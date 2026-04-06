import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import React from 'react'
import { LiveMapCanvas, createCirclePolygon } from './live-map-canvas'
import { useLiveStore } from '@/stores/live.store'
import type { MapSegmentData, AdventureStageResponse } from '@ridenrest/shared'

afterEach(cleanup)

// Mock MapLibre — WebGL unavailable in jsdom
const mockMarkerInstance = {
  addTo: vi.fn().mockReturnThis(),
  setLngLat: vi.fn().mockReturnThis(),
  remove: vi.fn(),
}

const mockMapInstance = {
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  removeLayer: vi.fn(),
  removeSource: vi.fn(),
  getSource: vi.fn(),
  getLayer: vi.fn().mockReturnValue(undefined),
  getStyle: vi.fn().mockReturnValue({ layers: [], sources: {} }),
  isStyleLoaded: vi.fn().mockReturnValue(false),
  fitBounds: vi.fn(),
  remove: vi.fn(),
  panTo: vi.fn(),
  easeTo: vi.fn(),
  setStyle: vi.fn(),
  getCanvas: vi.fn().mockReturnValue({ style: {} }),
  getZoom: vi.fn().mockReturnValue(10),
  flyTo: vi.fn(),
}

const MockMarkerClass = vi.fn().mockImplementation(function () { return mockMarkerInstance })

vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(function (this: unknown) { return mockMapInstance }),
  Marker: MockMarkerClass,
}))

// Mock findPointAtKm
vi.mock('@ridenrest/gpx', () => ({
  findPointAtKm: vi.fn().mockReturnValue({ lat: 43.3, lng: 1.3 }),
}))

// Mock OsmAttribution
vi.mock('@/components/shared/osm-attribution', () => ({
  OsmAttribution: () => <div data-testid="osm-attribution" />,
}))

// Mock prefs store
vi.mock('@/stores/prefs.store', () => ({
  usePrefsStore: (sel: (s: { mapStyle: string }) => unknown) => sel({ mapStyle: 'liberty' }),
}))

// Mock map-styles
vi.mock('@/lib/map-styles', () => ({
  MAP_STYLES: [
    { id: 'liberty', label: 'Liberty', description: 'Clair', url: 'https://tiles.openfreemap.org/styles/liberty' },
  ],
}))

// Mock useLivePoiLayers
vi.mock('@/hooks/use-live-poi-layers', () => ({
  useLivePoiLayers: vi.fn(),
}))

function makeSegment(): MapSegmentData {
  return {
    id: 'seg-1',
    name: 'S1',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 50,
    parseStatus: 'done',
    waypoints: [
      { lat: 43.0, lng: 1.0, ele: 100, distKm: 0 },
      { lat: 43.5, lng: 1.5, ele: 200, distKm: 50 },
    ],
    boundingBox: { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 },
  }
}

describe('LiveMapCanvas', () => {
  afterEach(() => {
    vi.clearAllMocks()
    useLiveStore.setState({ currentPosition: null })
  })

  it('renders OsmAttribution', () => {
    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)
    expect(screen.getByTestId('osm-attribution')).toBeDefined()
  })

  it('renders map container with aria-label', () => {
    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)
    const mapDiv = document.querySelector('[role="application"]')
    expect(mapDiv).not.toBeNull()
    expect(mapDiv?.getAttribute('aria-label')).toContain('Live')
  })

  it('initializes MapLibre map via dynamic import', async () => {
    const { Map: MockMap } = await import('maplibre-gl')
    const callsBefore = (MockMap as ReturnType<typeof vi.fn>).mock.calls.length

    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)

    await waitFor(() => {
      expect((MockMap as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore)
    })
  })

  it('adds trace, target-dot and gps-position sources/layers on map load', async () => {
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)

    await waitFor(() => {
      expect(mockMapInstance.on).toHaveBeenCalledWith('load', expect.any(Function))
    })

    loadCallback?.()

    const addSourceCalls = mockMapInstance.addSource.mock.calls as [string, unknown][]
    const sourceIds = addSourceCalls.map(([id]) => id)
    expect(sourceIds).toContain('live-trace')
    expect(sourceIds).toContain('live-target-point')
    expect(sourceIds).toContain('gps-position')

    const addLayerCalls = mockMapInstance.addLayer.mock.calls as [{ id: string }][]
    const layerIds = addLayerCalls.map(([l]) => l.id)
    expect(layerIds).toContain('target-dot')
    expect(layerIds).toContain('gps-dot')
    expect(layerIds).toContain('gps-halo')
  })

  it('creates stage markers when stageLayerActive=true and stages provided', async () => {
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    const stages: AdventureStageResponse[] = [
      {
        id: 'stage-1', adventureId: 'adv-1', name: 'Étape 1', color: '#FF0000',
        orderIndex: 0, startKm: 0, endKm: 25, distanceKm: 25,
        elevationGainM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '',
      },
    ]

    render(
      <LiveMapCanvas
        adventureId="adv-1"
        segments={[makeSegment()]}
        stages={stages}
        stageLayerActive={true}
        currentKmOnRoute={10}
      />,
    )

    await waitFor(() => expect(loadCallback).toBeDefined())
    act(() => { loadCallback?.() })

    await waitFor(() => {
      expect(MockMarkerClass).toHaveBeenCalled()
      expect(mockMarkerInstance.addTo).toHaveBeenCalledWith(mockMapInstance)
    })
  })

  it('does not create stage markers when stageLayerActive=false', async () => {
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    const stages: AdventureStageResponse[] = [
      {
        id: 'stage-1', adventureId: 'adv-1', name: 'Étape 1', color: '#FF0000',
        orderIndex: 0, startKm: 0, endKm: 25, distanceKm: 25,
        elevationGainM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '',
      },
    ]

    const callsBefore = MockMarkerClass.mock.calls.length
    render(
      <LiveMapCanvas
        adventureId="adv-1"
        segments={[makeSegment()]}
        stages={stages}
        stageLayerActive={false}
        currentKmOnRoute={10}
      />,
    )

    await waitFor(() => expect(loadCallback).toBeDefined())
    act(() => { loadCallback?.() })

    // No new markers created (layer inactive)
    expect(MockMarkerClass.mock.calls.length).toBe(callsBefore)
  })

  it('passed stage has opacity 0.4 style when currentKmOnRoute exceeds endKm', async () => {
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    const stages: AdventureStageResponse[] = [
      {
        id: 'stage-1', adventureId: 'adv-1', name: 'Étape 1', color: '#FF0000',
        orderIndex: 0, startKm: 0, endKm: 10, distanceKm: 10,
        elevationGainM: null, etaMinutes: null, departureTime: null, createdAt: '', updatedAt: '',
      },
    ]

    // Capture the element passed to Marker constructor
    let capturedEl: HTMLElement | null = null
    MockMarkerClass.mockImplementation(function ({ element }: { element: HTMLElement }) {
      capturedEl = element
      return mockMarkerInstance
    })

    render(
      <LiveMapCanvas
        adventureId="adv-1"
        segments={[makeSegment()]}
        stages={stages}
        stageLayerActive={true}
        currentKmOnRoute={20} // past stage endKm=10 → isPassed=true
      />,
    )

    await waitFor(() => expect(loadCallback).toBeDefined())
    act(() => { loadCallback?.() })

    await waitFor(() => {
      expect(capturedEl).not.toBeNull()
      expect(capturedEl!.style.opacity).toBe('0.4')
    })
  })

  it('dragstart pauses GPS auto-follow (easeTo not called after interaction)', async () => {
    const eventHandlers: Record<string, (e?: { originalEvent?: Event }) => void> = {}
    mockMapInstance.on.mockImplementation((event: string, cb: (e?: { originalEvent?: Event }) => void) => {
      eventHandlers[event] = cb
    })

    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)

    await waitFor(() => expect(eventHandlers['load']).toBeDefined())
    act(() => { eventHandlers['load']?.() })

    // First GPS update → flyTo (initial zoom)
    act(() => { useLiveStore.setState({ currentPosition: { lat: 43.1, lng: 1.1 } }) })
    await waitFor(() => expect(mockMapInstance.flyTo).toHaveBeenCalledTimes(1))

    // User pans → dragstart fires → tracking paused
    act(() => { eventHandlers['dragstart']?.() })
    expect(useLiveStore.getState().gpsTrackingActive).toBe(false)

    // GPS update after pan → easeTo should NOT be called
    const easeToCallsBefore = mockMapInstance.easeTo.mock.calls.length
    act(() => { useLiveStore.setState({ currentPosition: { lat: 43.2, lng: 1.2 } }) })
    await new Promise((r) => setTimeout(r, 50))
    expect(mockMapInstance.easeTo.mock.calls.length).toBe(easeToCallsBefore)
  })

  it('zoomstart with originalEvent pauses GPS tracking (pinch-to-zoom support)', async () => {
    const eventHandlers: Record<string, (e?: { originalEvent?: Event }) => void> = {}
    mockMapInstance.on.mockImplementation((event: string, cb: (e?: { originalEvent?: Event }) => void) => {
      eventHandlers[event] = cb
    })

    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)
    await waitFor(() => expect(eventHandlers['zoomstart']).toBeDefined())

    // Programmatic zoom (no originalEvent) → should NOT pause tracking
    act(() => { eventHandlers['zoomstart']?.({}) })
    expect(useLiveStore.getState().gpsTrackingActive).toBe(true)

    // User pinch-to-zoom (has originalEvent) → should pause tracking
    act(() => { eventHandlers['zoomstart']?.({ originalEvent: new Event('touchstart') }) })
    expect(useLiveStore.getState().gpsTrackingActive).toBe(false)
  })

  it('centerOnGps handle resets tracking and calls flyTo', async () => {
    const eventHandlers: Record<string, (e?: { originalEvent?: Event }) => void> = {}
    mockMapInstance.on.mockImplementation((event: string, cb: (e?: { originalEvent?: Event }) => void) => {
      eventHandlers[event] = cb
    })

    const ref = React.createRef<import('./live-map-canvas').LiveMapCanvasHandle>()
    render(<LiveMapCanvas ref={ref} adventureId="adv-1" segments={[makeSegment()]} />)

    await waitFor(() => expect(eventHandlers['load']).toBeDefined())
    act(() => { eventHandlers['load']?.() })

    // Set GPS position (needed for centerOnGps pos check)
    act(() => { useLiveStore.setState({ currentPosition: { lat: 43.3, lng: 1.3 } }) })

    // Pause tracking first
    act(() => { eventHandlers['dragstart']?.() })
    expect(useLiveStore.getState().gpsTrackingActive).toBe(false)

    // Call centerOnGps → tracking resumes, flyTo called
    const flyToCallsBefore = mockMapInstance.flyTo.mock.calls.length
    act(() => { ref.current?.centerOnGps() })

    expect(useLiveStore.getState().gpsTrackingActive).toBe(true)
    expect(mockMapInstance.flyTo.mock.calls.length).toBeGreaterThan(flyToCallsBefore)
  })

  it('fitToSearchZone calls fitBounds with waypoints in range and pauses GPS tracking (AC #4, #5)', async () => {
    const eventHandlers: Record<string, (e?: { originalEvent?: Event }) => void> = {}
    mockMapInstance.on.mockImplementation((event: string, cb: (e?: { originalEvent?: Event }) => void) => {
      eventHandlers[event] = cb
    })

    const ref = React.createRef<import('./live-map-canvas').LiveMapCanvasHandle>()
    const seg = makeSegment()
    render(
      <LiveMapCanvas
        ref={ref}
        adventureId="adv-1"
        segments={[seg]}
        currentKmOnRoute={10}
      />,
    )

    await waitFor(() => expect(eventHandlers['load']).toBeDefined())
    act(() => { eventHandlers['load']?.() })

    // Waypoints at distKm 5 (out of range), 15 (in range), 25 (in range)
    // fromKm = max(0, 20 - 5) = 15, toKm = 20 + 5 = 25
    const waypoints = [
      { lat: 43.0, lng: 1.0, distKm: 5 },
      { lat: 43.2, lng: 1.2, distKm: 15 },
      { lat: 43.5, lng: 1.5, distKm: 25 },
    ]

    act(() => { ref.current?.fitToSearchZone(20, 5, [seg], waypoints as never[]) })

    // Bounds with 10% expansion: dLat=0.3, dLng=0.3
    // minLng=1.2-0.03=1.17, minLat=43.2-0.03=43.17, maxLng=1.5+0.03=1.53, maxLat=43.5+0.03=43.53
    expect(mockMapInstance.fitBounds).toHaveBeenCalledWith(
      expect.arrayContaining([expect.any(Array), expect.any(Array)]),
      expect.objectContaining({ padding: { top: 60, right: 60, bottom: 240, left: 60 }, maxZoom: 16, animate: true }),
    )
    expect(useLiveStore.getState().gpsTrackingActive).toBe(false)
  })

  it('fitToSearchZone falls back to fitToTrace when no waypoints in range (AC #4)', async () => {
    const eventHandlers: Record<string, (e?: { originalEvent?: Event }) => void> = {}
    mockMapInstance.on.mockImplementation((event: string, cb: (e?: { originalEvent?: Event }) => void) => {
      eventHandlers[event] = cb
    })

    const ref = React.createRef<import('./live-map-canvas').LiveMapCanvasHandle>()
    const seg = makeSegment()
    render(
      <LiveMapCanvas
        ref={ref}
        adventureId="adv-1"
        segments={[seg]}
        currentKmOnRoute={50}
      />,
    )

    await waitFor(() => expect(eventHandlers['load']).toBeDefined())
    act(() => { eventHandlers['load']?.() })

    // All waypoints before currentKm range → empty inRange → fitToTrace (fitBounds from trace)
    const waypoints = [
      { lat: 43.0, lng: 1.0, distKm: 5 },
      { lat: 43.2, lng: 1.2, distKm: 15 },
    ]

    act(() => { ref.current?.fitToSearchZone(20, 5, [seg], waypoints as never[]) })

    // fitToTrace uses segment boundingBox → fitBounds called with trace bounds
    expect(mockMapInstance.fitBounds).toHaveBeenCalled()
    expect(useLiveStore.getState().gpsTrackingActive).toBe(false)
  })

  it('adds search-radius source and layers on map load', async () => {
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)

    await waitFor(() => expect(mockMapInstance.on).toHaveBeenCalledWith('load', expect.any(Function)))
    loadCallback?.()

    const addSourceCalls = mockMapInstance.addSource.mock.calls as [string, unknown][]
    const sourceIds = addSourceCalls.map(([id]) => id)
    expect(sourceIds).toContain('search-radius')

    const addLayerCalls = mockMapInstance.addLayer.mock.calls as [{ id: string }][]
    const layerIds = addLayerCalls.map(([l]) => l.id)
    expect(layerIds).toContain('search-radius-fill')
    expect(layerIds).toContain('search-radius-stroke')
  })

  it('auto-zoom calls fitBounds when targetKm changes and GPS position exists (AC #1)', async () => {
    const eventHandlers: Record<string, (e?: { originalEvent?: Event }) => void> = {}
    mockMapInstance.on.mockImplementation((event: string, cb: (e?: { originalEvent?: Event }) => void) => {
      eventHandlers[event] = cb
    })

    const seg = makeSegment()
    const { rerender } = render(
      <LiveMapCanvas adventureId="adv-1" segments={[seg]} targetKm={25} searchRadiusKm={5} />,
    )

    await waitFor(() => expect(eventHandlers['load']).toBeDefined())
    act(() => { eventHandlers['load']?.() })

    // Set GPS position so auto-zoom has a position to work with
    act(() => { useLiveStore.setState({ currentPosition: { lat: 43.1, lng: 1.1 } }) })

    // Wait for initial flyTo
    await waitFor(() => expect(mockMapInstance.flyTo).toHaveBeenCalled())

    const fitBoundsBefore = mockMapInstance.fitBounds.mock.calls.length

    // Change targetKm → triggers auto-zoom
    rerender(<LiveMapCanvas adventureId="adv-1" segments={[seg]} targetKm={30} searchRadiusKm={5} />)

    // Debounce 150ms
    await waitFor(() => {
      expect(mockMapInstance.fitBounds.mock.calls.length).toBeGreaterThan(fitBoundsBefore)
    }, { timeout: 500 })

    // Verify fitBounds was called with correct padding
    const lastCall = mockMapInstance.fitBounds.mock.calls[mockMapInstance.fitBounds.mock.calls.length - 1]
    expect(lastCall[1]).toMatchObject({
      padding: { top: 60, right: 60, bottom: 240, left: 60 },
      maxZoom: 16,
      animate: true,
      duration: 400,
    })
  })

  it('auto-zoom does NOT fire when currentPosition is null (AC #6)', async () => {
    const eventHandlers: Record<string, (e?: { originalEvent?: Event }) => void> = {}
    mockMapInstance.on.mockImplementation((event: string, cb: (e?: { originalEvent?: Event }) => void) => {
      eventHandlers[event] = cb
    })

    const seg = makeSegment()
    // No GPS position set
    const { rerender } = render(
      <LiveMapCanvas adventureId="adv-1" segments={[seg]} targetKm={25} searchRadiusKm={5} />,
    )

    await waitFor(() => expect(eventHandlers['load']).toBeDefined())
    act(() => { eventHandlers['load']?.() })

    const fitBoundsBefore = mockMapInstance.fitBounds.mock.calls.length

    // Change targetKm without GPS
    rerender(<LiveMapCanvas adventureId="adv-1" segments={[seg]} targetKm={30} searchRadiusKm={5} />)

    // Wait past debounce
    await new Promise((r) => setTimeout(r, 200))

    // fitBounds should NOT have been called for auto-zoom (may be called for fitToTrace on mount)
    expect(mockMapInstance.fitBounds.mock.calls.length).toBe(fitBoundsBefore)
  })

  it('search radius circle updates when searchRadiusKm changes (AC #4)', async () => {
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    const mockSetData = vi.fn()
    mockMapInstance.getSource.mockImplementation((id: string) => {
      if (id === 'live-target-point' || id === 'search-radius') return { setData: mockSetData }
      return undefined
    })

    const seg = makeSegment()
    const { rerender } = render(
      <LiveMapCanvas adventureId="adv-1" segments={[seg]} targetKm={25} searchRadiusKm={5} />,
    )

    await waitFor(() => expect(loadCallback).toBeDefined())
    act(() => { loadCallback?.() })

    // Initial setData calls for target point + circle
    const callsBefore = mockSetData.mock.calls.length

    // Change searchRadiusKm → circle should update
    rerender(<LiveMapCanvas adventureId="adv-1" segments={[seg]} targetKm={25} searchRadiusKm={10} />)

    await waitFor(() => {
      expect(mockSetData.mock.calls.length).toBeGreaterThan(callsBefore)
    })

    // Verify last call contains a Polygon (the circle)
    const allCalls = mockSetData.mock.calls
    const lastCircleCall = allCalls.findLast(
      (call: unknown[]) => (call[0] as { type?: string })?.type === 'Feature'
        && (call[0] as { geometry?: { type?: string } })?.geometry?.type === 'Polygon',
    )
    expect(lastCircleCall).toBeDefined()
  })
})

describe('createCirclePolygon', () => {
  it('generates polygon with 65 coordinates (64 segments + closure)', () => {
    const feature = createCirclePolygon({ lat: 43.3, lng: 1.3 }, 5)
    const coords = feature.geometry.coordinates[0]
    expect(coords).toHaveLength(65)
    // First and last point should be identical (explicit ring closure)
    expect(coords[0][0]).toBe(coords[64][0])
    expect(coords[0][1]).toBe(coords[64][1])
  })

  it('generates polygon with correct approximate radius', () => {
    const radiusKm = 10
    const center = { lat: 45.0, lng: 2.0 }
    const feature = createCirclePolygon(center, radiusKm)
    const coords = feature.geometry.coordinates[0]

    // Check north point (first bearing = 0 = north)
    // At lat 45, 1° lat ≈ 111.32 km → 10 km ≈ 0.0898°
    const northPoint = coords[0]
    const dLat = northPoint[1] - center.lat
    const approxDistKm = dLat * 111.32
    expect(approxDistKm).toBeCloseTo(radiusKm, 0)
  })

  it('returns a valid GeoJSON Feature with Polygon geometry', () => {
    const feature = createCirclePolygon({ lat: 48.8, lng: 2.3 }, 3)
    expect(feature.type).toBe('Feature')
    expect(feature.geometry.type).toBe('Polygon')
    expect(feature.geometry.coordinates).toHaveLength(1)
    expect(feature.properties).toEqual({})
  })
})
