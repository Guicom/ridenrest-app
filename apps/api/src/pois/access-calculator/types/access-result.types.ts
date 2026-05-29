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
 *  - `gps`             : coordonnées brutes fournies par le client.
 *  - `stage`           : point projeté au `start_km` de l'étape sur la trace.
 *  - `adventure-start` : point au km 0 de la première trace de l'aventure.
 */
export type AccessOrigin =
  | { type: 'gps'; lat: number; lng: number }
  | { type: 'stage'; stageId: string }
  | { type: 'adventure-start' }

/** Métriques d'accès calculées sur la portion divergente (hors chevauchement trace). */
export interface DivergentMetrics {
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  /** Portion divergente simplifiée (ST_SimplifyPreserveTopology, tolérance 5 m). */
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
      engineVersion: string
      computedAt: string
      source: 'db-cache' | 'redis-cache' | 'computed-fresh'
    }
  | {
      status: 'fallback'
      fallbackReason: 'routing_failed' | 'no_consent' | 'unreachable'
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
  /** `planning` → cache DB. `live` → cache Redis anonyme + consent gate (Story 3.1). */
  mode: 'planning' | 'live'
  /**
   * Requis en mode `live` : sert UNIQUEMENT au lookup `profiles.live_access_consent`.
   * N'est JAMAIS propagé vers la clé Redis ni stocké (anonymisation, NFR-PA-006).
   */
  userId?: string
}
