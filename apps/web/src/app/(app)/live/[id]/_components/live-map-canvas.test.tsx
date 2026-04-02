import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, act } from '@testing-library/react'
import { LiveMapCanvas } from './live-map-canvas'
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
        elevationGainM: null, etaMinutes: null, createdAt: '', updatedAt: '',
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
        elevationGainM: null, etaMinutes: null, createdAt: '', updatedAt: '',
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
        elevationGainM: null, etaMinutes: null, createdAt: '', updatedAt: '',
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

  it('calls flyTo when searchTrigger increments (> 0)', async () => {
    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })
    mockMapInstance.getSource.mockReturnValue({
      setData: vi.fn(),
    })

    const { rerender } = render(
      <LiveMapCanvas
        adventureId="adv-1"
        segments={[makeSegment()]}
        targetKm={40}
        searchTrigger={0}
      />,
    )

    await waitFor(() => expect(loadCallback).toBeDefined())
    act(() => { loadCallback?.() })

    // Trigger search
    rerender(
      <LiveMapCanvas
        adventureId="adv-1"
        segments={[makeSegment()]}
        targetKm={40}
        searchTrigger={1}
      />,
    )

    await waitFor(() => {
      expect(mockMapInstance.flyTo).toHaveBeenCalledWith(
        expect.objectContaining({ zoom: 13 }),
      )
    })
  })
})
