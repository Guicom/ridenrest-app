import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, act, screen, waitFor, cleanup } from '@testing-library/react'
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
vi.mock('./segment-card', () => ({
  SegmentCard: ({ segment }: { segment: { id: string } }) => (
    <div data-testid={`seg-${segment.id}`} />
  ),
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
  distanceKm: null,
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
