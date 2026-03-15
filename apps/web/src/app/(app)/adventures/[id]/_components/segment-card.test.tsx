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

  it('does not render action menu in pending/processing state', () => {
    const { container: c1 } = render(
      <SegmentCard segment={makeSegment({ parseStatus: 'pending' })} onRetry={vi.fn()} onDelete={vi.fn()} onReplace={vi.fn()} />,
    )
    expect(c1.querySelector('[aria-label="Options du segment"]')).toBeNull()
    cleanup()

    const { container: c2 } = render(
      <SegmentCard segment={makeSegment({ parseStatus: 'processing' })} onRetry={vi.fn()} onDelete={vi.fn()} onReplace={vi.fn()} />,
    )
    expect(c2.querySelector('[aria-label="Options du segment"]')).toBeNull()
  })

  it('calls onDelete when Supprimer clicked in error state', () => {
    const onDelete = vi.fn()
    render(
      <SegmentCard segment={makeSegment({ parseStatus: 'error' })} onRetry={vi.fn()} onDelete={onDelete} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /supprimer/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('calls onReplace when Remplacer clicked in done state', () => {
    const onReplace = vi.fn()
    render(
      <SegmentCard segment={makeSegment({ parseStatus: 'done' })} onRetry={vi.fn()} onDelete={vi.fn()} onReplace={onReplace} />,
    )
    // Open the dropdown menu
    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    fireEvent.click(screen.getByText('Remplacer'))
    expect(onReplace).toHaveBeenCalledOnce()
  })

  it('calls onDelete after confirming deletion dialog in done state', () => {
    const onDelete = vi.fn()
    render(
      <SegmentCard segment={makeSegment({ parseStatus: 'done' })} onRetry={vi.fn()} onDelete={onDelete} onReplace={vi.fn()} />,
    )
    // Open dropdown → click Supprimer → AlertDialog opens
    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    fireEvent.click(screen.getByText('Supprimer'))
    // Confirm in dialog
    fireEvent.click(screen.getByRole('button', { name: /^supprimer$/i }))
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('does NOT call onDelete when dialog is cancelled in done state', () => {
    const onDelete = vi.fn()
    render(
      <SegmentCard segment={makeSegment({ parseStatus: 'done' })} onRetry={vi.fn()} onDelete={onDelete} onReplace={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    fireEvent.click(screen.getByText('Supprimer'))
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('"Renommer" item in DropdownMenu triggers rename mode (shows inline input)', () => {
    render(
      <SegmentCard segment={makeSegment({ parseStatus: 'done' })} onRetry={vi.fn()} onRename={vi.fn()} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    fireEvent.click(screen.getByText('Renommer'))
    expect(screen.getByDisplayValue('Étape 1')).toBeInTheDocument()
  })

  it('Enter key submits rename and calls onRename prop', () => {
    const onRename = vi.fn()
    render(
      <SegmentCard segment={makeSegment({ parseStatus: 'done' })} onRetry={vi.fn()} onRename={onRename} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    fireEvent.click(screen.getByText('Renommer'))
    const input = screen.getByDisplayValue('Étape 1')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('Nouveau nom')
  })

  it('Escape cancels rename and restores original display', () => {
    const onRename = vi.fn()
    render(
      <SegmentCard segment={makeSegment({ parseStatus: 'done' })} onRetry={vi.fn()} onRename={onRename} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /options du segment/i }))
    fireEvent.click(screen.getByText('Renommer'))
    const input = screen.getByDisplayValue('Étape 1')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onRename).not.toHaveBeenCalled()
    expect(screen.queryByDisplayValue('Étape 1')).toBeNull()
    expect(screen.getByText('Étape 1')).toBeInTheDocument()
  })
})
