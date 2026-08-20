import { useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query';
import {
  CATEGORY_TO_LAYER,
  LAYER_CATEGORIES,
  type GooglePlaceDetails,
  type MapLayer,
  type MapSegmentData,
  type Poi,
  type PoiCategory,
} from '@ridenrest/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useNetworkStatus } from '@/hooks/use-network-status';
import { ALL_MAP_LAYERS } from '@/hooks/use-poi-layers';
import { getCachedPois, setCachedPois } from '@/lib/cache/poi-cache';
import {
  findPois,
  getPoiGoogleDetails,
  reverseCity,
  type PoiSource,
  type ReverseCityResult,
} from '@/lib/api/pois';

// Recherche POI corridor (MOB-4.2 / AC2, 4, 5, T4). Server-state = TanStack Query.
//
// **Query key STRICTE parité web** : `['pois', { segmentId, fromKm, toKm, layer,
// overpassEnabled }]` (cf. CLAUDE.md — `overpassEnabled` inclus pour ne pas partager
// le cache opt-in/opt-out). Une `useQuery` par couple (`segment` × `layer` visible).
//
// **Gate de recherche (MOB-4.3)** : `enabled` reçoit `searchCommitted` (route) — la
// recherche ne part QU'au clic explicite « Rechercher » (AC1). La plage adventure-
// cumulée `[fromKm, toKm]` est résolue par segment via `resolveSegmentRanges` (AC5) :
// une `useQuery` par (segment couvert × calque visible), avec les km **locaux** au
// segment dans la query key (parité web `use-pois.ts`).
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
  /** Dimension de clé à part entière : chaque source a son entrée de cache et son état. */
  source: PoiSource;
}

/**
 * Deux flux pour une même recherche (parité web, story 17.14 — portée au mobile 2026-08-20).
 *
 * Google répond en ~200 ms sur une bbox déjà prefetchée, ~2 s à froid ; Overpass a été mesuré
 * entre 1 s et 31 s sur les instances publiques. Les attendre ensemble fait payer à chaque
 * utilisateur le pire des deux — inacceptable en mode Live, où l'on est sur un vélo.
 */
export const POI_SOURCES: readonly PoiSource[] = ['google', 'overpass'];

/** Query key POI canonique (parité web `use-pois.ts`). */
export function buildPoiQueryKey(
  p: PoiQueryKeyParams,
): readonly ['pois', PoiQueryKeyParams] {
  return ['pois', p] as const;
}

/** Plage **locale** à un segment, résolue depuis la plage adventure-cumulée (AC5). */
export interface SegmentRange {
  segmentId: string;
  /** km local au segment (≥ 0). */
  fromKm: number;
  /** km local au segment (≤ `distanceKm`). */
  toKm: number;
}

/** Segment minimal requis pour la résolution (sous-ensemble de `MapSegmentData`). */
export type ResolvableSegment = Pick<
  MapSegmentData,
  'id' | 'cumulativeStartKm' | 'distanceKm'
>;

/**
 * Mappe une plage **adventure-cumulée** `[fromKm, toKm]` vers les segments qu'elle
 * recouvre, en convertissant chaque chevauchement en km **locaux** au segment (AC5).
 * Pur → testable hors React (T7). km arrondis à 0,1 (clés de cache stables, parité web).
 *
 * Un segment sans chevauchement (ou réduit à un point après clamp) est ignoré.
 */
export function resolveSegmentRanges(
  segments: readonly ResolvableSegment[],
  fromKm: number,
  toKm: number,
): SegmentRange[] {
  const out: SegmentRange[] = [];
  for (const s of segments) {
    const segStart = s.cumulativeStartKm;
    const segEnd = segStart + s.distanceKm;
    // Pas de chevauchement avec [fromKm, toKm].
    if (toKm <= segStart || fromKm >= segEnd) continue;
    const localFrom = Math.max(0, fromKm - segStart);
    const localTo = Math.min(s.distanceKm, toKm - segStart);
    if (localTo <= localFrom) continue;
    out.push({
      segmentId: s.id,
      fromKm: Math.round(localFrom * 10) / 10,
      toKm: Math.round(localTo * 10) / 10,
    });
  }
  return out;
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
  /** Vrai tant qu'une requête réseau est en vol (overlay de recherche, AC2). */
  isFetching: boolean;
  isError: boolean;
  isSuccess: boolean;
  /** Recherche étendue (Overpass) en vol — ses POI s'ajouteront à ceux déjà affichés. */
  overpassPending: boolean;
  /** La recherche étendue a échoué : les résultats affichés sont partiels, pas en erreur. */
  overpassError: boolean;
}

type CombineInput = Pick<
  UseQueryResult<Poi[]>,
  'data' | 'isLoading' | 'isError' | 'isSuccess'
> & { isFetching?: boolean };

/**
 * Agrège les résultats `useQueries` (dédoublonné). Pur → testable hors React.
 *
 * `isExtended[i]` indique si le résultat `i` vient de la recherche étendue (Overpass).
 * `useQueries` garantit l'ordre entrée/sortie, c'est la seule façon fiable de redistinguer
 * les deux flux mêlés dans `results`. Omis → tout est considéré comme source primaire
 * (comportement d'avant le découplage).
 *
 * ⚠️ Les états primaires (`isPending`, `isFetching`, `isError`, `isSuccess`) ne suivent QUE
 * la source primaire : Overpass ne doit retenir ni le premier affichage, ni l'auto-zoom, ni
 * faire tourner un indicateur pendant 30 s. Un échec Overpass donne des résultats *partiels*,
 * pas une recherche en erreur.
 */
export function combinePoiResults(
  results: CombineInput[],
  isExtended: readonly boolean[] = [],
): CombinedPoiResult {
  const primary = results.filter((_, i) => !isExtended[i]);
  const extended = results.filter((_, i) => isExtended[i]);
  return {
    // Les POI des DEUX flux s'affichent : Overpass complète Google.
    pois: dedupePois(results.flatMap((r) => r.data ?? [])),
    // `isLoading` = `isPending && isFetching` → vrai seulement si un fetch réel est
    // en vol (faux quand `enabled:false` hors-ligne → pas de skeleton infini, AC5).
    isPending: primary.some((r) => r.isLoading),
    // `isFetching` couvre aussi un refetch sur données déjà présentes → overlay AC2.
    isFetching: primary.some((r) => r.isFetching ?? false),
    isError: primary.some((r) => r.isError),
    isSuccess: primary.length > 0 && primary.every((r) => r.isSuccess),
    overpassPending: extended.some((r) => r.isLoading || (r.isFetching ?? false)),
    overpassError: extended.some((r) => r.isError),
  };
}

export interface UsePoisParams {
  adventureId: string;
  /** Segments de la carte (on lit `id` + km cumulés pour la résolution AC5). */
  segments: readonly ResolvableSegment[];
  visibleLayers: Set<MapLayer>;
  /** Plage **adventure-cumulée** (résolue par segment via `resolveSegmentRanges`). */
  fromKm: number;
  toKm: number;
  overpassEnabled?: boolean;
  /** Gate de déclenchement (route → `searchCommitted`) : la requête ne part que committée. */
  enabled?: boolean;
}

export interface UsePoisResult extends CombinedPoiResult {
  poisByLayer: Record<MapLayer, Poi[]>;
  /** Recherche committée terminée sans aucun POI → bannière « Aucun résultat » (AC3). */
  isEmpty: boolean;
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

  // Plage cumulée → plages locales par segment couvert (AC5). km locaux dans la key.
  const segmentRanges = useMemo(
    () => resolveSegmentRanges(segments, fromKm, toKm),
    [segments, fromKm, toKm],
  );

  // Triplets (segment couvert × calque visible × source), ordre stable (ALL_MAP_LAYERS).
  // Sans l'option étendue, une seule source → une seule requête, comme avant.
  const combos = useMemo(() => {
    const layers = ALL_MAP_LAYERS.filter((l) => visibleLayers.has(l));
    const sources: readonly PoiSource[] = overpassEnabled ? POI_SOURCES : ['google'];
    return segmentRanges.flatMap((r) =>
      layers.flatMap((layer) => sources.map((source) => ({ ...r, layer, source }))),
    );
  }, [segmentRanges, visibleLayers, overpassEnabled]);

  const isExtended = useMemo(() => combos.map((c) => c.source === 'overpass'), [combos]);

  const combine = useCallback(
    (results: CombineInput[]) => combinePoiResults(results, isExtended),
    [isExtended],
  );

  const combined = useQueries({
    queries: combos.map(({ segmentId, fromKm: localFrom, toKm: localTo, layer, source }) => ({
      queryKey: buildPoiQueryKey({
        segmentId,
        fromKm: localFrom,
        toKm: localTo,
        layer,
        overpassEnabled,
        source,
      }),
      queryFn: () =>
        findPois({
          segmentId,
          fromKm: localFrom,
          toKm: localTo,
          categories: [...LAYER_CATEGORIES[layer]] as PoiCategory[],
          overpassEnabled,
          source,
        }),
      enabled: enabled && isOnline && Boolean(segmentId),
      staleTime: POI_STALE_TIME_MS,
      gcTime: POI_GC_TIME_MS,
    })),
    combine,
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

  // Bannière « Aucun résultat » (AC3) : recherche committée terminée (succès réseau)
  // sans aucun POI. Hors-ligne (queries `enabled:false`) `isSuccess` est faux → pas de
  // bannière (on retombe sur le message offline / le cache). Distinct d'une erreur.
  // `!overpassPending` obligatoire : Google peut renvoyer 0 alors qu'Overpass va en ramener 50.
  // Annoncer « aucun résultat » avant la fin du second flux serait un mensonge à l'écran.
  const isEmpty = Boolean(
    enabled && combined.isSuccess && !combined.overpassPending && pois.length === 0,
  );

  return { ...combined, pois, poisByLayer, isEmpty };
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
