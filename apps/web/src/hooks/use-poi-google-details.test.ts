import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePoiGoogleDetails } from './use-poi-google-details'

const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

const mockGetPoiGoogleDetails = vi.fn()
vi.mock('@/lib/api-client', () => ({
  getPoiGoogleDetails: (...args: unknown[]) => mockGetPoiGoogleDetails(...args),
}))

describe('usePoiGoogleDetails', () => {
  it('returns { details: null, isPending: false } when externalId=null', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    const { result } = renderHook(() => usePoiGoogleDetails(null, 'seg-1'))

    expect(result.current.details).toBeNull()
    expect(result.current.isPending).toBe(false)
  })

  it('returns { details: null, isPending: false } when segmentId=null', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    const { result } = renderHook(() => usePoiGoogleDetails('ext-1', null))

    expect(result.current.details).toBeNull()
    expect(result.current.isPending).toBe(false)
  })

  it('disables query when externalId is null', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => usePoiGoogleDetails(null, 'seg-1'))

    const lastCall = mockUseQuery.mock.calls.at(-1)![0] as { enabled: boolean }
    expect(lastCall.enabled).toBe(false)
  })

  it('disables query when segmentId is null', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => usePoiGoogleDetails('ext-1', null))

    const lastCall = mockUseQuery.mock.calls.at(-1)![0] as { enabled: boolean }
    expect(lastCall.enabled).toBe(false)
  })

  it('enables query when both externalId and segmentId provided', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => usePoiGoogleDetails('ext-1', 'seg-1'))

    const lastCall = mockUseQuery.mock.calls.at(-1)![0] as { enabled: boolean }
    expect(lastCall.enabled).toBe(true)
  })

  it('returns details when query succeeds', () => {
    const mockDetails = { placeId: 'ChIJABC', displayName: 'Hotel Test', rating: 4.2, isOpenNow: true, formattedAddress: null, phone: null, website: null, types: [] }
    mockUseQuery.mockReturnValue({ data: mockDetails, isPending: false })

    const { result } = renderHook(() => usePoiGoogleDetails('ext-1', 'seg-1'))

    expect(result.current.details).toEqual(mockDetails)
    expect(result.current.isPending).toBe(false)
  })

  it('isPending=true while loading and externalId provided', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true })

    const { result } = renderHook(() => usePoiGoogleDetails('ext-1', 'seg-1'))

    expect(result.current.isPending).toBe(true)
  })

  it('uses retry: false (no automatic retry on error)', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => usePoiGoogleDetails('ext-1', 'seg-1'))

    const lastCall = mockUseQuery.mock.calls.at(-1)![0] as { retry: boolean }
    expect(lastCall.retry).toBe(false)
  })

  it('uses staleTime of 7 days', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => usePoiGoogleDetails('ext-1', 'seg-1'))

    const lastCall = mockUseQuery.mock.calls.at(-1)![0] as { staleTime: number }
    const SEVEN_DAYS_MS = 1000 * 60 * 60 * 24 * 7
    expect(lastCall.staleTime).toBe(SEVEN_DAYS_MS)
  })

  it('uses correct queryKey format', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })

    renderHook(() => usePoiGoogleDetails('ext-123', 'seg-abc'))

    const lastCall = mockUseQuery.mock.calls.at(-1)![0] as { queryKey: unknown[] }
    expect(lastCall.queryKey).toEqual(['poi-google-details', 'ext-123', 'seg-abc'])
  })
})
