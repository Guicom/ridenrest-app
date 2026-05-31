import { describe, it, expect } from 'vitest'
import {
  AccessRequestSchema,
  AccessResponseSchema,
} from './poi-access'

describe('AccessRequestSchema', () => {
  it('accepts a stage origin', () => {
    const r = AccessRequestSchema.safeParse({
      origin: { type: 'stage', stageId: '123e4567-e89b-12d3-a456-426614174000' },
    })
    expect(r.success).toBe(true)
  })

  it('accepts nearest-trace origin (no payload)', () => {
    const r = AccessRequestSchema.safeParse({ origin: { type: 'nearest-trace' } })
    expect(r.success).toBe(true)
  })

  it('rejects the removed adventure-start origin (review 3.3, 2026-05-30)', () => {
    const r = AccessRequestSchema.safeParse({ origin: { type: 'adventure-start' } })
    expect(r.success).toBe(false) // retiré : inutilisé + collision de cache avec nearest-trace
  })

  it('rejects a profile not provided by the BRouter build as profileOverride', () => {
    const r = AccessRequestSchema.safeParse({
      origin: { type: 'nearest-trace' },
      profileOverride: 'safety' as unknown as 'trekking',
    })
    expect(r.success).toBe(false) // 'safety' n'existe pas dans le build BRouter v1.7.9
  })

  it('accepts valid BRouter profileOverride', () => {
    const r = AccessRequestSchema.safeParse({
      origin: { type: 'nearest-trace' },
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

describe('AccessResponseSchema', () => {
  it('validates an ok response', () => {
    const r = AccessResponseSchema.safeParse({
      status: 'ok',
      distanceM: 1234,
      elevationGainM: 50,
      elevationLossM: 12,
      geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] },
      variants: [
        {
          entryPoint: [2.35, 48.85],
          distanceM: 1234,
          elevationGainM: 50,
          elevationLossM: 12,
          etaS: 900,
          geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] },
        },
      ],
      engineVersion: 'brouter-1.7.9+trekking',
      computedAt: new Date(0).toISOString(),
      source: 'computed-fresh',
    })
    expect(r.success).toBe(true)
  })

  it('rejects an ok response without variants (≥ 1 required)', () => {
    const r = AccessResponseSchema.safeParse({
      status: 'ok',
      distanceM: 1234,
      elevationGainM: 50,
      elevationLossM: 12,
      geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] },
      variants: [],
      engineVersion: 'v',
      computedAt: 'now',
      source: 'computed-fresh',
    })
    expect(r.success).toBe(false)
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
      variants: [
        {
          entryPoint: [2.35, 48.85],
          distanceM: 1,
          elevationGainM: 0,
          elevationLossM: 0,
          etaS: 0,
          geometry: { type: 'MultiLineString', coordinates: [[[2.35, 48.85], [2.36, 48.86]]] },
        },
      ],
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
