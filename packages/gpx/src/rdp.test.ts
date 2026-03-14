import { describe, it, expect } from 'vitest'
import { rdpSimplify } from './rdp'

describe('rdpSimplify', () => {
  it('returns same 2 points for minimal input', () => {
    const pts = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]
    expect(rdpSimplify(pts, 0.0001)).toHaveLength(2)
  })

  it('removes collinear middle points', () => {
    // 3 collinear points — middle one should be removed
    const pts = [{ lat: 0, lng: 0 }, { lat: 0.5, lng: 0.5 }, { lat: 1, lng: 1 }]
    const result = rdpSimplify(pts, 0.01)
    expect(result).toHaveLength(2)
  })

  it('keeps ≤ 2000 points for 50k collinear points with epsilon 0.0001', () => {
    const pts = Array.from({ length: 50000 }, (_, i) => ({
      lat: i * 0.00001,
      lng: 0,
    }))
    const result = rdpSimplify(pts, 0.0001)
    expect(result.length).toBeLessThanOrEqual(2000)
  })

  it('does not stack overflow on 50k non-collinear points (real GPS scenario)', () => {
    // Zigzag pattern — non-collinear, simulates realistic GPS track variation
    const pts = Array.from({ length: 50000 }, (_, i) => ({
      lat: i * 0.00001,
      lng: (i % 2 === 0 ? 1 : -1) * 0.000001, // tiny alternating offsets
    }))
    // Should complete without RangeError: Maximum call stack size exceeded
    expect(() => rdpSimplify(pts, 0.0001)).not.toThrow()
    const result = rdpSimplify(pts, 0.0001)
    // Must preserve first and last points
    expect(result[0]).toEqual(pts[0])
    expect(result[result.length - 1]).toEqual(pts[pts.length - 1])
  })

  it('preserves significant deviation points', () => {
    // Straight line with one point clearly off the line
    const pts = [
      { lat: 0, lng: 0 },
      { lat: 0.5, lng: 0.1 }, // significant deviation ~11km off the lat=0 to lat=1 line
      { lat: 1, lng: 0 },
    ]
    const result = rdpSimplify(pts, 0.001) // 1m epsilon — deviation is much larger
    expect(result).toHaveLength(3) // middle point must be kept
  })
})
