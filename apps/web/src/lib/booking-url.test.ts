import { describe, it, expect } from 'vitest'
import { getCorridorCenter, buildBookingSearchUrl, buildAirbnbSearchUrl } from './booking-url'
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
  it('includes dest_type=latlong for coordinate-based search', () => {
    const url = buildBookingSearchUrl({ lat: 43.5, lng: 1.4 })
    expect(url).toContain('dest_type=latlong')
  })

  it('includes latitude and longitude params', () => {
    const url = buildBookingSearchUrl({ lat: 43.5, lng: 1.4 })
    expect(url).toContain('latitude=43.5')
    expect(url).toContain('longitude=1.4')
  })

  it('includes ss param with coordinates for prefilled search box', () => {
    const url = buildBookingSearchUrl({ lat: 43.5, lng: 1.4 })
    expect(url).toContain('ss=')
    expect(url).toContain('43.500000')
    expect(url).toContain('1.400000')
  })

  it('includes negative coordinates correctly', () => {
    const url = buildBookingSearchUrl({ lat: -34.6, lng: -58.4 })
    expect(url).toContain('latitude=-34.6')
    expect(url).toContain('longitude=-58.4')
  })

  it('targets booking.com searchresults page', () => {
    const url = buildBookingSearchUrl({ lat: 43.5, lng: 1.4 })
    expect(url).toContain('https://www.booking.com/searchresults.html')
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
