import type { WeatherPoint } from '@ridenrest/shared'
import type { MapWaypoint } from '@ridenrest/shared'

/**
 * Build GeoJSON LineString features for weather-colored route segments.
 * Each feature spans the full-resolution waypoints between two adjacent sampled waypoints,
 * with weather properties from the first sampled point applied to the entire interval.
 */
export function buildWeatherLineSegments(
  allWaypoints: MapWaypoint[],
  weatherPoints: WeatherPoint[],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []

  for (let i = 0; i < weatherPoints.length - 1; i++) {
    const current = weatherPoints[i]
    const next = weatherPoints[i + 1]

    // Use all full-resolution waypoints between current.km and next.km
    const coords = allWaypoints
      .filter((wp) => wp.distKm >= current.km && wp.distKm <= next.km)
      .map((wp) => [wp.lng, wp.lat])  // GeoJSON = [lng, lat]

    if (coords.length < 2) continue

    const available = current.temperatureC !== null

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
        forecastAt: current.forecastAt,
        available,
      },
    })
  }

  return { type: 'FeatureCollection', features }
}

/**
 * Build GeoJSON Point features for wind direction arrows at each sampled waypoint.
 * Pre-converts wind direction from meteorological convention (0°=N, clockwise)
 * to MapLibre text-rotate convention (0°=East, clockwise):
 * maplibreAngle = (windDeg - 90 + 360) % 360
 */
export function buildWindArrowPoints(weatherPoints: WeatherPoint[], allWaypoints: MapWaypoint[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = []

  for (const wp of weatherPoints) {
    // Find closest waypoint to this km position
    const nearest = allWaypoints.reduce((prev, cur) =>
      Math.abs(cur.distKm - wp.km) < Math.abs(prev.distKm - wp.km) ? cur : prev,
      allWaypoints[0],
    )

    if (!nearest) continue

    const windDirectionMaplibre =
      wp.windDirection !== null ? (wp.windDirection - 90 + 360) % 360 : null

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [nearest.lng, nearest.lat] },
      properties: {
        windDirection: wp.windDirection,
        windDirectionMaplibre,
        windSpeedKmh: wp.windSpeedKmh,
        km: wp.km,
      },
    })
  }

  return { type: 'FeatureCollection', features }
}
