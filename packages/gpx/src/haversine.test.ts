import { describe, it, expect } from 'vitest'
import { haversine } from './haversine'

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8566, lng: 2.3522 })).toBe(0)
  })

  it('returns correct distance Paris → Lyon (±0.1%)', () => {
    // Paris (48.8566, 2.3522) to Lyon (45.7640, 4.8357) ≈ 392.2 km
    const dist = haversine({ lat: 48.8566, lng: 2.3522 }, { lat: 45.764, lng: 4.8357 })
    // ±0.1% = ±0.39 km
    expect(dist).toBeGreaterThan(391.8)
    expect(dist).toBeLessThan(392.6)
  })

  it('returns correct short distance (±0.1%)', () => {
    // ~1.11 km per 0.01° latitude
    const dist = haversine({ lat: 48.0, lng: 2.0 }, { lat: 48.01, lng: 2.0 })
    expect(dist).toBeCloseTo(1.111, 1)
  })
})
