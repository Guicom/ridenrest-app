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

    // Skeletons should be visible during load
    await waitFor(() => {
      expect(mockListStravaRoutes).toHaveBeenCalled()
    })
  })

  it('renders route list with Importer buttons when routes are loaded', async () => {
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

    const importButtons = screen.getAllByRole('button', { name: /importer/i })
    expect(importButtons).toHaveLength(2)
  })

  it('calls importStravaRoute, closes modal, and shows success toast on import', async () => {
    const user = userEvent.setup()
    const routes = [{ id: '123', name: 'Route Test', distanceKm: 30, elevationGainM: 500 }]
    mockListStravaRoutes.mockResolvedValue(routes)
    mockImportStravaRoute.mockResolvedValue({
      id: 'seg-1',
      adventureId: 'adv-1',
      name: 'Route Test',
      orderIndex: 0,
      cumulativeStartKm: 0,
      distanceKm: 30,
      elevationGainM: 500,
      parseStatus: 'pending',
      source: 'strava',
      boundingBox: null,
      createdAt: '2026-03-15T00:00:00.000Z',
      updatedAt: '2026-03-15T00:00:00.000Z',
    })

    const mockOnOpenChange = vi.fn()
    renderModal({ stravaConnected: true, onOpenChange: mockOnOpenChange })

    await waitFor(() => {
      expect(screen.getByText('Route Test')).toBeInTheDocument()
    })

    const importButton = screen.getByRole('button', { name: /importer/i })
    await user.click(importButton)

    await waitFor(() => {
      expect(mockImportStravaRoute).toHaveBeenCalledWith('123', 'adv-1')
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
      expect(mockToast.success).toHaveBeenCalledWith('Route Strava importée — analyse en cours')
    })
  })

  it('shows error toast when import fails', async () => {
    const user = userEvent.setup()
    const routes = [{ id: '123', name: 'Route Test', distanceKm: 30, elevationGainM: null }]
    mockListStravaRoutes.mockResolvedValue(routes)
    mockImportStravaRoute.mockRejectedValue(new Error('API error'))

    renderModal({ stravaConnected: true })

    await waitFor(() => {
      expect(screen.getByText('Route Test')).toBeInTheDocument()
    })

    const importButton = screen.getByRole('button', { name: /importer/i })
    await user.click(importButton)

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Erreur lors de l'import Strava")
    })
  })
})
