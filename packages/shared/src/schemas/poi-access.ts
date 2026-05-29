import { z } from 'zod'

/**
 * Schémas Zod partagés web ↔ api pour l'endpoint POI Access (Story 2.3).
 *
 * Source UNIQUE de vérité de la validation : côté NestJS, un `ZodValidationPipe`
 * consomme `AccessRequestSchema` (pas de DTO class-validator parallèle → zéro drift).
 *
 * Coordonnées : voir Discovery #2 — en mode Planning l'origine `gps` n'est jamais
 * utilisée (réservée à Live, Story 3.1), mais le schéma la supporte déjà.
 */

/** Profils BRouter bas niveau (cf. RoutingService, Story 2.1). */
export const BrouterProfileSchema = z.enum(['fastbike', 'trekking', 'safety'])

/**
 * Coordonnée GPS DÉJÀ arrondie à 4 décimales (~11 m) côté client (Discovery #2).
 * On tolère l'imprécision flottante (488566.00000000006) via un epsilon.
 */
const RoundedCoord = z.number().refine(
  (n) => Math.abs(n * 10000 - Math.round(n * 10000)) < 1e-4,
  { message: 'Coordinate must be rounded to 4 decimals' },
)

// ── Origines (union discriminée sur `type`) ──────────────────────────────────

export const AccessOriginGpsSchema = z.object({
  type: z.literal('gps'),
  lat: RoundedCoord.min(-90).max(90),
  lng: RoundedCoord.min(-180).max(180),
})

export const AccessOriginStageSchema = z.object({
  type: z.literal('stage'),
  stageId: z.string().uuid(),
})

export const AccessOriginAdventureStartSchema = z.object({
  type: z.literal('adventure-start'),
})

export const AccessOriginSchema = z.discriminatedUnion('type', [
  AccessOriginGpsSchema,
  AccessOriginStageSchema,
  AccessOriginAdventureStartSchema,
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

// ── Réponse (union discriminée sur `status`, miroir de Story 2.2 AccessResult) ─

export const AccessResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    distanceM: z.number(),
    elevationGainM: z.number(),
    elevationLossM: z.number(),
    geometry: AccessGeometrySchema,
    engineVersion: z.string(),
    computedAt: z.string(),
    source: z.enum(['db-cache', 'redis-cache', 'computed-fresh']),
  }),
  z.object({
    status: z.literal('fallback'),
    fallbackReason: z.enum(['routing_failed', 'no_consent', 'unreachable']),
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
export type AccessOrigin = z.infer<typeof AccessOriginSchema>
export type BrouterProfile = z.infer<typeof BrouterProfileSchema>
