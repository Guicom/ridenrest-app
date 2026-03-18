'use client'
import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
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

const DIMENSIONS: { id: WeatherDimension; label: string; icon: string }[] = [
  { id: 'temperature', label: 'Température', icon: '🌡' },
  { id: 'precipitation', label: 'Précip', icon: '🌧' },
  { id: 'wind', label: 'Vent', icon: '💨' },
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    try { localStorage.setItem(WEATHER_PACE_STORAGE_KEY, JSON.stringify({ departureTime, speedKmh })) } catch { /* ignore */ }
    const parsedSpeed = speedKmh ? Number(speedKmh) : null
    const parsedTime = departureTime ? new Date(departureTime).toISOString() : null
    onPaceSubmit(parsedTime, parsedSpeed)
  }

  const legend = COLOR_LEGENDS[dimension]

  return (
    <div className="bg-background/95 backdrop-blur-sm border rounded-lg p-3 shadow-md w-64 space-y-3">
      {/* Dimension selector */}
      <div className="flex gap-1">
        {DIMENSIONS.map((dim) => (
          <button
            key={dim.id}
            data-testid={`weather-dim-${dim.id}`}
            onClick={() => onDimensionChange(dim.id)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 rounded text-xs font-medium transition-colors ${
              dimension === dim.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            aria-pressed={dimension === dim.id}
          >
            <span className="text-base leading-none">{dim.icon}</span>
            <span>{dim.label}</span>
          </button>
        ))}
      </div>

      {/* Color legend */}
      <ColorLegend stops={legend.stops} label={legend.label} />

      {/* Pace form */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="departure-time" className="text-xs text-muted-foreground">
            Départ
          </label>
          <input
            id="departure-time"
            type="datetime-local"
            value={departureTime}
            onChange={(e) => setDepartureTime(e.target.value)}
            className="h-8 px-2 text-xs rounded border bg-background text-foreground w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="speed" className="text-xs text-muted-foreground">
            Vitesse (km/h)
          </label>
          <input
            id="speed"
            type="number"
            min="1"
            max="100"
            placeholder="15"
            value={speedKmh}
            onChange={(e) => setSpeedKmh(e.target.value)}
            className="h-8 px-2 text-xs rounded border bg-background text-foreground w-full"
          />
        </div>
        <button
          type="submit"
          data-testid="weather-submit"
          disabled={isPending}
          className="w-full h-8 text-xs font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Chargement…' : 'Mettre à jour'}
        </button>
      </form>

      {isPending && <Skeleton className="h-2 w-full" />}
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
