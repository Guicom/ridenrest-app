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
    <div className="grid grid-cols-2 gap-3">
      {LAYER_CARDS.map(({ layer, label, icon: Icon }) => {
        const isActive = visibleLayers.has(layer)
        return (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            aria-pressed={isActive}
            aria-label={`${isActive ? 'Masquer' : 'Afficher'} les ${label}`}
            className={[
              'flex flex-col items-center justify-center gap-2 rounded-2xl p-4 min-h-[80px]',
              'text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-surface-raised',
            ].join(' ')}
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
            {isPending && isActive ? (
              <Skeleton className="h-2.5 w-16" />
            ) : (
              <span>{label}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
