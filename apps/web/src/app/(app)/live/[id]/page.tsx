'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useLiveMode } from '@/hooks/use-live-mode'
import { getAdventureMapData } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { LiveMapCanvas } from './_components/live-map-canvas'
import { GeolocationConsent } from './_components/geolocation-consent'

export default function LivePage() {
  const { id: adventureId } = useParams<{ id: string }>()
  const {
    isLiveModeActive,
    hasConsented,
    permissionDenied,
    startWatching,
    grantConsent,
  } = useLiveMode()

  const [mounted, setMounted] = useState(false)
  const [showConsent, setShowConsent] = useState(false)

  const { data: mapData, isPending } = useQuery({
    queryKey: ['adventures', adventureId, 'map'],
    queryFn: () => getAdventureMapData(adventureId),
  })

  // Hydration-safe: defer client-only rendering until after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // On mount: if already consented, start watching immediately (AC #5)
  useEffect(() => {
    if (!mounted) return
    if (hasConsented) {
      startWatching()
    } else {
      setShowConsent(true)
    }
  }, [mounted, hasConsented, startWatching])

  const handleConsent = () => {
    setShowConsent(false)
    grantConsent()
  }

  const handleDismiss = () => {
    setShowConsent(false)
  }

  const segments = mapData?.segments ?? []

  return (
    <div className="relative h-dvh w-full overflow-hidden">
      {/* Map canvas — z-0 */}
      <LiveMapCanvas adventureId={adventureId} segments={segments} />

      {/* Top bar — z-40 */}
      <div className="absolute top-4 left-4 z-40">
        <Link
          href="/adventures"
          className="inline-flex items-center gap-1 rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm hover:bg-background/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Aventures
        </Link>
      </div>

      {/* Consent modal — z-60 */}
      <GeolocationConsent
        open={showConsent && !hasConsented}
        onConsent={handleConsent}
        onDismiss={handleDismiss}
      />

      {/* Bottom overlay — z-30 (only render after mount to avoid hydration mismatch) */}
      {mounted && (
        <div className="absolute bottom-8 left-0 right-0 z-30 flex justify-center">
          {permissionDenied && (
            <div className="rounded-lg bg-destructive/90 px-4 py-2 text-sm text-destructive-foreground">
              Géolocalisation refusée — activez-la dans les paramètres de votre navigateur
            </div>
          )}

          {!isLiveModeActive && !permissionDenied && hasConsented && (
            <Button
              onClick={startWatching}
              variant="destructive"
              size="lg"
            >
              Activer le mode Live
            </Button>
          )}

          {!isLiveModeActive && !permissionDenied && !hasConsented && !showConsent && (
            <Button
              onClick={() => setShowConsent(true)}
              variant="destructive"
              size="lg"
            >
              Activer le mode Live
            </Button>
          )}
        </div>
      )}

      {isPending && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50">
          <div className="text-sm text-muted-foreground">Chargement de l&apos;aventure…</div>
        </div>
      )}
    </div>
  )
}
