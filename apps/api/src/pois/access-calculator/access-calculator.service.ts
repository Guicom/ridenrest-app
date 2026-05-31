/**
 * AccessCalculatorService (Story 2.2) — orchestre le calcul d'itinéraire d'accès POI :
 *   resolveOriginCandidates → resolveProfile → routeAndRankCandidates (BRouter) → computeDivergentSegment (par variante)
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
import type { BrouterProfile, BrouterRoute, LonLat } from '../../routing/routing.types.js'
import { resolveOriginCandidates } from './strategies/resolve-origin.js'
import { computeDivergentSegment } from './strategies/compute-divergent-segment.js'
import type { AccessComputeInput, AccessResult, AccessVariant, DivergentMetrics, GeoJSONGeometry } from './types/access-result.types.js'

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
  /** jsonb brut (déjà parsé par node-pg en tableau JS) ou null. */
  accessVariants: unknown
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
    const cachedVariants = this.parseVariants(poi.accessVariants)
    if (
      poi.accessComputedAt &&
      poi.accessEngineVersion === this.config.engineVersion &&
      poi.accessOriginStageId === originStageId &&
      poi.accessDistanceM !== null &&
      poi.accessElevationGainM !== null &&
      poi.accessElevationLossM !== null &&
      cachedGeometry !== null &&
      // Variantes requises au cache-hit : une ligne pré-multicand (variants null) est traitée
      // comme un miss → recalcul qui peuplera access_variants. Garde-fou anti-réponse dégradée.
      cachedVariants !== null
    ) {
      return {
        status: 'ok',
        distanceM: poi.accessDistanceM,
        elevationGainM: poi.accessElevationGainM,
        elevationLossM: poi.accessElevationLossM,
        geometry: cachedGeometry,
        variants: cachedVariants,
        engineVersion: poi.accessEngineVersion,
        computedAt: poi.accessComputedAt.toISOString(),
        source: 'db-cache',
      }
    }

    // ── Calcul frais (cache miss) → UPDATE cache DB ───────────────────────────
    // Échec d'écriture loggé en ERROR (non fatal : la réponse reste servie). Volontairement
    // bruyant — un `warn` muet ici a masqué pendant des semaines un cache jamais persisté
    // (col. `access_geometry` LINESTRING rejetant les MultiLineString, cf. migration 0017).
    return this.computeFresh(input, poi, async (best, variants) => {
      try {
        await this.updateCache(poi.id, originStageId, best, variants)
      } catch (cacheErr) {
        this.logger.error({
          msg: 'access_cache_write_failed',
          poiId: poi.id,
          geometryType: best.geometry.type,
          err: cacheErr instanceof Error ? cacheErr.message : String(cacheErr),
        })
      }
    })
  }

  /**
   * Calcul frais : resolveOriginCandidates → BRouter (meilleur candidat) → computeDivergentSegment.
   * `persist` reçoit les métriques pour l'écriture du cache DB.
   * BRouter down → `status: 'fallback'` (routing_failed) sans persistance (retry ultérieur).
   */
  private async computeFresh(
    input: AccessComputeInput,
    poi: PoiContext,
    persist: (best: DivergentMetrics, variants: AccessVariant[]) => Promise<void>,
  ): Promise<AccessResult> {
    // POI essentiellement SUR la trace (origine `nearest-trace`, distance ≤ buffer) : le point
    // d'origine résolu (`ST_ClosestPoint`) coïnciderait avec le POI → appel BRouter `from≈to`
    // dégénéré (route vide → `ST_Difference` vide → COALESCE sur la route entière). On court-circuite
    // par un accès ~0 sans routage. Review poi-access-3.3 (2026-05-30). Non persisté (calcul O(1)).
    if (input.origin.type === 'nearest-trace' && poi.distFromTraceM <= this.config.traceBufferM) {
      const onTrace: GeoJSONGeometry = {
        type: 'LineString',
        coordinates: [[poi.lng, poi.lat], [poi.lng, poi.lat]],
      }
      return {
        status: 'ok',
        distanceM: Math.round(poi.distFromTraceM),
        elevationGainM: 0,
        elevationLossM: 0,
        geometry: onTrace,
        // POI sur la trace → une seule « variante » dégénérée (le POI lui-même).
        variants: [{
          entryPoint: [poi.lng, poi.lat],
          distanceM: Math.round(poi.distFromTraceM),
          elevationGainM: 0,
          elevationLossM: 0,
          etaS: 0,
          geometry: onTrace,
        }],
        engineVersion: this.config.engineVersion,
        computedAt: new Date().toISOString(),
        source: 'computed-fresh',
      }
    }

    try {
      const candidates = await resolveOriginCandidates(
        db,
        input.origin,
        { adventureId: poi.adventureId, lat: poi.lat, lng: poi.lng },
        { radiusM: this.config.candidateRadiusM, maxCandidates: this.config.maxCandidates },
      )
      const profile = this.resolveProfile(poi.routingProfile, input.profileOverride)
      // Tous les candidats routés, triés meilleur-d'abord (coût profil-aware).
      const ranked = await this.routeAndRankCandidates(poi, candidates, profile)

      // Métriques de segment divergent pour CHAQUE variante (en parallèle, ≤ maxCandidates).
      const metricsList = await Promise.all(
        ranked.map((c) => computeDivergentSegment(db, c.route.geometry, poi.adventureId, this.config.traceBufferM)),
      )
      const variants: AccessVariant[] = ranked.map((c, i) => ({
        entryPoint: [c.entryPoint[0], c.entryPoint[1]],
        distanceM: metricsList[i].distanceM,
        elevationGainM: metricsList[i].elevationGainM,
        elevationLossM: metricsList[i].elevationLossM,
        etaS: c.route.timeS,
        geometry: metricsList[i].geometry,
      }))
      const best = metricsList[0] // variants[0] = meilleur (top-level + colonnes legacy)

      this.logGeometrySize(poi.id, best.geometry)
      await persist(best, variants)

      return {
        status: 'ok',
        distanceM: best.distanceM,
        elevationGainM: best.elevationGainM,
        elevationLossM: best.elevationLossM,
        geometry: best.geometry,
        variants,
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

  /**
   * Route chaque point d'accès candidat (en parallèle) et renvoie TOUTES les variantes
   * routées avec succès, triées par coût croissant — `timeS` (temps BRouter, profil-aware)
   * si disponible, sinon la distance. `[0]` est donc le meilleur choix automatique ; les
   * suivantes sont proposées à l'utilisateur. Le tri profil-aware rend l'ordre pertinent :
   * en `fastbike`, rejoindre la trace sur une nationale un peu plus loin passe devant un
   * raccourci par pistes plus proche à vol d'oiseau.
   *
   * Résilience : on garde tout candidat routé avec succès (`allSettled`). Si AUCUN ne réussit,
   * on relève la première `BrouterUnavailableException` rencontrée (→ fallback géré par
   * l'appelant) ; à défaut la première erreur (cas dégénéré → propagée).
   */
  private async routeAndRankCandidates(
    poi: PoiContext,
    candidates: LonLat[],
    profile: BrouterProfile,
  ): Promise<Array<{ route: BrouterRoute; entryPoint: LonLat }>> {
    const to = [poi.lng, poi.lat] as LonLat
    const settled = await Promise.allSettled(
      candidates.map((from) =>
        this.routingService.computeRoute({ from, to, profile }).then((route) => ({ route, entryPoint: from })),
      ),
    )

    const routed = settled
      .filter((s): s is PromiseFulfilledResult<{ route: BrouterRoute; entryPoint: LonLat }> => s.status === 'fulfilled')
      .map((s) => s.value)

    if (routed.length === 0) {
      const firstReject = settled.find(
        (s): s is PromiseRejectedResult => s.status === 'rejected',
      )
      const reason: unknown = firstReject?.reason
      // reason est l'erreur de rejet du candidat (BrouterUnavailableException, NotFound…).
      // Relevée telle quelle → le catch appelant traduit BRouter en fallback, propage le reste.
      if (reason instanceof Error) throw reason
      throw new BrouterUnavailableException('network', 'no route candidates')
    }

    const cost = (r: BrouterRoute): number => (r.timeS > 0 ? r.timeS : r.distanceM)
    routed.sort((a, b) => cost(a.route) - cost(b.route))

    if (candidates.length > 1) {
      this.logger.log({
        msg: 'access_candidate_selected',
        poiId: poi.id,
        profile,
        candidates: candidates.length,
        routed: routed.length,
        chosenTimeS: routed[0].route.timeS,
        chosenDistanceM: routed[0].route.distanceM,
        engineVersion: this.config.engineVersion,
      })
    }

    return routed
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
          ac.access_variants,
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
      accessVariants: r.access_variants ?? null,
      accessEngineVersion: (r.access_engine_version as string | null) ?? null,
      accessComputedAt: r.access_computed_at ? new Date(r.access_computed_at as string) : null,
    }
  }

  /**
   * UPDATE accommodations_cache avec les colonnes access_* (AC #5 step 5).
   *
   * La géométrie est ré-simplifiée à ~5 m côté DB (AC #8) avant stockage — tolérance
   * exprimée en degrés (EPSG:4326), cf. `5/111320`. PAS '5' (= 5° ≈ 550 km → ligne droite).
   *
   * `ST_Force2D` : la géométrie d'accès est fréquemment une `MultiLineString` 3D (BRouter
   * renvoie l'élévation Z, `computeDivergentSegment` fragmente via `ST_Difference`). La colonne
   * `access_geometry` est `geometry(GEOMETRY, 4326)` 2D (migration 0017) — sans `ST_Force2D`,
   * les coords 3D seraient rejetées. Le D+/D- est stocké séparément, la Z géométrique est inutile.
   */
  private async updateCache(
    poiId: string,
    originStageId: string | null,
    metrics: DivergentMetrics,
    variants: AccessVariant[],
  ): Promise<void> {
    const geomJson = JSON.stringify(metrics.geometry)
    // `access_variants` (jsonb) : tableau complet des variantes (entryPoint + métriques + géométrie),
    // servi tel quel au cache-hit. La géométrie y est celle déjà simplifiée par computeDivergentSegment.
    const variantsJson = JSON.stringify(variants)
    await db.execute(sql`
      UPDATE accommodations_cache
      SET
        access_distance_m = ${metrics.distanceM},
        access_elevation_gain_m = ${metrics.elevationGainM},
        access_elevation_loss_m = ${metrics.elevationLossM},
        access_geometry = ST_Force2D(ST_SimplifyPreserveTopology(ST_SetSRID(ST_GeomFromGeoJSON(${geomJson}), 4326), 5.0 / 111320.0)),
        access_variants = ${variantsJson}::jsonb,
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

  /**
   * Normalise la colonne `access_variants` (jsonb) en `AccessVariant[]`, ou `null` si absente/
   * invalide/vide (→ cache miss forcé, recalcul). node-pg parse déjà le jsonb en tableau JS ;
   * on accepte aussi une chaîne par robustesse. Validation structurelle minimale (entryPoint
   * + geometry présents) — la validation stricte est côté schéma partagé (frontend).
   */
  private parseVariants(raw: unknown): AccessVariant[] | null {
    let arr: unknown = raw
    if (typeof raw === 'string') {
      try {
        arr = JSON.parse(raw)
      } catch {
        return null
      }
    }
    if (!Array.isArray(arr) || arr.length === 0) return null
    const ok = arr.every((v): v is AccessVariant => {
      const o = v as Partial<AccessVariant>
      return (
        Array.isArray(o?.entryPoint) &&
        o.entryPoint.length === 2 &&
        typeof o.distanceM === 'number' &&
        o.geometry != null &&
        (o.geometry.type === 'LineString' || o.geometry.type === 'MultiLineString')
      )
    })
    return ok ? (arr as AccessVariant[]) : null
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
