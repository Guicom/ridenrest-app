'use client'
import type { Poi, PoiCategory } from '@ridenrest/shared'
import { POI_CATEGORY_COLORS } from '@ridenrest/shared'
import { useMapStore } from '@/stores/map.store'

export const RESTAURANT_SUB_TYPES: { type: PoiCategory; label: string; color: string }[] = [
  { type: 'restaurant',  label: 'Restaurant',       color: POI_CATEGORY_COLORS.restaurant },
  { type: 'cafe_bar',    label: 'Caf\u00e9 / Bar',  color: POI_CATEGORY_COLORS.cafe_bar },
  { type: 'gas_station', label: 'Station-service',  color: POI_CATEGORY_COLORS.gas_station },
]

export function computeRestCountByType(pois?: Poi[]): Record<string, number> | null {
  if (!pois || pois.length === 0) return null
  return pois.reduce<Record<string, number>>((acc, poi) => {
    acc[poi.category] = (acc[poi.category] ?? 0) + 1
    return acc
  }, {})
}

interface RestaurantSubTypesProps {
  restaurantPois?: Poi[]
  /** When true, count badge is only shown for active types (use in live mode where inactive types aren't searched) */
  onlyCountActive?: boolean
}

export function RestaurantSubTypes({ restaurantPois, onlyCountActive = false }: RestaurantSubTypesProps) {
  const { activeRestaurantTypes, toggleRestaurantType } = useMapStore()

  const countByType = computeRestCountByType(restaurantPois)

  return (
    <div>
      <p className="text-sm font-semibold text-foreground mb-2">Type de restauration</p>
      <div className="flex flex-wrap gap-2">
        {RESTAURANT_SUB_TYPES.map(({ type, label, color }) => {
          const isActive = activeRestaurantTypes.has(type)
          const rawCount = countByType ? (countByType[type] ?? 0) : null
          const count = onlyCountActive
            ? (isActive && rawCount !== null && rawCount > 0 ? rawCount : null)
            : rawCount
          const hasZeroResults = count !== null && count === 0
          return (
            <button
              key={type}
              onClick={() => toggleRestaurantType(type)}
              aria-pressed={isActive}
              style={isActive
                ? { backgroundColor: color, color: '#ffffff', borderColor: 'transparent' }
                : undefined}
              className={[
                'text-sm px-3 py-1.5 rounded-full font-medium flex items-center gap-2 border transition-all duration-75 cursor-pointer active:scale-[0.95]',
                hasZeroResults
                  ? 'bg-white text-muted-foreground border-[--border] opacity-50'
                  : isActive
                    ? 'border-transparent hover:brightness-90'
                    : 'bg-white text-foreground border-[--border] hover:border-[--border-strong]',
              ].join(' ')}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: isActive ? '#ffffff' : (hasZeroResults ? '#9CA3AF' : color) }}
                aria-hidden="true"
              />
              {label}{count !== null ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
