import { useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLiveStore } from '@/stores/live.store'
import { getWeatherForecast } from '@/lib/api-client'
import type { WeatherForecast, WeatherPoint } from '@ridenrest/shared'

const TRIGGER_THRESHOLD_KM = 5

interface UseLiveWeatherOptions {
  departureTime?: string // ISO 8601 — user-set departure time overrides auto-computation
}

export function useLiveWeather(segmentId: string | undefined, options?: UseLiveWeatherOptions) {
  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive)
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
  const speedKmh = useLiveStore((s) => s.speedKmh)
  const currentPosition = useLiveStore((s) => s.currentPosition)

  const lastFetchKmRef = useRef<number | null>(null)
  const [activeFetchKm, setActiveFetchKm] = useState<number | null>(null)

  // Update activeFetchKm when GPS moves >= 5 km
  useEffect(() => {
    if (currentKmOnRoute === null) return

    const shouldFetch =
      lastFetchKmRef.current === null ||
      Math.abs(currentKmOnRoute - lastFetchKmRef.current) >= TRIGGER_THRESHOLD_KM

    if (shouldFetch) {
      lastFetchKmRef.current = currentKmOnRoute
      setActiveFetchKm(currentKmOnRoute)
    }
  }, [currentKmOnRoute])

  // Departure time: user-set takes priority, otherwise auto-compute from speed
  const userDepartureTime = options?.departureTime
  const adjustedDepartureTime = userDepartureTime
    ? userDepartureTime
    : speedKmh > 0 && activeFetchKm !== null
      ? new Date(Date.now() - (activeFetchKm / speedKmh) * 3_600_000).toISOString()
      : undefined

  const fromKmRounded = activeFetchKm !== null ? Math.round(activeFetchKm / 5) * 5 : null

  const { data, isPending, isError } = useQuery<WeatherForecast>({
    queryKey: ['weather', 'live', { segmentId, fromKm: fromKmRounded, departureTime: userDepartureTime }],
    queryFn: () => getWeatherForecast({
      segmentId: segmentId!,
      fromKm: activeFetchKm!,
      ...(adjustedDepartureTime ? { departureTime: adjustedDepartureTime } : {}),
      ...(speedKmh > 0 ? { speedKmh } : {}),
    }),
    enabled: isLiveModeActive && activeFetchKm !== null && !!segmentId,
    staleTime: 5 * 60 * 1000,        // 5 min fresh
    placeholderData: (prev) => prev,  // TanStack Query v5 keepPreviousData equivalent
  })

  const isGpsLost = isLiveModeActive && currentPosition === null && currentKmOnRoute !== null

  const weatherPoints: WeatherPoint[] = data?.waypoints ?? []

  return { weatherPoints, isPending, isError, isGpsLost }
}
