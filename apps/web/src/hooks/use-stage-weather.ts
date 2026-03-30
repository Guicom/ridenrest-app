import { useQuery } from '@tanstack/react-query'
import { getStageWeather } from '@/lib/api-client'
import type { StageWeatherPoint } from '@ridenrest/shared'

export function useStageWeather(
  stageId: string,
  departureTime: string | undefined,
  speedKmh: number | undefined,
  enabled: boolean,
) {
  return useQuery<StageWeatherPoint | null>({
    queryKey: ['stages', stageId, 'weather', { departureTime, speedKmh }],
    queryFn: () => getStageWeather({ stageId, departureTime, speedKmh }),
    enabled: enabled && !!stageId,
    staleTime: 5 * 60 * 1000,  // 5 minutes — weather doesn't change that fast
  })
}
