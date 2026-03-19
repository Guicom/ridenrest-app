'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { useLiveStore } from '@/stores/live.store'

export function LiveControls() {
  const [expanded, setExpanded] = useState(true)

  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const speedKmh = useLiveStore((s) => s.speedKmh)
  const setTargetAheadKm = useLiveStore((s) => s.setTargetAheadKm)
  const setSearchRadius = useLiveStore((s) => s.setSearchRadius)
  const setSpeedKmh = useLiveStore((s) => s.setSpeedKmh)

  const distanceToTarget = targetAheadKm
  const etaSummary = formatEtaSummary(distanceToTarget, speedKmh)

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30" data-testid="live-controls">
      {/* Toggle button */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="mx-auto flex items-center gap-2 rounded-t-lg bg-background/90 px-4 py-2 text-sm font-medium backdrop-blur-sm"
        aria-label={expanded ? 'Replier les contrôles' : 'Déplier les contrôles'}
        data-testid="live-controls-toggle"
      >
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        <span>Arrêt dans {targetAheadKm} km {etaSummary}</span>
      </button>

      {expanded && (
        <div className="bg-background/95 px-4 pb-4 pt-2 backdrop-blur-sm">
          {/* Distance cible slider */}
          <div className="mb-3 flex items-center gap-3">
            <label className="w-28 shrink-0 text-xs text-muted-foreground">Distance cible</label>
            <Slider
              value={[targetAheadKm]}
              onValueChange={(v: number | readonly number[]) => {
                const val = typeof v === 'number' ? v : v[0]
                setTargetAheadKm(val)
              }}
              min={5}
              max={100}
              step={5}
              data-testid="slider-target"
            />
            <span className="w-14 shrink-0 text-right text-xs font-medium">{targetAheadKm} km</span>
          </div>

          {/* Rayon de recherche slider */}
          <div className="mb-3 flex items-center gap-3">
            <label className="w-28 shrink-0 text-xs text-muted-foreground">Rayon</label>
            <Slider
              value={[searchRadiusKm]}
              onValueChange={(v: number | readonly number[]) => {
                const val = typeof v === 'number' ? v : v[0]
                setSearchRadius(val)
              }}
              min={1}
              max={5}
              step={1}
              data-testid="slider-radius"
            />
            <span className="w-14 shrink-0 text-right text-xs font-medium">{searchRadiusKm} km</span>
          </div>

          {/* Speed input */}
          <div className="flex items-center gap-3">
            <label className="w-28 shrink-0 text-xs text-muted-foreground">Allure</label>
            <input
              type="number"
              min={5}
              max={50}
              value={speedKmh}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 5 && v <= 50) setSpeedKmh(v)
              }}
              className="h-8 w-16 rounded border bg-background px-2 text-sm"
              data-testid="input-speed"
            />
            <span className="text-xs text-muted-foreground">km/h</span>
          </div>
        </div>
      )}
    </div>
  )
}

function formatEtaSummary(distanceKm: number, speedKmh: number): string {
  if (speedKmh <= 0) return ''
  const totalMinutes = Math.round((distanceKm / speedKmh) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `(~${h}h${String(m).padStart(2, '0')})` : `(~${m}min)`
}
