import { z } from 'zod'

/**
 * Schémas Zod partagés web ↔ api pour l'endpoint POI Access (Story 2.3).
 *
 * Source UNIQUE de vérité de la validation : côté NestJS, un `ZodValidationPipe`
 * consomme `AccessRequestSchema` (pas de DTO class-validator parallèle → zéro drift).
 *
 * Origine : `nearest-trace` (point de trace le plus proche du POI) en Planning comme en
 * Live. L'origine `gps` (ex-mode Live, Story 3.1) a été retirée le 2026-05-30 : plus aucune
 * position GPS n'est transmise au serveur. L'origine `adventure-start` (km 0) a également
 * été retirée (review poi-access-3.3, 2026-05-30) : non utilisée par le frontend et source
 * d'une collision de cache avec `nearest-trace` (toutes deux persistent `origin_stage_id = null`).
 */

/**
 * Profils BRouter bas niveau (cf. RoutingService, Story 2.1).
 * DOIVENT exister dans le build BRouter (`/profiles2/*.brf`). `safety` n'est PAS fourni
 * par le build v1.7.9 → retiré au profit de `gravel` (fix 2026-05-30, mapping projet :
 * road→fastbike, gravel→gravel, bikepacking→trekking).
 */
export const BrouterProfileSchema = z.enum(['fastbike', 'trekking', 'gravel'])

// ── Origines (union discriminée sur `type`) ──────────────────────────────────

export const AccessOriginStageSchema = z.object({
  type: z.literal('stage'),
  stageId: z.string().uuid(),
})

/**
 * Origine = point de la trace le PLUS PROCHE du POI (fix 2026-05-30).
 * C'est la sémantique correcte de « l'accès vélo depuis la trace » : un détour court
 * (~quelques km) calculé depuis l'endroit où le cycliste quitte sa trace, et NON depuis
 * le départ d'aventure (qui pouvait produire un « accès » de 192 km). Le serveur résout
 * le point via `ST_ClosestPoint(trace, POI)` — aucune donnée supplémentaire côté client.
 */
export const AccessOriginNearestTraceSchema = z.object({
  type: z.literal('nearest-trace'),
})

export const AccessOriginSchema = z.discriminatedUnion('type', [
  AccessOriginStageSchema,
  AccessOriginNearestTraceSchema,
])

// ── Requête ──────────────────────────────────────────────────────────────────

export const AccessRequestSchema = z.object({
  origin: AccessOriginSchema,
  /** Force un profil BRouter bas niveau, sinon dérivé de `adventures.routing_profile`. */
  profileOverride: BrouterProfileSchema.optional(),
})

// ── Géométrie GeoJSON renvoyée (LineString | MultiLineString) ─────────────────

// Une position GeoJSON valide = [lon, lat] ou [lon, lat, ele] → 2 ou 3 nombres.
const Position = z.array(z.number()).min(2).max(3)

export const AccessGeometrySchema = z.discriminatedUnion('type', [
  // Un LineString requiert ≥ 2 positions (GeoJSON RFC 7946).
  z.object({ type: z.literal('LineString'), coordinates: z.array(Position).min(2) }),
  // Chaque ligne d'un MultiLineString requiert elle aussi ≥ 2 positions.
  z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(Position).min(2)) }),
])

// ── Variantes d'itinéraire d'accès (choix utilisateur, 2026-05-31) ────────────

/**
 * Une variante = un point d'entrée candidat sur la trace + son itinéraire d'accès calculé
 * pour le profil. Le serveur route plusieurs points d'entrée étalés (cf. `closestPointsOnTrace`)
 * et expose toutes les variantes ; l'utilisateur choisit celle qui lui convient (le point le
 * plus proche à vol d'oiseau n'est pas toujours le meilleur selon le profil/le terrain).
 */
export const AccessVariantSchema = z.object({
  /** Point d'entrée sur la trace [lon, lat] (origine de l'itinéraire d'accès). */
  entryPoint: z.tuple([z.number(), z.number()]),
  distanceM: z.number(),
  elevationGainM: z.number(),
  elevationLossM: z.number(),
  /** Temps de trajet estimé par BRouter (s) — critère de tri des variantes. */
  etaS: z.number(),
  /**
   * L'itinéraire emprunte une route nationale (OSM `highway=trunk`) → indicateur danger vélo.
   * Optionnel + défaut `false` : robustesse face aux variantes en cache calculées AVANT l'ajout
   * du champ (et à un éventuel décalage api/web en rollout) → pas d'échec de parse, juste pas d'icône.
   */
  usesMainRoad: z.boolean().optional().default(false),
  /** Distance (m) parcourue sur une nationale. 0 si aucune/absent. */
  mainRoadDistanceM: z.number().optional().default(0),
  geometry: AccessGeometrySchema,
})

// ── Réponse (union discriminée sur `status`, miroir de Story 2.2 AccessResult) ─

export const AccessResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    distanceM: z.number(),
    elevationGainM: z.number(),
    elevationLossM: z.number(),
    geometry: AccessGeometrySchema,
    // Toutes les variantes proposées, triées meilleur-d'abord. `variants[0]` correspond aux
    // champs top-level ci-dessus (meilleur auto) → rétro-compatible. ≥ 1 garanti par le serveur.
    variants: z.array(AccessVariantSchema).min(1),
    engineVersion: z.string(),
    computedAt: z.string(),
    source: z.enum(['db-cache', 'computed-fresh']),
  }),
  z.object({
    status: z.literal('fallback'),
    fallbackReason: z.enum(['routing_failed', 'unreachable']),
    fallbackDistanceM: z.number(),
    source: z.literal('computed-fresh'),
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
  }),
])

// ── Types inférés ──────────────────────────────────────────────────────────────

export type AccessRequest = z.infer<typeof AccessRequestSchema>
export type AccessResponse = z.infer<typeof AccessResponseSchema>
export type AccessVariant = z.infer<typeof AccessVariantSchema>
export type AccessOrigin = z.infer<typeof AccessOriginSchema>
export type BrouterProfile = z.infer<typeof BrouterProfileSchema>
