import { useQueries } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useMapStore } from '@/stores/map.store'
import { getPois, getNearMissCount } from '@/lib/api-client'
import { useOverpassEnabled } from './use-profile'
import { POI_BBOX_CACHE_TTL, LAYER_CATEGORIES, CATEGORY_TO_LAYER, CORRIDOR_WIDTH_M } from '@ridenrest/shared'
import type { MapSegmentData } from '@/lib/api-client'
import type { Poi, MapLayer } from '@ridenrest/shared'

interface UsePoisResult {
  poisByLayer: Record<MapLayer, Poi[]>
  /** Chargement de la source PRIMAIRE (Google). Pilote l'overlay, l'auto-zoom et les squelettes. */
  isPending: boolean
  hasError: boolean
  /** Recherche étendue (Overpass) en vol — ses POI s'ajouteront à ceux déjà affichés. */
  overpassPending: boolean
  /** La recherche étendue a échoué : les résultats affichés sont partiels. */
  overpassError: boolean
  /** Une recherche étendue est attendue pour cette recherche (option active + recherche lancée). */
  overpassExpected: boolean
  /**
   * POI écartés par le filtre corridor, juste au-delà de la limite. Le filtre est correct mais
   * il coupait en silence : un camping à 3 263 m écarté pour 263 m, et « Camping (0) » à
   * l'écran, indiscernable d'une absence réelle.
   */
  nearMiss: { count: number; nearestM: number | null; corridorWidthM: number }
}

/**
 * Deux flux pour une même recherche (story 17.14).
 *
 * Google répond en ~200 ms (bbox déjà prefetchée) à ~2 s (froide) ; Overpass a été mesuré entre
 * 1 s et 31 s sur les instances publiques, avec des incidents à 504. Les attendre ensemble
 * faisait payer à tout le monde le pire des deux. On émet donc une requête par source et on
 * affiche Google dès son arrivée, Overpass venant compléter la carte quand il peut.
 */
const POI_SOURCES = ['google', 'overpass'] as const

const DEBOUNCE_MS = 400

export function usePois(segments: MapSegmentData[]): UsePoisResult {
  const { visibleLayers, fromKm: storeFromKm, toKm: storeToKm, searchCommitted } = useMapStore()
  // `ready` gate obligatoire : sans elle, la 1re requête part en OFF pendant le chargement du
  // profil, puis une 2e part en ON → travail serveur doublé et résultat OFF affiché d'abord.
  const { overpassEnabled, ready: profileReady } = useOverpassEnabled()

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
  // Empty while sliding, before the user explicitly commits the search, or while the Overpass
  // opt-in is still unknown (firing early would search with the wrong flag)
  const segmentRanges = (isSliding || !searchCommitted || !profileReady) ? [] : readySegments.flatMap((segment) => {
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

  // Une requête par (segment × calque × source). La source fait partie de la clé : chaque flux
  // a son entrée de cache et son état de chargement propres.
  const activeSources = overpassEnabled ? POI_SOURCES : (['google'] as const)
  const queries = segmentRanges.flatMap(({ segment, segLocalFrom, segLocalTo }) =>
    activeLayers.flatMap((layer) =>
      activeSources.map((source) => ({
        queryKey: ['pois', {
          segmentId: segment.id,
          fromKm: segLocalFrom,
          toKm: segLocalTo,
          layer,
          overpassEnabled,
          source,
        }] as const,
        queryFn: () => getPois({
          segmentId: segment.id,
          fromKm: segLocalFrom,
          toKm: segLocalTo,
          categories: LAYER_CATEGORIES[layer] ?? [],
          overpassEnabled,
          source,
        }),
        staleTime: POI_BBOX_CACHE_TTL * 1000,  // 30 days — aligned with Redis TTL
        gcTime: POI_BBOX_CACHE_TTL * 1000,    // 30 days — prevents GC eviction before staleTime expires
      })),
    ),
  )

  const results = useQueries({ queries })

  // Les deux flux sont mêlés dans `results` : on les redistingue par la position dans `queries`,
  // seule information fiable (useQueries garantit l'ordre entrée/sortie).
  const isOverpassQuery = queries.map((q) => q.queryKey[1].source === 'overpass')
  const googleResults = results.filter((_, i) => !isOverpassQuery[i])
  const overpassResults = results.filter((_, i) => isOverpassQuery[i])

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

  // Compteur des quasi-manqués corridor : UNE requête par segment (pas par calque ni par
  // source), sur les mêmes catégories que l'affichage, avec les mêmes gardes de déclenchement.
  // Non bloquante : elle n'entre dans aucun état de chargement.
  // Sans calque visible, PAS de requête : `categories: []` serait interprété par l'API comme
  // « toutes les catégories » et on compterait des masqués que l'utilisateur ne cherchait pas.
  const nearMissCategories = activeLayers.flatMap((layer) => LAYER_CATEGORIES[layer] ?? [])
  const nearMissRanges = nearMissCategories.length > 0 ? segmentRanges : []
  const nearMissResults = useQueries({
    queries: nearMissRanges.map(({ segment, segLocalFrom, segLocalTo }) => ({
      queryKey: ['pois', 'near-miss', {
        segmentId: segment.id,
        fromKm: segLocalFrom,
        toKm: segLocalTo,
        categories: [...nearMissCategories].sort().join(','),
        overpassEnabled,
      }] as const,
      queryFn: () => getNearMissCount({
        segmentId: segment.id,
        fromKm: segLocalFrom,
        toKm: segLocalTo,
        categories: nearMissCategories,
        overpassEnabled,
      }),
      staleTime: POI_BBOX_CACHE_TTL * 1000,
      gcTime: POI_BBOX_CACHE_TTL * 1000,
    })),
  })

  const nearMissData = nearMissResults.map((r) => r.data).filter((d): d is NonNullable<typeof d> => Boolean(d))
  const nearMissDistances = nearMissData.map((d) => d.nearestM).filter((m): m is number => m !== null)
  const nearMiss = {
    count: nearMissData.reduce((sum, d) => sum + d.count, 0),
    nearestM: nearMissDistances.length > 0 ? Math.min(...nearMissDistances) : null,
    corridorWidthM: nearMissData[0]?.corridorWidthM ?? CORRIDOR_WIDTH_M,
  }

  // isPending = source primaire seulement. Overpass ne doit ni retenir le premier affichage,
  // ni l'auto-zoom, ni faire tourner les squelettes pendant 30 s.
  // Attendre le profil compte comme un chargement : sinon une recherche lancée annonce
  // brièvement « 0 résultat, pas de chargement » et la bannière « aucun résultat » clignote.
  const isPending = (searchCommitted && !profileReady) || googleResults.some((r) => r.isPending)
  const hasError = googleResults.some((r) => r.isError)

  const overpassExpected = overpassEnabled && overpassResults.length > 0
  const overpassPending = overpassResults.some((r) => r.isPending)
  const overpassError = overpassResults.some((r) => r.isError)

  return { poisByLayer, isPending, hasError, overpassPending, overpassError, overpassExpected, nearMiss }
}
