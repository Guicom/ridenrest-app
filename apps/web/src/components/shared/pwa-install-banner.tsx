'use client'
import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useIsPwaInstalled } from '@/hooks/use-is-pwa-installed'
import { isMobileViewport } from '@/lib/pwa-utils'

const STORAGE_KEY = 'pwa-install-dismissed'

export function PwaInstallBanner() {
  const isPwaInstalled = useIsPwaInstalled()
  const [visible, setVisible] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    function update() {
      const isMobile = isMobileViewport()
      const isDismissed = localStorage.getItem(STORAGE_KEY) === 'true'
      setVisible(isMobile && !isPwaInstalled && !isDismissed)
    }

    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [isPwaInstalled])

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, 'true')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      data-testid="pwa-install-banner"
      className="fixed bottom-0 left-0 right-0 z-50 animate-in slide-in-from-bottom duration-300"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="mx-2 mb-2 rounded-lg border border-green-700/30 bg-green-950/90 text-sm text-white shadow-lg backdrop-blur-sm">
        {/* Collapsed row — entire header is clickable except close button */}
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded ? 'Réduire' : 'Voir comment installer'}
            aria-expanded={expanded}
            className="flex flex-1 items-center gap-3 text-left"
          >
            <span className="flex-1 font-medium">
              Pour une meilleure experience, installez Ride&apos;n&apos;Rest
            </span>
            <span className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10">
              {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}
            </span>
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Fermer"
            className="shrink-0 rounded-full p-1 transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Expanded instructions */}
        {expanded && (
          <div data-testid="pwa-install-instructions" className="border-t border-green-700/30 px-4 pb-4 pt-3">
            <div className="space-y-3">
              {/* iPhone / iPad */}
              <div>
                <p className="mb-1 font-semibold text-green-300">iPhone / iPad</p>
                <ol className="list-inside list-decimal space-y-0.5 text-white/80">
                  <li>Cliquez le bouton <span className="font-semibold text-white">Partager</span></li>
                  <li>Cliquez sur le bouton <span className="font-semibold text-white">En voir plus</span></li>
                  <li>Faites défiler et touchez <span className="font-semibold text-white">Sur l&apos;écran d&apos;accueil</span></li>
                  <li>Confirmez en touchant <span className="font-semibold text-white">Ajouter</span></li>
                </ol>
              </div>

              {/* Android */}
              <div>
                <p className="mb-1 font-semibold text-green-300">Android</p>
                <ol className="list-inside list-decimal space-y-0.5 text-white/80">
                  <li>Cliquez le menu <span className="font-semibold text-white">⋮</span> (trois points en haut)</li>
                  <li>Cliquez <span className="font-semibold text-white">Ajouter à l&apos;écran d&apos;accueil</span></li>
                  <li>Confirmez en touchant <span className="font-semibold text-white">Ajouter</span></li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
