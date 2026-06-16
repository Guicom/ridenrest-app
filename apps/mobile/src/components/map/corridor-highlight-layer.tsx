import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { MapWaypoint } from '@ridenrest/shared';
import { useMemo } from 'react';

import { buildCorridorFeature } from '@/lib/map/corridor-features';

// Surbrillance du corridor de recherche — enfant du `<Map>` (via `MapCanvas`), au-dessus
// de la trace. Ligne bleue (#3498db, largeur 8) sur la portion `[fromKm, toKm]`. Affichée
// dès que l'utilisateur a touché la plage (`searchRangeInteracted`, parité web).

const CORRIDOR_COLOR = '#3498db'; // bleu vif — ne se confond pas avec les routes OSM

export interface CorridorHighlightLayerProps {
  waypoints: readonly MapWaypoint[];
  fromKm: number;
  toKm: number;
  visible: boolean;
}

export function CorridorHighlightLayer({
  waypoints,
  fromKm,
  toKm,
  visible,
}: CorridorHighlightLayerProps) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () =>
      visible && waypoints.length > 0
        ? buildCorridorFeature(waypoints, fromKm, toKm)
        : { type: 'FeatureCollection', features: [] },
    [visible, waypoints, fromKm, toKm],
  );

  if (!visible || data.features.length === 0) return null;

  return (
    <GeoJSONSource id="corridor" data={data}>
      <Layer
        id="corridor-highlight"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': CORRIDOR_COLOR,
          'line-width': 8,
          'line-opacity': 0.9,
        }}
      />
    </GeoJSONSource>
  );
}
