'use client'
import { useState } from 'react'
import { ChevronDown, ChevronUp, LayoutGrid } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useMapStore } from '@/stores/map.store'

function LegendItem({ color, label, detail }: { color: string; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-full shrink-0"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-xs font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">— {detail}</span>
    </div>
  )
}

export function SidebarDensitySection() {
  const [expanded, setExpanded] = useState(true)
  const { densityColorEnabled, toggleDensityColor } = useMapStore()

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid="density-section-header"
      >
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5" aria-hidden="true" />
          <span className="text-sm font-medium">Densité</span>
        </div>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>
      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Afficher sur la carte</span>
            <Switch
              checked={densityColorEnabled}
              onCheckedChange={toggleDensityColor}
              aria-label="Afficher la densité"
              data-testid="density-toggle"
            />
          </div>
          {/* Legend */}
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-[--text-secondary] uppercase tracking-wide mb-1">
              Densité hébergements / 10 km
            </p>
            <LegendItem color="var(--density-high)"   label="Bonne disponibilité"   detail="2+ hébergements / 10km" />
            <LegendItem color="var(--density-medium)" label="Disponibilité limitée" detail="1 hébergement / 10km" />
            <LegendItem color="var(--density-low)"    label="Zone critique"          detail="Aucun hébergement / 10km" />
          </div>
        </div>
      )}
    </div>
  )
}
