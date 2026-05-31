/**
 * AccessWorkerRepository (Story 4.1, étendu Story 4.2) — accès DB du worker de pré-calcul
 * et de l'invalidation event-driven.
 *
 * Encapsule les requêtes Drizzle du module :
 *   1. `findEagerPois` — lookup des POI éligibles au pré-calcul eager (AC #4, 4.1).
 *   2. `markAccessFailed` — marque un POI en échec définitif après épuisement des retries (AC #3, 4.1).
 *   3. `resetAccessForAdventure` — reset des champs `access_*` de toute une aventure
 *      (AC #1 trace-updated ET AC #2 profile-changed : tous deux invalident au scope aventure,
 *      car l'origine `nearest-trace` dépend de la trace fusionnée de tous les segments).
 *
 * ── Doc Sync Story 4.2 ──────────────────────────────────────────────────────────────────
 *  Le spec listait un fichier séparé `strategies/invalidation-queries.ts` pour les UPDATE reset.
 *  On les ajoute ICI à la place : la 4.1 a déjà consolidé tout l'accès DB du module dans ce
 *  repository, et la règle projet impose « toutes les requêtes Drizzle dans UN repository ».
 *  Un second fichier d'accès DB (= 2e repository de facto) serait redondant. Pas de dossier
 *  `strategies/` créé.
 *
 * Pattern : utilise le singleton `db` de `@ridenrest/database` (le projet n'a ni token
 * `DRIZZLE_DB` ni `DatabaseModule` — cf. déviation documentée dans `access-calculator.service.ts`).
 * On passe par un repository injectable (vs `db` inline) pour respecter la règle projet
 * « toutes les requêtes Drizzle dans un repository » et rendre le service/processor trivialement
 * mockables en test. Déviation vs File List du spec (qui ne listait pas de repository) → Doc Sync.
 *
 * Les POI accommodations vivent dans `accommodations_cache` (clé `segment_id`, pas `adventure_id`) :
 * le filtre par aventure passe par une jointure sur `adventure_segments` (⚠️Discovery #5).
 */
import { Injectable } from '@nestjs/common'
import { db } from '@ridenrest/database'
import { sql } from 'drizzle-orm'

/** POI éligible au pré-calcul + son profil de routage (observabilité). */
export interface EagerPoiRow {
  id: string
  routingProfile: string
}

@Injectable()
export class AccessWorkerRepository {
  /**
   * POI éligibles au pré-calcul eager pour une aventure (AC #4 step 1) :
   *   proches de la trace (`dist_from_trace_m < thresholdM`), jamais calculés
   *   (`access_computed_at IS NULL`) et non déjà en échec (`access_failed = false`).
   */
  async findEagerPois(adventureId: string, thresholdM: number): Promise<EagerPoiRow[]> {
    const { rows } = await db.execute(sql`
      SELECT ac.id, adv.routing_profile
      FROM accommodations_cache ac
      JOIN adventure_segments seg ON seg.id = ac.segment_id
      JOIN adventures adv ON adv.id = seg.adventure_id
      WHERE seg.adventure_id = ${adventureId}
        AND ac.dist_from_trace_m < ${thresholdM}
        AND ac.access_computed_at IS NULL
        AND ac.access_failed = false
    `)
    return rows.map((r) => ({
      id: r.id as string,
      routingProfile: r.routing_profile as string,
    }))
  }

  /**
   * Marque un POI en échec définitif (AC #3) : `access_failed = true` + `access_computed_at = NOW()`
   * pour éviter un recalcul perpétuel (le POI sort du lookup `findEagerPois` ET du cache miss lazy).
   * Satisfait la contrainte `chk_accommodations_cache_access_data` (clause `access_failed = true`).
   */
  async markAccessFailed(poiId: string): Promise<void> {
    await db.execute(sql`
      UPDATE accommodations_cache
      SET access_failed = true, access_computed_at = NOW()
      WHERE id = ${poiId}
    `)
  }

  /**
   * Reset des champs `access_*` de TOUS les POI d'une aventure (AC #1 trace-updated + AC #2
   * profile-changed). Remet chaque ligne dans l'état « jamais calculé » (`access_computed_at = NULL`,
   * `access_failed = false`) → satisfait la 1ʳᵉ clause de `chk_accommodations_cache_access_data`
   * et la rend de nouveau éligible au pré-calcul (`idx_accommodations_cache_access_pending`).
   * `accommodations_cache` est clé par `segment_id` : jointure via `adventure_segments`.
   * `access_origin_stage_id` n'est PAS touché : toujours NULL post-pivot `nearest-trace`.
   */
  async resetAccessForAdventure(adventureId: string): Promise<void> {
    await db.execute(sql`
      UPDATE accommodations_cache ac
      SET access_distance_m = NULL,
          access_elevation_gain_m = NULL,
          access_elevation_loss_m = NULL,
          access_geometry = NULL,
          access_computed_at = NULL,
          access_engine_version = NULL,
          access_failed = false
      FROM adventure_segments seg
      WHERE ac.segment_id = seg.id
        AND seg.adventure_id = ${adventureId}
    `)
  }
}
