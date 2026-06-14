import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { MapWaypoint, WeatherPoint } from '@ridenrest/shared';
import { useMemo } from 'react';

import {
  buildWeatherLineSegments,
  buildWindArrowPoints,
} from '@/lib/map/weather-geojson';
import type { WeatherDimension } from '@/lib/stores/map.store';

// Overlay météo — enfant du `<Map>` (via `MapCanvas`). Ligne colorée selon la dimension
// (temp/pluie/vent) + flèches de vent (visibles en dimension « vent »). Port iso de
// `weather-layer.tsx` web (mêmes échelles de couleur + conversion d'angle).

const LINE_COLOR_EXPRESSIONS: Record<WeatherDimension, ExpressionSpecification> = {
  temperature: [
    'case',
    ['get', 'available'],
    [
      'interpolate',
      ['linear'],
      ['get', 'temperatureC'],
      0,
      '#3b82f6',
      15,
      '#fbbf24',
      30,
      '#ef4444',
    ],
    '#9ca3af',
  ],
  precipitation: [
    'case',
    ['get', 'available'],
    [
      'interpolate',
      ['linear'],
      ['get', 'precipitationProbability'],
      0,
      '#86efac',
      50,
      '#facc15',
      100,
      '#1d4ed8',
    ],
    '#9ca3af',
  ],
  wind: [
    'case',
    ['get', 'available'],
    [
      'interpolate',
      ['linear'],
      ['get', 'windSpeedKmh'],
      0,
      '#d1fae5',
      30,
      '#fb923c',
      60,
      '#7c3aed',
    ],
    '#9ca3af',
  ],
};

export interface WeatherLayerProps {
  waypoints: readonly MapWaypoint[];
  weatherPoints: readonly WeatherPoint[];
  dimension: WeatherDimension;
  enabled: boolean;
}

export function WeatherLayer({
  waypoints,
  weatherPoints,
  dimension,
  enabled,
}: WeatherLayerProps) {
  const lines = useMemo(
    () => buildWeatherLineSegments(waypoints, weatherPoints),
    [waypoints, weatherPoints],
  );
  const arrows = useMemo(
    () => buildWindArrowPoints(weatherPoints, waypoints),
    [weatherPoints, waypoints],
  );

  if (!enabled || lines.features.length === 0) return null;

  return (
    <>
      <GeoJSONSource id="weather-lines" data={lines}>
        <Layer
          id="weather-lines-layer"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-width': 5,
            'line-color': LINE_COLOR_EXPRESSIONS[dimension],
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id="weather-wind-arrows" data={arrows}>
        <Layer
          id="weather-wind-arrows-layer"
          type="symbol"
          layout={{
            'text-field': '→',
            'text-size': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'windSpeedKmh'], 0],
              0,
              16,
              20,
              24,
              40,
              36,
              60,
              48,
            ],
            'text-rotate': ['coalesce', ['get', 'windDirectionMaplibre'], 0],
            'text-rotation-alignment': 'map',
            'text-allow-overlap': true,
            visibility: dimension === 'wind' ? 'visible' : 'none',
          }}
          paint={{
            'text-color': '#1e40af',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
