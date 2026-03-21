'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, CloudRain } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { WeatherControls } from './weather-controls'
import { useMapStore } from '@/stores/map.store'

interface SidebarWeatherSectionProps {
  isPending: boolean
  initialDepartureTime?: string
  initialSpeedKmh?: string
  onPaceSubmit: (departureTime: string | null, speedKmh: number | null) => void
}

export function SidebarWeatherSection({ isPending, initialDepartureTime, initialSpeedKmh, onPaceSubmit }: SidebarWeatherSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const { weatherActive, weatherDimension, setWeatherActive, setWeatherDimension } = useMapStore()

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid="weather-section-header"
      >
        <div className="flex items-center gap-2">
          <CloudRain className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">Météo</span>
        </div>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Afficher sur la carte</span>
            <Switch
              checked={weatherActive}
              onCheckedChange={setWeatherActive}
              aria-label="Activer la météo"
              data-testid="weather-toggle"
            />
          </div>
          <WeatherControls
            isPending={isPending}
            dimension={weatherDimension}
            onDimensionChange={setWeatherDimension}
            initialDepartureTime={initialDepartureTime}
            initialSpeedKmh={initialSpeedKmh}
            onPaceSubmit={onPaceSubmit}
          />
        </div>
      )}
    </div>
  )
}
