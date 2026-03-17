'use client'
import { Map } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { useMapStore } from '@/stores/map.store'

const DENSITY_ITEMS = [
  { color: '#22c55e', label: 'Bonne disponibilité', detail: '2+ hébergements / 10km' },
  { color: '#f59e0b', label: 'Disponibilité limitée', detail: '1 hébergement / 10km' },
  { color: '#ef4444', label: 'Zone critique', detail: 'Aucun hébergement / 10km' },
] as const

export function DensityLegend() {
  const densityColorEnabled = useMapStore((s) => s.densityColorEnabled)

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Légende de densité"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
      >
        <Map className="h-4 w-4" />
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-64 p-3" role="region" aria-label="Légende de densité hébergements">
        <p className="mb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
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
              <span className="text-xs text-zinc-700 dark:text-zinc-300">
                <span className="font-medium">{label}</span>
                {' — '}
                {detail}
              </span>
            </li>
          ))}
        </ul>
        <Separator className="my-2" />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-zinc-500 dark:text-zinc-400">Colorisation active</span>
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
