/**
 * Stratégie `computeDivergentSegment` (Story 2.2, AC #4 + #8).
 *
 * À partir de la route BRouter (origin → POI) et de la trace fusionnée de l'aventure,
 * isole la PORTION DIVERGENTE (hors d'un buffer de `bufferM` autour de la trace) et
 * calcule :
 *  - `distanceM`        : longueur de la portion divergente (mètres géodésiques).
 *  - `elevationGainM/LossM` : D+/D- sur les seuls points divergents (hors buffer).
 *  - `geometry`         : portion divergente simplifiée (`ST_SimplifyPreserveTopology(_, 5)`).
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

  // ── Requête 1 : distance divergente + géométrie simplifiée ──────────────────
  // Trace fusionnée = agrégat ordonné des segments. Si l'aventure n'a aucune trace,
  // `trace.g` vaut NULL → ST_Difference renvoie NULL → on retombe sur la route entière.
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
          r.g AS rg
        FROM r, t
      )
      SELECT
        CASE
          WHEN d.dg IS NULL THEN COALESCE(ST_Length(d.rg::geography), 0)
          ELSE COALESCE(ST_Length(d.dg::geography), 0)
        END AS divergent_length_m,
        ST_AsGeoJSON(
          ST_SimplifyPreserveTopology(
            CASE WHEN d.dg IS NULL OR ST_IsEmpty(d.dg) THEN d.rg ELSE d.dg END,
            5
          )
        ) AS divergent_geojson
      FROM d
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
 * Somme les D+/D- entre points consécutifs HORS buffer de trace.
 * Entrer dans le buffer (ou un sommet sans altitude) réinitialise la référence :
 * on ne "bridge" jamais le dénivelé à travers une portion de chevauchement.
 */
export function computeDivergentElevation(rows: RoutePointRow[]): {
  elevationGainM: number
  elevationLossM: number
} {
  let gain = 0
  let loss = 0
  let prev: number | null = null

  for (const row of rows) {
    const ele = typeof row.ele === 'number' ? row.ele : null
    if (row.within_trace || ele === null) {
      prev = null
      continue
    }
    if (prev !== null) {
      const delta = ele - prev
      if (delta > 0) gain += delta
      else loss += -delta
    }
    prev = ele
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
