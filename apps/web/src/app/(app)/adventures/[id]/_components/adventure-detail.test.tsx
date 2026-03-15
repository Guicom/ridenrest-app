import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiClient from '@/lib/api-client'
import { AdventureDetail } from './adventure-detail'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('sonner', () => ({ toast: { success: toastSuccess, error: toastError } }))
vi.mock('@/lib/api-client')
vi.mock('./gpx-upload-form', () => ({ GpxUploadForm: () => null }))
vi.mock('./sortable-segment-card', () => ({
  SortableSegmentCard: ({ segment }: { segment: { id: string } }) => (
    <div data-testid={`seg-${segment.id}`} />
  ),
}))
// Keep segment-card mock for direct uses
vi.mock('./segment-card', () => ({
  SegmentCard: ({ segment }: { segment: { id: string } }) => (
    <div data-testid={`seg-${segment.id}`} />
  ),
}))
// Mock dnd-kit — expose a simulate-drag-end button to trigger onDragEnd in tests
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({
    children,
    onDragEnd,
  }: {
    children: React.ReactNode
    onDragEnd?: (e: { active: { id: string }; over: { id: string } | null }) => void
  }) => (
    <>
      {children}
      <button
        data-testid="simulate-drag-end"
        onClick={() =>
          onDragEnd?.({ active: { id: 'seg-1' }, over: { id: 'seg-2' } })
        }
      >
        Simulate Reorder
      </button>
    </>
  ),
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}))
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  arrayMove: vi.fn((arr: unknown[], from: number, to: number) => {
    const result = [...arr]
    const [item] = result.splice(from, 1)
    result.splice(to, 0, item)
    return result
  }),
}))

afterEach(() => {
  vi.clearAllMocks()
  cleanup()
})

const makeSeg = (overrides: Partial<AdventureSegmentResponse> = {}): AdventureSegmentResponse => ({
  id: 'seg-1',
  adventureId: 'adv-1',
  name: 'Étape 1',
  parseStatus: 'pending',
  distanceKm: 0,
  elevationGainM: null,
  orderIndex: 0,
  cumulativeStartKm: 0,
  boundingBox: null,
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

function renderDetail(adventureId = 'adv-1') {
  vi.spyOn(apiClient, 'getAdventure').mockResolvedValue({
    id: adventureId,
    name: 'Tour test',
    totalDistanceKm: 0,
  } as Awaited<ReturnType<typeof apiClient.getAdventure>>)

  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AdventureDetail adventureId={adventureId} />
    </QueryClientProvider>,
  )
  return qc
}

describe('AdventureDetail — parse status transition detection', () => {
  it('fires success toast when segment transitions pending → done', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([makeSeg({ parseStatus: 'pending' })])
    const qc = renderDetail()

    // Wait for initial fetch to complete and populate prevSegmentsRef
    await waitFor(() => screen.getByTestId('seg-seg-1'))

    // Simulate next poll: segment is now done
    act(() => {
      qc.setQueryData(['adventures', 'adv-1', 'segments'], [
        makeSeg({ parseStatus: 'done', distanceKm: 42.5, elevationGainM: 1200 }),
      ])
    })

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Segment "Étape 1" analysé avec succès !'))
    expect(toastError).not.toHaveBeenCalled()
  })

  it('fires error toast when segment transitions processing → error', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([makeSeg({ parseStatus: 'processing' })])
    const qc = renderDetail()

    await waitFor(() => screen.getByTestId('seg-seg-1'))

    act(() => {
      qc.setQueryData(['adventures', 'adv-1', 'segments'], [makeSeg({ parseStatus: 'error' })])
    })

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Parsing échoué pour "Étape 1"', {
        description: 'Vérifiez le format du fichier GPX',
      }),
    )
    expect(toastSuccess).not.toHaveBeenCalled()
  })

  it('does NOT fire toast when already-done segment stays done across polls', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ parseStatus: 'done', distanceKm: 10, elevationGainM: 100 }),
    ])
    const qc = renderDetail()

    await waitFor(() => screen.getByTestId('seg-seg-1'))

    // Same done state on second poll
    await act(async () => {
      qc.setQueryData(['adventures', 'adv-1', 'segments'], [
        makeSeg({ parseStatus: 'done', distanceKm: 10, elevationGainM: 100 }),
      ])
    })

    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('does NOT fire toast on initial load when segments are already done', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ parseStatus: 'done', distanceKm: 10, elevationGainM: 100 }),
    ])
    renderDetail()

    await waitFor(() => screen.getByTestId('seg-seg-1'))

    expect(toastSuccess).not.toHaveBeenCalled()
    expect(toastError).not.toHaveBeenCalled()
  })

  it('optimistic reorder is rolled back and shows error toast when mutation fails', async () => {
    const seg1 = makeSeg({ id: 'seg-1', parseStatus: 'done', distanceKm: 10, orderIndex: 0 })
    const seg2 = makeSeg({ id: 'seg-2', parseStatus: 'done', distanceKm: 20, orderIndex: 1 })

    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([seg1, seg2])
    vi.spyOn(apiClient, 'reorderSegments').mockRejectedValue(new Error('Network error'))

    renderDetail()

    // Wait for both segments to be rendered
    await waitFor(() => {
      expect(screen.getByTestId('seg-seg-1')).toBeInTheDocument()
      expect(screen.getByTestId('seg-seg-2')).toBeInTheDocument()
    })

    // Trigger drag end via the mock button (simulates dragging seg-1 over seg-2)
    await act(async () => {
      fireEvent.click(screen.getByTestId('simulate-drag-end'))
    })

    // reorderSegments should have been called
    expect(apiClient.reorderSegments).toHaveBeenCalled()

    // After rejection, error toast should be shown
    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Erreur lors du réordonnancement'),
    )
  })

  it('fires toast for new segment that arrives already done (fast processing)', async () => {
    // First poll: segment-1 is done (already in ref)
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ id: 'seg-1', parseStatus: 'done', distanceKm: 10, elevationGainM: 100 }),
    ])
    const qc = renderDetail()

    await waitFor(() => screen.getByTestId('seg-seg-1'))

    // Second poll: a brand-new segment-2 appears already done
    act(() => {
      qc.setQueryData(['adventures', 'adv-1', 'segments'], [
        makeSeg({ id: 'seg-1', parseStatus: 'done', distanceKm: 10, elevationGainM: 100 }),
        makeSeg({ id: 'seg-2', name: 'Étape 2', parseStatus: 'done', distanceKm: 20, elevationGainM: 200 }),
      ])
    })

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith('Segment "Étape 2" analysé avec succès !'),
    )
  })
})
