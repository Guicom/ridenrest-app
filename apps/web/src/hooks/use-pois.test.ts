import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePois } from './use-pois'
import { POI_BBOX_CACHE_TTL } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi } from '@ridenrest/shared'

// Mock useMapStore
let mockVisibleLayers = new Set<string>()
let mockFromKm = 0
let mockToKm = 30

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    visibleLayers: mockVisibleLayers,
    fromKm: mockFromKm,
    toKm: mockToKm,
  }),
}))

// Mock getPois
const mockGetPois = vi.fn()
vi.mock('@/lib/api-client', () => ({
  getPois: (...args: unknown[]) => mockGetPois(...args),
}))

// Mock useQueries to control query results
const mockUseQueries = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQueries: (...args: unknown[]) => mockUseQueries(...args),
}))

const makeSegment = (
  id = 'seg-1',
  distanceKm = 50,
  cumulativeStartKm = 0,
): MapSegmentData => ({
  id,
  name: 'S1',
  orderIndex: 0,
  cumulativeStartKm,
  distanceKm,
  parseStatus: 'done',
  waypoints: [{ lat: 43.0, lng: 1.0, ele: 100, distKm: 0 }],
  boundingBox: { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 },
})

const makePoi = (category: Poi['category'] = 'hotel', distAlongRouteKm = 5): Poi => ({
  id: `overpass-123-${category}`,
  externalId: '123',
  source: 'overpass',
  category,
  name: 'Test POI',
  lat: 43.1,
  lng: 1.1,
  distFromTraceM: 0,
  distAlongRouteKm,
})

describe('usePois', () => {
  beforeEach(() => {
    mockVisibleLayers = new Set()
    mockFromKm = 0
    mockToKm = 30
    mockGetPois.mockReset()
    mockUseQueries.mockReset()
    mockUseQueries.mockReturnValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns empty poisByLayer when visibleLayers is empty', () => {
    mockUseQueries.mockReturnValue([])
    const { result } = renderHook(() => usePois([makeSegment()]))

    expect(result.current.poisByLayer.accommodations).toHaveLength(0)
    expect(result.current.poisByLayer.restaurants).toHaveLength(0)
    expect(result.current.poisByLayer.supplies).toHaveLength(0)
    expect(result.current.poisByLayer.bike).toHaveLength(0)
    expect(result.current.isPending).toBe(false)
    expect(result.current.hasError).toBe(false)
  })

  it('no queries generated when visibleLayers is empty', () => {
    mockUseQueries.mockReturnValue([])
    renderHook(() => usePois([makeSegment()]))

    // Use last call since React may render twice
    const lastCall = mockUseQueries.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const { queries } = lastCall![0]
    // activeLayers = [] → queries array is empty, nothing passed to useQueries
    expect(queries).toHaveLength(0)
  })

  it('fires queries when visibleLayers has active layers', () => {
    // With per-layer queries: 1 segment × 2 active layers = 2 independent queries
    mockVisibleLayers = new Set(['accommodations', 'restaurants'])
    mockUseQueries.mockReturnValue([
      { data: [], isPending: false, isError: false },
      { data: [], isPending: false, isError: false },
    ])

    renderHook(() => usePois([makeSegment()]))

    // Use last call since React may render twice
    const lastCall = mockUseQueries.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const { queries } = lastCall![0]
    // One query per active layer, not one combined query
    expect(queries).toHaveLength(2)
    // Each query has its own layer discriminator
    const layers = queries.map((q: { queryKey: [string, { layer: string }] }) => q.queryKey[1].layer)
    expect(layers).toContain('accommodations')
    expect(layers).toContain('restaurants')
  })

  it('groups returned POIs by layer using CATEGORY_TO_LAYER', () => {
    // With per-layer queries: 1 segment × 2 layers = 2 queries, each returning its own POIs
    mockVisibleLayers = new Set(['accommodations', 'bike'])

    const hotelPoi = makePoi('hotel')
    const bikePoi = makePoi('bike_shop')

    // Two independent queries: one for 'accommodations' layer, one for 'bike' layer
    mockUseQueries.mockReturnValue([
      { data: [hotelPoi], isPending: false, isError: false },
      { data: [bikePoi], isPending: false, isError: false },
    ])

    const { result } = renderHook(() => usePois([makeSegment()]))

    expect(result.current.poisByLayer.accommodations).toContain(hotelPoi)
    expect(result.current.poisByLayer.bike).toContain(bikePoi)
    expect(result.current.poisByLayer.restaurants).toHaveLength(0)
  })

  it('isPending=true when at least one query is loading', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockUseQueries.mockReturnValue([
      { data: undefined, isPending: true, isError: false },
    ])

    const { result } = renderHook(() => usePois([makeSegment()]))
    expect(result.current.isPending).toBe(true)
  })

  it('isPending=false when no queries are loading', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockUseQueries.mockReturnValue([
      { data: [], isPending: false, isError: false },
    ])

    const { result } = renderHook(() => usePois([makeSegment()]))
    expect(result.current.isPending).toBe(false)
  })

  it('hasError=true when any query fails', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockUseQueries.mockReturnValue([
      { data: undefined, isPending: false, isError: true },
    ])

    const { result } = renderHook(() => usePois([makeSegment()]))
    expect(result.current.hasError).toBe(true)
  })

  it('hasError=false when no queries have errors', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockUseQueries.mockReturnValue([
      { data: [], isPending: false, isError: false },
    ])

    const { result } = renderHook(() => usePois([makeSegment()]))
    expect(result.current.hasError).toBe(false)
  })

  // New tests for adventure→segment km mapping (Story 4.3 Task 6)
  it('segments outside [fromKm, toKm] range are NOT queried', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockFromKm = 0
    mockToKm = 30
    // Segment starts at km 50 — entirely outside [0, 30]
    const segment = makeSegment('seg-1', 20, 50)
    mockUseQueries.mockReturnValue([])

    renderHook(() => usePois([segment]))

    const lastCall = mockUseQueries.mock.calls.at(-1)
    const { queries } = lastCall![0]
    // No queries should be generated for out-of-range segment
    expect(queries).toHaveLength(0)
  })

  it('computes correct segLocalFrom/segLocalTo for partially overlapping segment', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockFromKm = 40
    mockToKm = 60
    // Segment: cumStart=30, distanceKm=40 → km range [30, 70]
    // Overlap with [40, 60] → localFrom=40-30=10, localTo=60-30=30
    const segment = makeSegment('seg-1', 40, 30)
    mockUseQueries.mockReturnValue([{ data: [], isPending: false, isError: false }])

    renderHook(() => usePois([segment]))

    const lastCall = mockUseQueries.mock.calls.at(-1)
    const { queries } = lastCall![0]
    // 1 segment × 1 active layer = 1 query
    expect(queries).toHaveLength(1)
    expect(queries[0].queryKey[1].fromKm).toBe(10)
    expect(queries[0].queryKey[1].toKm).toBe(30)
    // Per-layer key: uses `layer` field, not `categories` array
    expect(queries[0].queryKey[1].layer).toBe('accommodations')
    expect(queries[0].queryKey[1]).not.toHaveProperty('categories')
  })

  it('fires queries for multiple segments overlapping the range', () => {
    // With per-layer queries: numSegments × numActiveLayers queries total
    // 2 segments × 1 active layer = 2 queries
    mockVisibleLayers = new Set(['accommodations'])
    mockFromKm = 40
    mockToKm = 60
    // Segment 1: [0, 45] — overlap [40, 45] → local [40, 45]
    // Segment 2: [45, 90] — overlap [45, 60] → local [0, 15]
    const seg1 = makeSegment('seg-1', 45, 0)
    const seg2 = makeSegment('seg-2', 45, 45)
    mockUseQueries.mockReturnValue([
      { data: [], isPending: false, isError: false },
      { data: [], isPending: false, isError: false },
    ])

    renderHook(() => usePois([seg1, seg2]))

    const lastCall = mockUseQueries.mock.calls.at(-1)
    const { queries } = lastCall![0]
    // 2 segments × 1 layer = 2 queries
    expect(queries).toHaveLength(2)
    // Seg1: localFrom = max(0, 40-0) = 40, localTo = min(45, 60-0) = 45
    expect(queries[0].queryKey[1].segmentId).toBe('seg-1')
    expect(queries[0].queryKey[1].fromKm).toBe(40)
    expect(queries[0].queryKey[1].toKm).toBe(45)
    expect(queries[0].queryKey[1].layer).toBe('accommodations')
    // Seg2: localFrom = max(0, 40-45) = 0, localTo = min(45, 60-45) = 15
    expect(queries[1].queryKey[1].segmentId).toBe('seg-2')
    expect(queries[1].queryKey[1].fromKm).toBe(0)
    expect(queries[1].queryKey[1].toKm).toBe(15)
    expect(queries[1].queryKey[1].layer).toBe('accommodations')
  })

  it('computes correct local km for storeFromKm=0 toKm=30 with segment at cumulativeStart=20 distanceKm=50', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockFromKm = 0
    mockToKm = 30
    // Segment: cumStart=20, distanceKm=50 → adventure range [20, 70]
    // Overlap with [0, 30] → localFrom=max(0, 0-20)=0, localTo=min(50, 30-20)=10
    const segment = makeSegment('seg-1', 50, 20)
    mockUseQueries.mockReturnValue([{ data: [], isPending: false, isError: false }])

    renderHook(() => usePois([segment]))

    const lastCall = mockUseQueries.mock.calls.at(-1)
    const { queries } = lastCall![0]
    expect(queries).toHaveLength(1)
    expect(queries[0].queryKey[1].fromKm).toBe(0)
    expect(queries[0].queryKey[1].toKm).toBe(10)
  })

  it('debounce: queries use initial store values immediately (no timer needed)', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockFromKm = 10
    mockToKm = 40
    const segment = makeSegment('seg-1', 100, 0)
    mockUseQueries.mockReturnValue([{ data: [], isPending: false, isError: false }])

    renderHook(() => usePois([segment]))

    // On first render, debouncedFromKm = 10, debouncedToKm = 40 (from useState initializer)
    const lastCall = mockUseQueries.mock.calls.at(-1)
    const { queries } = lastCall![0]
    expect(queries[0].queryKey[1].fromKm).toBe(10)
    expect(queries[0].queryKey[1].toKm).toBe(40)
  })

  it('debounce: store value change does not fire new query until 400ms later', async () => {
    vi.useFakeTimers()

    mockVisibleLayers = new Set(['accommodations'])
    mockFromKm = 0
    mockToKm = 30
    const segment = makeSegment('seg-1', 100, 0)
    mockUseQueries.mockReturnValue([{ data: [], isPending: false, isError: false }])

    const { rerender } = renderHook(() => usePois([segment]))

    // Simulate slider move: store changes to [5, 35]
    mockFromKm = 5
    mockToKm = 35

    // Re-render immediately — isSliding=true → queries array is EMPTY (no stale queries)
    rerender()

    const callBeforeTimer = mockUseQueries.mock.calls.at(-1)![0].queries
    // While sliding, no queries are fired (map clears immediately)
    expect(callBeforeTimer).toHaveLength(0)

    // Advance 400ms → debounce fires
    await act(async () => { vi.advanceTimersByTime(400) })

    const callAfterTimer = mockUseQueries.mock.calls.at(-1)![0].queries
    expect(callAfterTimer[0].queryKey[1].fromKm).toBe(5)
    expect(callAfterTimer[0].queryKey[1].toKm).toBe(35)

    vi.useRealTimers()
  })

  it('toggling one layer does not invalidate other layer query key', () => {
    // Different layers produce different query keys — their TQ cache entries are independent
    mockVisibleLayers = new Set(['accommodations', 'restaurants'])
    mockUseQueries.mockReturnValue([
      { data: [], isPending: false, isError: false },
      { data: [], isPending: false, isError: false },
    ])

    renderHook(() => usePois([makeSegment()]))

    const lastCall = mockUseQueries.mock.calls.at(-1)
    const { queries } = lastCall![0]
    expect(queries).toHaveLength(2)

    // Verify the two queries have distinct layer discriminators
    const key0 = queries[0].queryKey[1]
    const key1 = queries[1].queryKey[1]
    expect(key0.layer).not.toBe(key1.layer)

    // Same segmentId/fromKm/toKm — only `layer` differs
    expect(key0.segmentId).toBe(key1.segmentId)
    expect(key0.fromKm).toBe(key1.fromKm)
    expect(key0.toKm).toBe(key1.toKm)
  })

  it('staleTime and gcTime equal POI_BBOX_CACHE_TTL * 1000 (30 days, aligned with Redis TTL)', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockUseQueries.mockReturnValue([{ data: [], isPending: false, isError: false }])

    renderHook(() => usePois([makeSegment()]))

    const lastCall = mockUseQueries.mock.calls.at(-1)
    const { queries } = lastCall![0]
    expect(queries[0].staleTime).toBe(POI_BBOX_CACHE_TTL * 1000)  // 2592000000ms = 30 days
    expect(queries[0].gcTime).toBe(POI_BBOX_CACHE_TTL * 1000)     // prevents GC eviction before staleTime expires
  })

  it('POIs are sorted by distAlongRouteKm in each layer', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockUseQueries.mockReturnValue([
      {
        data: [
          makePoi('hotel', 15),
          makePoi('hostel', 5),
          makePoi('shelter', 10),
        ],
        isPending: false,
        isError: false,
      },
    ])

    const { result } = renderHook(() => usePois([makeSegment()]))
    const accomPois = result.current.poisByLayer.accommodations
    expect(accomPois[0].distAlongRouteKm).toBe(5)
    expect(accomPois[1].distAlongRouteKm).toBe(10)
    expect(accomPois[2].distAlongRouteKm).toBe(15)
  })
})
