/**
 * Types pour le wrapper BRouter (RoutingService).
 *
 * Coordonnées : TOUJOURS [lon, lat] (GeoJSON) — jamais [lat, lon].
 * Cf. architecture POI Access §Enforcement Guidelines règle #1.
 */

/**
 * Profils BRouter bas niveau (PAS les labels projet Route/Gravel/Bikepacking).
 * DOIVENT exister dans le build BRouter (`/profiles2/*.brf`). `safety` n'est PAS fourni
 * par le build v1.7.9 → retiré (mapping projet : road→fastbike, gravel→gravel, bikepacking→trekking).
 */
export type BrouterProfile = 'fastbike' | 'trekking' | 'gravel'

/** Une coordonnée 3D GeoJSON : [lon, lat, ele]. */
export type LonLatEle = [number, number, number]

/** Une coordonnée 2D GeoJSON : [lon, lat]. Typage tuple strict pour empêcher l'inversion. */
export type LonLat = readonly [number, number]

/** Itinéraire BRouter normalisé retourné par RoutingService. */
export interface BrouterRoute {
  geometry: { type: 'LineString'; coordinates: LonLatEle[] }
  distanceM: number
  elevationGainM: number
  elevationLossM: number
}

/** Paramètres d'appel de computeRoute. `from`/`to` au format [lon, lat]. */
export interface ComputeRouteParams {
  from: LonLat
  to: LonLat
  profile: BrouterProfile
}
