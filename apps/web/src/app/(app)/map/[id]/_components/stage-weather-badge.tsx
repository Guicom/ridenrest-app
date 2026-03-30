'use client'
import { Skeleton } from '@/components/ui/skeleton'
import { useStageWeather } from '@/hooks/use-stage-weather'

interface StageWeatherBadgeProps {
  stageId: string
  departureTime: string | undefined
  speedKmh: number | undefined
}

export function StageWeatherBadge({ stageId, departureTime, speedKmh }: StageWeatherBadgeProps) {
  const { data, isPending, isError } = useStageWeather(stageId, departureTime, speedKmh, true)

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
