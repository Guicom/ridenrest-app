'use client'

import type { WeatherDimension } from '@/app/(app)/map/[id]/_components/weather-layer'

const DIMENSIONS: { id: WeatherDimension; icon: string; label: string }[] = [
  { id: 'temperature', icon: '🌡', label: 'Temp' },
  { id: 'precipitation', icon: '🌧', label: 'Précip' },
  { id: 'wind', icon: '💨', label: 'Vent' },
]

const COLOR_LEGENDS: Record<WeatherDimension, { stops: { color: string; value: string }[] }> = {
  temperature: {
    stops: [
      { color: '#3b82f6', value: '0°' },
      { color: '#fbbf24', value: '15°' },
      { color: '#ef4444', value: '30°+' },
    ],
  },
  precipitation: {
    stops: [
      { color: '#86efac', value: '0%' },
      { color: '#facc15', value: '50%' },
      { color: '#1d4ed8', value: '100%' },
    ],
  },
  wind: {
    stops: [
      { color: '#d1fae5', value: '0' },
      { color: '#fb923c', value: '30' },
      { color: '#7c3aed', value: '60+' },
    ],
  },
}

interface LiveWeatherOverlayProps {
  weatherActive: boolean
  onToggle: () => void
  dimension: WeatherDimension
  onDimensionChange: (dim: WeatherDimension) => void
  isGpsLost: boolean
  departureTime: string
  onDepartureTimeChange: (value: string) => void
}

export function LiveWeatherOverlay({
  weatherActive,
  onToggle,
  dimension,
  onDimensionChange,
  isGpsLost,
  departureTime,
  onDepartureTimeChange,
}: LiveWeatherOverlayProps) {
  const legend = COLOR_LEGENDS[dimension]

  return (
    <div className="absolute top-4 right-4 z-40 flex flex-col items-end gap-2" data-testid="live-weather-overlay">
      {/* Toggle button */}
      <button
        onClick={onToggle}
        className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium backdrop-blur-sm transition-colors ${
          weatherActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-background/80 text-foreground hover:bg-background/90'
        }`}
        data-testid="weather-toggle"
        aria-pressed={weatherActive}
      >
        🌤 Météo
      </button>

      {/* Controls panel — only when active */}
      {weatherActive && (
        <div className="rounded-lg border bg-background/95 p-2 shadow-md backdrop-blur-sm w-44" data-testid="weather-controls-panel">
          {/* GPS lost banner */}
          {isGpsLost && (
            <p className="text-[10px] text-amber-500 mb-1.5" data-testid="gps-lost-banner">
              Position GPS indisponible
            </p>
          )}

          {/* Dimension selector */}
          <div className="flex gap-1 mb-2">
            {DIMENSIONS.map((dim) => (
              <button
                key={dim.id}
                onClick={() => onDimensionChange(dim.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1 rounded text-[10px] font-medium transition-colors ${
                  dimension === dim.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
                data-testid={`weather-dim-${dim.id}`}
                aria-pressed={dimension === dim.id}
              >
                <span className="text-sm leading-none">{dim.icon}</span>
                <span>{dim.label}</span>
              </button>
            ))}
          </div>

          {/* Color legend */}
          <div className="space-y-0.5 mb-2">
            <div
              className="h-1.5 rounded-full w-full"
              style={{ background: `linear-gradient(to right, ${legend.stops.map((s) => s.color).join(', ')})` }}
            />
            <div className="flex justify-between text-[9px] text-muted-foreground">
              {legend.stops.map((s) => (
                <span key={s.value}>{s.value}</span>
              ))}
            </div>
          </div>

          {/* Departure time input */}
          <div className="space-y-0.5">
            <label htmlFor="live-departure-time" className="text-[10px] text-muted-foreground">
              Heure de départ
            </label>
            <input
              id="live-departure-time"
              type="datetime-local"
              value={departureTime}
              onChange={(e) => onDepartureTimeChange(e.target.value)}
              className="h-7 w-full rounded border bg-background px-1.5 text-[11px] text-foreground"
              data-testid="weather-departure-time"
            />
          </div>
        </div>
      )}
    </div>
  )
}
