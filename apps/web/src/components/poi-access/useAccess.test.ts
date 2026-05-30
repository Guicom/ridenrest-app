import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import type { AccessOrigin, AccessResponse } from '@ridenrest/shared'
import { useAccess } from './useAccess'

const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

const mockPost = vi.fn()
vi.mock('@/lib/api-client', () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}))

const ORIGIN: AccessOrigin = { type: 'nearest-trace' }

const OK_RESPONSE: AccessResponse = {
  status: 'ok',
  distanceM: 4200,
  elevationGainM: 120,
  elevationLossM: 80,
  geometry: { type: 'LineString', coordinates: [[2.35, 48.85], [2.36, 48.86]] },
  engineVersion: 'brouter-1.7.5',
  computedAt: '2026-05-29T12:00:00.000Z',
  source: 'computed-fresh',
}

describe('useAccess', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
    mockPost.mockReset()
  })

  it('uses the canonical query key ["poi-access", poiId, origin]', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderHook(() => useAccess('poi-1', ORIGIN))

    const { queryKey } = mockUseQuery.mock.calls[0][0]
    expect(queryKey).toEqual(['poi-access', 'poi-1', ORIGIN])
  })

  it('sets staleTime 5min, gcTime 15min', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderHook(() => useAccess('poi-1', ORIGIN))

    const opts = mockUseQuery.mock.calls[0][0]
    expect(opts.staleTime).toBe(5 * 60 * 1000)
    expect(opts.gcTime).toBe(15 * 60 * 1000)
  })

  it('is disabled (lazy) when poiId is empty', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null })
    renderHook(() => useAccess('', ORIGIN))

    expect(mockUseQuery.mock.calls[0][0].enabled).toBe(false)
  })

  it('queryFn POSTs to /api/pois/:id/access and parses the response', async () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null })
    mockPost.mockResolvedValue(OK_RESPONSE)
    renderHook(() => useAccess('poi-1', ORIGIN))

    const { queryFn } = mockUseQuery.mock.calls[0][0]
    const result = await queryFn()

    expect(mockPost).toHaveBeenCalledWith('/api/pois/poi-1/access', { origin: ORIGIN })
    expect(result).toEqual(OK_RESPONSE)
  })

  it('queryFn throws when the response fails schema validation', async () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false, error: null })
    mockPost.mockResolvedValue({ status: 'ok', distanceM: 'not-a-number' })
    renderHook(() => useAccess('poi-1', ORIGIN))

    const { queryFn } = mockUseQuery.mock.calls[0][0]
    await expect(queryFn()).rejects.toThrow()
  })

  it('returns { data, isLoading, error } passthrough', () => {
    const err = new Error('boom')
    mockUseQuery.mockReturnValue({ data: OK_RESPONSE, isLoading: false, error: err })
    const { result } = renderHook(() => useAccess('poi-1', ORIGIN))

    expect(result.current.data).toEqual(OK_RESPONSE)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBe(err)
  })
})
