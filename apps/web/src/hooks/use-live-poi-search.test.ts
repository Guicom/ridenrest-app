import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLivePoisSearch } from './use-live-poi-search'

// Mock live store state
let mockStoreState = {
  isLiveModeActive: true,
  currentKmOnRoute: null as number | null,
  targetAheadKm: 30,
  searchRadiusKm: 3,
}

vi.mock('@/stores/live.store', () => ({
  useLiveStore: (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

// Mock getLivePois
const mockGetLivePois = vi.fn().mockResolvedValue([])
vi.mock('@/lib/api-client', () => ({
  getLivePois: (...args: unknown[]) => mockGetLivePois(...args),
}))

// Mock useQuery
const mockUseQuery = vi.fn().mockReturnValue({ data: [], isPending: false })
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

describe('useLivePoisSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      isLiveModeActive: true,
      currentKmOnRoute: null,
      targetAheadKm: 30,
      searchRadiusKm: 3,
    }
    mockUseQuery.mockReturnValue({ data: [], isPending: false })
  })

  it('returns null targetKm when currentKmOnRoute is null', () => {
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.targetKm).toBeNull()
  })

  it('computes targetKm = currentKmOnRoute + targetAheadKm', () => {
    mockStoreState.currentKmOnRoute = 10
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    // targetKm = Math.round((10 + 30) * 10) / 10 = 40
    expect(result.current.targetKm).toBe(40)
  })

  it('passes correct queryKey with rounded targetKm', () => {
    mockStoreState.currentKmOnRoute = 10.15
    const { rerender } = renderHook(() => useLivePoisSearch('seg-1'))
    // Re-render to let useEffect set activeTriggerKm
    rerender()

    const lastCall = mockUseQuery.mock.calls[mockUseQuery.mock.calls.length - 1][0]
    // targetKm = Math.round((10.15 + 30) * 10) / 10 = 40.2
    expect(lastCall.queryKey).toEqual([
      'pois', 'live', { segmentId: 'seg-1', targetKm: 40.2, radiusKm: 3 },
    ])
  })

  it('disables query when segmentId is undefined', () => {
    mockStoreState.currentKmOnRoute = 10
    renderHook(() => useLivePoisSearch(undefined))

    const queryConfig = mockUseQuery.mock.calls[0][0]
    expect(queryConfig.enabled).toBe(false)
  })

  it('disables query when live mode is inactive', () => {
    mockStoreState.isLiveModeActive = false
    mockStoreState.currentKmOnRoute = 10
    renderHook(() => useLivePoisSearch('seg-1'))

    const queryConfig = mockUseQuery.mock.calls[0][0]
    expect(queryConfig.enabled).toBe(false)
  })

  it('does not trigger re-search for GPS move < 500m', () => {
    mockStoreState.currentKmOnRoute = 10
    const { rerender } = renderHook(() => useLivePoisSearch('seg-1'))
    rerender() // let effect run

    // Move by 0.3 km (< 0.5 threshold)
    mockStoreState.currentKmOnRoute = 10.3
    rerender()
    rerender() // let effect run again

    // Should still use original trigger km → targetKm = 40
    const queryConfig = mockUseQuery.mock.calls[mockUseQuery.mock.calls.length - 1][0]
    expect(queryConfig.queryKey[2].targetKm).toBe(40)
  })

  it('triggers re-search when GPS moves >= 500m', () => {
    mockStoreState.currentKmOnRoute = 10
    const { rerender } = renderHook(() => useLivePoisSearch('seg-1'))
    rerender() // let effect run

    // Move by 0.6 km (>= 0.5 threshold)
    mockStoreState.currentKmOnRoute = 10.6
    rerender()
    rerender() // let effect run

    const queryConfig = mockUseQuery.mock.calls[mockUseQuery.mock.calls.length - 1][0]
    // targetKm = Math.round((10.6 + 30) * 10) / 10 = 40.6
    expect(queryConfig.queryKey[2].targetKm).toBe(40.6)
  })
})
