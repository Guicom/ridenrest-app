import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePoiLayers } from './use-poi-layers'
import type { Poi, MapLayer } from '@ridenrest/shared'

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockVisibleLayers = new Set<string>(['accommodations'])
const mockSetSelectedPoiId = vi.fn()
vi.mock('@/stores/map.store', () => ({
  useMapStore: Object.assign(
    () => ({
      visibleLayers: mockVisibleLayers,
      activeAccommodationTypes: new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse']),
      selectedPoiId: null,
    }),
    { getState: () => ({ setSelectedPoiId: mockSetSelectedPoiId }) },
  ),
}))

const mockSetSelectedPoi = vi.fn()
vi.mock('@/stores/ui.store', () => ({
  useUIStore: Object.assign(
    () => ({ selectedPoiId: null, setSelectedPoi: mockSetSelectedPoi }),
    { getState: () => ({ setSelectedPoi: mockSetSelectedPoi }) },
  ),
}))

// Mock poi-pin-factory so registerPoiPinImages resolves immediately (no real SVG loading)
vi.mock('@/lib/poi-pin-factory', () => ({
  registerPoiPinImages: vi.fn().mockResolvedValue(undefined),
  poiPinImageKey: (category: string) => `poi-pin-${category}`,
}))

// ── MapLibre mock ─────────────────────────────────────────────────────────────

type EventHandler = (e: { features?: Array<{ properties: Record<string, unknown>; geometry: { coordinates: number[] } }>; preventDefault?: () => void }) => void

interface MockMap {
  isStyleLoaded: ReturnType<typeof vi.fn>
  getSource: ReturnType<typeof vi.fn>
  addSource: ReturnType<typeof vi.fn>
  addLayer: ReturnType<typeof vi.fn>
  removeLayer: ReturnType<typeof vi.fn>
  removeSource: ReturnType<typeof vi.fn>
  getLayer: ReturnType<typeof vi.fn>
  hasImage: ReturnType<typeof vi.fn>
  getCanvas: ReturnType<typeof vi.fn>
  flyTo: ReturnType<typeof vi.fn>
  getZoom: ReturnType<typeof vi.fn>
  setPaintProperty: ReturnType<typeof vi.fn>
  setLayoutProperty: ReturnType<typeof vi.fn>
  setFilter: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  _handlers: Map<string, EventHandler>
}

function createMockMap(): MockMap {
  const handlers = new Map<string, EventHandler>()
  return {
    isStyleLoaded: vi.fn().mockReturnValue(true),
    getSource: vi.fn().mockReturnValue(null),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    getLayer: vi.fn().mockReturnValue(null),
    hasImage: vi.fn().mockReturnValue(false),
    getCanvas: vi.fn().mockReturnValue({ style: { cursor: '' } }),
    flyTo: vi.fn(),
    getZoom: vi.fn().mockReturnValue(10),
    setPaintProperty: vi.fn(),
    setLayoutProperty: vi.fn(),
    setFilter: vi.fn(),
    on: vi.fn((event: string, layerId: string, handler: EventHandler) => {
      handlers.set(`${event}:${layerId}`, handler)
    }),
    off: vi.fn(),
    _handlers: handlers,
  }
}

// ── Test helpers ───────────────────────────────────────────────────────────────

const makePoi = (layer: MapLayer, overrides?: Partial<Poi>): Poi => ({
  id: `overpass-123-${layer}`,
  externalId: '123',
  source: 'overpass',
  category: layer === 'accommodations' ? 'hotel' : layer === 'restaurants' ? 'restaurant' : layer === 'supplies' ? 'supermarket' : 'bike_shop',
  name: 'Test POI',
  lat: 43.1,
  lng: 1.1,
  distFromTraceM: 0,
  distAlongRouteKm: 5,
  ...overrides,
})

const emptyPoisByLayer: Record<MapLayer, Poi[]> = {
  accommodations: [],
  restaurants: [],
  supplies: [],
  bike: [],
}

// Helper: flush all pending promises (microtask queue)
const flushPromises = () => act(async () => { await Promise.resolve() })

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('usePoiLayers', () => {
  let mockMap: MockMap

  beforeEach(() => {
    mockMap = createMockMap()
    mockVisibleLayers = new Set(['accommodations'])
    mockSetSelectedPoi.mockClear()
    mockSetSelectedPoiId.mockClear()
  })

  it('registers click handler on pointLayerId for visible layer', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [makePoi('accommodations')] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    const onCalls = (mockMap.on as ReturnType<typeof vi.fn>).mock.calls
    const pointClickCalls = onCalls.filter(
      (call: unknown[]) => call[0] === 'click' && String(call[1]).endsWith('-points'),
    )
    expect(pointClickCalls.length).toBeGreaterThan(0)
  })

  it('simulated click on POI point calls setSelectedPoi with correct id', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poi = makePoi('accommodations', { id: 'overpass-999', externalId: '999' })
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [poi] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    // Find the handler registered for 'click' on the points layer
    const handler = mockMap._handlers.get('click:pois-accommodations-points') as EventHandler | undefined
    expect(handler).toBeDefined()

    // Simulate a click event with the POI feature
    handler?.({
      features: [{ properties: { id: 'overpass-999' }, geometry: { coordinates: [1.1, 43.1] } }],
      preventDefault: vi.fn(),
    })

    expect(mockSetSelectedPoi).toHaveBeenCalledWith('overpass-999')
  })

  it('feature properties include externalId', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poi = makePoi('accommodations', { id: 'overpass-777', externalId: '777' })
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [poi] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    const addSourceCall = (mockMap.addSource as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { data: { features: Array<{ properties: Record<string, unknown> }> } }]
    const feature = addSourceCall[1].data.features[0]
    expect(feature.properties.externalId).toBe('777')
  })

  it('feature properties include id and name', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poi = makePoi('accommodations', { id: 'overpass-888', name: 'Mon Hôtel', externalId: '888' })
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [poi] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    const addSourceCall = (mockMap.addSource as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { data: { features: Array<{ properties: Record<string, unknown> }> } }]
    const feature = addSourceCall[1].data.features[0]
    expect(feature.properties.id).toBe('overpass-888')
    expect(feature.properties.name).toBe('Mon Hôtel')
  })

  it('feature properties include iconImageKey for accommodations hotel', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poi = makePoi('accommodations', { id: 'overpass-acc', externalId: 'acc', category: 'hotel' })
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [poi] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    const addSourceCall = (mockMap.addSource as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { data: { features: Array<{ properties: Record<string, unknown> }> } }]
    const feature = addSourceCall[1].data.features[0]
    expect(feature.properties.iconImageKey).toBe('poi-pin-hotel')
  })

  it('point layer is type symbol with icon-image expression', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [makePoi('accommodations')] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    const addLayerCalls = (mockMap.addLayer as ReturnType<typeof vi.fn>).mock.calls as Array<[{ id: string; type: string; layout?: Record<string, unknown> }]>
    const pointLayerCall = addLayerCalls.find(([layer]) => layer.id === 'pois-accommodations-points')
    expect(pointLayerCall).toBeDefined()
    expect(pointLayerCall![0].type).toBe('symbol')
    expect(pointLayerCall![0].layout?.['icon-image']).toEqual(['get', 'iconImageKey'])
    expect(pointLayerCall![0].layout?.['icon-anchor']).toBe('bottom')
  })

  it('registers mouseenter/mouseleave handlers on pointLayerId for cursor', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [makePoi('accommodations')] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    const onCalls = (mockMap.on as ReturnType<typeof vi.fn>).mock.calls
    const mouseEnterCalls = onCalls.filter(
      (call: unknown[]) => call[0] === 'mouseenter' && String(call[1]).endsWith('-points'),
    )
    const mouseLeaveCalls = onCalls.filter(
      (call: unknown[]) => call[0] === 'mouseleave' && String(call[1]).endsWith('-points'),
    )
    expect(mouseEnterCalls.length).toBeGreaterThan(0)
    expect(mouseLeaveCalls.length).toBeGreaterThan(0)
  })

  it('cluster layer uses POI_CLUSTER_COLOR #2D6A4A', async () => {
    const mapRef = { current: mockMap } as unknown as React.RefObject<ReturnType<typeof createMockMap>>
    const poisByLayer = { ...emptyPoisByLayer, accommodations: [makePoi('accommodations')] }

    renderHook(() => usePoiLayers(mapRef as never, poisByLayer, 1))
    await flushPromises()

    const addLayerCalls = (mockMap.addLayer as ReturnType<typeof vi.fn>).mock.calls as Array<[{ id: string; paint?: Record<string, unknown> }]>
    const clusterLayerCall = addLayerCalls.find(([layer]) => layer.id === 'pois-accommodations-clusters')
    expect(clusterLayerCall).toBeDefined()
    expect(clusterLayerCall![0].paint?.['circle-color']).toBe('#2D6A4A')
  })
})
