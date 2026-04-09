import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StravaImportModal } from './strava-import-modal'

// Mock api-client
vi.mock('@/lib/api-client', () => ({
  listStravaRoutes: vi.fn(),
  importStravaRoute: vi.fn(),
}))

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

import { listStravaRoutes, importStravaRoute } from '@/lib/api-client'
import { toast } from 'sonner'

const mockListStravaRoutes = vi.mocked(listStravaRoutes)
const mockImportStravaRoute = vi.mocked(importStravaRoute)
const mockToast = vi.mocked(toast)

// 30 routes → hasNextPage = true
const mockPage1 = Array.from({ length: 30 }, (_, i) => ({
  id: `route-${i}`,
  name: `Route ${i}`,
  distanceKm: 42,
  elevationGainM: 500,
}))

// 5 routes → hasNextPage = false
const mockPage2 = Array.from({ length: 5 }, (_, i) => ({
  id: `route-extra-${i}`,
  name: `Route extra ${i}`,
  distanceKm: 20,
  elevationGainM: 100,
}))

function renderModal(props: Partial<Parameters<typeof StravaImportModal>[0]> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <StravaImportModal
        adventureId="adv-1"
        open={true}
        onOpenChange={vi.fn()}
        stravaConnected={true}
        {...props}
      />
    </QueryClientProvider>,
  )
}

afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
})

describe('StravaImportModal', () => {
  it('shows not connected message when stravaConnected = false', () => {
    renderModal({ stravaConnected: false })

    expect(screen.getByText(/Connecte ton compte Strava dans les paramètres/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /aller dans les paramètres/i })).toBeInTheDocument()
    expect(mockListStravaRoutes).not.toHaveBeenCalled()
  })

  it('shows skeletons while loading routes', async () => {
    // Never resolves — keeps loading state
    mockListStravaRoutes.mockReturnValue(new Promise(() => {}))

    renderModal({ stravaConnected: true })

    await waitFor(() => {
      expect(mockListStravaRoutes).toHaveBeenCalled()
    })

    // 3 Skeleton elements visible while loading
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
    expect(skeletons.length).toBe(3)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('renders checkboxes instead of per-row Importer buttons when routes are loaded', async () => {
    const routes = [
      { id: '123', name: 'Col du Tourmalet', distanceKm: 45.2, elevationGainM: 1200 },
      { id: '456', name: 'Transcantabrique', distanceKm: 80.1, elevationGainM: null },
    ]
    mockListStravaRoutes.mockResolvedValue(routes)

    renderModal({ stravaConnected: true })

    await waitFor(() => {
      expect(screen.getByText('Col du Tourmalet')).toBeInTheDocument()
      expect(screen.getByText('Transcantabrique')).toBeInTheDocument()
    })

    // Checkboxes present
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)

    // No individual per-row "Importer" buttons
    const importerButtons = screen.queryAllByRole('button', { name: /^importer$/i })
    expect(importerButtons).toHaveLength(0)
  })

  it('"Importer 0 segment(s)" CTA is disabled when nothing selected', async () => {
    mockListStravaRoutes.mockResolvedValue([
      { id: '123', name: 'Route Test', distanceKm: 30, elevationGainM: 500 },
    ])

    renderModal({ stravaConnected: true })

    await waitFor(() => expect(screen.getByText('Route Test')).toBeInTheDocument())

    // Footer CTA should be disabled (no selection)
    const cta = screen.getByRole('button', { name: /segment\(s\)/i })
    expect(cta).toBeDisabled()
  })

  it('checking 2 routes → CTA shows "Importer 2 segment(s)" and is enabled', async () => {
    const user = userEvent.setup()
    const routes = [
      { id: '123', name: 'Col du Tourmalet', distanceKm: 45.2, elevationGainM: 1200 },
      { id: '456', name: 'Transcantabrique', distanceKm: 80.1, elevationGainM: null },
    ]
    mockListStravaRoutes.mockResolvedValue(routes)

    renderModal({ stravaConnected: true })

    await waitFor(() => expect(screen.getByText('Col du Tourmalet')).toBeInTheDocument())

    const checkboxes = screen.getAllByRole('checkbox')
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])

    const cta = screen.getByRole('button', { name: /importer 2 segment\(s\)/i })
    expect(cta).toBeEnabled()
  })

  it('"Charger plus" visible when page returned 30 items', async () => {
    mockListStravaRoutes.mockResolvedValue(mockPage1)

    renderModal({ stravaConnected: true })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /charger plus/i })).toBeInTheDocument()
    })
  })

  it('"Charger plus" hidden when page returned < 30 items', async () => {
    mockListStravaRoutes.mockResolvedValue(mockPage2)

    renderModal({ stravaConnected: true })

    await waitFor(() => expect(screen.getByText(`Route extra 0`)).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: /charger plus/i })).not.toBeInTheDocument()
  })

  it('clicking "Charger plus" calls listStravaRoutes(2) and appends routes', async () => {
    const user = userEvent.setup()
    mockListStravaRoutes
      .mockResolvedValueOnce(mockPage1)   // page 1
      .mockResolvedValueOnce(mockPage2)   // page 2

    renderModal({ stravaConnected: true })

    await waitFor(() => expect(screen.getByRole('button', { name: /charger plus/i })).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /charger plus/i }))

    await waitFor(() => {
      expect(mockListStravaRoutes).toHaveBeenCalledTimes(2)
      expect(mockListStravaRoutes).toHaveBeenNthCalledWith(2, 2)
      // Both pages appended → extra routes visible
      expect(screen.getByText('Route extra 0')).toBeInTheDocument()
    })
  })

  it('multi-import calls importStravaRoute sequentially, invalidates query, closes modal', async () => {
    const user = userEvent.setup()
    const routes = [
      { id: '123', name: 'Route A', distanceKm: 30, elevationGainM: 500 },
      { id: '456', name: 'Route B', distanceKm: 20, elevationGainM: 200 },
    ]
    mockListStravaRoutes.mockResolvedValue(routes)
    mockImportStravaRoute.mockResolvedValue({
      id: 'seg-1',
      adventureId: 'adv-1',
      name: 'Route A',
      orderIndex: 0,
      cumulativeStartKm: 0,
      distanceKm: 30,
      elevationGainM: 500,
      elevationLossM: null,
      parseStatus: 'pending',
      source: 'strava',
      boundingBox: null,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    })

    const mockOnOpenChange = vi.fn()
    renderModal({ stravaConnected: true, onOpenChange: mockOnOpenChange })

    await waitFor(() => expect(screen.getByText('Route A')).toBeInTheDocument())

    const checkboxes = screen.getAllByRole('checkbox')
    // Click both checkboxes (selection order: 123, 456)
    await user.click(checkboxes[0])
    await user.click(checkboxes[1])

    const cta = screen.getByRole('button', { name: /importer 2 segment\(s\)/i })
    await user.click(cta)

    await waitFor(() => {
      // Called in selection order
      expect(mockImportStravaRoute).toHaveBeenNthCalledWith(1, '123', 'adv-1')
      expect(mockImportStravaRoute).toHaveBeenNthCalledWith(2, '456', 'adv-1')
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
      expect(mockToast.success).toHaveBeenCalledWith('2 segment(s) importé(s)')
    })
  })

  it('search filter works on all loaded routes', async () => {
    const user = userEvent.setup()
    const routes = [
      { id: '123', name: 'Col du Tourmalet', distanceKm: 45.2, elevationGainM: 1200 },
      { id: '456', name: 'Transcantabrique', distanceKm: 80.1, elevationGainM: null },
    ]
    mockListStravaRoutes.mockResolvedValue(routes)

    renderModal({ stravaConnected: true })

    await waitFor(() => {
      expect(screen.getByText('Col du Tourmalet')).toBeInTheDocument()
      expect(screen.getByText('Transcantabrique')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText('Rechercher une route...')
    await user.type(searchInput, 'tourmalet')

    expect(screen.getByText('Col du Tourmalet')).toBeInTheDocument()
    expect(screen.queryByText('Transcantabrique')).not.toBeInTheDocument()
  })

  it('shows "Aucune route trouvée pour..." when search yields no results', async () => {
    const user = userEvent.setup()
    const routes = [
      { id: '123', name: 'Col du Tourmalet', distanceKm: 45.2, elevationGainM: 1200 },
    ]
    mockListStravaRoutes.mockResolvedValue(routes)

    renderModal({ stravaConnected: true })

    await waitFor(() => expect(screen.getByText('Col du Tourmalet')).toBeInTheDocument())

    const searchInput = screen.getByPlaceholderText('Rechercher une route...')
    await user.type(searchInput, 'pirénées')

    expect(screen.getByText(/Aucune route trouvée pour/i)).toBeInTheDocument()
    expect(screen.queryByText('Col du Tourmalet')).not.toBeInTheDocument()
  })

  it('CTA is disabled while import is in progress', async () => {
    const user = userEvent.setup()
    const routes = [{ id: '123', name: 'Route Test', distanceKm: 30, elevationGainM: 500 }]
    mockListStravaRoutes.mockResolvedValue(routes)

    // Never resolves — keeps isPending = true
    mockImportStravaRoute.mockReturnValue(new Promise(() => {}))

    renderModal({ stravaConnected: true })

    await waitFor(() => expect(screen.getByText('Route Test')).toBeInTheDocument())

    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    const cta = screen.getByRole('button', { name: /importer 1 segment\(s\)/i })
    expect(cta).toBeEnabled()

    await user.click(cta)

    // CTA should be disabled and show "Importation…" while pending
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /importation/i })).toBeDisabled()
    })
  })

  it('shows error toast when import fails', async () => {
    const user = userEvent.setup()
    const routes = [{ id: '123', name: 'Route Test', distanceKm: 30, elevationGainM: null }]
    mockListStravaRoutes.mockResolvedValue(routes)
    mockImportStravaRoute.mockRejectedValue(new Error('API error'))

    renderModal({ stravaConnected: true })

    await waitFor(() => expect(screen.getByText('Route Test')).toBeInTheDocument())

    // Select the route
    const checkbox = screen.getByRole('checkbox')
    await user.click(checkbox)

    const cta = screen.getByRole('button', { name: /importer 1 segment\(s\)/i })
    await user.click(cta)

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Erreur lors de l'importation : API error")
    })
  })

  it('query refetches on re-open with same QueryClient (staleTime: 0)', async () => {
    const routes = [{ id: '123', name: 'Route Test', distanceKm: 30, elevationGainM: 500 }]
    mockListStravaRoutes.mockResolvedValue(routes)

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <StravaImportModal adventureId="adv-1" open={true} onOpenChange={vi.fn()} stravaConnected={true} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(mockListStravaRoutes).toHaveBeenCalledTimes(1))

    // Close modal — query disabled
    rerender(
      <QueryClientProvider client={queryClient}>
        <StravaImportModal adventureId="adv-1" open={false} onOpenChange={vi.fn()} stravaConnected={true} />
      </QueryClientProvider>,
    )

    // Re-open — staleTime: 0 means data is immediately stale → refetch fires
    rerender(
      <QueryClientProvider client={queryClient}>
        <StravaImportModal adventureId="adv-1" open={true} onOpenChange={vi.fn()} stravaConnected={true} />
      </QueryClientProvider>,
    )

    await waitFor(() => expect(mockListStravaRoutes).toHaveBeenCalledTimes(2))
  })
})
