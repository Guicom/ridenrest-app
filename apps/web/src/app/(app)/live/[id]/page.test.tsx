import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

// Mock use-live-mode hook
const mockUseLiveMode = vi.fn()
vi.mock('@/hooks/use-live-mode', () => ({
  useLiveMode: () => mockUseLiveMode(),
}))

// Mock LiveMapCanvas
vi.mock('./_components/live-map-canvas', () => ({
  LiveMapCanvas: ({ adventureId }: { adventureId: string }) => (
    <div data-testid="live-map-canvas" data-adventure-id={adventureId} />
  ),
}))

// Mock GeolocationConsent
vi.mock('./_components/geolocation-consent', () => ({
  GeolocationConsent: ({ open }: { open: boolean }) => (
    open ? <div data-testid="geolocation-consent" /> : null
  ),
}))

// Mock TanStack Query
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      segments: [
        { id: 'seg-1', name: 'S1', orderIndex: 0, cumulativeStartKm: 0, distanceKm: 50, parseStatus: 'done', waypoints: [], boundingBox: null },
      ],
    },
    isPending: false,
  }),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'adv-123' }),
}))

// Mock api-client
vi.mock('@/lib/api-client', () => ({
  getAdventureMapData: vi.fn(),
}))

import LivePage from './page'

function defaultLiveMode(overrides = {}) {
  return {
    isLiveModeActive: false,
    hasConsented: false,
    permissionDenied: false,
    startWatching: vi.fn(),
    stopWatching: vi.fn(),
    grantConsent: vi.fn(),
    ...overrides,
  }
}

describe('LivePage', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows GeolocationConsent when user has not consented', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: false }))
    render(<LivePage />)
    expect(screen.getByTestId('geolocation-consent')).toBeDefined()
  })

  it('hides GeolocationConsent when user has consented', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)
    expect(screen.queryByTestId('geolocation-consent')).toBeNull()
  })

  it('renders LiveMapCanvas', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true }))
    render(<LivePage />)
    expect(screen.getByTestId('live-map-canvas')).toBeDefined()
  })

  it('shows back link to adventures', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode())
    render(<LivePage />)
    const backLink = screen.getByRole('link')
    expect(backLink.getAttribute('href')).toBe('/adventures')
  })

  it('shows permission denied message', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ permissionDenied: true, hasConsented: true }))
    render(<LivePage />)
    expect(screen.getByText(/Géolocalisation refusée/)).toBeDefined()
  })

  it('shows activate button when live mode inactive and not denied (consented)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: false, permissionDenied: false }))
    render(<LivePage />)
    expect(screen.getByText(/Activer le mode Live/)).toBeDefined()
  })

  it('calls startWatching when activate button clicked (consented user, AC #6)', () => {
    const startWatching = vi.fn()
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: false, startWatching }))
    render(<LivePage />)
    const callsBeforeClick = startWatching.mock.calls.length // 1 from useEffect auto-start
    const button = screen.getByText(/Activer le mode Live/)
    button.click()
    expect(startWatching).toHaveBeenCalledTimes(callsBeforeClick + 1)
  })
})
