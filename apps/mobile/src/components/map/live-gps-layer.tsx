import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useMemo } from 'react';

import { isValidLngLat, TRACE_COLOR } from '@/lib/map/maplibre-config';
import { useLiveStore } from '@/lib/stores/live.store';

// Point GPS Live (MOB-5.2 / T5, AC5) — dot + halo à la position courante. Parité web
// `live-map-canvas.tsx` (`gps-halo` / `gps-dot`). À monter comme **enfant** de
// `<MapCanvas>` : ses `children` ne sont rendus qu'après `styleLoaded` (gate anti-SIGABRT,
// AGENTS.md) → la `<GeoJSONSource>` ne reçoit jamais `setShape` pendant le chargement du style.
//
// CRITIQUE — coordonnée filtrée par `isValidLngLat` AVANT de bâtir la feature : MapLibre
// Native crash (SIGABRT) sur une coordonnée non finie. Position perdue (`currentPosition`
// null) ou non finie → `FeatureCollection` **vide** (source vidée, pas de dot fantôme).
//
// Marqueur **non interactif** → `<Layer type="circle">` (et non un `<Marker>`, dont les
// enfants sont rendus sur un bitmap non-fiable au tap sur iOS, AGENTS.md). Couleur de marque
// en style inline (jamais via Tailwind — règle couleurs dynamiques carte).

/**
 * `FeatureCollection` du point GPS — **pur**, testable hors React. Position `null` ou
 * coordonnée non finie (`isValidLngLat`) → collection **vide** (source vidée, anti-SIGABRT).
 * Coordonnées en ordre GeoJSON `[lng, lat]`.
 */
export function buildGpsFeatureCollection(
  position: { lat: number; lng: number } | null,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  if (!position || !isValidLngLat(position.lng, position.lat)) {
    return { type: 'FeatureCollection', features: [] };
  }
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [position.lng, position.lat] },
      },
    ],
  };
}

export function LiveGpsLayer() {
  const currentPosition = useLiveStore((s) => s.currentPosition);

  const data = useMemo(
    () => buildGpsFeatureCollection(currentPosition),
    [currentPosition],
  );

  return (
    <GeoJSONSource id="gps-position" data={data}>
      {/* Halo translucide (rayon large, sans contour). */}
      <Layer
        id="gps-halo"
        type="circle"
        paint={{
          'circle-radius': 14,
          'circle-color': TRACE_COLOR,
          'circle-opacity': 0.25,
          'circle-stroke-width': 0,
        }}
      />
      {/* Point plein, contour blanc (lisibilité sur fond carte clair/sombre). */}
      <Layer
        id="gps-dot"
        type="circle"
        paint={{
          'circle-radius': 8,
          'circle-color': TRACE_COLOR,
          'circle-opacity': 1,
          'circle-stroke-width': 3,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-opacity': 1,
        }}
      />
    </GeoJSONSource>
  );
}
