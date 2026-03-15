import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { MapCanvas } from './map-canvas'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer } from '@ridenrest/shared'

afterEach(cleanup)

// Mock maplibre-gl entirely — WebGL unavailable in jsdom
const mockMapInstance = {
  on: vi.fn(),
  once: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  getSource: vi.fn(),
  isStyleLoaded: vi.fn().mockReturnValue(false),
  fitBounds: vi.fn(),
  setStyle: vi.fn(),
  remove: vi.fn(),
  getCenter: vi.fn().mockReturnValue({ lat: 43.0, lng: 1.0 }),
  getZoom: vi.fn().mockReturnValue(10),
}

vi.mock('maplibre-gl', () => ({
  // Use regular function (not arrow) so it can be used as constructor with `new`
  Map: vi.fn().mockImplementation(function (this: unknown) { return mockMapInstance }),
}))

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

// Mock map store
vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({ setViewport: vi.fn(), visibleLayers: new Set() }),
}))

// Mock usePoiLayers
vi.mock('@/hooks/use-poi-layers', () => ({
  usePoiLayers: vi.fn(),
}))

// Mock OsmAttribution
vi.mock('@/components/shared/osm-attribution', () => ({
  OsmAttribution: () => <div data-testid="osm-attribution" />,
}))

const emptyPoisByLayer: Record<MapLayer, Poi[]> = {
  accommodations: [],
  restaurants: [],
  supplies: [],
  bike: [],
}

function makeSegment(parseStatus = 'done'): MapSegmentData {
  return {
    id: 'seg-1',
    name: 'S1',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 50,
    parseStatus: parseStatus as MapSegmentData['parseStatus'],
    waypoints: [
      { lat: 43.0, lng: 1.0, ele: 100, distKm: 0 },
      { lat: 43.5, lng: 1.5, ele: 200, distKm: 50 },
    ],
    boundingBox: { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 },
  }
}

describe('MapCanvas', () => {
  afterEach(() => {
    mockMapInstance.fitBounds.mockClear()
    mockMapInstance.on.mockClear()
    mockMapInstance.addSource.mockClear()
    mockMapInstance.addLayer.mockClear()
  })

  it('renders OsmAttribution', () => {
    render(<MapCanvas segments={[makeSegment()]} adventureName="Test" poisByLayer={emptyPoisByLayer} />)
    expect(screen.getByTestId('osm-attribution')).toBeDefined()
  })

  it('renders map container with aria-label and role', () => {
    render(<MapCanvas segments={[]} adventureName="Transcantabrique" poisByLayer={emptyPoisByLayer} />)
    const mapDiv = document.querySelector('[role="application"]')
    expect(mapDiv).not.toBeNull()
    expect(mapDiv?.getAttribute('aria-label')).toContain('Transcantabrique')
  })

  it('calls fitBounds on mount after map load event fires', async () => {
    // Capture the 'load' callback registered via map.on('load', cb)
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    render(<MapCanvas segments={[makeSegment()]} adventureName="Test" poisByLayer={emptyPoisByLayer} />)

    // Wait for dynamic import to resolve and map.on to be called
    await waitFor(() => {
      expect(mockMapInstance.on).toHaveBeenCalledWith('load', expect.any(Function))
    })

    // Simulate MapLibre firing 'load'
    await act(async () => { loadCallback?.() })

    expect(mockMapInstance.fitBounds).toHaveBeenCalledTimes(1)
    // Verify called with correct bounds format [[minLng, minLat], [maxLng, maxLat]]
    expect(mockMapInstance.fitBounds).toHaveBeenCalledWith(
      [[1.0, 43.0], [1.5, 43.5]],
      expect.objectContaining({ padding: 40, maxZoom: 14, animate: false }),
    )
  })

  it('does not call addSource for POI sources when no layers are visible', async () => {
    // visibleLayers is empty (mocked above) — usePoiLayers is mocked so no addSource calls
    // Verify: addSource is only called for trace sources, not POI sources
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })
    mockMapInstance.isStyleLoaded.mockReturnValue(true)

    render(
      <MapCanvas segments={[makeSegment()]} adventureName="Test" poisByLayer={emptyPoisByLayer} />,
    )

    await waitFor(() => {
      expect(mockMapInstance.on).toHaveBeenCalledWith('load', expect.any(Function))
    })

    await act(async () => { loadCallback?.() })

    // Only trace sources should be added, no pois-* sources
    const addSourceCalls = mockMapInstance.addSource.mock.calls as [string, unknown][]
    const poiSourceCalls = addSourceCalls.filter(([id]) => id.startsWith('pois-'))
    expect(poiSourceCalls).toHaveLength(0)
  })
})
