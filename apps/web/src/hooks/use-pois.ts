import { useQueries } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useMapStore } from '@/stores/map.store'
import { getPois } from '@/lib/api-client'
import { POI_BBOX_CACHE_TTL, LAYER_CATEGORIES, CATEGORY_TO_LAYER } from '@ridenrest/shared'
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
  const activeLayers = [...visibleLayers] as MapLayer[]

  // Map adventure-wide [debouncedFromKm, debouncedToKm] to per-segment local km ranges
  // Empty while sliding — no queries fired until slider settles
  const segmentRanges = isSliding ? [] : readySegments.flatMap((segment) => {
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

  // Per-layer × per-segment queries — each layer has an independent TanStack Query cache entry
  const queries = segmentRanges.flatMap(({ segment, segLocalFrom, segLocalTo }) =>
    activeLayers.map((layer) => ({
      queryKey: ['pois', {
        segmentId: segment.id,
        fromKm: segLocalFrom,
        toKm: segLocalTo,
        layer,
      }] as const,
      queryFn: () => getPois({
        segmentId: segment.id,
        fromKm: segLocalFrom,
        toKm: segLocalTo,
        categories: LAYER_CATEGORIES[layer] ?? [],
      }),
      staleTime: POI_BBOX_CACHE_TTL * 1000,  // 30 days — aligned with Redis TTL
      gcTime: POI_BBOX_CACHE_TTL * 1000,    // 30 days — prevents GC eviction before staleTime expires
    })),
  )

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

  const isPending = isSliding || results.some((r) => r.isPending)
  const hasError = results.some((r) => r.isError)

  return { poisByLayer, isPending, hasError }
}
