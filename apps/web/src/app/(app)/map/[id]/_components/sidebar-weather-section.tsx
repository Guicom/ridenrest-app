'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, CloudRain } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { WeatherControls } from './weather-controls'
import { useMapStore } from '@/stores/map.store'
import { SectionTooltip } from '@/components/shared/section-tooltip'

interface SidebarWeatherSectionProps {
  isPending: boolean
  initialDepartureTime?: string
  onPaceSubmit: (departureTime: string | null) => void
  stagesHaveDepartures?: boolean
  stagesMissingDepartureCount?: number
}

export function SidebarWeatherSection({ isPending, initialDepartureTime, onPaceSubmit, stagesHaveDepartures = false, stagesMissingDepartureCount = 0 }: SidebarWeatherSectionProps) {
  const [expanded, setExpanded] = useState(false)
  const { weatherActive, weatherDimension, setWeatherActive, setWeatherDimension } = useMapStore()

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid="weather-section-header"
      >
        <SectionTooltip content="Prévisions météo calées sur votre allure estimée. Saisissez une heure de départ et une vitesse pour des prévisions personnalisées. Si des étapes sont définies avec des heures de départ, la météo sera calculé par rapport à ces informations.">
          <div className="flex items-center gap-2">
            <CloudRain className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-medium">Météo</span>
          </div>
        </SectionTooltip>
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
            onPaceSubmit={onPaceSubmit}
            stagesHaveDepartures={stagesHaveDepartures}
            stagesMissingDepartureCount={stagesMissingDepartureCount}
          />
        </div>
      )}
    </div>
  )
}
