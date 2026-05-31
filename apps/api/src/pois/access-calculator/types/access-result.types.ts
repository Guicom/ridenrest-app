/**
 * Types partagés du module AccessCalculator (Story 2.2).
 *
 * Coordonnées : TOUJOURS [lon, lat] (GeoJSON) en interne — jamais [lat, lon].
 * Cf. RoutingService (Story 2.1) et architecture POI Access §Enforcement Guidelines.
 */
import type { SQL } from 'drizzle-orm'
import type { BrouterProfile } from '../../../routing/routing.types.js'

/**
 * Sous-ensemble minimal de l'instance Drizzle `db` consommé par les stratégies.
 * Permet d'injecter `db` (depuis `@ridenrest/database`) en prod et de le stubber
 * trivialement en test (pure functions, pas de DI NestJS). Cf. Dev Notes Story 2.2.
 */
export interface SqlExecutor {
  execute(query: SQL): Promise<{ rows: Record<string, unknown>[] }>
}

/** LineString GeoJSON. Coordonnées 2D `[lon, lat]` ou 3D `[lon, lat, ele]`. */
export interface GeoJSONLineString {
  type: 'LineString'
  coordinates: number[][]
}

/** MultiLineString GeoJSON — plusieurs segments discontinus (ex: portions divergentes séparées par le chevauchement trace). */
export interface GeoJSONMultiLineString {
  type: 'MultiLineString'
  coordinates: number[][][]
}

/** Géométrie GeoJSON retournée par le module access-calculator (LineString ou MultiLineString). */
export type GeoJSONGeometry = GeoJSONLineString | GeoJSONMultiLineString

/**
 * Origine de l'accès — union discriminée.
 *  - `stage`           : point projeté au `start_km` de l'étape sur la trace.
 *  - `nearest-trace`   : point de la trace le plus proche du POI (fix 2026-05-30) —
 *                        sémantique correcte de « l'accès depuis la trace » (détour court).
 *                        Utilisée en Planning ET en Live (décision 2026-05-30).
 *
 * `adventure-start` (km 0) retiré (review poi-access-3.3, 2026-05-30) : inutilisé par le
 * frontend et source d'une collision de cache avec `nearest-trace` (toutes deux → `origin_stage_id = null`).
 */
export type AccessOrigin =
  | { type: 'stage'; stageId: string }
  | { type: 'nearest-trace' }

/** Métriques d'accès calculées sur la portion divergente (hors chevauchement trace). */
export interface DivergentMetrics {
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  /** Portion divergente simplifiée (ST_SimplifyPreserveTopology, tolérance ~5 m = 5/111320 deg). */
  geometry: GeoJSONGeometry
}

/**
 * Une variante d'accès = un point d'entrée candidat sur la trace + son itinéraire routé.
 * Le service en expose plusieurs (cf. `closestPointsOnTrace`) et l'utilisateur choisit.
 */
export interface AccessVariant {
  /** Point d'entrée sur la trace `[lon, lat]`. */
  entryPoint: [number, number]
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  /** Temps BRouter (s), critère de tri. */
  etaS: number
  geometry: GeoJSONGeometry
}

/** Résultat de `AccessCalculatorService.compute()` — status discriminant. */
export type AccessResult =
  | {
      status: 'ok'
      distanceM: number
      elevationGainM: number
      elevationLossM: number
      geometry: GeoJSONGeometry
      /** Variantes proposées, triées meilleur-d'abord. `variants[0]` = champs top-level. */
      variants: AccessVariant[]
      engineVersion: string
      computedAt: string
      source: 'db-cache' | 'computed-fresh'
    }
  | {
      status: 'fallback'
      fallbackReason: 'routing_failed' | 'unreachable'
      fallbackDistanceM: number
      source: 'computed-fresh'
    }
  | { status: 'error'; message: string }

/** Entrée de `AccessCalculatorService.compute()`. */
export interface AccessComputeInput {
  poiId: string
  origin: AccessOrigin
  /** Force un profil BRouter bas niveau, sinon dérivé de `adventures.routing_profile`. */
  profileOverride?: BrouterProfile
}
