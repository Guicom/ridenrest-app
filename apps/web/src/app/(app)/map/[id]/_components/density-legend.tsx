'use client'
import { Map } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useMapStore } from '@/stores/map.store'

const DENSITY_ITEMS = [
  { color: 'var(--density-high)', label: 'Bonne disponibilité', detail: '2+ hébergements / 10km' },
  { color: 'var(--density-medium)', label: 'Disponibilité limitée', detail: '1 hébergement / 10km' },
  { color: 'var(--density-low)', label: 'Zone critique', detail: 'Aucun hébergement / 10km' },
]

export function DensityLegend() {
  const densityColorEnabled = useMapStore((s) => s.densityColorEnabled)

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Légende de densité"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-background shadow-md border border-border"
      >
        <Map className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 p-3" role="region" aria-label="Légende de densité hébergements">
        <p className="mb-2 text-xs font-semibold text-text-muted">
          Densité hébergements / 10 km
        </p>
        <ul className="space-y-1.5">
          {DENSITY_ITEMS.map(({ color, label, detail }) => (
            <li key={color} className="flex items-center gap-2">
              <div
                className="h-3 w-3 flex-shrink-0 rounded-full"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <span className="text-xs text-text-secondary">
                <span className="font-medium">{label}</span>
                {' — '}
                {detail}
              </span>
            </li>
          ))}
        </ul>
        <Separator className="my-2" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-text-muted">Colorisation active</span>
          <Switch
            checked={densityColorEnabled}
            onCheckedChange={() => useMapStore.getState().toggleDensityColor()}
            aria-label="Activer/désactiver la colorisation de densité"
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}
