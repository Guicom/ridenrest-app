'use client'
import { useMapStore } from '@/stores/map.store'
import { Skeleton } from '@/components/ui/skeleton'
import type { MapLayer } from '@ridenrest/shared'

interface LayerConfig {
  layer: MapLayer
  label: string
  icon: string
}

const LAYER_CONFIGS: LayerConfig[] = [
  { layer: 'accommodations', label: 'Hébergements', icon: '🏨' },
  { layer: 'restaurants',    label: 'Restauration',  icon: '🍽️' },
  { layer: 'supplies',       label: 'Alimentation',  icon: '🛒' },
  { layer: 'bike',           label: 'Vélo',          icon: '🚲' },
]

interface LayerTogglesProps {
  isPending: boolean
  weatherActive?: boolean
  onWeatherToggle?: () => void
  densityActive?: boolean
  onDensityToggle?: () => void
}

export function LayerToggles({ isPending, weatherActive, onWeatherToggle, densityActive, onDensityToggle }: LayerTogglesProps) {
  const { visibleLayers, toggleLayer } = useMapStore()

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-xl shadow-md">
      {LAYER_CONFIGS.map(({ layer, label, icon }) => {
        const isActive = visibleLayers.has(layer)
        return (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            className={[
              'min-w-[48px] min-h-[48px]',
              'flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2',
              'text-xs font-medium transition-colors',
              'border border-transparent',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:border-[--border]',
            ].join(' ')}
            aria-label={`${isActive ? 'Masquer' : 'Afficher'} les ${label}`}
            aria-pressed={isActive}
          >
            <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
            {isPending && isActive ? (
              <Skeleton className="h-2 w-12 mt-0.5" />
            ) : (
              <span className="truncate">{label}</span>
            )}
          </button>
        )
      })}

      {onWeatherToggle !== undefined && (
        <button
          onClick={onWeatherToggle}
          className={[
            'min-w-[48px] min-h-[48px]',
            'flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2',
            'text-xs font-medium transition-colors',
            'border border-transparent',
            weatherActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:border-[--border]',
          ].join(' ')}
          aria-label={`${weatherActive ? 'Désactiver' : 'Activer'} la Météo`}
          aria-pressed={!!weatherActive}
        >
          <span className="text-lg leading-none" aria-hidden="true">🌤️</span>
          <span className="truncate">Météo</span>
        </button>
      )}

      {onDensityToggle !== undefined && (
        <button
          onClick={onDensityToggle}
          className={[
            'min-w-[48px] min-h-[48px]',
            'flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2',
            'text-xs font-medium transition-colors',
            'border border-transparent',
            densityActive
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:border-[--border]',
          ].join(' ')}
          aria-label={`${densityActive ? 'Désactiver' : 'Activer'} la Densité`}
          aria-pressed={!!densityActive}
        >
          <span className="text-lg leading-none" aria-hidden="true">📊</span>
          <span className="truncate">Densité</span>
        </button>
      )}
    </div>
  )
}
