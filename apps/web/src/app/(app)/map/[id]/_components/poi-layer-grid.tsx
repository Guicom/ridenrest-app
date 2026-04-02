'use client'
import { BedDouble, Utensils, ShoppingBasket, Bike } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useMapStore } from '@/stores/map.store'
import { Skeleton } from '@/components/ui/skeleton'
import { POI_LAYER_COLORS } from '@ridenrest/shared'
import type { MapLayer } from '@ridenrest/shared'

interface LayerCardConfig {
  layer: MapLayer
  label: string
  icon: LucideIcon
  color: string
}

const LAYER_CARDS: LayerCardConfig[] = [
  { layer: 'accommodations', label: 'Hébergements', icon: BedDouble,      color: POI_LAYER_COLORS.accommodations },
  { layer: 'restaurants',    label: 'Restauration',  icon: Utensils,       color: POI_LAYER_COLORS.restaurants },
  { layer: 'supplies',       label: 'Alimentation',  icon: ShoppingBasket, color: POI_LAYER_COLORS.supplies },
  { layer: 'bike',           label: 'Vélo',          icon: Bike,           color: POI_LAYER_COLORS.bike },
]

interface PoiLayerGridProps {
  isPending: boolean
}

export function PoiLayerGrid({ isPending }: PoiLayerGridProps) {
  const { visibleLayers, toggleLayer } = useMapStore()

  return (
    <div className="flex gap-2">
      {LAYER_CARDS.map(({ layer, label, icon: Icon, color }) => {
        const isActive = visibleLayers.has(layer)
        return (
          <button
            key={layer}
            onClick={() => toggleLayer(layer)}
            aria-pressed={isActive}
            aria-label={`${isActive ? 'Masquer' : 'Afficher'} les ${label}`}
            style={isActive ? { backgroundColor: color, color: '#ffffff', borderColor: 'transparent' } : undefined}
            className={[
              'flex-1 flex items-center justify-center rounded-xl p-3 transition-all duration-75 cursor-pointer active:scale-[0.95]',
              isActive ? '' : 'bg-white text-foreground border border-[--border] hover:bg-surface-raised',
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
