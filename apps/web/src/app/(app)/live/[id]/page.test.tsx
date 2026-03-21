import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

afterEach(cleanup)

// Mock use-live-mode hook
const mockUseLiveMode = vi.fn()
vi.mock('@/hooks/use-live-mode', () => ({
  useLiveMode: () => mockUseLiveMode(),
}))

// Mock use-live-poi-search hook
const mockUseLivePoisSearch = vi.fn().mockReturnValue({ pois: [], isPending: false, targetKm: null, isError: false })
vi.mock('@/hooks/use-live-poi-search', () => ({
  useLivePoisSearch: () => mockUseLivePoisSearch(),
}))

// Mock useNetworkStatus hook
const mockUseNetworkStatus = vi.fn().mockReturnValue({ isOnline: true })
vi.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: () => mockUseNetworkStatus(),
}))

// Mock useLiveWeather hook
vi.mock('@/hooks/use-live-weather', () => ({
  useLiveWeather: () => ({ weatherPoints: [], isGpsLost: false }),
}))

// Mutable live store state for Story 8.4 badge tests
let mockLiveSearchRadiusKm = 5

// Mock Zustand stores
vi.mock('@/stores/live.store', () => ({
  useLiveStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      isLiveModeActive: false,
      currentKmOnRoute: null,
      targetAheadKm: 30,
      searchRadiusKm: mockLiveSearchRadiusKm,
      speedKmh: 15,
      currentPosition: null,
      setCurrentKm: () => {},
    }),
}))

vi.mock('@/stores/ui.store', () => ({
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ selectedPoiId: null }),
}))

// Mock useMapStore for Story 8.4 (activeFilterCount computation)
let mockMapVisibleLayers = new Set(['accommodations'])
let mockMapWeatherActive = false
let mockMapDensityColorEnabled = true
vi.mock('@/stores/map.store', () => ({
  useMapStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      visibleLayers: mockMapVisibleLayers,
      weatherActive: mockMapWeatherActive,
      densityColorEnabled: mockMapDensityColorEnabled,
    }),
}))

// Mock LiveMapCanvas
vi.mock('./_components/live-map-canvas', () => ({
  LiveMapCanvas: ({ adventureId }: { adventureId: string }) => (
    <div data-testid="live-map-canvas" data-adventure-id={adventureId} />
  ),
}))

// Mock LiveControls (no props)
vi.mock('./_components/live-controls', () => ({
  LiveControls: () => <div data-testid="live-controls" />,
}))

// Mock LiveFiltersDrawer (Story 8.4)
vi.mock('./_components/live-filters-drawer', () => ({
  LiveFiltersDrawer: ({ open }: { open: boolean }) => (
    open ? <div data-testid="live-filters-drawer" /> : null
  ),
}))

// Mock StatusBanner
vi.mock('./_components/status-banner', () => ({
  StatusBanner: ({ variant, message }: { variant: string; message: string }) => (
    <div data-testid="status-banner" data-variant={variant}>{message}</div>
  ),
}))

// Mock LiveWeatherOverlay
vi.mock('./_components/live-weather-overlay', () => ({
  LiveWeatherOverlay: () => <div data-testid="live-weather-overlay" />,
}))

// Mock GeolocationConsent
vi.mock('./_components/geolocation-consent', () => ({
  GeolocationConsent: ({ open }: { open: boolean }) => (
    open ? <div data-testid="geolocation-consent" /> : null
  ),
}))

// Mock PoiDetailSheet (from map route, reused in live)
vi.mock('../../map/[id]/_components/poi-detail-sheet', () => ({
  PoiDetailSheet: () => <div data-testid="poi-detail-sheet" />,
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
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'adv-123' }),
  useRouter: () => ({ push: mockPush }),
}))

// Mock api-client
vi.mock('@/lib/api-client', () => ({
  getAdventureMapData: vi.fn(),
}))

// Mock snapToTrace from gpx package
vi.mock('@ridenrest/gpx', () => ({
  snapToTrace: vi.fn().mockReturnValue(null),
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

  it('does NOT render "Aventures" ArrowLeft back link (AC #5 — removed in Story 8.3)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode())
    render(<LivePage />)
    // No <a> link to /adventures should exist on the live page
    const links = screen.queryAllByRole('link')
    const adventuresLink = links.find((l) => l.getAttribute('href') === '/adventures')
    expect(adventuresLink).toBeUndefined()
  })

  it('renders "Quitter le live" button (AC #5)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode())
    render(<LivePage />)
    expect(screen.getByTestId('quit-live-btn')).toBeDefined()
    expect(screen.getByTestId('quit-live-btn').textContent).toContain('Quitter le live')
  })

  it('first click on "Quitter le live" shows confirm state (AC #6)', async () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode())
    render(<LivePage />)
    const btn = screen.getByTestId('quit-live-btn')
    await act(async () => { fireEvent.click(btn) })
    expect(btn.textContent).toContain('Confirmer')
  })

  it('second click on "Quitter le live" calls stopWatching and navigates to /adventures (AC #6)', async () => {
    const stopWatching = vi.fn()
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ stopWatching }))
    render(<LivePage />)
    const btn = screen.getByTestId('quit-live-btn')
    await act(async () => { fireEvent.click(btn) }) // first click — confirm state
    await act(async () => { fireEvent.click(btn) }) // second click — confirmed
    expect(stopWatching).toHaveBeenCalledTimes(1)
    expect(mockPush).toHaveBeenCalledWith('/adventures')
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
    fireEvent.click(button)
    expect(startWatching).toHaveBeenCalledTimes(callsBeforeClick + 1)
  })

  it('shows offline banner when navigator.onLine is false and live mode active (AC #3, #4)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseNetworkStatus.mockReturnValue({ isOnline: false })
    render(<LivePage />)
    const banner = screen.getByTestId('status-banner')
    expect(banner.getAttribute('data-variant')).toBe('offline')
    expect(banner.textContent).toContain('Mode hors ligne')
  })

  it('shows error banner when POI query fails and online (AC #1)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseNetworkStatus.mockReturnValue({ isOnline: true })
    mockUseLivePoisSearch.mockReturnValue({ pois: [{ id: '1' }, { id: '2' }], isPending: false, targetKm: 40, isError: true })
    render(<LivePage />)
    const banner = screen.getByTestId('status-banner')
    expect(banner.getAttribute('data-variant')).toBe('error')
    expect(banner.textContent).toContain('Connexion instable')
    expect(banner.textContent).toContain('2 résultats chargés')
  })

  it('does not show banner when live mode is inactive', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: false }))
    mockUseNetworkStatus.mockReturnValue({ isOnline: false })
    render(<LivePage />)
    expect(screen.queryByTestId('status-banner')).toBeNull()
  })

  it('hides banner when POI query succeeds after error (AC #2)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseNetworkStatus.mockReturnValue({ isOnline: true })
    mockUseLivePoisSearch.mockReturnValue({ pois: [], isPending: false, targetKm: 40, isError: false })
    render(<LivePage />)
    expect(screen.queryByTestId('status-banner')).toBeNull()
  })

  it('shows offline banner over error banner when both apply', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseNetworkStatus.mockReturnValue({ isOnline: false })
    mockUseLivePoisSearch.mockReturnValue({ pois: [], isPending: false, targetKm: 40, isError: true })
    render(<LivePage />)
    const banners = screen.getAllByTestId('status-banner')
    expect(banners).toHaveLength(1)
    expect(banners[0].getAttribute('data-variant')).toBe('offline')
  })
})

describe('LivePage — Story 8.4 FILTERS button', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockMapVisibleLayers = new Set(['accommodations'])
    mockMapWeatherActive = false
    mockMapDensityColorEnabled = true
    mockLiveSearchRadiusKm = 5
  })

  it('renders FILTERS button when live mode is active', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)
    expect(screen.getByTestId('live-filters-btn')).toBeDefined()
  })

  it('does not render FILTERS button when live mode is inactive', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: false, isLiveModeActive: false }))
    render(<LivePage />)
    expect(screen.queryByTestId('live-filters-btn')).toBeNull()
  })

  it('clicking FILTERS button opens the drawer', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)
    expect(screen.queryByTestId('live-filters-drawer')).toBeNull()
    fireEvent.click(screen.getByTestId('live-filters-btn'))
    expect(screen.getByTestId('live-filters-drawer')).toBeDefined()
  })

  it('shows no badge when filter count is zero (default state)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockMapVisibleLayers = new Set(['accommodations'])
    mockMapWeatherActive = false
    mockMapDensityColorEnabled = true
    mockLiveSearchRadiusKm = 5
    render(<LivePage />)
    // Badge span only renders when activeFilterCount > 0
    const btn = screen.getByTestId('live-filters-btn')
    expect(btn.querySelector('span')).toBeNull()
  })

  it('shows badge when active filter count > 0 (e.g. restaurants active)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockMapVisibleLayers = new Set(['accommodations', 'restaurants'])
    mockMapWeatherActive = false
    mockMapDensityColorEnabled = true
    mockLiveSearchRadiusKm = 5
    render(<LivePage />)
    const btn = screen.getByTestId('live-filters-btn')
    const badge = btn.querySelector('span')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toBe('1')
  })
})
