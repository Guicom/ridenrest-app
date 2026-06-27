import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';
import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { MapWaypoint, WeatherPoint } from '@ridenrest/shared';
import { useMemo } from 'react';
import type { ImageRequireSource } from 'react-native';

import {
  buildWeatherLineSegments,
  buildWindArrowPoints,
} from '@/lib/map/weather-geojson';
import type { WeatherDimension } from '@/lib/stores/map.store';

// Flèche de vent comme image carte (clé MapLibre `wind-arrow`) — `require` statique
// du PNG bundlé (parité pattern `PIN_IMAGE_SOURCES`). L'asset pointe vers l'Est.
const WIND_ARROW_IMAGES: Record<string, ImageRequireSource> = {
  'wind-arrow': require('../../../assets/wind-arrow.png'),
};

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
      {/* Flèche enregistrée comme IMAGE (pas un glyphe texte) : sur MapLibre **Native**,
          un `text-field: '→'` ne rend RIEN — le glyphe U+2192 est absent de la fontstack
          par défaut servie par OpenFreeMap (validé sur device). On bascule donc sur
          `icon-image` (indépendant des glyphes), approche unifiée web↔mobile. L'asset
          pointe vers l'Est → `icon-rotate = windDirectionMaplibre` préserve la conversion
          `(deg-90+360)%360`. */}
      <Images images={WIND_ARROW_IMAGES} />
      <GeoJSONSource id="weather-wind-arrows" data={arrows}>
        <Layer
          id="weather-wind-arrows-layer"
          type="symbol"
          layout={{
            'icon-image': 'wind-arrow',
            // Taille ∝ vitesse (AC5). Source PNG 128px → facteur ≈ pxCible/128
            // (≈ 23/36/51/67 px sur les paliers calme→tempête).
            'icon-size': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'windSpeedKmh'], 0],
              0,
              0.18,
              20,
              0.28,
              40,
              0.4,
              60,
              0.52,
            ],
            'icon-rotate': ['coalesce', ['get', 'windDirectionMaplibre'], 0],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            visibility: dimension === 'wind' ? 'visible' : 'none',
          }}
          paint={{
            // Vent quasi-nul atténué (AC5) : opacité 0.4 à 0 km/h → pleine dès ~5 km/h.
            'icon-opacity': [
              'interpolate',
              ['linear'],
              ['coalesce', ['get', 'windSpeedKmh'], 0],
              0,
              0.4,
              5,
              1,
            ],
          }}
        />
      </GeoJSONSource>
    </>
  );
}
