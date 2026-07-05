import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { AccessVariant } from '@ridenrest/shared';

import { computeTraceBounds, isValidLngLat } from './maplibre-config';

// Helpers PURS (testables hors React, T6) pour la polyline d'itinéraire d'accès POI
// (MOB-4.7 — parité web `AccessMapLayer`). Construisent la `FeatureCollection`
// (une feature par variante, propriété `idx`), le bbox englobant et les expressions
// de filtre `idx` qui isolent la variante sélectionnée des « fantômes ».
//
// ⚠️ MapLibre **Native** crash (SIGABRT) sur une coordonnée non finie dans une source
// GeoJSON (cf. `isValidLngLat`, AGENTS.md). Toutes les coordonnées d'accès sont donc
// filtrées **au niveau du point** avant d'entrer dans la source, puis on re-vérifie
// le seuil `≥ 2` points par ligne (une LineString peut retomber sous 2 points valides).

/** Source GeoJSON unique (parité id web `poi-access-source`). */
export const ACCESS_SOURCE_ID = 'poi-access';
/** Variantes non sélectionnées — gris pointillé tapable. */
export const ACCESS_GHOST_LAYER_ID = 'poi-access-ghost';
/** Liseré blanc continu sous la variante sélectionnée (contraste tous fonds). */
export const ACCESS_CASING_LAYER_ID = 'poi-access-casing';
/** Variante sélectionnée — magenta pointillé. */
export const ACCESS_LINE_LAYER_ID = 'poi-access-line';

/** Magenta/fuchsia — accent de la variante sélectionnée (cohérent chips MOB-4.6). */
export const ACCESS_ROUTE_COLOR = '#e6007e';
/** Gris des variantes fantômes. */
export const ACCESS_GHOST_COLOR = '#9ca3af';
/** Blanc du liseré de contraste. */
export const ACCESS_CASING_COLOR = '#ffffff';

/** Géométrie d'une feature d'accès (LineString simple ou multi-tronçons). */
type AccessLineGeometry = GeoJSON.LineString | GeoJSON.MultiLineString;

/** Ne garde que les positions `[lng, lat]` finies (filtre point par point). */
function normalizeLine(coordinates: readonly number[][]): [number, number][] {
  const out: [number, number][] = [];
  for (const c of coordinates) {
    const lng = c[0];
    const lat = c[1];
    // Tronque toute élévation (`[lng, lat, ele]`) — MapLibre la tolère mais on
    // normalise à 2 composantes pour des features homogènes.
    if (isValidLngLat(lng, lat)) out.push([lng as number, lat as number]);
  }
  return out;
}

/**
 * `FeatureCollection` des variantes d'accès : une feature par variante, propriété
 * `idx` = index **d'origine** dans `variants` (jamais ré-indexé après filtrage) →
 * le filtre `idx` reste aligné sur `selectedVariantIndex`. Une variante dont la
 * géométrie n'a plus ≥ 2 points valides est **omise** (pas de feature dégénérée).
 */
export function buildAccessFeatureCollection(
  variants: readonly AccessVariant[],
): GeoJSON.FeatureCollection<AccessLineGeometry> {
  const features: GeoJSON.Feature<AccessLineGeometry>[] = [];
  variants.forEach((variant, idx) => {
    const geometry = variant.geometry;
    if (geometry.type === 'LineString') {
      const coords = normalizeLine(geometry.coordinates);
      if (coords.length >= 2) {
        features.push({
          type: 'Feature',
          properties: { idx },
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
      return;
    }
    if (geometry.type !== 'MultiLineString') return;
    // MultiLineString : normalise chaque tronçon, ne garde que ceux à ≥ 2 points.
    const lines = geometry.coordinates
      .map((line) => normalizeLine(line))
      .filter((line) => line.length >= 2);
    if (lines.length > 0) {
      features.push({
        type: 'Feature',
        properties: { idx },
        geometry: { type: 'MultiLineString', coordinates: lines },
      });
    }
  });
  return { type: 'FeatureCollection', features };
}

/**
 * Bbox `LngLatBounds` (`[west, south, east, north]`) englobant **toutes** les variantes.
 * Réutilise `computeTraceBounds` (`@ridenrest/gpx`, buffer 1 km) → cadrage confortable,
 * jamais bord-à-bord. `null` si aucune coordonnée valide (l'appelant ne fit pas alors).
 */
export function computeAccessBounds(
  variants: readonly AccessVariant[],
): LngLatBounds | null {
  const points: { lat: number; lng: number }[] = [];
  for (const variant of variants) {
    const geometry = variant.geometry;
    const lines =
      geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    for (const line of lines) {
      for (const c of line) {
        if (isValidLngLat(c[0], c[1])) points.push({ lng: c[0]!, lat: c[1]! });
      }
    }
  }
  return computeTraceBounds(points);
}

/** Filtre MapLibre : variantes **autres** que la sélectionnée (fantômes). */
export function ghostFilter(selectedIndex: number): ExpressionSpecification {
  return ['!=', ['get', 'idx'], selectedIndex];
}

/** Filtre MapLibre : **uniquement** la variante sélectionnée (liseré + trait). */
export function selectedFilter(selectedIndex: number): ExpressionSpecification {
  return ['==', ['get', 'idx'], selectedIndex];
}

/**
 * Index de la variante tapée à partir d'un évènement de press de source GeoJSON
 * (résilient à la forme native : `nativeEvent.features` ou payload direct hors device).
 * `null` si aucune feature exploitable.
 */
export function extractTappedVariantIndex(event: unknown): number | null {
  const e = event as {
    features?: GeoJSON.Feature[];
    nativeEvent?: { features?: GeoJSON.Feature[] };
  };
  const features = e?.nativeEvent?.features ?? e?.features ?? [];
  const idx = features[0]?.properties?.idx;
  return Number.isInteger(idx) ? (idx as number) : null;
}
