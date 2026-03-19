import { describe, it, expect } from 'vitest'
import { findPointAtKm } from './find-point-at-km'
import type { KmWaypoint } from './cumulative-distances'

const waypoints: KmWaypoint[] = [
  { lat: 43.0, lng: 1.0, km: 0 },
  { lat: 43.1, lng: 1.1, km: 10 },
  { lat: 43.3, lng: 1.3, km: 30 },
  { lat: 43.5, lng: 1.5, km: 50 },
]

describe('findPointAtKm', () => {
  it('returns null for empty waypoints', () => {
    expect(findPointAtKm([], 10)).toBeNull()
  })

  it('clamps to first waypoint when targetKm <= 0', () => {
    expect(findPointAtKm(waypoints, -5)).toEqual({ lat: 43.0, lng: 1.0 })
    expect(findPointAtKm(waypoints, 0)).toEqual({ lat: 43.0, lng: 1.0 })
  })

  it('clamps to last waypoint when targetKm >= total distance', () => {
    expect(findPointAtKm(waypoints, 50)).toEqual({ lat: 43.5, lng: 1.5 })
    expect(findPointAtKm(waypoints, 100)).toEqual({ lat: 43.5, lng: 1.5 })
  })

  it('interpolates between bracketing waypoints', () => {
    const result = findPointAtKm(waypoints, 5)!
    // Midpoint between wp[0] (km=0) and wp[1] (km=10): t = 0.5
    expect(result.lat).toBeCloseTo(43.05, 5)
    expect(result.lng).toBeCloseTo(1.05, 5)
  })

  it('interpolates at exact waypoint positions', () => {
    const result = findPointAtKm(waypoints, 10)!
    expect(result.lat).toBeCloseTo(43.1, 5)
    expect(result.lng).toBeCloseTo(1.1, 5)
  })

  it('interpolates between non-adjacent waypoints', () => {
    // targetKm = 40 is between wp[2] (km=30) and wp[3] (km=50), t = 0.5
    const result = findPointAtKm(waypoints, 40)!
    expect(result.lat).toBeCloseTo(43.4, 5)
    expect(result.lng).toBeCloseTo(1.4, 5)
  })
})
