'use client'

import { Skeleton } from '@/components/ui/skeleton'
import type { WeatherPoint } from '@ridenrest/shared'

interface LiveWeatherPanelProps {
  weatherPoints: WeatherPoint[]
  isPending: boolean
  isError: boolean
  isGpsLost: boolean
}

function formatRelativeEta(forecastAt: string): string {
  const diffMs = new Date(forecastAt).getTime() - Date.now()
  if (diffMs <= 0) return 'maintenant'
  const totalMinutes = Math.round(diffMs / 60000)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `dans ~${h}h${String(m).padStart(2, '0')}` : `dans ~${m}min`
}

export function LiveWeatherPanel({ weatherPoints, isPending, isError, isGpsLost }: LiveWeatherPanelProps) {
  const hasData = weatherPoints.length > 0
  const showSkeleton = isPending && !hasData
  const showError = isError && !hasData

  return (
    <div data-testid="live-weather-panel">
      {isGpsLost && (
        <p className="text-xs text-amber-500 mb-1" data-testid="gps-lost-banner">
          Position GPS indisponible
        </p>
      )}

      {showError && (
        <p className="text-xs text-muted-foreground" data-testid="weather-error">
          Météo non disponible
        </p>
      )}

      {showSkeleton && (
        <div className="flex gap-2 overflow-x-auto" data-testid="weather-skeleton">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-28 shrink-0 rounded-lg" />
          ))}
        </div>
      )}

      {!showSkeleton && !showError && hasData && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {weatherPoints.slice(0, 5).map((wp, i) => (
            <div
              key={i}
              className="flex shrink-0 flex-col items-center rounded-lg border bg-card p-2 text-xs"
              data-testid="weather-card"
            >
              <span className="text-sm">
                {wp.iconEmoji ?? '—'} {formatRelativeEta(wp.forecastAt)}
              </span>
              <span>
                {wp.temperatureC !== null ? `${wp.temperatureC}°C` : '—'}
              </span>
              <span>
                💨 {wp.windSpeedKmh ?? '—'} km/h
              </span>
              <span>
                🌧 {wp.precipitationProbability ?? '—'}%
              </span>
              <span className="text-muted-foreground">
                km {Math.round(wp.km)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
