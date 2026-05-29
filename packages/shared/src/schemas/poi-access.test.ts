import { describe, it, expect } from 'vitest'
import {
  AccessRequestSchema,
  AccessResponseSchema,
  AccessOriginGpsSchema,
} from './poi-access'

describe('AccessRequestSchema', () => {
  it('accepts a stage origin', () => {
    const r = AccessRequestSchema.safeParse({
      origin: { type: 'stage', stageId: '123e4567-e89b-12d3-a456-426614174000' },
    })
    expect(r.success).toBe(true)
  })

  it('accepts adventure-start origin (no payload)', () => {
    const r = AccessRequestSchema.safeParse({ origin: { type: 'adventure-start' } })
    expect(r.success).toBe(true)
  })

  it('rejects a non-BRouter profile label as profileOverride', () => {
    const r = AccessRequestSchema.safeParse({
      origin: { type: 'adventure-start' },
      profileOverride: 'gravel' as unknown as 'trekking',
    })
    expect(r.success).toBe(false) // gravel is a project label, not a BRouter profile
  })

  it('accepts valid BRouter profileOverride', () => {
    const r = AccessRequestSchema.safeParse({
      origin: { type: 'adventure-start' },
      profileOverride: 'trekking',
    })
    expect(r.success).toBe(true)
  })

  it('rejects unknown origin type (discriminated union)', () => {
    const r = AccessRequestSchema.safeParse({ origin: { type: 'wormhole' } })
    expect(r.success).toBe(false)
  })

  it('rejects invalid uuid for stage', () => {
    const r = AccessRequestSchema.safeParse({ origin: { type: 'stage', stageId: 'nope' } })
    expect(r.success).toBe(false)
  })

  it('rejects missing origin', () => {
    const r = AccessRequestSchema.safeParse({})
    expect(r.success).toBe(false)
  })
})

describe('AccessOriginGpsSchema (rounded coords)', () => {
  it('accepts coordinates rounded to 4 decimals', () => {
    const r = AccessOriginGpsSchema.safeParse({ type: 'gps', lat: 48.8566, lng: 2.3522 })
    expect(r.success).toBe(true)
  })

  it('rejects coordinates with > 4 decimals', () => {
    const r = AccessOriginGpsSchema.safeParse({ type: 'gps', lat: 48.85661, lng: 2.3522 })
    expect(r.success).toBe(false)
  })

  it('rejects out-of-range latitude', () => {
    const r = AccessOriginGpsSchema.safeParse({ type: 'gps', lat: 91, lng: 2.3522 })
    expect(r.success).toBe(false)
  })
})

describe('AccessResponseSchema', () => {
  it('validates an ok response', () => {
    const r = AccessResponseSchema.safeParse({
      status: 'ok',
      distanceM: 1234,
      elevationGainM: 50,
      elevationLossM: 12,
      geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] },
      engineVersion: 'brouter-1.7.9+trekking',
      computedAt: new Date(0).toISOString(),
      source: 'computed-fresh',
    })
    expect(r.success).toBe(true)
  })

  it('validates a fallback response', () => {
    const r = AccessResponseSchema.safeParse({
      status: 'fallback',
      fallbackReason: 'routing_failed',
      fallbackDistanceM: 800,
      source: 'computed-fresh',
    })
    expect(r.success).toBe(true)
  })

  it('validates a MultiLineString geometry', () => {
    const r = AccessResponseSchema.safeParse({
      status: 'ok',
      distanceM: 1,
      elevationGainM: 0,
      elevationLossM: 0,
      geometry: { type: 'MultiLineString', coordinates: [[[2.35, 48.85], [2.36, 48.86]]] },
      engineVersion: 'v',
      computedAt: 'now',
      source: 'db-cache',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an unknown status', () => {
    const r = AccessResponseSchema.safeParse({ status: 'pending' })
    expect(r.success).toBe(false)
  })
})
