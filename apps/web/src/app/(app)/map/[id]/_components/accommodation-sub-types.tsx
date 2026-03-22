'use client'
import type { Poi, PoiCategory } from '@ridenrest/shared'
import { useMapStore } from '@/stores/map.store'

export const ACCOMMODATION_SUB_TYPES: { type: PoiCategory; label: string; icon: string }[] = [
  { type: 'hotel',      label: 'Hôtel',               icon: '🏨' },
  { type: 'camp_site',  label: 'Camping',              icon: '⛺' },
  { type: 'shelter',    label: 'Refuge / Abri',        icon: '🏠' },
  { type: 'hostel',     label: 'Auberge de jeunesse',  icon: '🛏️' },
  { type: 'guesthouse', label: 'Chambre d\'hôte',      icon: '🏡' },
]

export function computeAccCountByType(pois?: Poi[]): Record<string, number> | null {
  if (!pois) return null
  return pois.reduce<Record<string, number>>((acc, poi) => {
    acc[poi.category] = (acc[poi.category] ?? 0) + 1
    return acc
  }, {})
}

interface AccommodationSubTypesProps {
  accommodationPois?: Poi[]
}

export function AccommodationSubTypes({ accommodationPois }: AccommodationSubTypesProps) {
  const { activeAccommodationTypes, toggleAccommodationType } = useMapStore()

  // Count POIs per sub-type — null when no data provided (no badge)
  const countByType = computeAccCountByType(accommodationPois)

  return (
    <div>
      <p className="text-xs font-medium text-[--text-secondary] mb-1">Type d&apos;hébergement</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {ACCOMMODATION_SUB_TYPES.map(({ type, label, icon }) => {
          const isActive = activeAccommodationTypes.has(type)
          const count = countByType ? (countByType[type] ?? 0) : null
          const hasZeroResults = count !== null && count === 0
          return (
            <button
              key={type}
              onClick={() => toggleAccommodationType(type)}
              aria-pressed={isActive}
              className={[
                'text-xs px-2.5 py-1 rounded-full font-medium',
                hasZeroResults
                  ? 'bg-muted text-muted-foreground border border-[--border] opacity-60'
                  : isActive
                    ? 'bg-primary text-primary-foreground border border-transparent'
                    : 'bg-muted text-muted-foreground border border-[--border]',
              ].join(' ')}
            >
              {icon} {label}{count !== null ? ` (${count})` : ''}
            </button>
          )
        })}
      </div>
    </div>
  )
}
