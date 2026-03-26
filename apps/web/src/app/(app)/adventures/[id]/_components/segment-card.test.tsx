import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SegmentCard } from './segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

function makeSegment(overrides: Partial<AdventureSegmentResponse> = {}): AdventureSegmentResponse {
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

describe('SegmentCard — pending state', () => {
  it('shows amber "En cours..." badge when parseStatus is pending', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'pending' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('En cours...')).toBeInTheDocument()
  })

  it('shows amber "En cours..." badge when parseStatus is processing', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'processing' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('En cours...')).toBeInTheDocument()
  })

  it('does NOT render Skeleton in pending state', () => {
    const { container } = render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'pending' })}
        onRetry={vi.fn()}
      />,
    )

    // Skeleton renders as a div with animate-pulse class — verify none present
    const skeletons = container.querySelectorAll('[class*="animate-pulse"]')
    // Only the badge span should have animate-pulse, not Skeleton divs
    // The badge is a span, Skeleton would be a div
    const skeletonDivs = Array.from(skeletons).filter((el) => el.tagName === 'DIV')
    expect(skeletonDivs).toHaveLength(0)
  })

  it('shows segment name in pending state', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'pending', name: 'Col du Tourmalet' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Col du Tourmalet')).toBeInTheDocument()
  })
})

describe('SegmentCard — done state', () => {
  it('shows green "Prêt" badge when parseStatus is done', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'done' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Prêt')).toBeInTheDocument()
  })

  it('does NOT show "Analysé" badge text in done state', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'done' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByText('Analysé')).not.toBeInTheDocument()
  })

  it('shows distance and elevation in done state', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'done', distanceKm: 45.2, elevationGainM: 1200 })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('45.2 km')).toBeInTheDocument()
    expect(screen.getByText('1200m D+')).toBeInTheDocument()
  })
})

describe('SegmentCard — error state', () => {
  it('shows red "Erreur" badge inline in card when parseStatus is error', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'error' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Erreur')).toBeInTheDocument()
  })

  it('shows "Réessayer" button inline in card when parseStatus is error', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'error' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument()
  })

  it('opens confirmation dialog when "Réessayer" button is clicked', async () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'error' })}
        onRetry={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(await screen.findByText(/Le segment actuel sera supprimé/i)).toBeInTheDocument()
  })

  it('calls onRetry only after confirming the dialog', async () => {
    const onRetry = vi.fn()
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'error' })}
        onRetry={onRetry}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(onRetry).not.toHaveBeenCalled()

    const confirmBtn = await screen.findByRole('button', { name: /remplacer le fichier gpx/i })
    fireEvent.click(confirmBtn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows segment name in error state', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'error', name: 'Étape Pyrénées' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Étape Pyrénées')).toBeInTheDocument()
  })

  it('shows fallback name "Segment sans nom" when name is null in error state', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'error', name: null })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Segment sans nom')).toBeInTheDocument()
  })
})

describe('SegmentCard — rename menu item', () => {
  it('shows Renommer in dropdown when done', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'done' })}
        onRetry={vi.fn()}
        onRename={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    expect(screen.getByText('Renommer')).toBeInTheDocument()
  })

  it('does NOT show Renommer in dropdown when pending', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'pending' })}
        onRetry={vi.fn()}
        onRename={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    expect(screen.queryByText('Renommer')).not.toBeInTheDocument()
  })
})

describe('SegmentCard — rename Escape cancels without saving', () => {
  it('does NOT call onRename when Escape is pressed after typing', () => {
    const onRename = vi.fn()
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'done', name: 'Original' })}
        onRetry={vi.fn()}
        onRename={onRename}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    fireEvent.click(screen.getByText('Renommer'))

    const input = screen.getByDisplayValue('Original')
    fireEvent.change(input, { target: { value: 'Modified' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(onRename).not.toHaveBeenCalled()
  })
})

describe('SegmentCard — Strava badge', () => {
  it('shows "Via Strava" badge when source === "strava"', () => {
    render(
      <SegmentCard
        segment={makeSegment({ source: 'strava' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByText('Via Strava')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Strava' })).toBeInTheDocument()
  })

  it('does NOT show badge when source is null (manual upload)', () => {
    render(
      <SegmentCard
        segment={makeSegment({ source: null })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByText('Via Strava')).not.toBeInTheDocument()
  })

  it('does NOT show badge when segment is in pending state', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'pending', source: 'strava' })}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByText('Via Strava')).not.toBeInTheDocument()
  })
})
