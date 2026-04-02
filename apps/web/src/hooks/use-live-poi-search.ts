import { useQuery } from '@tanstack/react-query'
import { useLiveStore } from '@/stores/live.store'
import { useMapStore } from '@/stores/map.store'
import { getLivePois } from '@/lib/api-client'
import { useProfile } from './use-profile'
import { LAYER_CATEGORIES } from '@ridenrest/shared'
import type { Poi } from '@ridenrest/shared'

export function useLivePoisSearch(segmentId: string | undefined) {
  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive)
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const visibleLayers = useMapStore((s) => s.visibleLayers)
  const activeAccommodationTypes = useMapStore((s) => s.activeAccommodationTypes)
  const { data: profile } = useProfile()
  const overpassEnabled = profile?.overpassEnabled ?? false

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

  // enabled: false — only fetches when refetch() is called explicitly (RECHERCHER button)
  const { data: poisData, isFetching, isError, refetch } = useQuery<Poi[]>({
    // categories intentionally excluded from queryKey — search is always explicit (refetch()),
    // so queryFn captures the current categories via closure at call time
    queryKey: ['pois', 'live', { segmentId, targetKm, radiusKm: searchRadiusKm, overpassEnabled }],
    queryFn: () => getLivePois({
      segmentId: segmentId!,
      targetKm: targetKm!,
      radiusKm: searchRadiusKm,
      overpassEnabled,
      categories,
    }),
    enabled: false,
    staleTime: Infinity,
  })

  // poisData === undefined means "never fetched for this queryKey" (enabled:false initial state)
  // poisData === [] means "fetched and got zero results" — distinct from unfetched
  const pois = poisData ?? []
  const hasFetched = poisData !== undefined

  const canSearch = isLiveModeActive && targetKm !== null && !!segmentId

  return { pois, hasFetched, isFetching, targetKm, isError, refetch, canSearch }
}
