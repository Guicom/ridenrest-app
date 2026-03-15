import { useQueries } from '@tanstack/react-query'
import { useMapStore } from '@/stores/map.store'
import { getPois } from '@/lib/api-client'
import { LAYER_CATEGORIES, CATEGORY_TO_LAYER } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer } from '@ridenrest/shared'

const MAX_SEGMENT_QUERY_KM = 30

interface UsePoisResult {
  poisByLayer: Record<MapLayer, Poi[]>
  isPending: boolean
  hasError: boolean
}

export function usePois(segments: MapSegmentData[]): UsePoisResult {
  const { visibleLayers } = useMapStore()

  // Only query segments that are ready + when at least one layer is visible
  const readySegments = segments.filter((s) => s.parseStatus === 'done')
  const isEnabled = visibleLayers.size > 0 && readySegments.length > 0

  // Build active categories from visible layers
  const activeCategories = [...visibleLayers].flatMap(
    (layer) => LAYER_CATEGORIES[layer] ?? [],
  )

  // One query per ready segment
  const queries = readySegments.map((segment) => ({
    queryKey: ['pois', {
      segmentId: segment.id,
      fromKm: 0,
      toKm: Math.min(segment.distanceKm, MAX_SEGMENT_QUERY_KM),
      categories: [...activeCategories].sort(),
    }] as const,
    queryFn: () => getPois({
      segmentId: segment.id,
      fromKm: 0,
      toKm: Math.min(segment.distanceKm, MAX_SEGMENT_QUERY_KM),
      categories: activeCategories,
    }),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 60 * 24,  // 24h — matches Redis TTL
  }))

  const results = useQueries({ queries })

  // Combine all segment results and group by MapLayer
  const allPois = results.flatMap((r) => r.data ?? [])
  const poisByLayer: Record<MapLayer, Poi[]> = {
    accommodations: [],
    restaurants: [],
    supplies: [],
    bike: [],
  }
  for (const poi of allPois) {
    const layer = CATEGORY_TO_LAYER[poi.category]
    if (layer) {
      poisByLayer[layer].push(poi)
    }
  }

  const isPending = isEnabled && results.some((r) => r.isPending)
  const hasError = results.some((r) => r.isError)

  return { poisByLayer, isPending, hasError }
}
