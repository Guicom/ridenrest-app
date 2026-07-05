import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

import {
  createCirclePolygon,
  isValidLngLat,
  TRACE_COLOR,
} from '@/lib/map/maplibre-config';

// Zone de recherche Live (MOB-5.3 / AC3) — **cercle de rayon** (`searchRadiusKm`) +
// **point cible** rendus sur la carte autour du point `targetKm`. Inséré comme **enfant
// de `<MapCanvas>`** (donc rendu seulement après `styleLoaded` — gate anti-SIGABRT) et
// AVANT `<PoiLayer>` → les pins restent au-dessus du cercle.
//
// Le centre = `findPointAtKm(waypoints, targetKm)` (calculé par l'écran). Quand le centre
// est `null` (GPS perdu / `targetKm` null) on **ne monte aucune source** → cercle masqué.
// Le polygone est un cercle géodésique à anneau fermé (`createCirclePolygon`, pur) ;
// `createCirclePolygon` renvoie `null` sur centre non fini (anti-SIGABRT).

const CIRCLE_STEPS = 64;

export interface LiveSearchZoneLayerProps {
  /** Centre = point à `targetKm` sur la trace. `null` → rien rendu (cercle masqué). */
  center: { lat: number; lng: number } | null;
  /** Rayon de recherche (km). */
  radiusKm: number;
}

export function LiveSearchZoneLayer({
  center,
  radiusKm,
}: LiveSearchZoneLayerProps) {
  const circle = useMemo(
    () => (center ? createCirclePolygon(center, radiusKm, CIRCLE_STEPS) : null),
    [center, radiusKm],
  );

  // Pas de centre valide / polygone null (GPS perdu, targetKm null) → source vidée.
  if (!center || !circle || !isValidLngLat(center.lng, center.lat)) return null;

  const targetPoint: GeoJSON.Feature<GeoJSON.Point> = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [center.lng, center.lat] },
    properties: {},
  };

  return (
    <>
      {/* Cercle de rayon : remplissage translucide + liseré (parité web, vert de marque). */}
      <GeoJSONSource id="live-search-radius" data={circle}>
        <Layer
          id="live-search-radius-fill"
          type="fill"
          paint={{ 'fill-color': TRACE_COLOR, 'fill-opacity': 0.08 }}
        />
        <Layer
          id="live-search-radius-line"
          type="line"
          paint={{
            'line-color': TRACE_COLOR,
            'line-opacity': 0.4,
            'line-width': 1.5,
          }}
        />
      </GeoJSONSource>
      {/* Point cible : halo + pastille à liseré blanc (centre de la recherche). */}
      <GeoJSONSource id="live-target-point" data={targetPoint}>
        <Layer
          id="live-target-dot-halo"
          type="circle"
          paint={{
            'circle-radius': 14,
            'circle-color': TRACE_COLOR,
            'circle-opacity': 0.2,
          }}
        />
        <Layer
          id="live-target-dot"
          type="circle"
          paint={{
            'circle-radius': 7,
            'circle-color': TRACE_COLOR,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
