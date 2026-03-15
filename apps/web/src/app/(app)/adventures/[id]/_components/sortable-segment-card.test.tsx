import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { SortableSegmentCard } from './sortable-segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

// Mock dnd-kit to avoid DOM measurement issues in tests
vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
}))
vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}))

// Mock SegmentCard to isolate SortableSegmentCard behavior
vi.mock('./segment-card', () => ({
  SegmentCard: ({
    segment,
    onDelete,
    onReplace,
  }: {
    segment: AdventureSegmentResponse
    onDelete?: () => void
    onReplace?: () => void
  }) => (
    <div data-testid={`seg-${segment.id}`}>
      <button onClick={onDelete}>Delete</button>
      <button onClick={onReplace}>Replace</button>
    </div>
  ),
}))

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
  source: null,
  boundingBox: null,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

describe('SortableSegmentCard', () => {
  it('renders drag handle and SegmentCard', () => {
    render(
      <SortableSegmentCard
        segment={makeSegment()}
        onDelete={vi.fn()}
        onReplace={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /réordonner le segment/i })).toBeInTheDocument()
    expect(screen.getByTestId('seg-seg-1')).toBeInTheDocument()
  })

  it('passes onDelete and onReplace to SegmentCard', () => {
    const onDelete = vi.fn()
    const onReplace = vi.fn()
    render(
      <SortableSegmentCard
        segment={makeSegment()}
        onDelete={onDelete}
        onReplace={onReplace}
      />,
    )
    screen.getByText('Delete').click()
    expect(onDelete).toHaveBeenCalledOnce()

    screen.getByText('Replace').click()
    expect(onReplace).toHaveBeenCalledOnce()
  })
})
