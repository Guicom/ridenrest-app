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

// Mock usePois hook
vi.mock('@/hooks/use-pois', () => ({
  usePois: () => ({
    poisByLayer: { accommodations: [], restaurants: [], supplies: [], bike: [] },
    isPending: false,
    hasError: false,
  }),
}))

// Mock useDensity hook — default to idle (no density data)
let mockDensityStatus: string = 'idle'
vi.mock('@/hooks/use-density', () => ({
  useDensity: () => ({
    coverageGaps: [],
    densityStatus: mockDensityStatus,
    isPending: false,
  }),
}))

// Mock DensityLegend
vi.mock('./density-legend', () => ({
  DensityLegend: () => <div data-testid="density-legend" />,
}))

// Mock map store
vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    visibleLayers: new Set(),
    toggleLayer: vi.fn(),
    weatherActive: false,
    weatherDimension: 'temperature',
    setWeatherActive: vi.fn(),
    setWeatherDimension: vi.fn(),
    densityColorEnabled: false,
    fromKm: 0,
    toKm: 30,
    setSearchRange: vi.fn(),
  }),
}))

// Mock SearchRangeSlider
vi.mock('./search-range-slider', () => ({
  SearchRangeSlider: () => <div data-testid="search-range-slider" />,
}))

// Mock PoiDetailSheet
vi.mock('./poi-detail-sheet', () => ({
  PoiDetailSheet: () => null,
}))

// Mock MapCanvas to avoid WebGL in tests
vi.mock('./map-canvas', () => ({
  MapCanvas: ({ segments }: { segments: unknown[] }) => (
    <div data-testid="map-canvas" data-segments={segments.length} />
  ),
}))

// Mock LayerToggles
vi.mock('./layer-toggles', () => ({
  LayerToggles: () => <div data-testid="layer-toggles" />,
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

  it('renders DensityLegend when densityStatus is success', async () => {
    mockDensityStatus = 'success'
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(
      makeMapResponse({ segments: [doneSeg as never] }),
    )
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')
    expect(screen.getByTestId('density-legend')).toBeDefined()
  })

  it('does not render DensityLegend when densityStatus is idle', async () => {
    mockDensityStatus = 'idle'
    const doneSeg = makeSegment('done')
    vi.mocked(getAdventureMapData).mockResolvedValue(
      makeMapResponse({ segments: [doneSeg as never] }),
    )
    render(<MapView adventureId="adv-1" />, { wrapper: Wrapper })

    await screen.findByTestId('map-canvas')
    expect(screen.queryByTestId('density-legend')).toBeNull()
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

  it('SearchRangeSlider is rendered inside the sidebar (AC #3)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    const slider = screen.getByTestId('search-range-slider')
    expect(sidebar.contains(slider)).toBe(true)
  })

  it('LayerToggles is rendered inside the sidebar (AC #3)', async () => {
    renderWithData()
    await screen.findByTestId('map-canvas')
    const sidebar = screen.getByTestId('planning-sidebar')
    const toggles = screen.getByTestId('layer-toggles')
    expect(sidebar.contains(toggles)).toBe(true)
  })
})

describe('MapView — back button (Story 8.3, AC #2)', () => {
  beforeEach(() => {
    mockDensityStatus = 'idle'
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
