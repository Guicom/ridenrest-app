import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MapView } from './map-view'

afterEach(cleanup)

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
  useMapStore: () => ({ visibleLayers: new Set(), toggleLayer: vi.fn() }),
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
