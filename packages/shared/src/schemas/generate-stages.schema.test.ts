import { describe, it, expect } from 'vitest'
import { generateStagesSchema, ACCOMMODATION_CATEGORIES } from './generate-stages.schema'
import { LAYER_CATEGORIES } from '../types/poi.types'
import { MAX_SEARCH_RADIUS_KM } from '../constants/gpx.constants'

const valid = {
  targetKmPerDay: 80,
  accommodationTypes: ['hotel'],
  mode: 'replace' as const,
}

describe('ACCOMMODATION_CATEGORIES', () => {
  it('reste égal à LAYER_CATEGORIES.accommodations — verrou anti-divergence', () => {
    // Deux tables de catégories ont déjà coexisté et divergé en silence (GOOGLE_PLACE_TYPES vs
    // LAYER_GOOGLE_TYPES, story 17.17). Ce test empêche la répétition.
    expect([...ACCOMMODATION_CATEGORIES]).toEqual([...LAYER_CATEGORIES.accommodations])
  })
})

describe('generateStagesSchema', () => {
  it('accepte une saisie minimale valide', () => {
    expect(generateStagesSchema.safeParse(valid).success).toBe(true)
  })

  it('exige au moins un type d’hébergement', () => {
    expect(generateStagesSchema.safeParse({ ...valid, accommodationTypes: [] }).success).toBe(false)
  })

  it('rejette une catégorie hors hébergement', () => {
    expect(
      generateStagesSchema.safeParse({ ...valid, accommodationTypes: ['restaurant'] }).success,
    ).toBe(false)
  })

  it('borne targetKmPerDay', () => {
    expect(generateStagesSchema.safeParse({ ...valid, targetKmPerDay: 5 }).success).toBe(false)
    expect(generateStagesSchema.safeParse({ ...valid, targetKmPerDay: 500 }).success).toBe(false)
  })

  it('borne radiusKm sur MAX_SEARCH_RADIUS_KM', () => {
    expect(generateStagesSchema.safeParse({ ...valid, radiusKm: MAX_SEARCH_RADIUS_KM }).success).toBe(true)
    expect(generateStagesSchema.safeParse({ ...valid, radiusKm: MAX_SEARCH_RADIUS_KM + 1 }).success).toBe(false)
    expect(generateStagesSchema.safeParse({ ...valid, radiusKm: 0.1 }).success).toBe(false)
  })

  it('n’accepte que les deux modes', () => {
    expect(generateStagesSchema.safeParse({ ...valid, mode: 'merge' }).success).toBe(false)
  })

  it('accepte firstDepartureAt ISO + timeZone, et leur absence', () => {
    expect(
      generateStagesSchema.safeParse({
        ...valid,
        firstDepartureAt: '2026-09-05T06:00:00.000Z',
        timeZone: 'Europe/Paris',
      }).success,
    ).toBe(true)
    expect(generateStagesSchema.safeParse(valid).success).toBe(true)
  })

  it('rejette un firstDepartureAt non ISO', () => {
    expect(generateStagesSchema.safeParse({ ...valid, firstDepartureAt: '05/09/2026' }).success).toBe(false)
  })
})
