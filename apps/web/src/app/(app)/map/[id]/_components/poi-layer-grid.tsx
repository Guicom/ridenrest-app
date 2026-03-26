'use client'
import { BedDouble, Utensils, ShoppingBasket, Bike } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMapStore } from '@/stores/map.store'
import { Skeleton } from '@/components/ui/skeleton'
import type { MapLayer } from '@ridenrest/shared'

interface LayerCardConfig {
  layer: MapLayer
  label: string
  icon: LucideIcon
}

const LAYER_CARDS: LayerCardConfig[] = [
  { layer: 'accommodations', label: 'Hébergements', icon: BedDouble },
  { layer: 'restaurants',    label: 'Restauration',  icon: Utensils },
  { layer: 'supplies',       label: 'Alimentation',  icon: ShoppingBasket },
  { layer: 'bike',           label: 'Vélo',          icon: Bike },
]

interface PoiLayerGridProps {
  isPending: boolean
}

export function PoiLayerGrid({ isPending }: PoiLayerGridProps) {
  const { visibleLayers, toggleLayer } = useMapStore()

  return (
    <div className="flex gap-2">
      {LAYER_CARDS.map(({ layer, label, icon: Icon }) => {
        const isActive = visibleLayers.has(layer)
        return (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            aria-pressed={isActive}
            aria-label={`${isActive ? 'Masquer' : 'Afficher'} les ${label}`}
            className={[
              'flex-1 flex items-center justify-center rounded-xl p-3',
              'transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-white text-foreground border border-[--border] hover:bg-surface-raised',
            ].join(' ')}
          >
            {isPending && isActive
              ? <Skeleton className="h-5 w-5 rounded" />
              : <Icon className="h-5 w-5" aria-hidden="true" />
            }
          </button>
        )
      })}
    </div>
  )
}
