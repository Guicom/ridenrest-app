import { Loader2 } from 'lucide-react'

interface MapSearchOverlayProps {
  visible: boolean
}

export function MapSearchOverlay({ visible }: MapSearchOverlayProps) {
  if (!visible) return null
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 pointer-events-none">
      <div className="flex items-center gap-2 bg-white/90 dark:bg-black/80 px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Recherche en cours…
      </div>
    </div>
  )
}
