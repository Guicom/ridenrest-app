import { describe, it, expect } from 'vitest'
import { createAdventureSchema, updateAdventureSchema, reorderSegmentsSchema } from './adventure.schema'

describe('createAdventureSchema', () => {
  it('accepts valid name', () => {
    expect(createAdventureSchema.safeParse({ name: 'Desertus Bikus 2026' }).success).toBe(true)
  })

  it('rejects empty name', () => {
    expect(createAdventureSchema.safeParse({ name: '' }).success).toBe(false)
  })

  it('rejects name over 100 characters', () => {
    expect(createAdventureSchema.safeParse({ name: 'a'.repeat(101) }).success).toBe(false)
  })
})

describe('updateAdventureSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(updateAdventureSchema.safeParse({}).success).toBe(true)
  })

  it('accepts valid status', () => {
    expect(updateAdventureSchema.safeParse({ status: 'active' }).success).toBe(true)
  })

  it('rejects invalid status', () => {
    expect(updateAdventureSchema.safeParse({ status: 'archived' }).success).toBe(false)
  })
})

describe('reorderSegmentsSchema', () => {
  it('accepts array of UUIDs', () => {
    const result = reorderSegmentsSchema.safeParse({
      segmentIds: ['123e4567-e89b-12d3-a456-426614174000'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty array', () => {
    expect(reorderSegmentsSchema.safeParse({ segmentIds: [] }).success).toBe(false)
  })

  it('rejects non-UUID strings', () => {
    expect(reorderSegmentsSchema.safeParse({ segmentIds: ['not-a-uuid'] }).success).toBe(false)
  })
})
