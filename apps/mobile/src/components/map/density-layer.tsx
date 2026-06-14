import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { CoverageGapSummary, MapSegmentData } from '@ridenrest/shared';
import { useMemo } from 'react';

import { buildDensityColoredFeatures } from '@/lib/map/density-features';

// Overlay de colorisation densité — enfant du `<Map>` (via `MapCanvas`). Rendu seulement
// quand `enabled` (toggle store) ET analyse `success`. Une `LineString` colorée par
// tronçon de 10 km (vert/orange/rouge), au-dessus de la trace. Port iso du web.

export interface DensityLayerProps {
  segments: readonly MapSegmentData[];
  coverageGaps: readonly CoverageGapSummary[];
  enabled: boolean;
}

export function DensityLayer({
  segments,
  coverageGaps,
  enabled,
}: DensityLayerProps) {
  const data = useMemo<GeoJSON.FeatureCollection<GeoJSON.LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: enabled ? buildDensityColoredFeatures(segments, coverageGaps) : [],
    }),
    [enabled, segments, coverageGaps],
  );

  if (!enabled || data.features.length === 0) return null;

  return (
    <GeoJSONSource id="trace-density" data={data}>
      <Layer
        id="trace-density-line"
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': ['get', 'color'],
          'line-width': 4,
          'line-opacity': 0.9,
        }}
      />
    </GeoJSONSource>
  );
}
