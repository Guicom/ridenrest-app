import { useQuery } from '@tanstack/react-query'
import { useLiveStore } from '@/stores/live.store'
import { getLivePois } from '@/lib/api-client'
import { useProfile } from './use-profile'
import type { Poi } from '@ridenrest/shared'

export function useLivePoisSearch(segmentId: string | undefined) {
  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive)
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const { data: profile } = useProfile()
  const overpassEnabled = profile?.overpassEnabled ?? false

  // Always computed from current GPS position — used as queryKey and returned for map target dot
  const targetKm = currentKmOnRoute !== null
    ? Math.round((currentKmOnRoute + targetAheadKm) * 10) / 10
    : null

  // enabled: false — only fetches when refetch() is called explicitly (RECHERCHER button)
  const { data: poisData, isFetching, isError, refetch } = useQuery<Poi[]>({
    queryKey: ['pois', 'live', { segmentId, targetKm, radiusKm: searchRadiusKm, overpassEnabled }],
    queryFn: () => getLivePois({
      segmentId: segmentId!,
      targetKm: targetKm!,
      radiusKm: searchRadiusKm,
      overpassEnabled,
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
