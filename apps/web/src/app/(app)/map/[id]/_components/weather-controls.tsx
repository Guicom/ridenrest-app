'use client'
import { useState } from 'react'
import { Calendar, Thermometer, Umbrella, Wind } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import type { LucideIcon } from 'lucide-react'
import type { WeatherDimension } from './weather-layer'

export const WEATHER_PACE_STORAGE_KEY = 'ridenrest:weather-pace'

interface WeatherControlsProps {
  isPending: boolean
  onPaceSubmit: (departureTime: string | null, speedKmh: number | null) => void
  dimension: WeatherDimension
  onDimensionChange: (dim: WeatherDimension) => void
  initialDepartureTime?: string
  initialSpeedKmh?: string
}

const DIMENSIONS: { id: WeatherDimension; label: string; icon: LucideIcon }[] = [
  { id: 'temperature', label: 'Temp.',  icon: Thermometer },
  { id: 'precipitation', label: 'Pluie', icon: Umbrella },
  { id: 'wind', label: 'Vent',          icon: Wind },
]

const COLOR_LEGENDS: Record<WeatherDimension, { label: string; stops: { color: string; value: string }[] }> = {
  temperature: {
    label: '°C',
    stops: [
      { color: '#3b82f6', value: '0°' },
      { color: '#fbbf24', value: '15°' },
      { color: '#ef4444', value: '30°+' },
    ],
  },
  precipitation: {
    label: '%',
    stops: [
      { color: '#86efac', value: '0%' },
      { color: '#facc15', value: '50%' },
      { color: '#1d4ed8', value: '100%' },
    ],
  },
  wind: {
    label: 'km/h',
    stops: [
      { color: '#d1fae5', value: '0' },
      { color: '#fb923c', value: '30' },
      { color: '#7c3aed', value: '60+' },
    ],
  },
}

export function WeatherControls({ isPending, onPaceSubmit, dimension, onDimensionChange, initialDepartureTime = '', initialSpeedKmh = '' }: WeatherControlsProps) {
  const [departureTime, setDepartureTime] = useState(initialDepartureTime)
  const [speedKmh, setSpeedKmh] = useState(initialSpeedKmh)

  const submitPace = (dt: string, sp: string) => {
    try { localStorage.setItem(WEATHER_PACE_STORAGE_KEY, JSON.stringify({ departureTime: dt, speedKmh: sp })) } catch { /* ignore */ }
    onPaceSubmit(
      dt ? new Date(dt).toISOString() : null,
      sp ? Number(sp) : null,
    )
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

      {/* Departure date/time */}
      <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
        <Calendar className="h-5 w-5 text-muted-foreground shrink-0" />
        <input
          id="departure-time"
          type="datetime-local"
          value={departureTime}
          onChange={(e) => setDepartureTime(e.target.value)}
          onBlur={(e) => submitPace(e.target.value, speedKmh)}
          className="bg-transparent text-sm text-foreground w-full outline-none"
        />
      </div>

      {/* Speed — même style que le champ date */}
      <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
        <span className="text-sm text-muted-foreground shrink-0">Vitesse moyenne</span>
        <input
          id="speed"
          type="number"
          min="1"
          max="100"
          placeholder="20"
          value={speedKmh}
          onChange={(e) => setSpeedKmh(e.target.value)}
          onBlur={(e) => submitPace(departureTime, e.target.value)}
          className="bg-transparent text-sm text-foreground w-full outline-none text-right"
        />
        <span className="text-muted-foreground text-sm shrink-0">km/h</span>
      </div>

      {isPending && <Skeleton className="h-2 w-full" data-testid="weather-submit" />}
    </div>
  )
}

function ColorLegend({ stops, label }: { stops: { color: string; value: string }[]; label: string }) {
  const gradient = `linear-gradient(to right, ${stops.map((s) => s.color).join(', ')})`

  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full w-full" style={{ background: gradient }} />
      <div className="flex justify-between text-[10px] text-muted-foreground">
        {stops.map((s) => (
          <span key={s.value}>{s.value}</span>
        ))}
      </div>
      <div className="text-center text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
