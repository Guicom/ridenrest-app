import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePois } from './use-pois'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi } from '@ridenrest/shared'

// Mock useMapStore
let mockVisibleLayers = new Set<string>()

vi.mock('@/stores/map.store', () => ({
  useMapStore: () => ({
    visibleLayers: mockVisibleLayers,
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

const makeSegment = (id = 'seg-1', distanceKm = 50): MapSegmentData => ({
  id,
  name: 'S1',
  orderIndex: 0,
  cumulativeStartKm: 0,
  distanceKm,
  parseStatus: 'done',
  waypoints: [{ lat: 43.0, lng: 1.0, ele: 100, distKm: 0 }],
  boundingBox: { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 },
})

const makePoi = (category: Poi['category'] = 'hotel'): Poi => ({
  id: `overpass-123-${category}`,
  externalId: '123',
  source: 'overpass',
  category,
  name: 'Test POI',
  lat: 43.1,
  lng: 1.1,
  distFromTraceM: 0,
  distAlongRouteKm: 0,
})

describe('usePois', () => {
  beforeEach(() => {
    mockVisibleLayers = new Set()
    mockGetPois.mockReset()
    mockUseQueries.mockReset()
    mockUseQueries.mockReturnValue([])
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

  it('queries are disabled when visibleLayers is empty', () => {
    mockUseQueries.mockReturnValue([])
    renderHook(() => usePois([makeSegment()]))

    // Use last call since React may render twice
    const lastCall = mockUseQueries.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const { queries } = lastCall![0]
    // All queries should have enabled: false
    expect(queries.every((q: { enabled: boolean }) => q.enabled === false)).toBe(true)
  })

  it('fires queries when visibleLayers has active layers', () => {
    mockVisibleLayers = new Set(['accommodations'])
    mockUseQueries.mockReturnValue([{ data: [], isPending: false, isError: false }])

    renderHook(() => usePois([makeSegment()]))

    // Use last call since React may render twice
    const lastCall = mockUseQueries.mock.calls.at(-1)
    expect(lastCall).toBeDefined()
    const { queries } = lastCall![0]
    expect(queries.some((q: { enabled: boolean }) => q.enabled === true)).toBe(true)
  })

  it('groups returned POIs by layer using CATEGORY_TO_LAYER', () => {
    mockVisibleLayers = new Set(['accommodations', 'bike'])

    const hotelPoi = makePoi('hotel')
    const bikePoi = makePoi('bike_shop')

    mockUseQueries.mockReturnValue([
      { data: [hotelPoi, bikePoi], isPending: false, isError: false },
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
})
