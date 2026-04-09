import { describe, it, expect } from 'vitest'
import { computeElevationGain, computeElevationLoss } from './parser'
import type { GpxPoint } from './cumulative-distances'

describe('computeElevationGain', () => {
  it('returns 0 for ascending-only when no ascent', () => {
    const points: GpxPoint[] = [
      { lat: 0, lng: 0, elevM: 100 },
      { lat: 0, lng: 0, elevM: 80 },
      { lat: 0, lng: 0, elevM: 60 },
    ]
    expect(computeElevationGain(points)).toBe(0)
  })

  it('sums only positive deltas', () => {
    const points: GpxPoint[] = [
      { lat: 0, lng: 0, elevM: 100 },
      { lat: 0, lng: 0, elevM: 150 },
      { lat: 0, lng: 0, elevM: 120 },
      { lat: 0, lng: 0, elevM: 200 },
    ]
    expect(computeElevationGain(points)).toBe(50 + 80)
  })

  it('returns 0 for empty or single point', () => {
    expect(computeElevationGain([])).toBe(0)
    expect(computeElevationGain([{ lat: 0, lng: 0, elevM: 100 }])).toBe(0)
  })
})

describe('computeElevationLoss', () => {
  it('returns 0 when all ascending', () => {
    const points: GpxPoint[] = [
      { lat: 0, lng: 0, elevM: 100 },
      { lat: 0, lng: 0, elevM: 200 },
      { lat: 0, lng: 0, elevM: 300 },
    ]
    expect(computeElevationLoss(points)).toBe(0)
  })

  it('sums absolute value of negative deltas', () => {
    const points: GpxPoint[] = [
      { lat: 0, lng: 0, elevM: 300 },
      { lat: 0, lng: 0, elevM: 250 },
      { lat: 0, lng: 0, elevM: 280 },
      { lat: 0, lng: 0, elevM: 100 },
    ]
    // Descents: 300→250 = 50, 280→100 = 180 → total 230
    expect(computeElevationLoss(points)).toBe(230)
  })

  it('handles mixed ascent/descent correctly', () => {
    const points: GpxPoint[] = [
      { lat: 0, lng: 0, elevM: 100 },
      { lat: 0, lng: 0, elevM: 200 },
      { lat: 0, lng: 0, elevM: 150 },
      { lat: 0, lng: 0, elevM: 250 },
      { lat: 0, lng: 0, elevM: 100 },
    ]
    // Descents: 200→150 = 50, 250→100 = 150 → total 200
    expect(computeElevationLoss(points)).toBe(200)
  })

  it('returns 0 for empty or single point', () => {
    expect(computeElevationLoss([])).toBe(0)
    expect(computeElevationLoss([{ lat: 0, lng: 0, elevM: 100 }])).toBe(0)
  })

  it('skips points without elevation', () => {
    const points: GpxPoint[] = [
      { lat: 0, lng: 0, elevM: 200 },
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0, elevM: 100 },
    ]
    // No consecutive pair with both elevM defined and descent
    // 200 → undefined (skip) → 100: elevM undefined between, so only last pair checked
    // Actually: prev=200 curr=undefined → skip, prev=undefined curr=100 → skip
    expect(computeElevationLoss(points)).toBe(0)
  })
})
