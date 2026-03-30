import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useStageWeather } from './use-stage-weather'

const mockUseQuery = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

vi.mock('@/lib/api-client', () => ({
  getStageWeather: vi.fn(),
}))

const SAMPLE_WEATHER = {
  forecastAt: '2026-03-22T12:00:00.000Z',
  temperatureC: 14,
  precipitationMmH: 0.2,
  windSpeedKmh: 12,
  windDirectionDeg: 270,
  iconEmoji: '⛅',
}

describe('useStageWeather', () => {
  beforeEach(() => {
    mockUseQuery.mockReset()
  })

  it('uses correct query key with stageId, departureTime, speedKmh', () => {
    mockUseQuery.mockReturnValue({ data: null, isPending: false, isError: false })

    renderHook(() => useStageWeather('stage-1', '2026-03-22T08:00:00.000Z', 15, true))

    const [options] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }]
    expect(options.queryKey).toEqual([
      'stages',
      'stage-1',
      'weather',
      { departureTime: '2026-03-22T08:00:00.000Z', speedKmh: 15 },
    ])
  })

  it('query key includes undefined values when not provided', () => {
    mockUseQuery.mockReturnValue({ data: null, isPending: false, isError: false })

    renderHook(() => useStageWeather('stage-1', undefined, undefined, true))

    const [options] = mockUseQuery.mock.calls[0] as [{ queryKey: unknown[] }]
    expect(options.queryKey).toEqual([
      'stages',
      'stage-1',
      'weather',
      { departureTime: undefined, speedKmh: undefined },
    ])
  })

  it('enabled=false prevents fetch', () => {
    mockUseQuery.mockReturnValue({ data: null, isPending: false, isError: false })

    renderHook(() => useStageWeather('stage-1', undefined, undefined, false))

    const [options] = mockUseQuery.mock.calls[0] as [{ enabled: boolean }]
    expect(options.enabled).toBe(false)
  })

  it('enabled=true with stageId enables fetch', () => {
    mockUseQuery.mockReturnValue({ data: null, isPending: false, isError: false })

    renderHook(() => useStageWeather('stage-1', undefined, undefined, true))

    const [options] = mockUseQuery.mock.calls[0] as [{ enabled: boolean }]
    expect(options.enabled).toBe(true)
  })

  it('returns WeatherPoint data when query succeeds', () => {
    mockUseQuery.mockReturnValue({ data: SAMPLE_WEATHER, isPending: false, isError: false })

    const { result } = renderHook(() => useStageWeather('stage-1', undefined, undefined, true))

    expect(result.current.data).toEqual(SAMPLE_WEATHER)
    expect(result.current.isPending).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('staleTime is 5 minutes', () => {
    mockUseQuery.mockReturnValue({ data: null, isPending: false, isError: false })

    renderHook(() => useStageWeather('stage-1', undefined, undefined, true))

    const [options] = mockUseQuery.mock.calls[0] as [{ staleTime: number }]
    expect(options.staleTime).toBe(5 * 60 * 1000)
  })
})
