import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useDensity } from './use-density'

const mockUseQuery = vi.fn()
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

vi.mock('@/lib/api-client', () => ({
  getDensityStatus: vi.fn(),
}))

describe('useDensity', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('returns idle status and empty coverageGaps when no data', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })
    const { result } = renderHook(() => useDensity('adv-1'))

    expect(result.current.densityStatus).toBe('idle')
    expect(result.current.coverageGaps).toEqual([])
    expect(result.current.isPending).toBe(false)
  })

  it('returns coverageGaps and densityStatus from query data', () => {
    const mockData = {
      densityStatus: 'success',
      densityProgress: 100,
      coverageGaps: [{ segmentId: 'seg-1', fromKm: 0, toKm: 10, severity: 'critical' as const }],
    }
    mockUseQuery.mockReturnValue({ data: mockData, isPending: false })
    const { result } = renderHook(() => useDensity('adv-1'))

    expect(result.current.densityStatus).toBe('success')
    expect(result.current.coverageGaps).toHaveLength(1)
    expect(result.current.coverageGaps[0].severity).toBe('critical')
  })

  it('isPending=true while loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true })
    const { result } = renderHook(() => useDensity('adv-1'))
    expect(result.current.isPending).toBe(true)
  })

  it('polling stops when densityStatus is success', () => {
    mockUseQuery.mockReturnValue({ data: { densityStatus: 'success', densityProgress: 100, coverageGaps: [] }, isPending: false })
    renderHook(() => useDensity('adv-1'))

    const { refetchInterval } = mockUseQuery.mock.calls[0][0]
    const mockQuery = { state: { data: { densityStatus: 'success', densityProgress: 100, coverageGaps: [] } } }
    expect(refetchInterval(mockQuery)).toBe(false)
  })

  it('polling continues at 3000ms when densityStatus is pending', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true })
    renderHook(() => useDensity('adv-1'))

    const { refetchInterval } = mockUseQuery.mock.calls[0][0]
    const mockQuery = { state: { data: { densityStatus: 'pending', densityProgress: 0, coverageGaps: [] } } }
    expect(refetchInterval(mockQuery)).toBe(3000)
  })

  it('polling continues at 3000ms when densityStatus is processing', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: true })
    renderHook(() => useDensity('adv-1'))

    const { refetchInterval } = mockUseQuery.mock.calls[0][0]
    const mockQuery = { state: { data: { densityStatus: 'processing', densityProgress: 50, coverageGaps: [] } } }
    expect(refetchInterval(mockQuery)).toBe(3000)
  })

  it('polling stops when no data (default to false)', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })
    renderHook(() => useDensity('adv-1'))

    const { refetchInterval } = mockUseQuery.mock.calls[0][0]
    const mockQuery = { state: { data: undefined } }
    expect(refetchInterval(mockQuery)).toBe(false)
  })

  it('query is disabled when adventureId is empty string', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })
    renderHook(() => useDensity(''))

    const { enabled } = mockUseQuery.mock.calls[0][0]
    expect(enabled).toBe(false)
  })

  it('uses correct query key [density, adventureId]', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isPending: false })
    renderHook(() => useDensity('adv-42'))

    const { queryKey } = mockUseQuery.mock.calls[0][0]
    expect(queryKey).toEqual(['density', 'adv-42'])
  })
})
