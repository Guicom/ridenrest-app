/**
 * Stratégie `resolveOrigin` (Story 2.2, AC #3).
 *
 * Résout une `AccessOrigin` en coordonnées `[lon, lat]` (GeoJSON) :
 *  - `stage`           → projette `adventure_stages.start_km` sur la trace fusionnée.
 *  - `nearest-trace`   → point de la trace le plus proche du POI (`ST_ClosestPoint`) —
 *                        détour court depuis l'endroit où l'on quitte la trace (fix 2026-05-30).
 *
 * `resolveOriginCandidates` (2026-05-31) : pour `nearest-trace`, renvoie PLUSIEURS points
 * d'entrée candidats (le plus proche de chaque « passage » de la trace dans un rayon autour
 * du POI) — pas seulement le plus proche à vol d'oiseau. L'appelant route chacun avec le
 * profil et garde le meilleur temps réel. Motivation : le point géométriquement le plus
 * proche n'est pas toujours le meilleur point d'accès selon le profil (ex. en `fastbike`,
 * rejoindre la trace sur une nationale un peu plus loin bat un raccourci par pistes).
 *
 * `adventure-start` retiré (review poi-access-3.3, 2026-05-30) : inutilisé + collision de cache.
 *
 * Fonction pure : `db` est passé en paramètre (testable sans DI NestJS).
 * PostGIS via `db.execute(sql\`...\`)` uniquement — pas de connexion `pg` parallèle
 * (cf. project-context §PostGIS / Discovery #1).
 */
import { NotFoundException } from '@nestjs/common'
import { sql } from 'drizzle-orm'
import type { AccessOrigin, SqlExecutor } from '../types/access-result.types.js'
import type { LonLat } from '../../../routing/routing.types.js'

export type ResolvedOrigin = LonLat

/** Séparation minimale (m) entre deux candidats retenus — en deçà, on considère un doublon. */
const MIN_CANDIDATE_SEP_M = 250

/**
 * Distance approchée (m) entre deux points proches (équirectangulaire). Suffisant pour un
 * seuil de dédoublonnage à l'échelle de quelques centaines de mètres — pas besoin du haversine.
 */
function approxDistanceM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const R = 6_371_000
  const toRad = Math.PI / 180
  const meanLat = ((a.lat + b.lat) / 2) * toRad
  const dLat = (b.lat - a.lat) * toRad
  const dLng = (b.lon - a.lon) * toRad * Math.cos(meanLat)
  return R * Math.hypot(dLat, dLng)
}

/** Point GeoJSON renvoyé par `ST_AsGeoJSON(ST_LineInterpolatePoint(...))`. */
interface GeoJsonPoint {
  type: 'Point'
  coordinates: [number, number]
}

/**
 * @param db Instance Drizzle (ou stub `{ execute }`).
 * @param origin Union discriminée d'origine.
 * @param poi Contexte POI minimal : `adventureId` (stage/nearest) + `lat`/`lng` (nearest-trace).
 * @returns `[lon, lat]` du point d'origine.
 * @throws NotFoundException si l'étape est absente ou si l'aventure n'a aucune trace.
 */
export async function resolveOrigin(
  db: SqlExecutor,
  origin: AccessOrigin,
  poi: { adventureId: string; lat: number; lng: number },
): Promise<ResolvedOrigin> {
  if (origin.type === 'nearest-trace') {
    return closestPointOnTrace(db, poi.adventureId, poi.lat, poi.lng)
  }

  // origin.type === 'stage'
  const stageRows = (
    await db.execute(sql`
      SELECT start_km
      FROM adventure_stages
      WHERE id = ${origin.stageId} AND adventure_id = ${poi.adventureId}
      LIMIT 1
    `)
  ).rows
  const stage = stageRows[0]
  if (!stage) {
    throw new NotFoundException(`Stage not found: ${origin.stageId}`)
  }
  const startKm = Number(stage.start_km)
  if (!Number.isFinite(startKm)) {
    throw new NotFoundException(`Stage has invalid start_km: ${origin.stageId}`)
  }
  return interpolateOnTrace(db, poi.adventureId, startKm)
}

/**
 * Point de la trace fusionnée le plus proche du POI (`ST_ClosestPoint`).
 * La trace peut être multi-parties (gap ferry/train) → `ST_Collect` + `ST_LineMerge`,
 * `ST_ClosestPoint` renvoie le point le plus proche toutes parties confondues.
 */
async function closestPointOnTrace(
  db: SqlExecutor,
  adventureId: string,
  lat: number,
  lng: number,
): Promise<ResolvedOrigin> {
  const rows = (
    await db.execute(sql`
      WITH t AS (
        SELECT ST_LineMerge(ST_Collect(geom ORDER BY order_index)) AS g
        FROM adventure_segments
        WHERE adventure_id = ${adventureId} AND geom IS NOT NULL
      )
      SELECT ST_AsGeoJSON(
        ST_ClosestPoint(t.g, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326))
      ) AS point
      FROM t
      WHERE t.g IS NOT NULL
    `)
  ).rows

  const raw = rows[0]?.point
  if (!raw || typeof raw !== 'string') {
    throw new NotFoundException(`Adventure has no usable trace: ${adventureId}`)
  }
  const point = JSON.parse(raw) as GeoJsonPoint
  if (!Array.isArray(point?.coordinates) || point.coordinates.length < 2) {
    throw new NotFoundException(`Adventure trace returned degenerate point: ${adventureId}`)
  }
  const [lon, plat] = point.coordinates
  return [lon, plat]
}

/** Options de génération des candidats `nearest-trace`. */
export interface OriginCandidateOptions {
  /** Rayon (m) autour du POI : seule la portion de trace à ≤ ce rayon fournit des candidats. */
  radiusM: number
  /** Nombre de tranches positionnelles = nombre max de candidats. Borne les appels BRouter. */
  maxCandidates: number
}

/**
 * Résout une origine en UNE OU PLUSIEURS coordonnées candidates `[lon, lat]`.
 *  - `stage`         → un seul point (interpolation à `start_km`).
 *  - `nearest-trace` → points d'entrée étalés le long de la portion de trace dans `radiusM`
 *                      (≤ `maxCandidates`, un par tranche positionnelle). Repli sur le point
 *                      géométriquement le plus proche si aucune trace dans le rayon (POI
 *                      éloigné) — garantit ≥ 1 candidat, jamais de régression vs mono-point.
 */
export async function resolveOriginCandidates(
  db: SqlExecutor,
  origin: AccessOrigin,
  poi: { adventureId: string; lat: number; lng: number },
  options: OriginCandidateOptions,
): Promise<ResolvedOrigin[]> {
  if (origin.type !== 'nearest-trace') {
    return [await resolveOrigin(db, origin, poi)]
  }

  const candidates = await closestPointsOnTrace(db, poi.adventureId, poi.lat, poi.lng, options)
  if (candidates.length > 0) return candidates

  // Aucune trace dans le rayon → repli sur ST_ClosestPoint (point global le plus proche).
  return [await closestPointOnTrace(db, poi.adventureId, poi.lat, poi.lng)]
}

/**
 * Points d'entrée candidats sur la trace : on découpe la portion de trace à ≤ `radiusM` du
 * POI en `maxCandidates` tranches *par position le long de la trace* (`ntile` sur l'ordre des
 * sommets), et on retient le sommet le plus proche de chaque tranche. On obtient des points
 * d'entrée RÉELLEMENT ÉTALÉS le long de l'approche, là où `ST_ClosestPoint` n'en garde qu'un
 * (le minimum global à vol d'oiseau). C'est ce qui permet au routeur de préférer, selon le
 * profil, une entrée un peu plus loin mais mieux connectée (ex. `fastbike` → jonction sur
 * nationale plutôt qu'un raccourci par pistes).
 *
 * Pourquoi par position et pas par « passage contigu » : sur un grand rayon la trace reste
 * souvent continûment dans le rayon (un seul passage) → un regroupement par contiguïté
 * retombe sur un unique candidat. Le découpage positionnel garantit l'étalement.
 *
 * Robuste aux traces multi-parties (gap ferry/train) : `ST_DumpPoints` parcourt aussi bien
 * un LineString qu'un MultiLineString, l'ordre `path` rétablit la séquence. Distances en
 * mètres via `::geography`. `ntile` renvoie ≤ `maxCandidates` lignes.
 */
async function closestPointsOnTrace(
  db: SqlExecutor,
  adventureId: string,
  lat: number,
  lng: number,
  { radiusM, maxCandidates }: OriginCandidateOptions,
): Promise<ResolvedOrigin[]> {
  const rows = (
    await db.execute(sql`
      WITH merged AS (
        SELECT ST_LineMerge(ST_Collect(geom ORDER BY order_index)) AS g
        FROM adventure_segments
        WHERE adventure_id = ${adventureId} AND geom IS NOT NULL
      ),
      pts AS (
        SELECT
          dp.path AS path,
          dp.geom AS pt,
          ST_Distance(
            dp.geom::geography,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) AS dist_m
        FROM merged, LATERAL ST_DumpPoints(merged.g) AS dp
        WHERE merged.g IS NOT NULL
      ),
      -- Sommets dans le rayon, ré-indexés dans l'ordre de la trace.
      inr AS (
        SELECT pt, dist_m, row_number() OVER (ORDER BY path) AS rn
        FROM pts
        WHERE dist_m <= ${radiusM}
      ),
      -- Découpage en tranches positionnelles (par ordre le long de la trace).
      bucketed AS (
        SELECT pt, dist_m, ntile(${maxCandidates}) OVER (ORDER BY rn) AS bucket
        FROM inr
      )
      -- Sommet le plus proche de chaque tranche → candidats étalés le long de l'approche.
      SELECT DISTINCT ON (bucket) ST_X(pt) AS lon, ST_Y(pt) AS lat, dist_m
      FROM bucketed
      ORDER BY bucket, dist_m ASC
    `)
  ).rows

  const sorted = rows
    .map((r) => ({ lon: Number(r.lon), lat: Number(r.lat), dist: Number(r.dist_m) }))
    .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat))
    .sort((a, b) => a.dist - b.dist)

  // Dédoublonnage spatial : quand la trace effleure à peine le rayon, les tranches `ntile`
  // se chevauchent et donnent des candidats quasi identiques → autant d'appels BRouter
  // redondants. On garde, par ordre de proximité, ceux séparés d'au moins MIN_CANDIDATE_SEP_M
  // — les entrées réellement distinctes (raccourci vs jonction) survivent, les doublons non.
  const kept: typeof sorted = []
  for (const c of sorted) {
    if (kept.every((k) => approxDistanceM(k, c) > MIN_CANDIDATE_SEP_M)) kept.push(c)
    if (kept.length >= maxCandidates) break
  }
  return kept.map((r) => [r.lon, r.lat] as ResolvedOrigin)
}

/**
 * Interpole un point à `startKm` sur la trace de l'aventure, segment par segment.
 * Fonctionne sur les traces multi-parties (gap ferry/train) : pas de `ST_LineMerge`,
 * on identifie le segment qui contient le km cible via les longueurs cumulées.
 * fraction = (startKm*1000 - seg_start_m) / seg_len_m, clampée à [0, 1].
 */
async function interpolateOnTrace(
  db: SqlExecutor,
  adventureId: string,
  startKm: number,
): Promise<ResolvedOrigin> {
  const rows = (
    await db.execute(sql`
      WITH seg_lengths AS (
        SELECT
          geom,
          order_index,
          COALESCE(
            SUM(ST_Length(geom::geography)) OVER (
              ORDER BY order_index
              ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
            ),
            0
          ) AS seg_start_m,
          ST_Length(geom::geography) AS seg_len_m
        FROM adventure_segments
        WHERE adventure_id = ${adventureId} AND geom IS NOT NULL
      )
      SELECT ST_AsGeoJSON(
        ST_LineInterpolatePoint(
          geom,
          LEAST(GREATEST(
            (${startKm} * 1000.0 - seg_start_m) / NULLIF(seg_len_m, 0),
            0
          ), 1)
        )
      ) AS point
      FROM seg_lengths
      WHERE seg_start_m <= ${startKm} * 1000.0
      ORDER BY order_index DESC
      LIMIT 1
    `)
  ).rows

  const raw = rows[0]?.point
  if (!raw || typeof raw !== 'string') {
    throw new NotFoundException(`Adventure has no usable trace: ${adventureId}`)
  }
  const point = JSON.parse(raw) as GeoJsonPoint
  if (!Array.isArray(point?.coordinates) || point.coordinates.length < 2) {
    throw new NotFoundException(`Adventure trace returned degenerate point: ${adventureId}`)
  }
  const [lon, lat] = point.coordinates
  return [lon, lat]
}
