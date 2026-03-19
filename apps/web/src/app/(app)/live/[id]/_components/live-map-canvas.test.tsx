import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { LiveMapCanvas } from './live-map-canvas'
import { useLiveStore } from '@/stores/live.store'
import type { MapSegmentData } from '@ridenrest/shared'

afterEach(cleanup)

// Mock MapLibre — WebGL unavailable in jsdom
const mockMapInstance = {
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  getSource: vi.fn(),
  getLayer: vi.fn().mockReturnValue(undefined),
  isStyleLoaded: vi.fn().mockReturnValue(false),
  fitBounds: vi.fn(),
  remove: vi.fn(),
  panTo: vi.fn(),
  getCanvas: vi.fn().mockReturnValue({ style: {} }),
  getZoom: vi.fn().mockReturnValue(10),
  flyTo: vi.fn(),
}

vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(function (this: unknown) { return mockMapInstance }),
}))

// Mock findPointAtKm
vi.mock('@ridenrest/gpx', () => ({
  findPointAtKm: vi.fn().mockReturnValue({ lat: 43.3, lng: 1.3 }),
}))

// Mock next-themes
vi.mock('next-themes', () => ({
  useTheme: () => ({ resolvedTheme: 'light' }),
}))

// Mock OsmAttribution
vi.mock('@/components/shared/osm-attribution', () => ({
  OsmAttribution: () => <div data-testid="osm-attribution" />,
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

  it('adds trace source and gps-dot layer on map load', async () => {
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
    expect(sourceIds).toContain('live-gps-position')

    const addLayerCalls = mockMapInstance.addLayer.mock.calls as [{ id: string }][]
    const layerIds = addLayerCalls.map(([l]) => l.id)
    expect(layerIds).toContain('target-dot')
    expect(layerIds).toContain('gps-dot')
  })

  it('updates GPS source when currentPosition changes in store', async () => {
    const mockGpsSource = { setData: vi.fn() }
    mockMapInstance.getSource.mockImplementation((id: string) =>
      id === 'live-gps-position' ? mockGpsSource : undefined,
    )
    mockMapInstance.isStyleLoaded.mockReturnValue(true)

    let loadCallback: (() => void) | undefined
    mockMapInstance.on.mockImplementation((event: string, cb: () => void) => {
      if (event === 'load') loadCallback = cb
    })

    render(<LiveMapCanvas adventureId="adv-1" segments={[makeSegment()]} />)
    await waitFor(() => { expect(loadCallback).toBeDefined() })
    loadCallback?.()

    useLiveStore.setState({ currentPosition: { lat: 43.3, lng: 1.2 } })

    await waitFor(() => {
      expect(mockGpsSource.setData).toHaveBeenCalled()
    })
  })
})
