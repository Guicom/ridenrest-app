import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { SegmentCard } from './segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

afterEach(() => {
  cleanup()
})

const makeSegment = (overrides: Partial<AdventureSegmentResponse> = {}): AdventureSegmentResponse => ({
  id: 'seg-1',
  adventureId: 'adv-1',
  name: 'Étape 1',
  parseStatus: 'done',
  distanceKm: 42.5,
  elevationGainM: 1200,
  orderIndex: 0,
  cumulativeStartKm: 0,
  boundingBox: null,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

describe('SegmentCard', () => {
  it('renders skeleton for pending state', () => {
    render(<SegmentCard segment={makeSegment({ parseStatus: 'pending' })} onRetry={vi.fn()} />)
    expect(screen.getByText("En attente d'analyse...")).toBeInTheDocument()
  })

  it('renders skeleton for processing state', () => {
    render(<SegmentCard segment={makeSegment({ parseStatus: 'processing' })} onRetry={vi.fn()} />)
    expect(screen.getByText('Analyse en cours...')).toBeInTheDocument()
  })

  it('renders full card for done state', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'done', distanceKm: 42.5, elevationGainM: 1200 })}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('42.5 km')).toBeInTheDocument()
    expect(screen.getByText('1200m D+')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /afficher sur la carte/i })).toBeDisabled()
  })

  it('renders N/A elevation when elevationGainM is null', () => {
    render(
      <SegmentCard
        segment={makeSegment({ parseStatus: 'done', elevationGainM: null })}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('renders error state and calls onRetry', () => {
    const onRetry = vi.fn()
    render(<SegmentCard segment={makeSegment({ parseStatus: 'error' })} onRetry={onRetry} />)
    expect(
      screen.getByText('Parsing échoué — vérifiez le format du fichier GPX'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
