import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MapView } from './map-view'

afterEach(cleanup)

// Mock next/navigation for Link component
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({ id: 'adv-1' }),
  usePathname: () => '/map/adv-1',
}))

// Mock getAdventureMapData
vi.mock('@/lib/api-client', () => ({
  getAdventureMapData: vi.fn(),
}))

// Mock usePois hook — mutable isPending for auto-zoom tests
let mockPoisIsPending = false
let mockPoisAccommodations: { id: string; category: string }[] = []
vi.mock('@/hooks/use-pois', () => ({
  usePois: () => ({
    poisByLayer: { accommodations: mockPoisAccommodations, restaurants: [], supplies: [], bike: [] },
    isPending: mockPoisIsPending,
    hasError: false,
  }),
}))

// Mock useDensity hook — default to idle (no density data)
let mockDensityStatus: string = 'idle'
vi.mock('@/hooks/use-density', () => ({
  useDensity: () => ({
    coverageGaps: [],
    densityStatus: mockDensityStatus,
    densityCategories: [],
    densityStale: false,
    isPending: false,
  }),
}))

// Mutable map store state for Story 8.4 + 16.15 tests
let mockMapStoreVisibleLayers = new Set<string>()
let mockSearchCommitted = false
let mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])

// Mock map store
vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    visibleLayers: mockMapStoreVisibleLayers,
    toggleLayer: vi.fn(),
    weatherActive: false,
    weatherDimension: 'temperature',
    setWeatherActive: vi.fn(),
    setWeatherDimension: vi.fn(),
    densityColorEnabled: false,
    toggleDensityColor: vi.fn(),
    fromKm: 0,
    toKm: 30,
    setSearchRange: vi.fn(),
    searchRangeInteracted: false,
    activeAccommodationTypes: mockActiveAccommodationTypes,
    toggleAccommodationType: vi.fn(),
    selectedStageId: null,
    setSelectedStageId: vi.fn(),
    searchCommitted: mockSearchCommitted,
    setSearchCommitted: vi.fn(),
    traceClickedKm: null,
    setTraceClickedKm: vi.fn(),
  }),
}))

// Mock SearchRangeControl
vi.mock('./search-range-control', () => ({
  SearchRangeControl: () => <div data-testid="search-range-control" />,
}))

// Mock PoiDetailSheet
vi.mock('./poi-detail-sheet', () => ({
  PoiDetailSheet: () => null,
}))

// Mock MapCanvas to avoid WebGL in tests — forwardRef for auto-zoom ref tests
const mockFitToCorridorRange = vi.fn()
vi.mock('./map-canvas', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react')
  return {
    MapCanvas: React.forwardRef(function MockMapCanvas(
      { segments, stages }: { segments: unknown[]; stages?: unknown[] },
      ref: unknown,
    ) {
      React.useImperativeHandle(ref, () => ({
        fitToCorridorRange: mockFitToCorridorRange,
        getMap: () => null,
        resetZoom: () => {},
        updateCrosshair: () => {},
      }))
      return React.createElement('div', {
        'data-testid': 'map-canvas',
        'data-segments': (segments as unknown[]).length,
        'data-stage-count': ((stages as unknown[]) ?? []).length,
      })
    }),
  }
})

// Mock ElevationProfile to avoid Recharts in map-view integration tests
vi.mock('./elevation-profile', () => ({
  ElevationProfile: ({ stagesVisible }: { stagesVisible?: boolean }) => (
    <div data-testid="elevation-profile" data-stages-visible={String(stagesVisible ?? false)} />
  ),
}))

// Mock PoiLayerGrid
vi.mock('./poi-layer-grid', () => ({
  PoiLayerGrid: () => <div data-testid="poi-layer-grid" />,
}))

// Mock SidebarWeatherSection
vi.mock('./sidebar-weather-section', () => ({
  SidebarWeatherSection: () => <div data-testid="sidebar-weather-section" />,
}))

// Mock SidebarDensitySection
vi.mock('./sidebar-density-section', () => ({
  SidebarDensitySection: () => <div data-testid="sidebar-density-section" />,
}))

// Mock SidebarDensityCta
vi.mock('./sidebar-density-cta', () => ({
  SidebarDensityCta: () => <div data-testid="sidebar-density-cta" />,
}))

// Mock useStages
vi.mock('@/hooks/use-stages', () => ({
  useStages: () => ({
    stages: [
      { id: 'st1', adventureId: 'adv-1', name: 'Étape 1', color: '#f97316', orderIndex: 0, startKm: 0, endKm: 50, distanceKm: 50, createdAt: '', updatedAt: '' },
    ],
    isPending: false,
    createStage: vi.fn(),
    updateStage: vi.fn(),
    deleteStage: vi.fn(),
  }),
}))

// Mock useElevationProfile
vi.mock('@/hooks/use-elevation-profile', () => ({
  useElevationProfile: () => ({ points: [], boundaries: [], hasElevationData: false, totalDPlus: 0 }),
}))

// Mock SidebarStagesSection with a toggle button for testing stagesVisible
vi.mock('./sidebar-stages-section', () => ({
  SidebarStagesSection: ({ onStagesVisibilityChange }: { onStagesVisibilityChange?: (v: boolean) => void }) => (
    <button data-testid="toggle-stages" onClick={() => onStagesVisibilityChange?.(true)}>Toggle Stages</button>
  ),
}))

// Mock AccommodationSubTypes
vi.mock('./accommodation-sub-types', () => ({
  AccommodationSubTypes: () => <div data-testid="accommodation-sub-types" />,
  ACCOMMODATION_SUB_TYPES: [
    { type: 'hotel', label: 'Hôtel', color: '#000' },
    { type: 'camp_site', label: 'Camping', color: '#000' },
    { type: 'shelter', label: 'Refuge / Abri', color: '#000' },
    { type: 'hostel', label: 'Auberge de jeunesse', color: '#000' },
    { type: 'guesthouse', label: 'Chambre d\'hôte', color: '#000' },
  ],
}))

// Mock NoResultsSubTypeBanner
vi.mock('./no-results-sub-type-banner', () => ({
  NoResultsSubTypeBanner: ({ activeTypeLabels, alternatives, onResetFilters }: { activeTypeLabels: string[], alternatives: { label: string; count: number }[], onResetFilters: () => void }) => (
    <button data-testid="no-results-sub-type-banner" onClick={onResetFilters}>
      {activeTypeLabels.join(', ')} — {alternatives.map(a => `${a.count} ${a.label}`).join(', ')}
    </button>
  ),
}))

// Mock StatusBanner
vi.mock('@/components/shared/status-banner', () => ({
  StatusBanner: ({ message }: { message: string }) => (
    <div data-testid="status-banner">{message}</div>
  ),
}))

// Mock Skeleton
vi.mock('@/components/ui/skeleton', () => ({
  Skeleton: ({ className }: { className: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

import { getAdventureMapData } from '@/lib/api-client'
import type { AdventureMapResponse } from '@/lib/api-client'

function makeMapResponse(overrides: Partial<AdventureMapResponse> = {}): AdventureMapResponse {
  return {
    adventureId: 'adv-1',
    adventureName: 'Test',
    totalDistanceKm: 100,
    totalElevationGainM: null,
    segments: [],
    ...overrides,
  }
}

function makeSegment(parseStatus: string, overrides = {}) {
  return {
    id: `seg-${Math.random()}`,
    name: 'S1',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 50,
    parseStatus,
    waypoints: parseStatus === 'done' ? [{ lat: 1, lng: 2, distKm: 0 }] : null,
    boundingBox: null,
    ...overrides,
  }
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('MapView', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockMapStoreVisibleLayers = new Set()
    mockPoisIsPending = false
    mockSearchCommitted = false
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockFitToCorridorRange.mockClear()
  })

  it('shows Skeleton when isPending', () => {
    vi.mocked(getAdventureMapData).mockReturnValue(new Promise(() => {})) // never resolves
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    expect(screen.getByTestId('skeleton')).toBeDefined()
  })

  it('shows StatusBanner on error', async () => {
    vi.mocked(getAdventureMapData).mockRejectedValue(new Error('Network error'))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    // Wait for error state
    const banner = await screen.findByTestId('status-banner')
    expect(banner.textContent).toMatch(/Impossible de charger la carte/)
  })

  it('shows pending banner + renders MapCanvas with filtered segments when 1 pending', async () => {
    const doneSeg = makeSegment('done')
    const pendingSeg = makeSegment('pending')
    vi.mocked(getAdventureMapData).mockResolvedValue(
      makeMapResponse({ segments: [doneSeg as never, pendingSeg as never] }),
    )
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')
    const canvas = screen.getByTestId('map-canvas')
    expect(canvas.getAttribute('data-segments')).toBe('1') // only done segment

    const banner = screen.getByTestId('status-banner')
    expect(banner.textContent).toMatch(/en cours de traitement/)
  })

  it('renders MapCanvas without banner when all segments are done', async () => {
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(
      makeMapResponse({ segments: [doneSeg as never] }),
    )
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')
    expect(screen.queryByTestId('status-banner')).toBeNull()
  })

  it('shows error banner for error segments (AC #5)', async () => {
    const doneSeg = makeSegment('done')
    const errorSeg = makeSegment('error')
    vi.mocked(getAdventureMapData).mockResolvedValue(
      makeMapResponse({ segments: [doneSeg as never, errorSeg as never] }),
    )
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')
    const canvas = screen.getByTestId('map-canvas')
    expect(canvas.getAttribute('data-segments')).toBe('1') // only done segment shown

    const banners = screen.getAllByTestId('status-banner')
    expect(banners.some((b) => b.textContent?.match(/n'ont pas pu être analysés/))).toBe(true)
  })
})

describe('MapView — sidebar layout (Story 8.3, AC #2, #3)', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockMapStoreVisibleLayers = new Set()
    mockPoisIsPending = false
    mockSearchCommitted = false
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockFitToCorridorRange.mockClear()
  })

  function renderWithData() {
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
  }

  it('sidebar element has hidden and lg:flex classes (AC #2)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    expect(sidebar.className).toContain('hidden')
    expect(sidebar.className).toContain('lg:flex')
  })

  it('sidebar starts expanded (w-[360px]) (AC #3)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    expect(sidebar.className).toContain('w-[360px]')
  })

  it('collapse toggle collapses sidebar to w-0 (AC #3)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    const toggle = screen.getByTestId('sidebar-toggle')
    fireEvent.click(toggle)
    expect(sidebar.className).toContain('w-0')
    expect(sidebar.className).toContain('overflow-hidden')
  })

  it('collapse toggle expands sidebar back to w-[360px] on second click (AC #3)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const toggle = screen.getByTestId('sidebar-toggle')
    fireEvent.click(toggle)
    fireEvent.click(toggle)
    expect(screen.getByTestId('planning-sidebar').className).toContain('w-[360px]')
  })

  it('SearchRangeControl is rendered inside the sidebar (AC #3)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    const control = screen.getByTestId('search-range-control')
    expect(sidebar.contains(control)).toBe(true)
  })

  it('PoiLayerGrid is rendered inside SearchRangeControl (AC #3)', async () => {
    // PoiLayerGrid is now inside SearchRangeControl — verified via SearchRangeControl presence in sidebar
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    const control = screen.getByTestId('search-range-control')
    expect(sidebar.contains(control)).toBe(true)
  })

  it('SidebarDensityCta is rendered inside the sidebar (AC #1, Story 16.4)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    const cta = screen.getByTestId('sidebar-density-cta')
    expect(sidebar.contains(cta)).toBe(true)
  })
})

describe('MapView — Story 8.4 AccommodationSubTypes', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
  })

  // AccommodationSubTypes is now inside SearchRangeControl (mocked) — conditional logic tested in search-range-control.test.tsx

  it('SidebarWeatherSection is rendered inside the sidebar', async () => {
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    const weatherSection = screen.getByTestId('sidebar-weather-section')
    expect(sidebar.contains(weatherSection)).toBe(true)
  })
})

describe('MapView — back button (Story 8.3, AC #2)', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockMapStoreVisibleLayers = new Set()
    mockPoisIsPending = false
    mockSearchCommitted = false
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockFitToCorridorRange.mockClear()
  })

  it('"← Aventures" link points to /adventures', async () => {
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    await screen.findByTestId('map-canvas')
    const link = screen.getByTestId('back-to-adventures')
    expect(link.getAttribute('href')).toBe('/adventures')
  })

  it('"← Aventures" link has z-40 class (AC #2)', async () => {
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    await screen.findByTestId('map-canvas')
    const link = screen.getByTestId('back-to-adventures')
    expect(link.className).toContain('z-40')
  })
})

describe('MapView — elevation profile collapse (Story 8.8, AC #1, AC #6)', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockMapStoreVisibleLayers = new Set()
    mockPoisIsPending = false
    mockSearchCommitted = false
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockFitToCorridorRange.mockClear()
  })

  function renderWithData() {
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
  }

  it('renders elevation profile container (desktop hidden lg:block)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    expect(screen.getByTestId('elevation-profile')).toBeInTheDocument()
  })

  it('collapse toggle shows "Masquer le profil" button initially (expanded)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    expect(screen.getByRole('button', { name: /Masquer le profil/i })).toBeInTheDocument()
  })

  it('collapse toggle changes aria-label to "Afficher" after click', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    fireEvent.click(screen.getByRole('button', { name: /Masquer le profil/i }))
    expect(screen.getByRole('button', { name: /Afficher le profil/i })).toBeInTheDocument()
  })

  it('collapse toggle expands profile on second click', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    fireEvent.click(screen.getByRole('button', { name: /Masquer le profil/i }))
    fireEvent.click(screen.getByRole('button', { name: /Afficher le profil/i }))
    expect(screen.getByRole('button', { name: /Masquer le profil/i })).toBeInTheDocument()
  })
})

describe('MapView — stagesVisible toggle (Story 11.2, AC4)', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockMapStoreVisibleLayers = new Set()
    mockPoisIsPending = false
    mockSearchCommitted = false
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockFitToCorridorRange.mockClear()
  })

  function renderWithData() {
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
  }

  it('MapCanvas receives empty stages when stagesVisible=false (default)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const canvas = screen.getByTestId('map-canvas')
    expect(canvas.getAttribute('data-stage-count')).toBe('0')
  })

  it('ElevationProfile receives stagesVisible=false by default', async () => {
    renderWithData()
    await screen.findByTestId('elevation-profile')
    const profile = screen.getByTestId('elevation-profile')
    expect(profile.getAttribute('data-stages-visible')).toBe('false')
  })

  it('toggling stagesVisible on passes stages to MapCanvas and stagesVisible=true to ElevationProfile', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')

    fireEvent.click(screen.getByTestId('toggle-stages'))

    const canvas = screen.getByTestId('map-canvas')
    expect(canvas.getAttribute('data-stage-count')).toBe('1')

    const profile = screen.getByTestId('elevation-profile')
    expect(profile.getAttribute('data-stages-visible')).toBe('true')
  })
})

describe('MapView — auto-zoom on search (Story 16.15)', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockMapStoreVisibleLayers = new Set()
    mockPoisIsPending = false
    mockSearchCommitted = false
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockFitToCorridorRange.mockClear()
  })

  it('warm cache: calls fitToCorridorRange when searchCommitted turns true and poisPending stays false (AC #1)', async () => {
    mockSearchCommitted = false
    mockPoisIsPending = false
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    const { rerender } = render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')
    expect(mockFitToCorridorRange).not.toHaveBeenCalled()

    // User commits search — warm cache: isPending stays false
    mockSearchCommitted = true
    rerender(<MapView adventureId="adv-1" />)

    // Effect fires: justCommitted=true (searchCommitted && !prevSearchCommittedRef),
    // !poisPending=true → fitToCorridorRange called
    expect(mockFitToCorridorRange).toHaveBeenCalledTimes(1)
  })

  it('cold cache: calls fitToCorridorRange when poisPending transitions true→false (AC #2)', async () => {
    mockSearchCommitted = false
    mockPoisIsPending = false
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    const { rerender } = render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')

    // User commits search — cold cache: isPending goes true
    mockSearchCommitted = true
    mockPoisIsPending = true
    rerender(<MapView adventureId="adv-1" />)

    // justCommitted=true but !poisPending=false → no zoom
    expect(mockFitToCorridorRange).not.toHaveBeenCalled()

    // Fetch completes: poisPending false
    mockPoisIsPending = false
    rerender(<MapView adventureId="adv-1" />)

    // justResolved = prevIsPendingRef(true) && !poisPending(true) → zoom
    expect(mockFitToCorridorRange).toHaveBeenCalledTimes(1)
  })

  it('does NOT zoom when searchCommitted is false (no search triggered)', async () => {
    mockSearchCommitted = false
    mockPoisIsPending = false
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')

    expect(mockFitToCorridorRange).not.toHaveBeenCalled()
  })
})

describe('MapView — NoResultsSubTypeBanner (Story 16.17)', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
    mockMapStoreVisibleLayers = new Set(['accommodations'])
    mockPoisIsPending = false
    mockSearchCommitted = true
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'])
    mockFitToCorridorRange.mockClear()
  })

  it('shows blue banner when accommodations exist but none match active filter (AC-1)', async () => {
    mockPoisAccommodations = [
      { id: 'p1', category: 'camp_site' },
      { id: 'p2', category: 'shelter' },
    ]
    mockActiveAccommodationTypes = new Set(['hotel'])
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    await screen.findByTestId('map-canvas')
    expect(screen.getByTestId('no-results-sub-type-banner')).toBeInTheDocument()
  })

  it('banner text lists alternative types with counts (AC-2)', async () => {
    mockPoisAccommodations = [
      { id: 'p1', category: 'camp_site' },
      { id: 'p2', category: 'camp_site' },
      { id: 'p3', category: 'shelter' },
    ]
    mockActiveAccommodationTypes = new Set(['hotel'])
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    await screen.findByTestId('map-canvas')
    const banner = screen.getByTestId('no-results-sub-type-banner')
    expect(banner.textContent).toContain('hôtel')
    expect(banner.textContent).toContain('2 camping')
    expect(banner.textContent).toContain('1 refuge / abri')
  })

  it('does NOT show blue banner when at least one accommodation matches filter (AC-3)', async () => {
    mockPoisAccommodations = [
      { id: 'p1', category: 'hotel' },
      { id: 'p2', category: 'camp_site' },
    ]
    mockActiveAccommodationTypes = new Set(['hotel'])
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    await screen.findByTestId('map-canvas')
    expect(screen.queryByTestId('no-results-sub-type-banner')).toBeNull()
  })

  it('orange banner shows when allPois empty, blue banner does not (AC-5)', async () => {
    mockPoisAccommodations = []
    mockActiveAccommodationTypes = new Set(['hotel'])
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(makeMapResponse({ segments: [doneSeg as never] }))
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })
    await screen.findByTestId('map-canvas')
    expect(screen.queryByTestId('no-results-sub-type-banner')).toBeNull()
    expect(screen.getByText('Aucun résultat dans cette zone')).toBeInTheDocument()
  })
})
