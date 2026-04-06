import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'

afterEach(cleanup)

// Mock use-live-mode hook
const mockUseLiveMode = vi.fn()
vi.mock('@/hooks/use-live-mode', () => ({
  useLiveMode: () => mockUseLiveMode(),
}))

// Mock use-live-poi-search hook — mutable for auto-zoom tests
const mockRefetchPois = vi.fn()
const mockUseLivePoisSearch = vi.fn().mockReturnValue({ pois: [], hasFetched: false, isFetching: false, targetKm: null, isError: false, refetch: mockRefetchPois, canSearch: false })
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

// Mock useStages hook
const mockUpdateStage = vi.fn().mockResolvedValue(undefined)
vi.mock('@/hooks/use-stages', () => ({
  useStages: () => ({ stages: mockStages, isPending: false, createStage: vi.fn(), updateStage: mockUpdateStage, deleteStage: vi.fn() }),
}))

// Mutable stages for stage update dialog tests
let mockStages: { id: string; name: string; endKm: number; startKm: number; color: string; orderIndex: number; adventureId: string; distanceKm: number; elevationGainM: null; etaMinutes: null; departureTime: null; createdAt: string; updatedAt: string }[] = []

// Mutable live store state for Story 8.4 badge tests
let mockLiveSearchRadiusKm = 5
let mockStageLayerActive = false
let mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])

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
      weatherDepartureTime: null,
      stageLayerActive: mockStageLayerActive,
      gpsTrackingActive: true,
      setCurrentKm: () => {},
      setTargetAheadKm: () => {},
      setStageLayerActive: () => {},
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
  useMapStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        visibleLayers: mockMapVisibleLayers,
        activeAccommodationTypes: mockActiveAccommodationTypes,
        weatherActive: mockMapWeatherActive,
        weatherDimension: 'temperature',
        densityColorEnabled: mockMapDensityColorEnabled,
      }),
    {
      getState: () => ({
        resetAccommodationTypes: vi.fn(),
        setSelectedPoiId: vi.fn(),
      }),
    },
  ),
}))

// Mock LiveMapCanvas — forwardRef for fitToSearchZone tests + captures onStageLongPress
let capturedOnStageLongPress: ((id: string) => void) | undefined
vi.mock('./_components/live-map-canvas', () => ({
  LiveMapCanvas: ({ adventureId, onStageLongPress }: { adventureId: string; onStageLongPress?: (id: string) => void }) => {
    capturedOnStageLongPress = onStageLongPress
    return <div data-testid="live-map-canvas" data-adventure-id={adventureId} />
  },
}))

// Mock LiveControls — expose btn-filters + activeFilterCount badge for page-level tests
vi.mock('./_components/live-controls', () => ({
  LiveControls: ({ onFiltersOpen, activeFilterCount }: { onFiltersOpen: () => void; activeFilterCount: number }) => (
    <div data-testid="live-controls">
      <button data-testid="live-filters-btn" onClick={onFiltersOpen}>
        {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
      </button>
    </div>
  ),
}))

// Mock ElevationProfile (desktop only, full width)
vi.mock('../../map/[id]/_components/elevation-profile', () => ({
  ElevationProfile: () => <div data-testid="elevation-profile" />,
}))

// Mock LiveFiltersDrawer (Story 8.4)
vi.mock('./_components/live-filters-drawer', () => ({
  LiveFiltersDrawer: ({ open }: { open: boolean }) => (
    open ? <div data-testid="live-filters-drawer" /> : null
  ),
}))

// Mock shadcn Dialog (used for stage update confirmation modal)
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div data-testid="stage-update-dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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

// Mock AccommodationSubTypes (reused from map route)
vi.mock('../../map/[id]/_components/accommodation-sub-types', () => ({
  ACCOMMODATION_SUB_TYPES: [
    { type: 'hotel', label: 'Hôtel', color: '#000' },
    { type: 'camp_site', label: 'Camping', color: '#000' },
    { type: 'shelter', label: 'Refuge / Abri', color: '#000' },
    { type: 'hostel', label: 'Auberge de jeunesse', color: '#000' },
    { type: 'guesthouse', label: 'Chambre d\'hôte', color: '#000' },
  ],
}))

// Mock NoResultsSubTypeBanner
vi.mock('../../map/[id]/_components/no-results-sub-type-banner', () => ({
  NoResultsSubTypeBanner: () => <div data-testid="no-results-sub-type-banner" />,
}))

// Mock TanStack Query
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: {
      segments: [
        { id: 'seg-1', name: 'S1', orderIndex: 0, cumulativeStartKm: 0, distanceKm: 50, parseStatus: 'done', waypoints: [], boundingBox: null },
      ],
    },
    isFetching: false,
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
  getAdventure: vi.fn(),
}))

// Mock snapToTrace + computeElevationGain from gpx package
vi.mock('@ridenrest/gpx', () => ({
  snapToTrace: vi.fn().mockReturnValue(null),
  computeElevationGain: vi.fn().mockReturnValue(0),
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

  it('renders "Quitter le live" button with Undo2 icon (AC #5)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode())
    render(<LivePage />)
    const btn = screen.getByTestId('quit-live-btn')
    expect(btn).toBeDefined()
    expect(btn.getAttribute('aria-label')).toBe('Quitter le live')
  })

  it('single click on "Quitter le live" calls stopWatching and navigates to /adventures (AC #6)', async () => {
    const stopWatching = vi.fn()
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ stopWatching }))
    render(<LivePage />)
    const btn = screen.getByTestId('quit-live-btn')
    await act(async () => { fireEvent.click(btn) })
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
    mockUseLivePoisSearch.mockReturnValue({ pois: [{ id: '1' }, { id: '2' }], hasFetched: true, isFetching: false, targetKm: 40, isError: true, refetch: mockRefetchPois, canSearch: true })
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
    mockUseLivePoisSearch.mockReturnValue({ pois: [], hasFetched: true, isFetching: false, targetKm: 40, isError: false, refetch: mockRefetchPois, canSearch: true })
    render(<LivePage />)
    expect(screen.queryByTestId('status-banner')).toBeNull()
  })

  it('shows offline banner over error banner when both apply', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseNetworkStatus.mockReturnValue({ isOnline: false })
    mockUseLivePoisSearch.mockReturnValue({ pois: [], hasFetched: false, isFetching: false, targetKm: 40, isError: true, refetch: mockRefetchPois, canSearch: false })
    render(<LivePage />)
    const banners = screen.getAllByTestId('status-banner')
    expect(banners).toHaveLength(1)
    expect(banners[0].getAttribute('data-variant')).toBe('offline')
  })
})

describe('LivePage — desktop elevation profile', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders elevation profile (full-width desktop panel)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)
    expect(screen.getByTestId('elevation-profile')).toBeDefined()
  })

  it('collapse button toggles elevation profile aria-label', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)
    const btn = screen.getByTestId('elevation-collapse-btn')
    expect(btn.getAttribute('aria-label')).toContain('Masquer')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-label')).toContain('Afficher')
  })
})

describe('LivePage — Story 8.4 FILTERS button', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockMapVisibleLayers = new Set(['accommodations'])
    mockMapWeatherActive = false
    mockMapDensityColorEnabled = true
    mockLiveSearchRadiusKm = 5
    mockStageLayerActive = false
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
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
    mockMapDensityColorEnabled = false
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
    mockMapDensityColorEnabled = false
    mockLiveSearchRadiusKm = 5
    render(<LivePage />)
    const btn = screen.getByTestId('live-filters-btn')
    const badge = btn.querySelector('span')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toBe('1')
  })

  it('activeFilterCount increments by 1 when stageLayerActive = true (AC #4)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockMapVisibleLayers = new Set(['accommodations'])
    mockMapWeatherActive = false
    mockMapDensityColorEnabled = false
    mockLiveSearchRadiusKm = 5
    mockStageLayerActive = true
    render(<LivePage />)
    const btn = screen.getByTestId('live-filters-btn')
    const badge = btn.querySelector('span')
    expect(badge).toBeDefined()
    expect(badge?.textContent).toBe('1')
  })
})

describe('LivePage — Stage update dialog (AC #3)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockStages = []
    capturedOnStageLongPress = undefined
  })

  it('onStageLongPress opens dialog with stage name', () => {
    mockStages = [
      { id: 'stage-1', name: 'Étape 1', endKm: 25, startKm: 0, color: '#FF0000', orderIndex: 0, adventureId: 'adv-123', distanceKm: 25, elevationGainM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '' },
    ]
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)

    act(() => { capturedOnStageLongPress?.('stage-1') })

    expect(screen.getByTestId('stage-update-dialog')).toBeDefined()
    expect(screen.getByText(/Étape 1/)).toBeDefined()
  })

  it('cancel button closes dialog without calling updateStage', () => {
    mockStages = [
      { id: 'stage-1', name: 'Étape 1', endKm: 25, startKm: 0, color: '#FF0000', orderIndex: 0, adventureId: 'adv-123', distanceKm: 25, elevationGainM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '' },
    ]
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)

    act(() => { capturedOnStageLongPress?.('stage-1') })
    expect(screen.getByTestId('stage-update-dialog')).toBeDefined()

    fireEvent.click(screen.getByTestId('stage-update-cancel-btn'))
    expect(screen.queryByTestId('stage-update-dialog')).toBeNull()
    expect(mockUpdateStage).not.toHaveBeenCalled()
  })

  it('confirm button is disabled when currentKmOnRoute is null (no GPS)', () => {
    mockStages = [
      { id: 'stage-1', name: 'Étape 1', endKm: 25, startKm: 0, color: '#FF0000', orderIndex: 0, adventureId: 'adv-123', distanceKm: 25, elevationGainM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '' },
    ]
    // currentKmOnRoute = null (GPS not locked) — default in store mock
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    render(<LivePage />)

    act(() => { capturedOnStageLongPress?.('stage-1') })

    const confirmBtn = screen.getByTestId('stage-update-confirm-btn') as HTMLButtonElement
    expect(confirmBtn.disabled).toBe(true)
  })
})

describe('LivePage — auto-zoom on search (Story 16.15)', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('survives poisFetching true→false transition without error (AC #4)', () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseLivePoisSearch.mockReturnValue({
      pois: [], hasFetched: true, isFetching: true, targetKm: 30,
      isError: false, refetch: mockRefetchPois, canSearch: true,
    })

    const { rerender } = render(<LivePage />)
    expect(screen.getByTestId('live-map-canvas')).toBeDefined()

    // Transition: isFetching true→false — should not throw
    mockUseLivePoisSearch.mockReturnValue({
      pois: [{ id: 'p1' }], hasFetched: true, isFetching: false, targetKm: 30,
      isError: false, refetch: mockRefetchPois, canSearch: true,
    })
    rerender(<LivePage />)

    // Component still renders after transition
    expect(screen.getByTestId('live-map-canvas')).toBeDefined()
  })

  it('does not show no-results banner before first search (AC #6)', async () => {
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseLivePoisSearch.mockReturnValue({
      pois: [], hasFetched: false, isFetching: false, targetKm: null,
      isError: false, refetch: mockRefetchPois, canSearch: false,
    })
    render(<LivePage />)
    // Wait for mount effect to complete, then verify no banner
    await screen.findByTestId('live-map-canvas')
    expect(screen.queryByText('Aucun résultat dans cette zone')).toBeNull()
  })
})

describe('LivePage — NoResultsSubTypeBanner (Story 16.17, AC-4)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockUseNetworkStatus.mockReturnValue({ isOnline: true })
  })

  it('shows blue banner when live active, no accommodations, and not all types selected', async () => {
    mockActiveAccommodationTypes = new Set(['hotel'])
    mockUseNetworkStatus.mockReturnValue({ isOnline: true })
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseLivePoisSearch.mockReturnValue({
      pois: [], hasFetched: true, isFetching: false, targetKm: 30,
      isError: false, refetch: mockRefetchPois, canSearch: true,
    })
    render(<LivePage />)
    // Wait for mounted useEffect to fire
    expect(await screen.findByTestId('no-results-sub-type-banner')).toBeDefined()
  })

  it('does NOT show blue banner when all accommodation types are selected', async () => {
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockUseNetworkStatus.mockReturnValue({ isOnline: true })
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseLivePoisSearch.mockReturnValue({
      pois: [], hasFetched: true, isFetching: false, targetKm: 30,
      isError: false, refetch: mockRefetchPois, canSearch: true,
    })
    render(<LivePage />)
    await screen.findByTestId('live-map-canvas')
    expect(screen.queryByTestId('no-results-sub-type-banner')).toBeNull()
  })

  it('shows orange banner instead when all types selected and no results (AC-5)', async () => {
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockUseNetworkStatus.mockReturnValue({ isOnline: true })
    mockUseLiveMode.mockReturnValue(defaultLiveMode({ hasConsented: true, isLiveModeActive: true }))
    mockUseLivePoisSearch.mockReturnValue({
      pois: [], hasFetched: true, isFetching: false, targetKm: 30,
      isError: false, refetch: mockRefetchPois, canSearch: true,
    })
    render(<LivePage />)
    // Wait for mounted useEffect, then check banners
    expect(await screen.findByText('Aucun résultat dans cette zone')).toBeDefined()
    expect(screen.queryByTestId('no-results-sub-type-banner')).toBeNull()
  })
})
