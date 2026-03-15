'use client'
import { useMapStore } from '@/stores/map.store'
import { Skeleton } from '@/components/ui/skeleton'
import type { MapLayer } from '@ridenrest/shared'

interface LayerConfig {
  layer: MapLayer
  label: string
  icon: string
  activeColor: string  // Tailwind bg color class for active state
}

const LAYER_CONFIGS: LayerConfig[] = [
  { layer: 'accommodations', label: 'Hébergements', icon: '🏨', activeColor: 'bg-blue-500 text-white' },
  { layer: 'restaurants',    label: 'Restauration',  icon: '🍽️', activeColor: 'bg-red-500 text-white' },
  { layer: 'supplies',       label: 'Alimentation',  icon: '🛒', activeColor: 'bg-green-500 text-white' },
  { layer: 'bike',           label: 'Vélo',          icon: '🚲', activeColor: 'bg-amber-500 text-white' },
]

interface LayerTogglesProps {
  isPending: boolean
}

export function LayerToggles({ isPending }: LayerTogglesProps) {
  const { visibleLayers, toggleLayer } = useMapStore()

  return (
    <div className="flex gap-2 p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-xl shadow-md">
      {LAYER_CONFIGS.map(({ layer, label, icon, activeColor }) => {
        const isActive = visibleLayers.has(layer)
        return (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            className={[
              // Minimum 48×48px touch target (AC #2)
              'min-w-[48px] min-h-[48px]',
              'flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2',
              'text-xs font-medium transition-colors',
              'border border-transparent',
              isActive
                ? activeColor
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300',
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
    </div>
  )
}
