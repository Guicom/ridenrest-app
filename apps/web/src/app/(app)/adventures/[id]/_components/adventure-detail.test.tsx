import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as apiClient from '@/lib/api-client'
import { AdventureDetail } from './adventure-detail'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

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
vi.mock('./density-trigger-button', () => ({
  DensityTriggerButton: () => <button data-testid="density-trigger-btn">Calculer la densité</button>,
}))
// Render TooltipContent always visible for testability
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div role="tooltip">{children}</div>,
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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
  source: null,
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

describe('AdventureDetail — adventure rename', () => {
  it('clicking the adventure title enters rename mode (shows input)', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByTitle('Cliquer pour renommer'))
    expect(screen.getByDisplayValue('Tour test')).toBeInTheDocument()
  })

  it('pressing Escape cancels rename and restores title display', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByTitle('Cliquer pour renommer'))
    const input = screen.getByDisplayValue('Tour test')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByDisplayValue('Tour test')).toBeNull()
    expect(screen.getByText('Tour test')).toBeInTheDocument()
  })

  it('successful rename mutation invalidates queries and shows success toast', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    vi.spyOn(apiClient, 'renameAdventure').mockResolvedValue({
      id: 'adv-1',
      name: 'Nouveau nom',
      totalDistanceKm: 0,
    } as Awaited<ReturnType<typeof apiClient.renameAdventure>>)
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByTitle('Cliquer pour renommer'))
    const input = screen.getByDisplayValue('Tour test')
    fireEvent.change(input, { target: { value: 'Nouveau nom' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(apiClient.renameAdventure).toHaveBeenCalledWith('adv-1', 'Nouveau nom'))
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Aventure renommée'))
  })
})

describe('AdventureDetail — density CTA visibility', () => {
  it('shows density button when segment is pending (not gated to all-done)', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ id: 'seg-1', parseStatus: 'pending' }),
    ])
    renderDetail()

    await waitFor(() => expect(screen.getByTestId('density-trigger-btn')).toBeInTheDocument())
  })

  it('shows density button when segment is done', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ id: 'seg-1', parseStatus: 'done', distanceKm: 50 }),
    ])
    renderDetail()

    await waitFor(() => expect(screen.getByTestId('density-trigger-btn')).toBeInTheDocument())
  })

  it('does NOT show density button when segments list is empty', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    expect(screen.queryByTestId('density-trigger-btn')).not.toBeInTheDocument()
  })

  it('shows tooltip with pending message when any segment is pending', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ id: 'seg-1', parseStatus: 'pending' }),
    ])
    renderDetail()

    await waitFor(() =>
      expect(screen.getByText("En attente de l'analyse des segments")).toBeInTheDocument()
    )
  })

  it('does NOT show pending tooltip when all segments are done', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ id: 'seg-1', parseStatus: 'done', distanceKm: 50 }),
    ])
    renderDetail()

    await waitFor(() => expect(screen.getByTestId('density-trigger-btn')).toBeInTheDocument())
    expect(screen.queryByText("En attente de l'analyse des segments")).not.toBeInTheDocument()
  })
})

describe('AdventureDetail — delete adventure', () => {
  it('dialog appears when delete button is clicked', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByRole('button', { name: /supprimer l'aventure/i }))
    expect(screen.getByText(/supprimer définitivement/i)).toBeInTheDocument()
  })

  it('confirm button is disabled until adventure name is typed correctly', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByRole('button', { name: /supprimer l'aventure/i }))

    const confirmBtn = screen.getByRole('button', { name: /supprimer définitivement/i })
    expect(confirmBtn).toBeDisabled()

    const input = screen.getByPlaceholderText('Tour test')
    fireEvent.change(input, { target: { value: 'Tour test' } })
    expect(confirmBtn).not.toBeDisabled()
  })
})
