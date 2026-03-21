import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, waitFor } from '@testing-library/react'
import { MapCanvas, buildCorridorFeatures, buildDensityColoredFeatures } from './map-canvas'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer, CoverageGapSummary } from '@ridenrest/shared'

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
  useMapStore: Object.assign(
    () => ({
      setViewport: vi.fn(),
      visibleLayers: new Set(),
      fromKm: 0,
      toKm: 30,
      densityColorEnabled: true,
      weatherActive: false,
      weatherDimension: 'temperature',
      searchRangeInteracted: false,
    }),
    { subscribe: vi.fn(() => vi.fn()) },  // subscribe returns unsubscribe fn
  ),
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

describe('buildDensityColoredFeatures', () => {
  function makeDensitySegment(
    id: string,
    distanceKm: number,
    cumulativeStartKm: number,
    numWaypoints = 20,
  ): MapSegmentData {
    const waypoints = Array.from({ length: numWaypoints }, (_, i) => ({
      lat: 43 + i * 0.01,
      lng: 1 + i * 0.01,
      ele: 100,
      distKm: (i / (numWaypoints - 1)) * distanceKm,
    }))
    return {
      id,
      name: `Segment ${id}`,
      orderIndex: 0,
      cumulativeStartKm,
      distanceKm,
      parseStatus: 'done',
      waypoints,
      boundingBox: { minLat: 43, maxLat: 44, minLng: 1, maxLng: 2 },
    }
  }

  it('returns empty array for segment with no waypoints', () => {
    const segment: MapSegmentData = {
      id: 'seg-1', name: 'S1', orderIndex: 0, cumulativeStartKm: 0, distanceKm: 30,
      parseStatus: 'done', waypoints: null, boundingBox: null,
    }
    expect(buildDensityColoredFeatures([segment], [])).toHaveLength(0)
  })

  it('all tronçons are green (#16a34a) when coverageGaps is empty', () => {
    const segment = makeDensitySegment('seg-1', 30, 0)
    const result = buildDensityColoredFeatures([segment], [])
    expect(result.length).toBeGreaterThan(0)
    for (const f of result) expect(f.properties?.color).toBe('#16a34a')
  })

  it('critical gap → red (#dc2626) tronçon', () => {
    const segment = makeDensitySegment('seg-1', 30, 0, 30)
    const gap: CoverageGapSummary = { segmentId: 'seg-1', fromKm: 0, toKm: 10, severity: 'critical' }
    const result = buildDensityColoredFeatures([segment], [gap])
    const troncon = result.find((f) => f.properties?.fromKmAbsolute === 0 && f.properties?.toKmAbsolute === 10)
    expect(troncon?.properties?.color).toBe('#dc2626')
  })

  it('medium gap → amber (#d97706) tronçon', () => {
    const segment = makeDensitySegment('seg-1', 30, 0, 30)
    const gap: CoverageGapSummary = { segmentId: 'seg-1', fromKm: 10, toKm: 20, severity: 'medium' }
    const result = buildDensityColoredFeatures([segment], [gap])
    const troncon = result.find((f) => f.properties?.fromKmAbsolute === 10 && f.properties?.toKmAbsolute === 20)
    expect(troncon?.properties?.color).toBe('#d97706')
  })

  it('segment shorter than 10km → single partial tronçon colored correctly', () => {
    const segment = makeDensitySegment('seg-1', 7, 0, 10)
    const result = buildDensityColoredFeatures([segment], [])
    expect(result).toHaveLength(1)
    expect(result[0].properties?.fromKmAbsolute).toBe(0)
    expect(result[0].properties?.toKmAbsolute).toBe(7)
    expect(result[0].properties?.color).toBe('#16a34a')
  })

  it('fromKmAbsolute uses cumulativeStartKm offset correctly', () => {
    const segment = makeDensitySegment('seg-1', 20, 50, 20)
    const result = buildDensityColoredFeatures([segment], [])
    expect(result[0].properties?.fromKmAbsolute).toBe(50)
    expect(result[0].properties?.toKmAbsolute).toBe(60)
  })

  it('floating point matching: fromKm=9.999999 matches tronçon at 10.0 within epsilon < 0.01', () => {
    const segment = makeDensitySegment('seg-1', 30, 0, 30)
    const gap: CoverageGapSummary = { segmentId: 'seg-1', fromKm: 9.999999, toKm: 20.000001, severity: 'critical' }
    const result = buildDensityColoredFeatures([segment], [gap])
    const matched = result.find((f) => f.properties?.fromKmAbsolute >= 9 && f.properties?.fromKmAbsolute <= 11)
    expect(matched?.properties?.color).toBe('#dc2626')
  })

  it('gap for different segmentId does not color the wrong tronçon', () => {
    const segment = makeDensitySegment('seg-1', 30, 0, 30)
    const gap: CoverageGapSummary = { segmentId: 'seg-2', fromKm: 0, toKm: 10, severity: 'critical' }
    const result = buildDensityColoredFeatures([segment], [gap])
    for (const f of result) expect(f.properties?.color).toBe('#16a34a')
  })
})

describe('buildCorridorFeatures', () => {
  const makeSegmentWithWaypoints = (
    cumulativeStartKm: number,
    distanceKm: number,
  ): MapSegmentData => ({
    id: `seg-${cumulativeStartKm}`,
    name: 'S',
    orderIndex: 0,
    cumulativeStartKm,
    distanceKm,
    parseStatus: 'done',
    waypoints: [
      { lat: 43.0, lng: 1.0, ele: 100, distKm: 0 },
      { lat: 43.1, lng: 1.1, ele: 110, distKm: distanceKm / 2 },
      { lat: 43.2, lng: 1.2, ele: 120, distKm: distanceKm },
    ],
    boundingBox: { minLat: 43.0, maxLat: 43.2, minLng: 1.0, maxLng: 1.2 },
  })

  it('returns empty features for segments completely outside range', () => {
    const segment = makeSegmentWithWaypoints(50, 20)  // km range [50, 70]
    const features = buildCorridorFeatures([segment], 0, 30)  // query [0, 30]
    expect(features).toHaveLength(0)
  })

  it('returns features for segment within range', () => {
    const segment = makeSegmentWithWaypoints(0, 50)  // km range [0, 50]
    const features = buildCorridorFeatures([segment], 0, 30)  // query [0, 30]
    expect(features.length).toBeGreaterThan(0)
    expect(features[0].geometry.type).toBe('LineString')
  })

  it('returns empty when segment has no waypoints', () => {
    const segment: MapSegmentData = {
      id: 'seg-no-wp',
      name: 'S',
      orderIndex: 0,
      cumulativeStartKm: 0,
      distanceKm: 50,
      parseStatus: 'done',
      waypoints: null,
      boundingBox: null,
    }
    const features = buildCorridorFeatures([segment], 0, 30)
    expect(features).toHaveLength(0)
  })
})
