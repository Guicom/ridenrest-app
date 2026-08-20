import { apiFetch } from '@/lib/api/api-client';
import {
  MAX_LIVE_RADIUS_KM,
  type GooglePlaceDetails,
  type Poi,
  type PoiCategory,
} from '@ridenrest/shared';

// Façade API typée POI (MOB-4.2 / AC2, 4, 5). Unique point d'accès HTTP aux POIs
// d'une aventure — via `apiFetch` (Bearer JWT + 401/refresh + déballage `{ data }`),
// jamais `fetch`/`axios` direct.
//
// ⚠️ Chemins SANS préfixe `/api` : `apiFetch` l'ajoute déjà (api-client.ts). Backend
// epic 4 (web) 100 % livré — rien à recréer côté serveur.
//
// 🔒 RGPD (archi L795/L948) : la recherche corridor n'envoie JAMAIS de lat/lng
// utilisateur — uniquement `segmentId` + `fromKm/toKm`. `reverseCity` utilise les
// coords **du POI** (renvoyées par le serveur), pas la position user → conforme.

/**
 * Source interrogée. Omettre = comportement combiné historique (les deux sources dans une
 * seule réponse, donc l'utilisateur attend la plus lente). Préciser la source permet de
 * découpler les deux flux : Google répond en ~200 ms, Overpass a été mesuré entre 1 et 31 s
 * sur les instances publiques.
 */
export type PoiSource = 'google' | 'overpass';

export interface FindPoisParams {
  segmentId: string;
  fromKm: number;
  toKm: number;
  categories?: PoiCategory[];
  overpassEnabled?: boolean;
  source?: PoiSource;
}

/**
 * GET /pois (mode corridor/planning) → POIs le long d'un segment entre `fromKm` et
 * `toKm`. `categories` (multi) filtre par calque ; `overpassEnabled` (défaut false)
 * complète Google Places par Overpass (opt-in). Pas de lat/lng (RGPD).
 */
export function findPois(params: FindPoisParams): Promise<Poi[]> {
  const search = new URLSearchParams({
    segmentId: params.segmentId,
    fromKm: String(params.fromKm),
    toKm: String(params.toKm),
  });
  if (params.categories && params.categories.length > 0) {
    params.categories.forEach((c) => search.append('categories', c));
  }
  if (params.overpassEnabled) {
    search.set('overpassEnabled', 'true');
  }
  if (params.source) {
    search.set('source', params.source);
  }
  return apiFetch<Poi[]>(`/pois?${search.toString()}`);
}

/** Compteur des POI écartés par le filtre corridor, juste au-delà de la limite. */
export interface NearMissCount {
  count: number;
  /** Distance du plus proche des masqués, en mètres. `null` si aucun. */
  nearestM: number | null;
  /** Seuil d'affichage effectif côté serveur — le client n'a pas à le redéclarer. */
  corridorWidthM: number;
  /** Borne haute du signalement : au-delà, c'est une autre vallée. */
  maxM: number;
}

export interface GetNearMissCountParams {
  segmentId: string;
  fromKm: number;
  toKm: number;
  categories?: PoiCategory[];
  overpassEnabled?: boolean;
}

/**
 * GET /pois/near-miss-count — combien de POI ont satisfait la recherche mais sont tombés juste
 * au-delà du corridor d'affichage.
 *
 * Endpoint SÉPARÉ de `/pois` à dessein : le `ResponseInterceptor` place le tableau de POI
 * directement dans `data`, donc y ajouter un champ casserait les binaires déjà distribués.
 * Planning uniquement — le mode live raisonne en rayon, pas en couloir.
 */
export function getNearMissCount(params: GetNearMissCountParams): Promise<NearMissCount> {
  const search = new URLSearchParams({
    segmentId: params.segmentId,
    fromKm: String(params.fromKm),
    toKm: String(params.toKm),
  });
  if (params.categories && params.categories.length > 0) {
    params.categories.forEach((c) => search.append('categories', c));
  }
  if (params.overpassEnabled) {
    search.set('overpassEnabled', 'true');
  }
  return apiFetch<NearMissCount>(`/pois/near-miss-count?${search.toString()}`);
}

export interface GetLivePoisParams {
  segmentId: string;
  /** km **cumulé** relatif à la trace du point cible (jamais de lat/lng — RGPD). */
  targetKm: number;
  /** Rayon de recherche autour du point cible (km). Capé à `MAX_LIVE_RADIUS_KM`. */
  radiusKm: number;
  categories?: PoiCategory[];
  overpassEnabled?: boolean;
  source?: PoiSource;
}

/**
 * GET /pois (mode **Live**) → POIs autour du point cible `targetKm` (rayon `radiusKm`).
 * `targetKm`/`radiusKm` sont **mutuellement exclusifs** avec `fromKm`/`toKm` côté DTO
 * serveur (`find-pois.dto.ts`). Le serveur résout le point via `getWaypointAtKm`
 * (interpolation des waypoints stockés, ownership check) → **aucune lat/lng envoyée**
 * par le client (RGPD, NFR-012). `radiusKm` est capé à `MAX_LIVE_RADIUS_KM` (20) côté
 * client en plus de la validation serveur. Google Places primaire + Overpass si opt-in.
 */
export function getLivePois(params: GetLivePoisParams): Promise<Poi[]> {
  const radiusKm = Math.min(params.radiusKm, MAX_LIVE_RADIUS_KM);
  const search = new URLSearchParams({
    segmentId: params.segmentId,
    targetKm: String(params.targetKm),
    radiusKm: String(radiusKm),
  });
  if (params.categories && params.categories.length > 0) {
    params.categories.forEach((c) => search.append('categories', c));
  }
  if (params.overpassEnabled) {
    search.set('overpassEnabled', 'true');
  }
  if (params.source) {
    search.set('source', params.source);
  }
  return apiFetch<Poi[]>(`/pois?${search.toString()}`);
}

/**
 * GET /pois/google-details → enrichissement Google d'un POI (par `externalId`).
 * Optionnel : `null` sur échec (jamais de throw — l'enrichissement ne doit pas
 * bloquer la fiche, AC4).
 */
export async function getPoiGoogleDetails(
  externalId: string,
  segmentId: string,
): Promise<GooglePlaceDetails | null> {
  try {
    return await apiFetch<GooglePlaceDetails>(
      `/pois/google-details?externalId=${encodeURIComponent(externalId)}&segmentId=${encodeURIComponent(segmentId)}`,
    );
  } catch {
    return null;
  }
}

export interface ReverseCityResult {
  city: string | null;
  postcode: string | null;
  state: string | null;
  country: string | null;
}

/**
 * GET /geo/reverse-city → ville/CP/région/pays depuis les coords **du POI** (pas la
 * position user → RGPD OK). Enrichit la fiche hébergement (AC4).
 */
export function reverseCity(lat: number, lng: number): Promise<ReverseCityResult> {
  return apiFetch<ReverseCityResult>(`/geo/reverse-city?lat=${lat}&lng=${lng}`);
}
