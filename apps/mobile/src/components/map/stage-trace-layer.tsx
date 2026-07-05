import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { AdventureStageResponse, MapWaypoint } from '@ridenrest/shared';
import { useMemo } from 'react';

import { buildStageColoredFeatures } from '@/lib/map/stage-features';

// Trace recolorée par étape — enfant du `<Map>` (via `MapCanvas`), au-dessus de la trace
// de base. Une `LineString` par étape, couleur = `stage.color` (parité web). Rendu quand
// `visible` (toggle store) ET qu'au moins une étape existe.

export interface StageTraceLayerProps {
  waypoints: readonly MapWaypoint[];
  stages: readonly AdventureStageResponse[];
  visible: boolean;
}

export function StageTraceLayer({
  waypoints,
  stages,
  visible,
}: StageTraceLayerProps) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features:
        visible && waypoints.length > 0
          ? buildStageColoredFeatures(waypoints, stages)
          : [],
    }),
    [visible, waypoints, stages],
  );

  if (!visible || data.features.length === 0) return null;

  return (
    <GeoJSONSource id="trace-stages" data={data}>
      <Layer
        id="trace-stages-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.95,
        }}
      />
    </GeoJSONSource>
  );
}
