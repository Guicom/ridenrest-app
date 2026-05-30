'use client'

import type maplibregl from 'maplibre-gl'
import { useMemo } from 'react'
import type { AccessOrigin } from '@ridenrest/shared'
import { useAccess } from './useAccess'
import { AccessMapLayer } from './AccessMapLayer'

/**
 * Polyline d'itinéraire d'accès sur la carte Live.
 *
 * Affiche le tracé d'accès du POI hébergement sélectionné en réutilisant la MÊME requête
 * `useAccess` (origine `nearest-trace`) que la rangée stats du popup → queryKey identique,
 * dédup TanStack, un seul fetch partagé.
 *
 * Décision 2026-05-30 : le mode Live utilise désormais l'origine `nearest-trace` (comme le
 * Planning), pas la position GPS. Aucune donnée de localisation n'est transmise, donc plus
 * de gate de consentement RGPD ici.
 *
 * `fitOnShow={false}` : pas d'auto-zoom en Live (le suivi GPS pilote la caméra).
 */
interface LiveAccessPolylineProps {
  map: maplibregl.Map | null
  poiId: string
  isAccommodation: boolean
}

const NEAREST_TRACE: AccessOrigin = { type: 'nearest-trace' }

export function LiveAccessPolyline({ map, poiId, isAccommodation }: LiveAccessPolylineProps) {
  const origin = useMemo<AccessOrigin>(() => NEAREST_TRACE, [])
  // `useAccess` est lazy (enabled requiert un poiId) — '' désactive la requête.
  const { data } = useAccess(isAccommodation ? poiId : '', origin)
  const geometry = data?.status === 'ok' ? data.geometry : null

  return <AccessMapLayer map={map} geometry={geometry} fitOnShow={false} />
}
