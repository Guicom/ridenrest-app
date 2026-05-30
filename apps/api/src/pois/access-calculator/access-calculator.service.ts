/**
 * AccessCalculatorService (Story 2.2) — orchestre le calcul d'itinéraire d'accès POI :
 *   resolveOrigin → resolveProfile → routingService.computeRoute → computeDivergentSegment
 *
 * Cache : UPDATE `accommodations_cache` (cache DB durable, Story 2.2).
 *
 * Note (2026-05-30) : le mode « live GPS » (origine `gps`, consent gate, cache Redis
 * anonyme — ex-Story 3.1) a été retiré. Le mode Live utilise désormais la même origine
 * `nearest-trace` que le Planning ; aucune position GPS n'est transmise au serveur.
 *
 * Contrat (AC #2) : `compute()` ne THROW JAMAIS, sauf cas dégénéré (POI inexistant /
 * étape inexistante). Les indisponibilités BRouter sont catchées et converties en
 * `{ status: 'fallback' }`.
 *
 * ── Déviations vs story spec (Doc Sync) ────────────────────────────────────────────────
 *  - DI `db` : le projet n'a pas de token `DRIZZLE_DB` ni de `DatabaseModule`. On importe le
 *    singleton `db` de `@ridenrest/database` (pattern pois.repository / adventures.repository).
 *  - Pas d'`EventEmitter2`/`EventEmitterModule` : aucun AC ne demande d'émettre d'événement,
 *    et `EventEmitterModule.forRoot()` est déjà global. Évite du code mort.
 *  - Lectures/écritures DB inline via `db.execute(sql\`...\`)` plutôt qu'un repository dédié :
 *    AC #10 restreint le diff aux fichiers du module (pas de repo nouveau/modifié) et les
 *    repos existants ne conviennent pas (AdventuresRepository exige un userId absent ici,
 *    PoisRepository n'a pas de findById). Les Dev Notes sanctionnent explicitement l'inline.
 *
 * ── Concurrency (Discovery #3) ─────────────────────────────────────────────────────────
 *  Deux requêtes simultanées sur le même POI peuvent lancer 2 calculs BRouter en parallèle.
 *  Non critique pour le MVP : l'UPDATE est idempotent (le dernier gagne, cohérence finale).
 *  Un advisory lock Postgres ou un Redis SETNX serait hors scope MVP.
 */
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import type { ConfigType } from '@nestjs/config'
import { db } from '@ridenrest/database'
import { sql } from 'drizzle-orm'
import accessConfig from '../../config/access.config.js'
import { RoutingService } from '../../routing/routing.service.js'
import { BrouterUnavailableException } from '../../routing/brouter-unavailable.exception.js'
import type { BrouterProfile, LonLat } from '../../routing/routing.types.js'
import { resolveOrigin } from './strategies/resolve-origin.js'
import { computeDivergentSegment } from './strategies/compute-divergent-segment.js'
import type { AccessComputeInput, AccessResult, DivergentMetrics, GeoJSONGeometry } from './types/access-result.types.js'

/**
 * Profils projet (`adventures.routing_profile`) → profils bas niveau BRouter.
 *
 * ⚠️ Les valeurs DOIVENT exister dans le build BRouter (`/profiles2/*.brf`). Le build
 * v1.7.9 fournit notamment `fastbike`, `gravel`, `trekking`, `mtb` — mais PAS `safety`.
 * `bikepacking → safety` (mapping initial) renvoyait HTTP 500 → fallback systématique
 * (vol d'oiseau) pour toute aventure en profil bikepacking. Corrigé 2026-05-30 :
 *   - road        → fastbike  (route rapide bitume)
 *   - gravel      → gravel    (profil gravel natif — plus précis que trekking)
 *   - bikepacking → trekking  (tourisme chargé / surfaces mixtes)
 */
const PROFILE_MAP: Record<string, BrouterProfile> = {
  road: 'fastbike',
  gravel: 'gravel',
  bikepacking: 'trekking',
}

/** Au-delà, la géométrie d'accès stockée/renvoyée est jugée trop lourde (AC #8). */
const GEOMETRY_WARN_KB = 50

/** Forme normalisée de la ligne `accommodations_cache` (+ jointures) lue par loadPoi. */
interface PoiContext {
  id: string
  lat: number
  lng: number
  distFromTraceM: number
  adventureId: string
  routingProfile: string
  accessOriginStageId: string | null
  accessDistanceM: number | null
  accessElevationGainM: number | null
  accessElevationLossM: number | null
  accessGeometry: string | null
  accessEngineVersion: string | null
  accessComputedAt: Date | null
}

@Injectable()
export class AccessCalculatorService {
  private readonly logger = new Logger(AccessCalculatorService.name)

  constructor(
    private readonly routingService: RoutingService,
    @Inject(accessConfig.KEY)
    private readonly config: ConfigType<typeof accessConfig>,
  ) {}

  /**
   * Calcule (ou récupère depuis le cache DB) l'itinéraire d'accès d'un POI.
   * @throws NotFoundException si le POI ou l'étape demandée n'existe pas (cas dégénéré).
   */
  async compute(input: AccessComputeInput): Promise<AccessResult> {
    const poi = await this.loadPoi(input.poiId)
    const originStageId = input.origin.type === 'stage' ? input.origin.stageId : null

    // ── Cache hit DB (AC #6) ──────────────────────────────────────────────────
    const cachedGeometry = poi.accessGeometry ? this.parseGeometry(poi.accessGeometry) : null
    if (
      poi.accessComputedAt &&
      poi.accessEngineVersion === this.config.engineVersion &&
      poi.accessOriginStageId === originStageId &&
      poi.accessDistanceM !== null &&
      poi.accessElevationGainM !== null &&
      poi.accessElevationLossM !== null &&
      cachedGeometry !== null
    ) {
      return {
        status: 'ok',
        distanceM: poi.accessDistanceM,
        elevationGainM: poi.accessElevationGainM,
        elevationLossM: poi.accessElevationLossM,
        geometry: cachedGeometry,
        engineVersion: poi.accessEngineVersion,
        computedAt: poi.accessComputedAt.toISOString(),
        source: 'db-cache',
      }
    }

    // ── Calcul frais (cache miss) → UPDATE cache DB ───────────────────────────
    return this.computeFresh(input, poi, async (metrics) => {
      try {
        await this.updateCache(poi.id, originStageId, metrics)
      } catch (cacheErr) {
        this.logger.warn({ msg: 'access_cache_write_failed', poiId: poi.id, err: cacheErr })
      }
    })
  }

  /**
   * Calcul frais : resolveOrigin → BRouter → computeDivergentSegment.
   * `persist` reçoit les métriques pour l'écriture du cache DB.
   * BRouter down → `status: 'fallback'` (routing_failed) sans persistance (retry ultérieur).
   */
  private async computeFresh(
    input: AccessComputeInput,
    poi: PoiContext,
    persist: (metrics: DivergentMetrics) => Promise<void>,
  ): Promise<AccessResult> {
    // POI essentiellement SUR la trace (origine `nearest-trace`, distance ≤ buffer) : le point
    // d'origine résolu (`ST_ClosestPoint`) coïnciderait avec le POI → appel BRouter `from≈to`
    // dégénéré (route vide → `ST_Difference` vide → COALESCE sur la route entière). On court-circuite
    // par un accès ~0 sans routage. Review poi-access-3.3 (2026-05-30). Non persisté (calcul O(1)).
    if (input.origin.type === 'nearest-trace' && poi.distFromTraceM <= this.config.traceBufferM) {
      return {
        status: 'ok',
        distanceM: Math.round(poi.distFromTraceM),
        elevationGainM: 0,
        elevationLossM: 0,
        geometry: { type: 'LineString', coordinates: [[poi.lng, poi.lat], [poi.lng, poi.lat]] },
        engineVersion: this.config.engineVersion,
        computedAt: new Date().toISOString(),
        source: 'computed-fresh',
      }
    }

    try {
      const from = await resolveOrigin(db, input.origin, {
        adventureId: poi.adventureId,
        lat: poi.lat,
        lng: poi.lng,
      })
      const profile = this.resolveProfile(poi.routingProfile, input.profileOverride)
      const route = await this.routingService.computeRoute({
        from,
        to: [poi.lng, poi.lat] as LonLat,
        profile,
      })
      const metrics = await computeDivergentSegment(db, route.geometry, poi.adventureId, this.config.traceBufferM)

      this.logGeometrySize(poi.id, metrics.geometry)
      await persist(metrics)

      return {
        status: 'ok',
        distanceM: metrics.distanceM,
        elevationGainM: metrics.elevationGainM,
        elevationLossM: metrics.elevationLossM,
        geometry: metrics.geometry,
        engineVersion: this.config.engineVersion,
        computedAt: new Date().toISOString(),
        source: 'computed-fresh',
      }
    } catch (err) {
      if (err instanceof BrouterUnavailableException) {
        // PAS de persistance → permet un retry ultérieur. Log INFO (volume attendu).
        this.logger.log({
          msg: 'access_fallback',
          poiId: poi.id,
          reason: err.reason,
          engineVersion: this.config.engineVersion,
        })
        return {
          status: 'fallback',
          fallbackReason: 'routing_failed',
          fallbackDistanceM: poi.distFromTraceM,
          source: 'computed-fresh',
        }
      }
      // Cas dégénéré (POI/étape inexistant, etc.) → propage.
      throw err
    }
  }

  // ── Helpers DB (inline — cf. déviation documentée en tête de fichier) ─────────

  /** Charge le POI + adventureId + routing_profile + colonnes access_* en une requête. */
  private async loadPoi(poiId: string): Promise<PoiContext> {
    const rows = (
      await db.execute(sql`
        SELECT
          ac.id,
          ac.lat,
          ac.lng,
          ac.dist_from_trace_m,
          ac.access_origin_stage_id,
          ac.access_distance_m,
          ac.access_elevation_gain_m,
          ac.access_elevation_loss_m,
          ST_AsGeoJSON(ac.access_geometry) AS access_geometry,
          ac.access_engine_version,
          ac.access_computed_at,
          seg.adventure_id,
          adv.routing_profile
        FROM accommodations_cache ac
        JOIN adventure_segments seg ON seg.id = ac.segment_id
        JOIN adventures adv ON adv.id = seg.adventure_id
        WHERE ac.id = ${poiId}
        LIMIT 1
      `)
    ).rows
    const r = rows[0]
    if (!r) {
      throw new NotFoundException(`POI not found: ${poiId}`)
    }
    return {
      id: r.id as string,
      lat: Number(r.lat),
      lng: Number(r.lng),
      distFromTraceM: Number(r.dist_from_trace_m),
      adventureId: r.adventure_id as string,
      routingProfile: r.routing_profile as string,
      accessOriginStageId: (r.access_origin_stage_id as string | null) ?? null,
      accessDistanceM: r.access_distance_m === null ? null : Number(r.access_distance_m),
      accessElevationGainM: r.access_elevation_gain_m === null ? null : Number(r.access_elevation_gain_m),
      accessElevationLossM: r.access_elevation_loss_m === null ? null : Number(r.access_elevation_loss_m),
      accessGeometry: (r.access_geometry as string | null) ?? null,
      accessEngineVersion: (r.access_engine_version as string | null) ?? null,
      accessComputedAt: r.access_computed_at ? new Date(r.access_computed_at as string) : null,
    }
  }

  /**
   * UPDATE accommodations_cache avec les colonnes access_* (AC #5 step 5).
   * La géométrie est ré-simplifiée à ~5 m côté DB (AC #8) avant stockage — tolérance
   * exprimée en degrés (EPSG:4326), cf. `5/111320`. PAS '5' (= 5° ≈ 550 km → ligne droite).
   */
  private async updateCache(
    poiId: string,
    originStageId: string | null,
    metrics: DivergentMetrics,
  ): Promise<void> {
    const geomJson = JSON.stringify(metrics.geometry)
    await db.execute(sql`
      UPDATE accommodations_cache
      SET
        access_distance_m = ${metrics.distanceM},
        access_elevation_gain_m = ${metrics.elevationGainM},
        access_elevation_loss_m = ${metrics.elevationLossM},
        access_geometry = ST_SimplifyPreserveTopology(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326), 5.0 / 111320.0),
        access_engine_version = ${this.config.engineVersion},
        access_origin_stage_id = ${originStageId},
        access_computed_at = NOW(),
        access_failed = false
      WHERE id = ${poiId}
    `)
  }

  /** `adventures.routing_profile` (ou override explicite) → profil BRouter bas niveau. */
  private resolveProfile(routingProfile: string, override?: BrouterProfile): BrouterProfile {
    if (override) return override
    return PROFILE_MAP[routingProfile] ?? (this.config.brouterDefaultProfile as BrouterProfile)
  }

  /** Log la taille de la géométrie d'accès — WARN si > 50 kB (AC #8). */
  private logGeometrySize(poiId: string, geometry: GeoJSONGeometry): void {
    const sizeKb = Math.round((Buffer.byteLength(JSON.stringify(geometry)) / 1024) * 10) / 10
    if (sizeKb > GEOMETRY_WARN_KB) {
      this.logger.warn({ msg: 'access_geometry_large', poiId, sizeKb })
    } else {
      this.logger.debug({ msg: 'access_geometry_size', poiId, sizeKb })
    }
  }

  /** Retourne `null` si le JSON est invalide (géométrie corrompue → cache miss forcé). */
  private parseGeometry(raw: string): GeoJSONGeometry | null {
    try {
      const geo = JSON.parse(raw) as { type?: string; coordinates?: unknown }
      if (geo.type === 'LineString' && Array.isArray(geo.coordinates)) {
        return { type: 'LineString', coordinates: geo.coordinates as number[][] }
      }
      if (geo.type === 'MultiLineString' && Array.isArray(geo.coordinates)) {
        return { type: 'MultiLineString', coordinates: geo.coordinates as number[][][] }
      }
    } catch {
      this.logger.warn({ msg: 'access_geometry_parse_error', raw: raw.slice(0, 80) })
    }
    return null
  }
}
