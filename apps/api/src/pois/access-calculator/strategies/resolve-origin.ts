/**
 * Stratégie `resolveOrigin` (Story 2.2, AC #3).
 *
 * Résout une `AccessOrigin` en coordonnées `[lon, lat]` (GeoJSON) :
 *  - `stage`           → projette `adventure_stages.start_km` sur la trace fusionnée.
 *  - `nearest-trace`   → point de la trace le plus proche du POI (`ST_ClosestPoint`) —
 *                        détour court depuis l'endroit où l'on quitte la trace (fix 2026-05-30).
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
