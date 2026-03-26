import { useQueries } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useMapStore } from '@/stores/map.store'
import { getPois } from '@/lib/api-client'
import { LAYER_CATEGORIES, CATEGORY_TO_LAYER } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer } from '@ridenrest/shared'

interface UsePoisResult {
  poisByLayer: Record<MapLayer, Poi[]>
  isPending: boolean
  hasError: boolean
}

const DEBOUNCE_MS = 400

export function usePois(segments: MapSegmentData[]): UsePoisResult {
  const { visibleLayers, fromKm: storeFromKm, toKm: storeToKm } = useMapStore()

  // Debounce km range to avoid firing a query on every 1km slider step
  const [debouncedFromKm, setDebouncedFromKm] = useState(storeFromKm)
  const [debouncedToKm, setDebouncedToKm] = useState(storeToKm)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFromKm(storeFromKm)
      setDebouncedToKm(storeToKm)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [storeFromKm, storeToKm])

  // While the slider is still moving (store ≠ debounced), return empty immediately
  // so the map clears stale pins without waiting for the debounce to fire
  const isSliding = storeFromKm !== debouncedFromKm || storeToKm !== debouncedToKm

  const readySegments = segments.filter((s) => s.parseStatus === 'done')
  const isEnabled = visibleLayers.size > 0 && readySegments.length > 0 && !isSliding

  const activeCategories = [...visibleLayers].flatMap(
    (layer) => LAYER_CATEGORIES[layer] ?? [],
  )

  // Map adventure-wide [debouncedFromKm, debouncedToKm] to per-segment local km ranges
  // Empty while sliding — no queries fired until slider settles
  const segmentQueries = isSliding ? [] : readySegments.flatMap((segment) => {
    // Compute overlap of [debouncedFromKm, debouncedToKm] with this segment's km range
    const segStart = segment.cumulativeStartKm
    const segEnd = segStart + segment.distanceKm

    // No overlap with requested range
    if (debouncedToKm <= segStart || debouncedFromKm >= segEnd) return []

    const segLocalFrom = Math.max(0, debouncedFromKm - segStart)
    const segLocalTo = Math.min(segment.distanceKm, debouncedToKm - segStart)

    if (segLocalTo <= segLocalFrom) return []

    return [{
      segment,
      segLocalFrom: Math.round(segLocalFrom * 10) / 10,  // Round to 0.1km for stable cache keys
      segLocalTo: Math.round(segLocalTo * 10) / 10,
    }]
  })

  const queries = segmentQueries.map(({ segment, segLocalFrom, segLocalTo }) => ({
    queryKey: ['pois', {
      segmentId: segment.id,
      fromKm: segLocalFrom,
      toKm: segLocalTo,
      categories: [...activeCategories].sort(),
    }] as const,
    queryFn: () => getPois({
      segmentId: segment.id,
      fromKm: segLocalFrom,
      toKm: segLocalTo,
      categories: activeCategories,
    }),
    enabled: isEnabled,
    staleTime: 1000 * 60 * 60 * 24,  // 24h — matches Redis TTL
  }))

  const results = useQueries({ queries })

  const allPois = results.flatMap((r) => r.data ?? [])
  const poisByLayer: Record<MapLayer, Poi[]> = {
    accommodations: [],
    restaurants: [],
    supplies: [],
    bike: [],
  }
  for (const poi of allPois) {
    const layer = CATEGORY_TO_LAYER[poi.category]
    if (layer) poisByLayer[layer].push(poi)
  }

  // Sort each layer by distAlongRouteKm for the POI list
  for (const layer of Object.keys(poisByLayer) as MapLayer[]) {
    poisByLayer[layer].sort((a, b) => a.distAlongRouteKm - b.distAlongRouteKm)
  }

  const isPending = isSliding || (isEnabled && results.some((r) => r.isPending))
  const hasError = results.some((r) => r.isError)

  return { poisByLayer, isPending, hasError }
}
