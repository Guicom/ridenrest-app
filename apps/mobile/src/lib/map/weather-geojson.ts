import type { MapWaypoint, WeatherPoint } from '@ridenrest/shared';

import { isValidLngLat } from '@/lib/map/maplibre-config';

// Construction GeoJSON de l'overlay météo — port iso de `weather-geojson.ts` web.
// `weatherPoints` et `waypoints` sont en km **cumulés** (alignés). PUR → testable.

/** Une `LineString` par paire de points météo consécutifs, colorée selon ses props. */
export function buildWeatherLineSegments(
  waypoints: readonly MapWaypoint[],
  weatherPoints: readonly WeatherPoint[],
): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (let i = 0; i < weatherPoints.length - 1; i++) {
    const current = weatherPoints[i]!;
    const next = weatherPoints[i + 1]!;
    const coords = waypoints
      .filter((wp) => wp.distKm >= current.km && wp.distKm <= next.km && isValidLngLat(wp.lng, wp.lat))
      .map((wp) => [wp.lng, wp.lat] as [number, number]);
    if (coords.length < 2) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {
        temperatureC: current.temperatureC,
        windSpeedKmh: current.windSpeedKmh,
        windDirection: current.windDirection,
        precipitationProbability: current.precipitationProbability,
        iconEmoji: current.iconEmoji,
        km: current.km,
        available: current.temperatureC !== null,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/** Un point par échantillon météo, avec l'angle de flèche vent converti MapLibre. */
export function buildWindArrowPoints(
  weatherPoints: readonly WeatherPoint[],
  waypoints: readonly MapWaypoint[],
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  const features: GeoJSON.Feature<GeoJSON.Point>[] = [];
  // Ne considérer que des waypoints à coords finies (cf. AGENTS.md) — sinon le point
  // « flèche vent » le plus proche pourrait porter une coordonnée non finie → SIGABRT.
  const validWaypoints = waypoints.filter((w) => isValidLngLat(w.lng, w.lat));
  if (validWaypoints.length === 0) return { type: 'FeatureCollection', features };

  for (const wp of weatherPoints) {
    let nearest = validWaypoints[0]!;
    let minDiff = Math.abs(nearest.distKm - wp.km);
    for (const cand of validWaypoints) {
      const diff = Math.abs(cand.distKm - wp.km);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = cand;
      }
    }
    // Convention météo (0°=N, horaire) → MapLibre text-rotate (0°=E, horaire).
    const windDirectionMaplibre =
      wp.windDirection !== null ? (wp.windDirection - 90 + 360) % 360 : null;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [nearest.lng, nearest.lat] },
      properties: {
        windDirection: wp.windDirection,
        windDirectionMaplibre,
        windSpeedKmh: wp.windSpeedKmh,
        km: wp.km,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}
