/**
 * Stratégie cache Redis du mode Live (Story 3.1, AC #3).
 *
 * Anonymisation (NFR-PA-006) : la clé est `access:live:{poiId}:{profile}:{lat}:{lng}`.
 * Elle ne contient JAMAIS `userId` — deux users à la même position partagent la même
 * entrée, et la révocation du consentement n'a aucune PII à purger (les entrées
 * expirent naturellement, cf. AC #6).
 *
 * Aucun stockage durable de la position GPS (AC #5) : Redis est volatil (TTL 15 min),
 * la clé encode des coordonnées déjà arrondies à 4 décimales (~11 m) côté client.
 *
 * Fonctions pures : le client Redis est passé en paramètre (testable sans DI NestJS,
 * cohérent avec resolve-origin / compute-divergent-segment).
 */
import type { GeoJSONGeometry } from '../types/access-result.types.js'

/**
 * Sous-ensemble du client `ioredis` consommé par ce wrapper. Permet d'injecter le vrai
 * client (via `RedisProvider.getClient()`) en prod et un fake en test.
 */
export interface RedisLike {
  get(key: string): Promise<string | null>
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>
}

/** Payload mis en cache Redis — métriques d'accès suffisantes pour reconstruire un `status: 'ok'`. */
export interface CachedAccessMetrics {
  distanceM: number
  elevationGainM: number
  elevationLossM: number
  geometry: GeoJSONGeometry
  engineVersion: string
  computedAt: string
}

/** Préfixe de toutes les clés du cache Live (sert aussi au grep anti-PII des Dev Notes). */
export const ACCESS_LIVE_KEY_PREFIX = 'access:live'

/**
 * Construit la clé Redis anonyme du mode Live.
 * @param poiId  Identifiant du POI (`accommodations_cache.id`).
 * @param profile Profil BRouter bas niveau effectivement utilisé pour le calcul.
 * @param lat/lng Coordonnées GPS déjà arrondies 4 décimales (jamais de PII : pas d'userId).
 */
export function buildAccessLiveKey({
  poiId,
  profile,
  lat,
  lng,
}: {
  poiId: string
  profile: string
  lat: number
  lng: number
}): string {
  return `${ACCESS_LIVE_KEY_PREFIX}:${poiId}:${profile}:${lat}:${lng}`
}

/**
 * Lit une entrée du cache Live. Renvoie `null` sur miss OU sur payload corrompu
 * (JSON invalide / forme inattendue) — un miss force un recalcul propre.
 */
export async function getCachedAccess(redis: RedisLike, key: string): Promise<CachedAccessMetrics | null> {
  const raw = await redis.get(key)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<CachedAccessMetrics>
    if (
      typeof parsed.distanceM === 'number' &&
      typeof parsed.elevationGainM === 'number' &&
      typeof parsed.elevationLossM === 'number' &&
      typeof parsed.engineVersion === 'string' &&
      typeof parsed.computedAt === 'string' &&
      parsed.geometry != null &&
      (parsed.geometry.type === 'LineString' || parsed.geometry.type === 'MultiLineString')
    ) {
      return parsed as CachedAccessMetrics
    }
  } catch {
    // payload corrompu → traité comme un miss
  }
  return null
}

/** Écrit une entrée du cache Live avec TTL (best-effort : l'appelant catch les erreurs Redis). */
export async function setCachedAccess(
  redis: RedisLike,
  key: string,
  metrics: CachedAccessMetrics,
  ttlSeconds: number,
): Promise<void> {
  await redis.setex(key, ttlSeconds, JSON.stringify(metrics))
}
