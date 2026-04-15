import { describe, it, expect } from 'vitest'
import { getCorridorCenter, buildBookingSearchUrl, buildBookingCoordUrl, buildAirbnbSearchUrl, extractCityFromOsmRawData } from './booking-url'
import type { MapWaypoint } from '@ridenrest/shared'

const makeWp = (distKm: number, lat: number, lng: number): MapWaypoint => ({
  lat, lng, ele: null, distKm,
})

describe('getCorridorCenter', () => {
  it('returns null for empty waypoints array', () => {
    expect(getCorridorCenter([], 50)).toBeNull()
  })

  it('returns the only waypoint when array has one element', () => {
    const wp = makeWp(10, 43.5, 1.4)
    expect(getCorridorCenter([wp], 999)).toEqual({ lat: 43.5, lng: 1.4 })
  })

  it('returns the waypoint closest to targetKm', () => {
    const waypoints = [
      makeWp(0,   43.0, 1.0),
      makeWp(10,  43.1, 1.1),
      makeWp(20,  43.2, 1.2),
      makeWp(30,  43.3, 1.3),
    ]
    const result = getCorridorCenter(waypoints, 18)
    // closest to 18 is km=20 (diff=2) over km=10 (diff=8)
    expect(result).toEqual({ lat: 43.2, lng: 1.2 })
  })

  it('returns the first waypoint when targetKm is before the route start', () => {
    const waypoints = [makeWp(50, 44.0, 2.0), makeWp(100, 45.0, 3.0)]
    expect(getCorridorCenter(waypoints, 0)).toEqual({ lat: 44.0, lng: 2.0 })
  })

  it('returns the last waypoint when targetKm is beyond the route end', () => {
    const waypoints = [makeWp(0, 43.0, 1.0), makeWp(50, 44.0, 2.0)]
    expect(getCorridorCenter(waypoints, 200)).toEqual({ lat: 44.0, lng: 2.0 })
  })

  it('picks the earlier waypoint on exact tie', () => {
    // km=10 and km=20, targetKm=15 → both equidistant; first found wins
    const waypoints = [makeWp(10, 43.1, 1.1), makeWp(20, 43.2, 1.2)]
    const result = getCorridorCenter(waypoints, 15)
    // diff for km=10 → 5, diff for km=20 → 5 — strict < means first element wins
    expect(result).toEqual({ lat: 43.1, lng: 1.1 })
  })
})

describe('buildBookingSearchUrl', () => {
  it('uses ss param with city name and dest_type=city', () => {
    expect(buildBookingSearchUrl('Pamplona')).toBe('https://www.booking.com/searchresults.html?ss=Pamplona&dest_type=city')
  })

  it('encodes city name with hyphen', () => {
    expect(buildBookingSearchUrl('Saint-Girons')).toContain('ss=Saint-Girons')
  })

  it('encodes spaces in city name', () => {
    expect(buildBookingSearchUrl('Les Houches')).toContain('ss=Les%20Houches')
  })

  it('includes dest_type=city always', () => {
    const url = buildBookingSearchUrl('Toulouse')
    expect(url).toContain('dest_type=city')
  })

  it('does not include lat/lng when no center provided', () => {
    const url = buildBookingSearchUrl('Toulouse')
    expect(url).not.toContain('latitude')
    expect(url).not.toContain('longitude')
  })

  it('targets booking.com searchresults page', () => {
    expect(buildBookingSearchUrl('Pamplona')).toContain('https://www.booking.com/searchresults.html')
  })

  it('appends latitude and longitude when center provided', () => {
    const url = buildBookingSearchUrl('La Puerta De Segura', { lat: 38.38, lng: -2.84 })
    expect(url).toBe('https://www.booking.com/searchresults.html?ss=La%20Puerta%20De%20Segura&dest_type=city&latitude=38.38&longitude=-2.84')
  })

  it('omits coordinates when center is null', () => {
    const url = buildBookingSearchUrl('Toulouse', null)
    expect(url).toBe('https://www.booking.com/searchresults.html?ss=Toulouse&dest_type=city')
  })

  it('omits coordinates when center is undefined', () => {
    const url = buildBookingSearchUrl('Toulouse', undefined)
    expect(url).toBe('https://www.booking.com/searchresults.html?ss=Toulouse&dest_type=city')
  })

  it('encodes accented characters in city name', () => {
    const url = buildBookingSearchUrl('Almazán', { lat: 41.49, lng: -2.53 })
    expect(url).toContain('ss=Almaz%C3%A1n')
    expect(url).toContain('dest_type=city')
    expect(url).toContain('latitude=41.49')
    expect(url).toContain('longitude=-2.53')
  })
})

describe('buildBookingCoordUrl', () => {
  it('uses latitude, longitude and dest_type=latlong params', () => {
    const url = buildBookingCoordUrl({ lat: 43.5, lng: 1.4 })
    expect(url).toBe('https://www.booking.com/searchresults.html?latitude=43.5&longitude=1.4&dest_type=latlong')
  })

  it('does not include ss param', () => {
    const url = buildBookingCoordUrl({ lat: 48.8566, lng: 2.3522 })
    expect(url).not.toContain('ss=')
  })

  it('targets booking.com searchresults page', () => {
    expect(buildBookingCoordUrl({ lat: 0, lng: 0 })).toContain('https://www.booking.com/searchresults.html')
  })
})

describe('extractCityFromOsmRawData', () => {
  it('returns nulls for undefined rawData', () => {
    expect(extractCityFromOsmRawData(undefined)).toEqual({ city: null, postcode: null })
  })

  it('returns nulls for empty rawData', () => {
    expect(extractCityFromOsmRawData({})).toEqual({ city: null, postcode: null })
  })

  it('returns addr:city and addr:postcode if present', () => {
    expect(extractCityFromOsmRawData({ 'addr:city': 'Pamplona', 'addr:postcode': '31001' }))
      .toEqual({ city: 'Pamplona', postcode: '31001' })
  })

  it('falls back to addr:town when addr:city absent', () => {
    expect(extractCityFromOsmRawData({ 'addr:town': 'Saint-Girons' }).city).toBe('Saint-Girons')
  })

  it('falls back to addr:village when addr:city and addr:town absent', () => {
    expect(extractCityFromOsmRawData({ 'addr:village': 'Eylie' }).city).toBe('Eylie')
  })

  it('prefers addr:city over addr:town', () => {
    expect(extractCityFromOsmRawData({ 'addr:city': 'Toulouse', 'addr:town': 'Other' }).city).toBe('Toulouse')
  })

  it('prefers addr:town over addr:village', () => {
    expect(extractCityFromOsmRawData({ 'addr:town': 'Miramont', 'addr:village': 'Hamlet' }).city).toBe('Miramont')
  })

  it('returns postcode null when addr:postcode absent', () => {
    expect(extractCityFromOsmRawData({ 'addr:city': 'Toulouse' }).postcode).toBeNull()
  })

  it('extracts addr:postcode from OSM rawData', () => {
    expect(extractCityFromOsmRawData({ 'addr:postcode': '31000' }).postcode).toBe('31000')
  })
})

describe('buildAirbnbSearchUrl', () => {
  it('builds correct Airbnb URL with ±0.2° bbox', () => {
    const url = buildAirbnbSearchUrl({ lat: 43.5, lng: 1.4 })
    expect(url).toContain('airbnb.com/s/homes')
    expect(url).toContain('ne_lat=43.7')
    expect(url).toContain('sw_lat=43.3')
    expect(url).toContain('ne_lng=1.5999999999999999')  // 1.4 + 0.2 in JS float
    expect(url).toContain('sw_lng=')
  })

  it('ne_lat is greater than sw_lat (north > south)', () => {
    const url = buildAirbnbSearchUrl({ lat: 48.8, lng: 2.3 })
    const params = new URLSearchParams(url.split('?')[1])
    expect(Number(params.get('ne_lat'))).toBeGreaterThan(Number(params.get('sw_lat')))
  })

  it('ne_lng is greater than sw_lng (east > west)', () => {
    const url = buildAirbnbSearchUrl({ lat: 48.8, lng: 2.3 })
    const params = new URLSearchParams(url.split('?')[1])
    expect(Number(params.get('ne_lng'))).toBeGreaterThan(Number(params.get('sw_lng')))
  })

  it('bbox is exactly ±0.2° around center', () => {
    const url = buildAirbnbSearchUrl({ lat: 45.0, lng: 5.0 })
    const params = new URLSearchParams(url.split('?')[1])
    expect(Number(params.get('ne_lat'))).toBeCloseTo(45.2, 10)
    expect(Number(params.get('sw_lat'))).toBeCloseTo(44.8, 10)
    expect(Number(params.get('ne_lng'))).toBeCloseTo(5.2, 10)
    expect(Number(params.get('sw_lng'))).toBeCloseTo(4.8, 10)
  })
})
