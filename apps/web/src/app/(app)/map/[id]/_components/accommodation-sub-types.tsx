'use client'
import type { PoiCategory } from '@ridenrest/shared'
import { useMapStore } from '@/stores/map.store'

const ACCOMMODATION_SUB_TYPES: { type: PoiCategory; label: string; icon: string }[] = [
  { type: 'hotel',      label: 'Hôtel',               icon: '🏨' },
  { type: 'camp_site',  label: 'Camping',              icon: '⛺' },
  { type: 'shelter',    label: 'Refuge / Abri',        icon: '🏠' },
  { type: 'hostel',     label: 'Auberge de jeunesse',  icon: '🛏️' },
  { type: 'guesthouse', label: 'Chambre d\'hôte',      icon: '🏡' },
]

export function AccommodationSubTypes() {
  const { activeAccommodationTypes, toggleAccommodationType } = useMapStore()

  return (
    <div>
      <p className="text-xs font-medium text-[--text-secondary] mb-1">Type d&apos;hébergement</p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {ACCOMMODATION_SUB_TYPES.map(({ type, label, icon }) => {
          const isActive = activeAccommodationTypes.has(type)
          return (
            <button
              key={type}
              onClick={() => toggleAccommodationType(type)}
              aria-pressed={isActive}
              className={[
                'text-xs px-2.5 py-1 rounded-full font-medium',
                isActive
                  ? 'bg-primary text-primary-foreground border border-transparent'
                  : 'bg-muted text-muted-foreground border border-[--border]',
              ].join(' ')}
            >
              {icon} {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
