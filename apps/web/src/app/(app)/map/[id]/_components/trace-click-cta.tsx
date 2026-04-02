'use client'
import { MapPin } from 'lucide-react'
import { useMapStore } from '@/stores/map.store'

export function TraceClickCta() {
  const { traceClickedKm, setTraceClickedKm, setSearchRange, fromKm, toKm } = useMapStore()

  if (traceClickedKm === null) return null

  return (
    <div
      className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30
        flex items-center gap-3 px-4 py-2.5
        bg-white dark:bg-neutral-900 rounded-xl shadow-lg border border-[--border]
        text-sm text-foreground"
    >
      <span className="flex items-center gap-1 text-muted-foreground font-mono">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        Km {traceClickedKm.toFixed(1)}
      </span>
      <button
        type="button"
        className="font-medium text-primary hover:underline cursor-pointer transition-all duration-75 active:scale-[0.95]"
        onClick={() => {
          const rangeWidth = toKm - fromKm
          setSearchRange(traceClickedKm, traceClickedKm + rangeWidth)
          setTraceClickedKm(null)
        }}
      >
        Rechercher ici
      </button>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground ml-1 cursor-pointer transition-all duration-75 active:scale-[0.85]"
        onClick={() => setTraceClickedKm(null)}
        aria-label="Fermer"
      >
        ✕
      </button>
    </div>
  )
}
