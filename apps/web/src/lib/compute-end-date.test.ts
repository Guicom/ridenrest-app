import { describe, it, expect } from 'vitest'
import { computeEndDateFromStages } from './compute-end-date'
import type { AdventureStageResponse } from '@ridenrest/shared'

function makeStage(overrides: Partial<AdventureStageResponse> = {}): AdventureStageResponse {
  return {
    id: 'stage-1',
    adventureId: 'adv-1',
    name: 'Stage 1',
    color: '#f97316',
    orderIndex: 0,
    startKm: 0,
    endKm: 80,
    distanceKm: 80,
    elevationGainM: null,
    elevationLossM: null,
    etaMinutes: null,
    departureTime: null,
    speedKmh: null,
    pauseHours: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('computeEndDateFromStages', () => {
  it('returns null when stages is empty', () => {
    expect(computeEndDateFromStages([])).toBeNull()
  })

  it('returns null when last stage has no departureTime', () => {
    const stages = [makeStage({ etaMinutes: 300, departureTime: null })]
    expect(computeEndDateFromStages(stages)).toBeNull()
  })

  it('returns null when last stage has no etaMinutes', () => {
    const stages = [makeStage({ departureTime: '2026-06-10T08:00:00.000Z', etaMinutes: null })]
    expect(computeEndDateFromStages(stages)).toBeNull()
  })

  it('returns null when last stage has etaMinutes=0', () => {
    const stages = [makeStage({ departureTime: '2026-06-10T08:00:00.000Z', etaMinutes: 0 })]
    expect(computeEndDateFromStages(stages)).toBeNull()
  })

  it('computes arrival date correctly for same-day trip', () => {
    // Départ 08:00 UTC + 360 min (6h) = 14:00 UTC → 2026-06-10
    const stages = [makeStage({ departureTime: '2026-06-10T08:00:00.000Z', etaMinutes: 360 })]
    expect(computeEndDateFromStages(stages)).toBe('2026-06-10')
  })

  it('computes arrival date correctly when trip crosses midnight', () => {
    // Départ 20:00 UTC + 240 min (4h) = 00:00 UTC le lendemain → 2026-06-11
    const stages = [makeStage({ departureTime: '2026-06-10T20:00:00.000Z', etaMinutes: 240 })]
    expect(computeEndDateFromStages(stages)).toBe('2026-06-11')
  })

  it('uses the last stage by orderIndex (not array order)', () => {
    const stages = [
      makeStage({ id: 'stage-2', orderIndex: 1, departureTime: '2026-06-11T08:00:00.000Z', etaMinutes: 300 }),
      makeStage({ id: 'stage-1', orderIndex: 0, departureTime: '2026-06-10T08:00:00.000Z', etaMinutes: 300 }),
    ]
    // Last by orderIndex = stage-2 → 2026-06-11T13:00 → 2026-06-11
    expect(computeEndDateFromStages(stages)).toBe('2026-06-11')
  })

  it('ignores departureTime of earlier stages when last stage has no departureTime', () => {
    const stages = [
      makeStage({ id: 'stage-1', orderIndex: 0, departureTime: '2026-06-10T08:00:00.000Z', etaMinutes: 300 }),
      makeStage({ id: 'stage-2', orderIndex: 1, departureTime: null, etaMinutes: 300 }),
    ]
    expect(computeEndDateFromStages(stages)).toBeNull()
  })
})
