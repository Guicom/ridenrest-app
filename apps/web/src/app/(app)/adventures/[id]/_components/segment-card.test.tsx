import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SegmentCard } from './segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

function makeDoneSegment(overrides: Partial<AdventureSegmentResponse> = {}): AdventureSegmentResponse {
  return {
    id: 'seg-1',
    adventureId: 'adv-1',
    name: 'Segment Test',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 45.2,
    elevationGainM: 1200,
    parseStatus: 'done',
    source: null,
    boundingBox: null,
    createdAt: '2026-03-15T00:00:00.000Z',
    updatedAt: '2026-03-15T00:00:00.000Z',
    ...overrides,
  }
}

afterEach(cleanup)

describe('SegmentCard — Strava badge', () => {
  it('shows "Via Strava" badge when source === "strava"', () => {
    render(
      <SegmentCard
        segment={makeDoneSegment({ source: 'strava' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Via Strava')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Strava' })).toBeInTheDocument()
  })

  it('does NOT show badge when source is null (manual upload)', () => {
    render(
      <SegmentCard
        segment={makeDoneSegment({ source: null })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByText('Via Strava')).not.toBeInTheDocument()
  })

  it('does NOT show badge when segment is in pending state', () => {
    render(
      <SegmentCard
        segment={makeDoneSegment({ parseStatus: 'pending', source: 'strava' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByText('Via Strava')).not.toBeInTheDocument()
  })
})
