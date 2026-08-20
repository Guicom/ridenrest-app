import { useQuery } from '@tanstack/react-query'
import { useCallback } from 'react'
import { useLiveStore } from '@/stores/live.store'
import { useMapStore } from '@/stores/map.store'
import { getLivePois } from '@/lib/api-client'
import { useOverpassEnabled } from './use-profile'
import { LAYER_CATEGORIES } from '@ridenrest/shared'
import type { Poi } from '@ridenrest/shared'

export function useLivePoisSearch(segmentId: string | undefined) {
  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive)
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const visibleLayers = useMapStore((s) => s.visibleLayers)
  const activeAccommodationTypes = useMapStore((s) => s.activeAccommodationTypes)
  const { overpassEnabled, ready: profileReady } = useOverpassEnabled()

  // Convert visible layers → flat list of PoiCategory for the API
  // For accommodations, only include the active sub-types (e.g. hotel only by default)
  const categories = [...visibleLayers].flatMap((layer) => {
    const cats = LAYER_CATEGORIES[layer]
    return layer === 'accommodations'
      ? cats.filter((c) => activeAccommodationTypes.has(c))
      : cats
  })

  // Always computed from current GPS position — used as queryKey and returned for map target dot
  const targetKm = currentKmOnRoute !== null
    ? Math.round((currentKmOnRoute + targetAheadKm) * 10) / 10
    : null

  // Deux flux, comme en planning (story 17.14) : Google répond en ~200 ms, Overpass a été mesuré
  // entre 1 et 31 s sur les instances publiques. En live c'est encore plus critique — l'utilisateur
  // est sur son vélo, il ne va pas attendre 30 s devant un écran figé.
  // enabled: false — ne part qu'au refetch() explicite (bouton RECHERCHER)
  const baseKey = { segmentId, targetKm, radiusKm: searchRadiusKm, overpassEnabled }
  const commonOptions = { enabled: false, staleTime: Infinity } as const

  const googleQuery = useQuery<Poi[]>({
    // categories intentionally excluded from queryKey — search is always explicit (refetch()),
    // so queryFn captures the current categories via closure at call time
    queryKey: ['pois', 'live', { ...baseKey, source: 'google' }],
    queryFn: () => getLivePois({
      segmentId: segmentId!,
      targetKm: targetKm!,
      radiusKm: searchRadiusKm,
      overpassEnabled,
      categories,
      source: 'google',
    }),
    ...commonOptions,
  })

  const overpassQuery = useQuery<Poi[]>({
    queryKey: ['pois', 'live', { ...baseKey, source: 'overpass' }],
    queryFn: () => getLivePois({
      segmentId: segmentId!,
      targetKm: targetKm!,
      radiusKm: searchRadiusKm,
      overpassEnabled,
      categories,
      source: 'overpass',
    }),
    ...commonOptions,
  })

  const { data: poisData, isFetching, isError } = googleQuery

  /** Lance les deux flux. Overpass n'est sollicité que si l'option est active. */
  const refetch = useCallback(async () => {
    const runs: Promise<unknown>[] = [googleQuery.refetch()]
    if (overpassEnabled) runs.push(overpassQuery.refetch())
    await Promise.all(runs)
  }, [googleQuery, overpassQuery, overpassEnabled])

  // poisData === undefined means "never fetched for this queryKey" (enabled:false initial state)
  // poisData === [] means "fetched and got zero results" — distinct from unfetched
  const pois = [...(poisData ?? []), ...(overpassQuery.data ?? [])]
  const hasFetched = poisData !== undefined

  // profileReady : RECHERCHER doit partir avec le bon flag Overpass, pas avec le défaut OFF
  const canSearch = isLiveModeActive && targetKm !== null && !!segmentId && profileReady

  return {
    pois,
    hasFetched,
    isFetching,                                   // source primaire seulement
    targetKm,
    isError,                                      // idem : un échec Overpass ≠ recherche en erreur
    refetch,
    canSearch,
    overpassPending: overpassQuery.isFetching,
    overpassError: overpassQuery.isError,
  }
}
