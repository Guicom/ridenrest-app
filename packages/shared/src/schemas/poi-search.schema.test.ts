import { describe, it, expect } from 'vitest'
import { poiSearchSchema } from './poi-search.schema'

describe('poiSearchSchema', () => {
  const validBase = {
    segmentId: '123e4567-e89b-12d3-a456-426614174000',
    fromKm: 0,
    toKm: 10,
  }

  it('accepts valid input', () => {
    const result = poiSearchSchema.safeParse(validBase)
    expect(result.success).toBe(true)
  })

  it('accepts valid input with categories', () => {
    const result = poiSearchSchema.safeParse({
      ...validBase,
      categories: ['hotel', 'camp_site'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects when toKm <= fromKm', () => {
    const result = poiSearchSchema.safeParse({ ...validBase, fromKm: 10, toKm: 10 })
    expect(result.success).toBe(false)
  })

  it('rejects when toKm < fromKm', () => {
    const result = poiSearchSchema.safeParse({ ...validBase, fromKm: 20, toKm: 10 })
    expect(result.success).toBe(false)
  })

  it('rejects when range exceeds 50km', () => {
    const result = poiSearchSchema.safeParse({ ...validBase, fromKm: 0, toKm: 51 })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/50/)
    }
  })

  it('accepts exactly 50km range', () => {
    const result = poiSearchSchema.safeParse({ ...validBase, fromKm: 0, toKm: 50 })
    expect(result.success).toBe(true)
  })

  it('rejects invalid UUID for segmentId', () => {
    const result = poiSearchSchema.safeParse({ ...validBase, segmentId: 'not-a-uuid' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid category value', () => {
    const result = poiSearchSchema.safeParse({ ...validBase, categories: ['invalid_category'] })
    expect(result.success).toBe(false)
  })

  it('accepts cafe_bar category', () => {
    const result = poiSearchSchema.safeParse({
      ...validBase,
      categories: ['cafe_bar'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts gas_station category', () => {
    const result = poiSearchSchema.safeParse({
      ...validBase,
      categories: ['gas_station'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts cafe_bar and gas_station mixed with other categories', () => {
    const result = poiSearchSchema.safeParse({
      ...validBase,
      categories: ['restaurant', 'cafe_bar', 'gas_station'],
    })
    expect(result.success).toBe(true)
  })
})
