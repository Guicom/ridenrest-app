import { describe, it, expect } from 'vitest'
import { buildWeatherLineSegments, buildWindArrowPoints } from './weather-geojson'
import type { WeatherPoint } from '@ridenrest/shared'
import type { MapWaypoint } from '@ridenrest/shared'

const waypoints: MapWaypoint[] = [
  { distKm: 0, lat: 48.0, lng: 2.0 },
  { distKm: 2.5, lat: 48.05, lng: 2.05 },
  { distKm: 5, lat: 48.1, lng: 2.1 },
  { distKm: 7.5, lat: 48.15, lng: 2.15 },
  { distKm: 10, lat: 48.2, lng: 2.2 },
]

const weatherPoints: WeatherPoint[] = [
  { km: 0, forecastAt: '2026-03-22T08:00:00Z', temperatureC: 15, precipitationProbability: 10, windSpeedKmh: 20, windDirection: 270, weatherCode: 1, iconEmoji: '🌤' },
  { km: 5, forecastAt: '2026-03-22T08:15:00Z', temperatureC: null, precipitationProbability: null, windSpeedKmh: null, windDirection: null, weatherCode: null, iconEmoji: null },
  { km: 10, forecastAt: '2026-03-22T08:30:00Z', temperatureC: null, precipitationProbability: null, windSpeedKmh: null, windDirection: null, weatherCode: null, iconEmoji: null },
]

describe('buildWeatherLineSegments', () => {
  it('returns a FeatureCollection', () => {
    const result = buildWeatherLineSegments(waypoints, weatherPoints)
    expect(result.type).toBe('FeatureCollection')
    expect(Array.isArray(result.features)).toBe(true)
  })

  it('creates one feature per adjacent pair of weather points', () => {
    const result = buildWeatherLineSegments(waypoints, weatherPoints)
    // 3 weather points → 2 segments
    expect(result.features).toHaveLength(2)
  })

  it('uses full-resolution waypoints between sampled points', () => {
    const result = buildWeatherLineSegments(waypoints, weatherPoints)
    const firstFeature = result.features[0]
    // waypoints at 0, 2.5, 5 km → 3 coordinate pairs
    expect(firstFeature.geometry.type).toBe('LineString')
    expect((firstFeature.geometry as GeoJSON.LineString).coordinates).toHaveLength(3)
  })

  it('coordinates are [lng, lat] order', () => {
    const result = buildWeatherLineSegments(waypoints, weatherPoints)
    const coords = (result.features[0].geometry as GeoJSON.LineString).coordinates
    // First waypoint at lat=48.0, lng=2.0 → GeoJSON should be [2.0, 48.0]
    expect(coords[0]).toEqual([2.0, 48.0])
  })

  it('sets available=true when temperatureC is not null', () => {
    const result = buildWeatherLineSegments(waypoints, weatherPoints)
    expect(result.features[0].properties?.available).toBe(true)
  })

  it('sets available=false when temperatureC is null (beyond horizon)', () => {
    const result = buildWeatherLineSegments(waypoints, weatherPoints)
    expect(result.features[1].properties?.available).toBe(false)
  })

  it('assigns weather properties from the starting sampled point', () => {
    const availablePoints: WeatherPoint[] = [
      { km: 0, forecastAt: '2026-03-22T08:00:00Z', temperatureC: 15, precipitationProbability: 10, windSpeedKmh: 20, windDirection: 270, weatherCode: 1, iconEmoji: '🌤' },
      { km: 5, forecastAt: '2026-03-22T08:15:00Z', temperatureC: 18, precipitationProbability: 5, windSpeedKmh: 15, windDirection: 180, weatherCode: 0, iconEmoji: '☀️' },
    ]
    const result = buildWeatherLineSegments(waypoints, availablePoints)
    const props = result.features[0].properties
    expect(props?.temperatureC).toBe(15)
    expect(props?.precipitationProbability).toBe(10)
    expect(props?.windSpeedKmh).toBe(20)
    expect(props?.iconEmoji).toBe('🌤')
    expect(props?.km).toBe(0)
  })
})

describe('buildWindArrowPoints', () => {
  it('returns a FeatureCollection with one point per weather waypoint', () => {
    const result = buildWindArrowPoints(weatherPoints, waypoints)
    expect(result.type).toBe('FeatureCollection')
    expect(result.features).toHaveLength(3)
  })

  it('converts wind direction from meteorological to MapLibre convention', () => {
    const dirPoints: WeatherPoint[] = [
      { km: 0, forecastAt: '2026-03-22T08:00:00Z', temperatureC: 15, precipitationProbability: 10, windSpeedKmh: 20, windDirection: 270, weatherCode: 1, iconEmoji: '🌤' },
      { km: 5, forecastAt: '2026-03-22T08:15:00Z', temperatureC: 18, precipitationProbability: 5, windSpeedKmh: 15, windDirection: 180, weatherCode: 0, iconEmoji: '☀️' },
    ]
    const result = buildWindArrowPoints(dirPoints, waypoints)
    // windDirection=270 → maplibreAngle = (270 - 90 + 360) % 360 = 180
    expect(result.features[0].properties?.windDirectionMaplibre).toBe(180)
    // windDirection=180 → maplibreAngle = (180 - 90 + 360) % 360 = 90
    expect(result.features[1].properties?.windDirectionMaplibre).toBe(90)
  })

  it('sets windDirectionMaplibre to null when windDirection is null', () => {
    const result = buildWindArrowPoints(weatherPoints, waypoints)
    // weatherPoints[1] and [2] have null windDirection
    expect(result.features[1].properties?.windDirectionMaplibre).toBeNull()
  })

  it('uses [lng, lat] order for Point coordinates', () => {
    const result = buildWindArrowPoints(weatherPoints, waypoints)
    const firstPoint = result.features[0].geometry as GeoJSON.Point
    // lat=48.0, lng=2.0 → [2.0, 48.0]
    expect(firstPoint.coordinates[0]).toBe(2.0)
    expect(firstPoint.coordinates[1]).toBe(48.0)
  })

  it('handles North wind direction (0°) correctly', () => {
    const northWindPoints: WeatherPoint[] = [
      { ...weatherPoints[0], windDirection: 0 },
      weatherPoints[1],
    ]
    const result = buildWindArrowPoints(northWindPoints, waypoints)
    // windDirection=0 → maplibreAngle = (0 - 90 + 360) % 360 = 270
    expect(result.features[0].properties?.windDirectionMaplibre).toBe(270)
  })
})
