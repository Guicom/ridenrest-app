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
vi.mock('./gpx-upload-form', () => ({
  GpxUploadForm: ({ onSuccess, onPendingChange }: { onSuccess?: () => void; onPendingChange?: (p: boolean) => void }) => (
    <div data-testid="gpx-upload-form">
      <button data-testid="simulate-upload-success" onClick={() => onSuccess?.()}>Upload</button>
      <button data-testid="simulate-pending-true" onClick={() => onPendingChange?.(true)}>Set Pending</button>
      <button data-testid="simulate-pending-false" onClick={() => onPendingChange?.(false)}>Clear Pending</button>
    </div>
  ),
}))
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
// Mock Dialog to avoid base-ui portal issues in JSDOM
// Only the OPEN dialog stores its onOpenChange so Close targets the right one
vi.mock('@/components/ui/dialog', () => {
  let activeOnOpenChange: ((o: boolean) => void) | null = null
  return {
    Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }) => {
      if (open) activeOnOpenChange = onOpenChange
      return open ? <div data-testid="dialog-root">{children}</div> : null
    },
    DialogContent: ({ children }: { children: React.ReactNode }) => (
      <div>
        {children}
        <button aria-label="Close" onClick={() => activeOnOpenChange?.(false)}>×</button>
      </div>
    ),
    DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    DialogClose: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DialogOverlay: () => null,
    DialogPortal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DialogTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})
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
  elevationLossM: null,
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
      expect(screen.getByText("Segments en cours d'analyse")).toBeInTheDocument()
    )
  })

  it('does NOT show pending tooltip when all segments are done', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ id: 'seg-1', parseStatus: 'done', distanceKm: 50 }),
    ])
    renderDetail()

    await waitFor(() => expect(screen.getByTestId('density-trigger-btn')).toBeInTheDocument())
    expect(screen.queryByText("Segments en cours d'analyse")).not.toBeInTheDocument()
  })
})

describe('AdventureDetail — date pickers', () => {
  it('calls updateAdventureStartDate with the selected date on start date change', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    const updateStartDate = vi.spyOn(apiClient, 'updateAdventureStartDate').mockResolvedValue({
      id: 'adv-1',
      name: 'Tour test',
      totalDistanceKm: 0,
      startDate: '2026-06-15',
    } as Awaited<ReturnType<typeof apiClient.getAdventure>>)
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    const input = screen.getByLabelText('Date de départ :')
    fireEvent.change(input, { target: { value: '2026-06-15' } })

    await waitFor(() => expect(updateStartDate).toHaveBeenCalledWith('adv-1', '2026-06-15'))
  })

  it('calls updateAdventureStartDate with null when start date is cleared', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    vi.spyOn(apiClient, 'getAdventure').mockResolvedValue({
      id: 'adv-1',
      name: 'Tour test',
      totalDistanceKm: 0,
      startDate: '2026-06-15',
    } as Awaited<ReturnType<typeof apiClient.getAdventure>>)
    const updateStartDate = vi.spyOn(apiClient, 'updateAdventureStartDate').mockResolvedValue({
      id: 'adv-1',
      name: 'Tour test',
      totalDistanceKm: 0,
      startDate: null,
    } as Awaited<ReturnType<typeof apiClient.getAdventure>>)

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <AdventureDetail adventureId="adv-1" />
      </QueryClientProvider>,
    )

    await waitFor(() => screen.getByText('Tour test'))
    const input = screen.getByLabelText('Date de départ :')
    fireEvent.change(input, { target: { value: '' } })

    await waitFor(() => expect(updateStartDate).toHaveBeenCalledWith('adv-1', null))
  })

  it('calls updateAdventureEndDate with the selected date on end date change', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    const updateEndDate = vi.spyOn(apiClient, 'updateAdventureEndDate').mockResolvedValue({
      id: 'adv-1',
      name: 'Tour test',
      totalDistanceKm: 0,
      endDate: '2026-06-30',
    } as Awaited<ReturnType<typeof apiClient.getAdventure>>)
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    const input = screen.getByLabelText('Date de fin :')
    fireEvent.change(input, { target: { value: '2026-06-30' } })

    await waitFor(() => expect(updateEndDate).toHaveBeenCalledWith('adv-1', '2026-06-30'))
  })

  it('shows error toast when start date mutation fails', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    vi.spyOn(apiClient, 'updateAdventureStartDate').mockRejectedValue(new Error('Network error'))
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    const input = screen.getByLabelText('Date de départ :')
    fireEvent.change(input, { target: { value: '2026-06-15' } })

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Erreur lors de la mise à jour de la date de départ'),
    )
  })

  it('start date input is disabled while mutation is pending', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    // Never resolves — simulates pending state
    vi.spyOn(apiClient, 'updateAdventureStartDate').mockReturnValue(new Promise(() => {}))
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    const input = screen.getByLabelText('Date de départ :') as HTMLInputElement
    fireEvent.change(input, { target: { value: '2026-06-15' } })

    await waitFor(() => expect(input.disabled).toBe(true))
  })
})

describe('AdventureDetail — GPX upload dialog', () => {
  it('shows "Ajouter un segment GPX" button when adventure has no segments', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    expect(screen.getByRole('button', { name: /ajouter un segment gpx/i })).toBeInTheDocument()
  })

  it('shows "+ Ajouter un segment" button when adventure has segments', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([
      makeSeg({ id: 'seg-1', parseStatus: 'done', distanceKm: 10 }),
    ])
    renderDetail()

    await waitFor(() => screen.getByTestId('seg-seg-1'))
    expect(screen.getByRole('button', { name: /ajouter un segment/i })).toBeInTheDocument()
  })

  it('clicking add button opens dialog with GPX upload form', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))

    // Dialog form should not be visible yet
    expect(screen.queryByTestId('gpx-upload-form')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /ajouter un segment gpx/i }))

    await waitFor(() => {
      expect(screen.getByTestId('dialog-root')).toBeInTheDocument()
      expect(screen.getByTestId('gpx-upload-form')).toBeInTheDocument()
    })
  })

  it('dialog closes after successful upload (onSuccess called)', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByRole('button', { name: /ajouter un segment gpx/i }))

    await waitFor(() => screen.getByTestId('gpx-upload-form'))

    // Simulate successful upload
    fireEvent.click(screen.getByTestId('simulate-upload-success'))

    await waitFor(() => {
      expect(screen.queryByTestId('gpx-upload-form')).not.toBeInTheDocument()
    })
  })

  it('dialog does NOT close while upload is pending', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByRole('button', { name: /ajouter un segment gpx/i }))

    await waitFor(() => screen.getByTestId('gpx-upload-form'))

    // Set upload as pending
    fireEvent.click(screen.getByTestId('simulate-pending-true'))

    // Try to close via the X button
    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)

    // Dialog should still be open
    expect(screen.getByTestId('gpx-upload-form')).toBeInTheDocument()
  })

  it('dialog closes after pending is cleared', async () => {
    vi.spyOn(apiClient, 'listSegments').mockResolvedValue([])
    renderDetail()

    await waitFor(() => screen.getByText('Tour test'))
    fireEvent.click(screen.getByRole('button', { name: /ajouter un segment gpx/i }))

    await waitFor(() => screen.getByTestId('gpx-upload-form'))

    // Set pending, then clear it
    fireEvent.click(screen.getByTestId('simulate-pending-true'))
    fireEvent.click(screen.getByTestId('simulate-pending-false'))

    // Now close should work
    const closeButton = screen.getByRole('button', { name: /close/i })
    fireEvent.click(closeButton)

    await waitFor(() => {
      expect(screen.queryByTestId('gpx-upload-form')).not.toBeInTheDocument()
    })
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
