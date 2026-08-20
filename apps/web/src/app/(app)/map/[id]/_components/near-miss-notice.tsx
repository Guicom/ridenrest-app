'use client'

import { Info } from 'lucide-react'

/** Formate une distance en mètres → « 3,3 km » ou « 800 m ». */
function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`
  return `${(meters / 1000).toFixed(1).replace('.', ',')} km`
}

interface NearMissNoticeProps {
  /** Nombre de POI écartés par le filtre corridor, dans la bande signalée. */
  count: number
  /** Distance du plus proche des masqués. */
  nearestM: number | null
  /** Seuil d'affichage effectif, renvoyé par le serveur. */
  corridorWidthM: number
}

/**
 * Dit ce que le filtre corridor a écarté.
 *
 * Le filtre est correct — il garde l'affichage cohérent avec le couloir annoncé, indépendamment
 * de la forme du rectangle de recherche. Ce qui ne l'était pas, c'est qu'il coupait **en
 * silence** : un camping à 3 263 m a été écarté pour 263 m, l'écran affichait « Camping (0) »,
 * et rien ne permettait de distinguer « il n'y a rien » de « il y a quelque chose juste au-delà
 * de la limite ». Même forme de défaut que la panne Overpass restée invisible cinq mois.
 *
 * Purement informatif : n'ajoute aucun POI et ne change rien à ce qui est rendu sur la carte.
 */
export function NearMissNotice({ count, nearestM, corridorWidthM }: NearMissNoticeProps) {
  if (count <= 0) return null

  const corridorLabel = formatDistance(corridorWidthM)
  const nearestLabel = nearestM !== null ? formatDistance(nearestM) : null

  return (
    <p
      role="note"
      className="flex items-start gap-1.5 text-xs text-muted-foreground"
    >
      <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
      <span>
        {count === 1
          ? `1 résultat au-delà de ${corridorLabel} de la trace n’est pas affiché`
          : `${count} résultats au-delà de ${corridorLabel} de la trace ne sont pas affichés`}
        {nearestLabel ? ` — le plus proche à ${nearestLabel}.` : '.'}
      </span>
    </p>
  )
}
