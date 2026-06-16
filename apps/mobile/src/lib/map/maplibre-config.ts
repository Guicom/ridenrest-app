import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { computeBoundingBox } from '@ridenrest/gpx';
import type { MapSegmentData } from '@ridenrest/shared';

// Configuration centrale de la carte MapLibre Native (MOB-4.1 / AC1-3). Constantes
// de rendu de la trace + style light/dark + helpers GeoJSON/bbox PURS (testables
// hors React, T8). Aucune dépendance à un composant : importable côté tests.

/** Couleur de marque uniforme de la trace (parité web `map-canvas.tsx` C8). */
export const TRACE_COLOR = '#2D6A4A';
/** Largeur de la ligne de trace (parité web). */
export const TRACE_WIDTH = 3;
/** Padding (px) du fit caméra autour de la trace (FR-026, parité web `fitToTrace`). */
export const FIT_PADDING = 40;
/** Durée d'animation caméra (ms) du fit auto. */
export const CAMERA_ANIMATION_MS = 500;

/**
 * Padding (px) sûr pour `fitBounds`, clampé à la taille rendue de la carte.
 * MapLibre Native émet une erreur au fit (« Unable to calculate appropriate zoom
 * level for bounds. Vertical or horizontal padding is greater than map's height or
 * width. ») quand `2×padding ≥ min(width, height)` — typiquement quand la surface
 * native n'a pas encore sa taille finale au moment du fit. On borne le padding à un
 * peu moins de la moitié de la plus petite dimension, et on renvoie `0` tant que la
 * carte n'est pas mesurée (`width`/`height` ≤ 0) → l'appelant doit alors différer le fit.
 */
export function safeFitPadding(
  width: number,
  height: number,
  desired: number = FIT_PADDING,
): number {
  const minDim = Math.min(width, height);
  if (minDim <= 0) return 0;
  // 1px de sécurité sous la moitié pour garantir `2×padding < dimension`.
  const max = Math.max(0, Math.floor(minDim / 2) - 1);
  return Math.min(desired, max);
}

// Styles de tuiles : **OpenFreeMap** vectoriel (parité web `lib/map-styles.ts`) —
// zéro clé API, attribution OSM suffisante (décision MOB-4.1, Open Question 1). Light
// = « liberty » (défaut web), Dark = « dark ». Pas d'`EXPO_PUBLIC_*` requis (raster
// vs vectoriel tranché : vectoriel, cf. story §Open Questions).
const STYLE_URL_LIGHT = 'https://tiles.openfreemap.org/styles/liberty';
const STYLE_URL_DARK = 'https://tiles.openfreemap.org/styles/dark';

/** URL de style carte selon le thème courant (suit `useColorScheme`, FR-021). */
export function getMapStyle(colorScheme: 'light' | 'dark'): string {
  return colorScheme === 'dark' ? STYLE_URL_DARK : STYLE_URL_LIGHT;
}

/** Vrai si au moins un segment porte une trace exploitable (≥ 2 waypoints). */
export function hasTrace(segments: readonly MapSegmentData[] | undefined): boolean {
  return !!segments?.some((s) => !!s.waypoints && s.waypoints.length >= 2);
}

/**
 * Aplati tous les waypoints des segments en une liste `{ lat, lng }` (ordre des
 * segments préservé). Utilisé pour le calcul de bbox du fit caméra.
 */
export function collectTraceWaypoints(
  segments: readonly MapSegmentData[],
): { lat: number; lng: number }[] {
  return segments
    .flatMap((s) => s.waypoints ?? [])
    .map((w) => ({ lat: w.lat, lng: w.lng }));
}

/**
 * Bbox de la trace au format MapLibre `LngLatBounds` = `[west, south, east, north]`
 * (= `[minLng, minLat, maxLng, maxLat]`). `null` si aucun waypoint (la caméra ne
 * doit alors PAS tenter de fit). Réutilise `computeBoundingBox` de `@ridenrest/gpx`
 * (buffer 1 km par défaut) plutôt que de recoder le calcul.
 */
export function computeTraceBounds(
  waypoints: readonly { lat: number; lng: number }[],
): LngLatBounds | null {
  if (!waypoints || waypoints.length === 0) return null;
  const bbox = computeBoundingBox(waypoints.map((w) => ({ lat: w.lat, lng: w.lng })));
  return [bbox.minLng, bbox.minLat, bbox.maxLng, bbox.maxLat];
}

/**
 * Bbox des waypoints (km **cumulés**) dans `[fromKm, toKm]` — pour le zoom corridor
 * après recherche (parité web `fitToCorridorRange`). `null` si moins de 2 points dans
 * la plage → l'appelant retombe alors sur la trace entière (`computeTraceBounds`).
 */
export function computeCorridorBounds(
  waypoints: readonly { lat: number; lng: number; distKm: number }[],
  fromKm: number,
  toKm: number,
): LngLatBounds | null {
  const inRange = waypoints.filter((w) => w.distKm >= fromKm && w.distKm <= toKm);
  if (inRange.length < 2) return null;
  return computeTraceBounds(inRange);
}

/**
 * Construit la `FeatureCollection` GeoJSON de la trace : une `LineString` par
 * segment ayant ≥ 2 waypoints (parité web `buildGeoJsonFeatures`). Coordonnées en
 * **ordre GeoJSON `[lng, lat]`** (jamais `[lat, lng]`).
 */
export function buildTraceFeatureCollection(
  segments: readonly MapSegmentData[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  return {
    type: 'FeatureCollection',
    features: segments
      .filter((s) => !!s.waypoints && s.waypoints.length >= 2)
      .map((segment, idx) => ({
        type: 'Feature' as const,
        properties: { segmentId: segment.id, segmentIndex: idx },
        geometry: {
          type: 'LineString' as const,
          coordinates: segment.waypoints!.map((w) => [w.lng, w.lat]),
        },
      })),
  };
}
