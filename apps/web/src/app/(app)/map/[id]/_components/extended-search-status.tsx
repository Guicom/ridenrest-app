'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'

/** Au-delà de ce délai, on prévient l'utilisateur que la recherche étendue traîne. */
const SLOW_THRESHOLD_MS = 5000

interface ExtendedSearchStatusProps {
  /** La recherche étendue (Overpass) est en vol. */
  pending: boolean
  /** Elle a échoué : les résultats affichés sont partiels. */
  error: boolean
  className?: string
}

/**
 * Statut discret de la recherche étendue (Overpass), affiché PENDANT que les résultats Google
 * sont déjà sur la carte.
 *
 * Raison d'être : Overpass a été mesuré entre 1 s et 31 s sur les instances publiques, avec des
 * 504 et des instances mortes. Faire attendre l'utilisateur derrière n'a aucun intérêt — mais le
 * laisser sans explication devant une carte qui se complète toute seule (ou qui reste partielle)
 * est pire. C'est ce silence qui a laissé une panne Overpass de 5 mois passer inaperçue.
 *
 * Non bloquant : `pointer-events-none`, l'utilisateur continue de naviguer, zoomer, ouvrir des POI.
 */
export function ExtendedSearchStatus({ pending, error, className = '' }: ExtendedSearchStatusProps) {
  const [isSlow, setIsSlow] = useState(false)

  useEffect(() => {
    if (!pending) {
      setIsSlow(false)
      return
    }
    const timer = setTimeout(() => setIsSlow(true), SLOW_THRESHOLD_MS)
    return () => clearTimeout(timer)
  }, [pending])

  if (!pending && !error) return null

  const base = `pointer-events-none flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium backdrop-blur-sm ${className}`

  if (error) {
    return (
      <div role="status" className={`${base} bg-orange-500/90 text-white`}>
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Recherche étendue indisponible — résultats partiels
      </div>
    )
  }

  return (
    <div role="status" className={`${base} bg-zinc-900/80 text-white dark:bg-zinc-100/90 dark:text-zinc-900`}>
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
      {isSlow
        ? 'Recherche étendue plus longue que prévu — les résultats s’ajouteront'
        : 'Recherche étendue en cours…'}
    </div>
  )
}
