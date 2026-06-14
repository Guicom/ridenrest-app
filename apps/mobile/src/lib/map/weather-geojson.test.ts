import type { MapWaypoint, WeatherPoint } from '@ridenrest/shared';

import {
  buildWeatherLineSegments,
  buildWindArrowPoints,
} from '@/lib/map/weather-geojson';

// Overlay météo (pur) — segments de ligne colorables + flèches de vent.

const waypoints: MapWaypoint[] = [
  { lat: 45.0, lng: 5.0, distKm: 0 },
  { lat: 45.1, lng: 5.1, distKm: 5 },
  { lat: 45.2, lng: 5.2, distKm: 10 },
];

function wp(km: number, tempC: number | null, windDir: number | null): WeatherPoint {
  return {
    km,
    forecastAt: '2026-06-15T08:00:00.000Z',
    temperatureC: tempC,
    precipitationProbability: 10,
    windSpeedKmh: 20,
    windDirection: windDir,
    weatherCode: 0,
    iconEmoji: '☀️',
  };
}

describe('buildWeatherLineSegments', () => {
  it('une LineString par paire consécutive, props météo + available', () => {
    const fc = buildWeatherLineSegments(waypoints, [wp(0, 10, 0), wp(10, 25, 90)]);
    expect(fc.features).toHaveLength(1);
    const f = fc.features[0]!;
    expect(f.geometry.coordinates.length).toBe(3); // tous les waypoints [0,10]
    expect(f.properties!.available).toBe(true);
    expect(f.properties!.temperatureC).toBe(10);
  });

  it('available=false quand temperature null', () => {
    const fc = buildWeatherLineSegments(waypoints, [wp(0, null, 0), wp(10, 5, 0)]);
    expect(fc.features[0]!.properties!.available).toBe(false);
  });
});

describe('buildWindArrowPoints', () => {
  it('convertit l’angle météo → MapLibre (deg-90)', () => {
    const fc = buildWindArrowPoints([wp(0, 10, 90)], waypoints);
    expect(fc.features).toHaveLength(1);
    // 90° météo → (90-90+360)%360 = 0 (Est).
    expect(fc.features[0]!.properties!.windDirectionMaplibre).toBe(0);
  });

  it('windDirection null → maplibre null', () => {
    const fc = buildWindArrowPoints([wp(5, 10, null)], waypoints);
    expect(fc.features[0]!.properties!.windDirectionMaplibre).toBeNull();
  });
});
