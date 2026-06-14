import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  CATEGORY_TO_LAYER,
  LAYER_CATEGORIES,
  type GooglePlaceDetails,
  type MapLayer,
  type Poi,
  type PoiCategory,
} from '@ridenrest/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useNetworkStatus } from '@/hooks/use-network-status';
import { ALL_MAP_LAYERS } from '@/hooks/use-poi-layers';
import { getCachedPois, setCachedPois } from '@/lib/cache/poi-cache';
import {
  findPois,
  getPoiGoogleDetails,
  reverseCity,
  type ReverseCityResult,
} from '@/lib/api/pois';

// Recherche POI corridor (MOB-4.2 / AC2, 4, 5, T4). Server-state = TanStack Query.
//
// **Query key STRICTE parité web** : `['pois', { segmentId, fromKm, toKm, layer,
// overpassEnabled }]` (cf. CLAUDE.md — `overpassEnabled` inclus pour ne pas partager
// le cache opt-in/opt-out). Une `useQuery` par couple (`segment` × `layer` visible).
//
// **Déclenchement minimal (MOB-4.2)** : `enabled` piloté par l'appelant (route) avec
// une plage par défaut. MOB-4.3 branchera `searchCommitted` + slider `fromKm/toKm`
// sans toucher à ce hook (le gate passe juste par `enabled`/`fromKm`/`toKm`).
//
// **Offline (AC5)** : write-through `setCachedPois` au succès en ligne ; fallback
// `getCachedPois` (cache N3 `/cache/pois/{adventureId}.json`) quand hors-ligne sans
// données live. Les queries sont `enabled: isOnline` → hors-ligne elles ne partent
// pas (pas de `paused` infini) et on retombe sur le cache fichier.

/** Référence stable pour l'absence de POIs (évite une nouvelle identité par render). */
const EMPTY_POIS: Poi[] = [];

const POI_STALE_TIME_MS = 7 * 24 * 60 * 60 * 1000; // 7 j — POIs très stables
const POI_GC_TIME_MS = 7 * 24 * 60 * 60 * 1000; // ≥ persist maxAge (offline N1)
const ENRICHMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // parité Redis TTL web

export interface PoiQueryKeyParams {
  segmentId: string;
  fromKm: number;
  toKm: number;
  layer: MapLayer;
  overpassEnabled: boolean;
}

/** Query key POI canonique (parité web `use-pois.ts`). */
export function buildPoiQueryKey(
  p: PoiQueryKeyParams,
): readonly ['pois', PoiQueryKeyParams] {
  return ['pois', p] as const;
}

/** Dédoublonne par `id` (POIs proches d'une frontière de segment peuvent réapparaître). */
function dedupePois(pois: Poi[]): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const poi of pois) {
    const key = poi.id ?? poi.externalId;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(poi);
  }
  return out;
}

/** Regroupe les POIs par calque visible (filtre via `CATEGORY_TO_LAYER`). */
export function groupPoisByLayer(
  pois: Poi[],
  visibleLayers: Set<MapLayer>,
): Record<MapLayer, Poi[]> {
  const grouped: Record<MapLayer, Poi[]> = {
    accommodations: [],
    restaurants: [],
    supplies: [],
    bike: [],
  };
  for (const poi of pois) {
    const layer = CATEGORY_TO_LAYER[poi.category];
    if (visibleLayers.has(layer)) grouped[layer].push(poi);
  }
  return grouped;
}

export interface CombinedPoiResult {
  pois: Poi[];
  /** Vrai uniquement pendant un 1er chargement réseau en cours (jamais offline/idle). */
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
}

/** Agrège les résultats `useQueries` (dédoublonné). Pur → testable hors React. */
export function combinePoiResults(
  results: Pick<
    UseQueryResult<Poi[]>,
    'data' | 'isLoading' | 'isError' | 'isSuccess'
  >[],
): CombinedPoiResult {
  return {
    pois: dedupePois(results.flatMap((r) => r.data ?? [])),
    // `isLoading` = `isPending && isFetching` → vrai seulement si un fetch réel est
    // en vol (faux quand `enabled:false` hors-ligne → pas de skeleton infini, AC5).
    isPending: results.some((r) => r.isLoading),
    isError: results.some((r) => r.isError),
    isSuccess: results.length > 0 && results.every((r) => r.isSuccess),
  };
}

export interface UsePoisParams {
  adventureId: string;
  /** Segments de la carte (on lit uniquement `id`). */
  segments: readonly { id: string }[];
  visibleLayers: Set<MapLayer>;
  fromKm: number;
  toKm: number;
  overpassEnabled?: boolean;
  /** Gate de déclenchement (MOB-4.3 y branchera `searchCommitted`). */
  enabled?: boolean;
}

export interface UsePoisResult extends CombinedPoiResult {
  poisByLayer: Record<MapLayer, Poi[]>;
}

/**
 * POIs corridor par (segment × calque visible) + agrégation + cache offline.
 */
export function usePois({
  adventureId,
  segments,
  visibleLayers,
  fromKm,
  toKm,
  overpassEnabled = false,
  enabled = true,
}: UsePoisParams): UsePoisResult {
  const { isOnline } = useNetworkStatus();

  // Couples (segment × calque visible), ordre stable (ALL_MAP_LAYERS).
  const combos = useMemo(() => {
    const layers = ALL_MAP_LAYERS.filter((l) => visibleLayers.has(l));
    return segments.flatMap((s) =>
      layers.map((layer) => ({ segmentId: s.id, layer })),
    );
  }, [segments, visibleLayers]);

  const combined = useQueries({
    queries: combos.map(({ segmentId, layer }) => ({
      queryKey: buildPoiQueryKey({ segmentId, fromKm, toKm, layer, overpassEnabled }),
      queryFn: () =>
        findPois({
          segmentId,
          fromKm,
          toKm,
          categories: [...LAYER_CATEGORIES[layer]] as PoiCategory[],
          overpassEnabled,
        }),
      enabled: enabled && isOnline && Boolean(segmentId),
      staleTime: POI_STALE_TIME_MS,
      gcTime: POI_GC_TIME_MS,
    })),
    combine: combinePoiResults,
  });

  // Write-through N3 (online + succès). Skippé si vide (évite d'écraser un cache offline
  // valide avec un résultat de plage sans POI). Signature dédoublonne les writes redondants.
  const writtenSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOnline || !combined.isSuccess || combined.pois.length === 0) return;
    const sig = `${adventureId}:${combined.pois.map((p) => p.id).join(',')}`;
    if (writtenSigRef.current === sig) return;
    writtenSigRef.current = sig;
    void setCachedPois(adventureId, combined.pois).catch(() => {});
  }, [isOnline, combined.isSuccess, combined.pois, adventureId]);

  // Fallback offline : lit le cache fichier UNIQUEMENT quand hors-ligne sans données
  // live. `setState` n'est appelé que dans le callback async (jamais en synchrone dans
  // le corps d'effet — règle `react-hooks/set-state-in-effect`). En ligne, `offlinePois`
  // est simplement ignoré par le calcul de `pois` ci-dessous → pas de reset nécessaire.
  const [offlinePois, setOfflinePois] = useState<Poi[] | null>(null);
  const needsOfflineFallback = !isOnline && combined.pois.length === 0;
  useEffect(() => {
    if (!needsOfflineFallback) return;
    let active = true;
    void getCachedPois(adventureId).then((cached) => {
      if (active && cached) setOfflinePois(cached);
    });
    return () => {
      active = false;
    };
  }, [needsOfflineFallback, adventureId]);

  const pois = useMemo<Poi[]>(() => {
    if (combined.pois.length > 0) return combined.pois;
    return needsOfflineFallback ? (offlinePois ?? EMPTY_POIS) : EMPTY_POIS;
  }, [combined.pois, needsOfflineFallback, offlinePois]);

  const poisByLayer = useMemo(
    () => groupPoisByLayer(pois, visibleLayers),
    [pois, visibleLayers],
  );

  return { ...combined, pois, poisByLayer };
}

/**
 * Enrichissement Google (lazy) — activé quand la fiche est ouverte sur un POI
 * enrichissable. `null` sur échec (optionnel, ne bloque pas la fiche, AC4).
 */
export function usePoiGoogleDetails(
  externalId: string | null,
  segmentId: string | null,
): { details: GooglePlaceDetails | null; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: ['poi-details', externalId, segmentId],
    queryFn: () => getPoiGoogleDetails(externalId!, segmentId!),
    enabled: !!externalId && !!segmentId,
    staleTime: ENRICHMENT_TTL_MS,
    retry: false, // enrichissement optionnel — pas de retry
  });
  return { details: data ?? null, isPending: isPending && !!externalId };
}

/**
 * Ville depuis les coords **du POI** (RGPD OK). Key arrondie à 3 décimales (parité
 * web `use-reverse-city`) → cache partagé entre POIs voisins.
 */
export function useReverseCity(
  center: { lat: number; lng: number } | null,
): ReverseCityResult & { isPending: boolean } {
  const roundedKey = center
    ? `${center.lat.toFixed(3)},${center.lng.toFixed(3)}`
    : null;
  const { data, isPending } = useQuery({
    queryKey: ['reverseCity', roundedKey],
    queryFn: () => reverseCity(center!.lat, center!.lng),
    enabled: center !== null,
    staleTime: ENRICHMENT_TTL_MS,
    gcTime: ENRICHMENT_TTL_MS,
  });
  return {
    city: data?.city ?? null,
    postcode: data?.postcode ?? null,
    state: data?.state ?? null,
    country: data?.country ?? null,
    isPending: center !== null && isPending,
  };
}
