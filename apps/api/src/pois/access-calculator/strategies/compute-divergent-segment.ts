/**
 * Stratégie `computeDivergentSegment` (Story 2.2, AC #4 + #8).
 *
 * À partir de la route BRouter (origin → POI) et de la trace fusionnée de l'aventure,
 * isole la PORTION DIVERGENTE (hors d'un buffer de `bufferM` autour de la trace) et
 * calcule :
 *  - `distanceM`        : longueur de la portion divergente (mètres géodésiques).
 *  - `elevationGainM/LossM` : D+/D- sur les seuls points divergents (hors buffer).
 *  - `geometry`         : portion divergente simplifiée (`ST_SimplifyPreserveTopology`, tolérance
 *                         ~5 m exprimée en degrés EPSG:4326 = `5/111320`).
 *
 * Fonction pure : `db` est passé en paramètre (testable sans DI NestJS).
 * Tout PostGIS passe par `db.execute(sql\`...\`)` (Discovery #1 — pas de `pg` parallèle).
 *
 * NB : `ST_Difference`/`ST_Buffer` travaillent en 2D → l'altitude (Z) est perdue sur la
 * géométrie résultante. Le D+/D- est donc recalculé en TS à partir des sommets 3D de la
 * route filtrés par leur appartenance (ou non) au buffer de trace — d'où la 2e requête.
 */
import { sql } from 'drizzle-orm'
import type { DivergentMetrics, GeoJSONGeometry, GeoJSONLineString, SqlExecutor } from '../types/access-result.types.js'

/** Une ligne de la requête "points" : altitude + appartenance au buffer trace. */
interface RoutePointRow {
  ele: number | null
  within_trace: boolean
}

/**
 * @param db Instance Drizzle (ou stub `{ execute }`).
 * @param route Géométrie LineString 3D de la route BRouter (`[lon, lat, ele]`).
 * @param adventureId Aventure dont la trace sert de référence d'overlap.
 * @param bufferM Buffer autour de la trace (`ACCESS_TRACE_BUFFER_M`, 10 m par défaut).
 */
export async function computeDivergentSegment(
  db: SqlExecutor,
  route: GeoJSONLineString,
  adventureId: string,
  bufferM: number,
): Promise<DivergentMetrics> {
  const routeJson = JSON.stringify(route)

  // ── Requête 1 : approche finale (du POI au 1er contact avec la trace) ─────────
  // La route va `origin (point de trace) → POI`. `ST_Difference(route, buffer_trace)`
  // découpe la route en composantes HORS trace ; on ne garde QUE celle qui touche le POI
  // (= ST_EndPoint de la route) → l'approche finale, en jetant les éventuels demi-tours
  // côté trace (fix 2026-05-30). Distance d'accès = longueur de cette approche finale.
  // Trace absente → `dg` NULL → fallback sur la route entière.
  const diffRows = (
    await db.execute(sql`
      WITH r AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${routeJson}), 4326) AS g
      ),
      t AS (
        SELECT ST_LineMerge(ST_Collect(geom ORDER BY order_index)) AS g
        FROM adventure_segments
        WHERE adventure_id = ${adventureId} AND geom IS NOT NULL
      ),
      d AS (
        SELECT
          ST_Difference(r.g, ST_Buffer(t.g::geography, ${bufferM})::geometry) AS dg,
          r.g AS rg,
          ST_EndPoint(r.g) AS poi
        FROM r, t
      ),
      parts AS (
        SELECT (ST_Dump(d.dg)).geom AS part, d.poi AS poi
        FROM d
        WHERE d.dg IS NOT NULL AND NOT ST_IsEmpty(d.dg)
      ),
      final_approach AS (
        -- Composante de la différence la plus proche du POI = celle qui le touche.
        SELECT part FROM parts ORDER BY ST_Distance(part, poi) ASC LIMIT 1
      )
      SELECT
        COALESCE(
          (SELECT ST_Length(part::geography) FROM final_approach),
          (SELECT ST_Length(rg::geography) FROM d),
          0
        ) AS divergent_length_m,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(
            COALESCE((SELECT part FROM final_approach), (SELECT rg FROM d)),
            -- Tolérance ~5 m EXPRIMÉE EN DEGRÉS (la géométrie est en EPSG:4326).
            -- ⚠️ Surtout pas '5' (= 5° ≈ 550 km) qui écrasait la route en ligne droite.
            5.0 / 111320.0
          )
        ) AS divergent_geojson
    `)
  ).rows

  const distanceM = Math.round(Number(diffRows[0]?.divergent_length_m ?? 0))
  const geometry = parseGeometry(diffRows[0]?.divergent_geojson)

  // ── Requête 2 : D+/D- sur les points divergents (hors buffer) ───────────────
  const pointRows = (
    await db.execute(sql`
      WITH r AS (
        SELECT ST_SetSRID(ST_GeomFromGeoJSON(${routeJson}), 4326) AS g
      ),
      t AS (
        SELECT ST_LineMerge(ST_Collect(geom ORDER BY order_index)) AS g
        FROM adventure_segments
        WHERE adventure_id = ${adventureId} AND geom IS NOT NULL
      )
      SELECT
        ST_Z((dp).geom) AS ele,
        CASE
          WHEN (SELECT g FROM t) IS NULL THEN false
          ELSE ST_DWithin((dp).geom::geography, (SELECT g FROM t)::geography, ${bufferM})
        END AS within_trace
      FROM r, ST_DumpPoints(r.g) AS dp
      ORDER BY (dp).path[1]
    `)
  ).rows as unknown as RoutePointRow[]

  const { elevationGainM, elevationLossM } = computeDivergentElevation(pointRows)

  return { distanceM, elevationGainM, elevationLossM, geometry }
}

/**
 * D+/D- sur l'APPROCHE FINALE uniquement (fix 2026-05-30) : le dernier run contigu de
 * points HORS buffer de trace, qui se termine au POI (dernier point de la route).
 * On parcourt depuis la fin jusqu'au 1er point DANS le buffer (ou sans altitude), qui
 * borne le moment où l'on rejoint la trace. Cohérent avec la géométrie « approche finale ».
 */
export function computeDivergentElevation(rows: RoutePointRow[]): {
  elevationGainM: number
  elevationLossM: number
} {
  let gain = 0
  let loss = 0
  let next: number | null = null

  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]
    const ele = typeof row.ele === 'number' ? row.ele : null
    if (row.within_trace || ele === null) break // borne : entrée sur la trace → fin de l'approche
    if (next !== null) {
      // Sens de parcours origin→POI : delta = ele[i+1] - ele[i].
      const delta = next - ele
      if (delta > 0) gain += delta
      else loss += -delta
    }
    next = ele
  }

  return { elevationGainM: Math.round(gain), elevationLossM: Math.round(loss) }
}

/** Parse un GeoJSON LineString ou MultiLineString natif. Fallback LineString vide. */
function parseGeometry(raw: unknown): GeoJSONGeometry {
  if (typeof raw !== 'string') {
    return { type: 'LineString', coordinates: [] }
  }
  const geo = JSON.parse(raw) as { type?: string; coordinates?: unknown }
  if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) {
    return { type: 'LineString', coordinates: geo.coordinates as number[][] }
  }
  if (geo.type === 'MultiLineString' && Array.isArray(geo.coordinates)) {
    return { type: 'MultiLineString', coordinates: geo.coordinates as number[][][] }
  }
  return { type: 'LineString', coordinates: [] }
}
