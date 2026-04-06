'use client'
import { Skeleton } from '@/components/ui/skeleton'
import { useStageWeather } from '@/hooks/use-stage-weather'

interface StageWeatherBadgeProps {
  stageId: string
  stageDepartureTime?: string | null  // per-stage departure time (priority)
  departureTime: string | undefined   // global departure time (fallback)
  speedKmh: number | undefined
}

export function StageWeatherBadge({ stageId, stageDepartureTime, departureTime, speedKmh }: StageWeatherBadgeProps) {
  // Priority: stage departure time > global departure time
  const effectiveDepartureTime = stageDepartureTime ?? departureTime
  const { data, isPending, isError } = useStageWeather(stageId, effectiveDepartureTime, speedKmh, true)

  if (isPending) return <Skeleton className="h-4 w-20" />
  if (isError || data === null || data === undefined) return null

  return (
    <span className="text-xs text-muted-foreground whitespace-nowrap">
      {data.iconEmoji} {data.temperatureC}°
      {' · '}
      {data.windSpeedKmh} km/h
      {data.precipitationMmH > 0.5 ? ' 🌧' : ''}
    </span>
  )
}
