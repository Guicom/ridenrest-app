'use client'
import { useState } from 'react'
import { Calendar, Thermometer, Umbrella, Wind, AlertTriangle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { LucideIcon } from 'lucide-react'
import type { WeatherDimension } from './weather-layer'

export const WEATHER_PACE_STORAGE_KEY = 'ridenrest:weather-pace'

interface WeatherControlsProps {
  isPending: boolean
  onPaceSubmit: (departureTime: string | null) => void
  dimension: WeatherDimension
  onDimensionChange: (dim: WeatherDimension) => void
  initialDepartureTime?: string
  stagesHaveDepartures?: boolean
  stagesMissingDepartureCount?: number
}

const DIMENSIONS: { id: WeatherDimension; label: string; icon: LucideIcon }[] = [
  { id: 'temperature', label: 'Temp.',  icon: Thermometer },
  { id: 'precipitation', label: 'Pluie', icon: Umbrella },
  { id: 'wind', label: 'Vent',          icon: Wind },
]


export function WeatherControls({ isPending, onPaceSubmit, dimension, onDimensionChange, initialDepartureTime = '', stagesHaveDepartures = false, stagesMissingDepartureCount = 0 }: WeatherControlsProps) {
  const [departureTime, setDepartureTime] = useState(initialDepartureTime)

  const submitPace = (dt: string) => {
    try { localStorage.setItem(WEATHER_PACE_STORAGE_KEY, JSON.stringify({ departureTime: dt })) } catch { /* ignore */ }
    onPaceSubmit(dt ? new Date(dt).toISOString() : null)
  }

  return (
    <div className="space-y-4">
      {/* Segmented control */}
      <div className="flex p-1 bg-muted rounded-full">
        {DIMENSIONS.map((dim) => {
          const Icon = dim.icon
          const active = dimension === dim.id
          return (
            <button
              key={dim.id}
              data-testid={`weather-dim-${dim.id}`}
              onClick={() => onDimensionChange(dim.id)}
              aria-pressed={active}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-full transition-colors',
                active ? 'bg-background text-primary shadow-sm' : 'text-muted-foreground',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {dim.label}
            </button>
          )
        })}
      </div>

      {/* Departure date/time — hidden when stages have their own departure times */}
      {stagesHaveDepartures ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
            <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">Dates définies par étape</span>
          </div>
          {stagesMissingDepartureCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 rounded-xl text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-xs">{stagesMissingDepartureCount} étape{stagesMissingDepartureCount > 1 ? 's' : ''} sans date de départ</span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
          <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            id="departure-time"
            type="datetime-local"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            onBlur={(e) => submitPace(e.target.value)}
            className="bg-transparent text-sm text-foreground w-full outline-none"
          />
        </div>
      )}

      {isPending && <Skeleton className="h-2 w-full" data-testid="weather-submit" />}
    </div>
  )
}

