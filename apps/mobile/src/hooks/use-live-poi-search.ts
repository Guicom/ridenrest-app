import { useQuery } from '@tanstack/react-query';
import { LAYER_CATEGORIES, type Poi, type PoiCategory } from '@ridenrest/shared';
import { useEffect, useRef, useState } from 'react';

import { useNetworkStatus } from '@/hooks/use-network-status';
import { useProfile } from '@/hooks/use-profile';
import { getLivePois } from '@/lib/api/pois';
import { getCachedPois, setCachedPois } from '@/lib/cache/poi-cache';
import { useLiveStore } from '@/lib/stores/live.store';
import { useMapStore } from '@/lib/stores/map.store';

// Recherche POI mode **Live** (MOB-5.3 / AC1, 2, 4, 5, 6). Port du web
// `use-live-poi-search.ts` + ajouts mobiles (offline cache, parité `use-pois`).
//
// **Recherche EXPLICITE** (AC2) : `enabled: false` + `staleTime: Infinity` → la query ne
// part QUE sur `refetch()` (bouton RECHERCHER), jamais au déplacement du slider/filtre.
//
// **`categories` EXCLU du queryKey** (parité web/CLAUDE.md) : la recherche est toujours
// explicite via closure ; exclure les catégories de la clé évite d'effacer les compteurs
// affichés quand l'utilisateur change un filtre avant de re-rechercher (la query garde
// son `data` jusqu'au prochain `refetch`). `queryFn` capture les catégories courantes.
//
// **`targetKm`** (AC1) = `round((currentKmOnRoute + targetAheadKm) * 10) / 10` ou `null`
// (pas de fix GPS). **RGPD** : seuls `segmentId` + `targetKm` + `radiusKm` partent à
// l'API — JAMAIS de lat/lng (le serveur résout le point via `getWaypointAtKm`).
//
// **`hasFetched = data !== undefined`** (AC5) : distingue « jamais cherché ici »
// (`undefined`, `enabled:false` initial) de « cherché, zéro résultat » (`[]`). C'est le
// gate de la bannière « Aucun résultat » — JAMAIS `pois.length === 0` seul. Quand
// `targetKm`/`radiusKm` change → nouvelle queryKey → `data` redevient `undefined` → la
// bannière se masque (AC5).
//
// **Offline (AC6)** : write-through `setCachedPois` au succès en ligne (clé dédiée
// `{adventureId}-live` pour ne pas écraser le cache planning) ; fallback `getCachedPois`
// hors-ligne sans donnée live → la dernière liste reste consultable. (Mobile-only,
// comme `use-pois` ; absent du hook web.)

/** Suffixe de clé de cache fichier Live (distinct du cache POI planning par aventure). */
const LIVE_CACHE_SUFFIX = '-live';
/** Conserve le cache mémoire ≥ 24 h pour l'offline N1 (parité `use-pois`). */
const POI_GC_TIME_MS = 24 * 60 * 60 * 1000;

/** Référence stable pour l'absence de POIs (évite une nouvelle identité par render). */
const EMPTY_POIS: Poi[] = [];

export interface UseLivePoiSearchParams {
  /** Aventure (clé du cache fichier offline `{adventureId}-live`). */
  adventureId: string;
  /** Segment courant (premier segment de l'aventure en Live). */
  segmentId: string | undefined;
}

export interface UseLivePoiSearchResult {
  pois: Poi[];
  /** `data !== undefined` — une recherche réelle s'est terminée à cette queryKey (AC5). */
  hasFetched: boolean;
  /** Requête réseau en vol (overlay de chargement, AC2). */
  isFetching: boolean;
  /** km cible courant (centre du cercle de recherche) — `null` sans fix GPS. */
  targetKm: number | null;
  isError: boolean;
  /** Déclenche la recherche (bouton RECHERCHER) — la query est `enabled:false`. */
  refetch: () => Promise<unknown>;
  /** Recherche possible : Live actif + `targetKm` connu + segment présent. */
  canSearch: boolean;
}

export function useLivePoiSearch({
  adventureId,
  segmentId,
}: UseLivePoiSearchParams): UseLivePoiSearchResult {
  const { isOnline } = useNetworkStatus();
  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive);
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute);
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm);
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm);
  const visibleLayers = useMapStore((s) => s.visibleLayers);
  const activeAccommodationTypes = useMapStore((s) => s.activeAccommodationTypes);
  const { data: profile } = useProfile();
  const overpassEnabled = profile?.overpassEnabled ?? false;

  // Calques visibles → liste plate de PoiCategory pour l'API. Pour les hébergements,
  // seuls les sous-types actifs (ex. hotel par défaut). Hors queryKey (cf. en-tête).
  const categories: PoiCategory[] = [...visibleLayers].flatMap((layer) => {
    const cats = LAYER_CATEGORIES[layer];
    return layer === 'accommodations'
      ? cats.filter((c) => activeAccommodationTypes.has(c))
      : cats;
  });

  const targetKm =
    currentKmOnRoute !== null
      ? Math.round((currentKmOnRoute + targetAheadKm) * 10) / 10
      : null;

  const {
    data: poisData,
    isFetching,
    isError,
    isSuccess,
    refetch,
  } = useQuery<Poi[]>({
    // `categories` volontairement EXCLU de la clé (recherche explicite via refetch()).
    queryKey: [
      'pois',
      'live',
      { segmentId, targetKm, radiusKm: searchRadiusKm, overpassEnabled },
    ],
    queryFn: () => {
      if (!segmentId || targetKm === null) return Promise.resolve([]);
      return getLivePois({
        segmentId,
        targetKm,
        radiusKm: searchRadiusKm,
        overpassEnabled,
        categories,
      });
    },
    enabled: false,
    staleTime: Infinity,
    gcTime: POI_GC_TIME_MS,
  });

  const fetchedPois = poisData ?? EMPTY_POIS;
  const hasFetched = poisData !== undefined;
  const canSearch = isLiveModeActive && targetKm !== null && !!segmentId && isOnline;

  // Write-through N3 (online + succès + non vide). Clé Live dédiée. Skip si vide (évite
  // d'écraser un cache offline valide avec une zone sans POI). Signature anti-doublon.
  const liveCacheKey = `${adventureId}${LIVE_CACHE_SUFFIX}`;
  const writtenSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isOnline || !isSuccess || fetchedPois.length === 0) return;
    const sig = fetchedPois.map((p) => p.id).join(',');
    if (writtenSigRef.current === sig) return;
    writtenSigRef.current = sig;
    void setCachedPois(liveCacheKey, fetchedPois).catch(() => {});
  }, [isOnline, isSuccess, fetchedPois, liveCacheKey]);

  // Fallback offline : lit le cache fichier UNIQUEMENT hors-ligne sans donnée live (ni
  // TanStack persist ni fetch). `setState` vit dans le callback async (jamais synchrone
  // dans le corps d'effet — règle `react-hooks/set-state-in-effect`).
  const [offlinePois, setOfflinePois] = useState<Poi[] | null>(null);
  const needsOfflineFallback = !isOnline && !hasFetched;
  useEffect(() => {
    if (!needsOfflineFallback) return;
    let active = true;
    void getCachedPois(liveCacheKey).then((cached) => {
      if (active && cached) setOfflinePois(cached);
    });
    return () => {
      active = false;
    };
  }, [needsOfflineFallback, liveCacheKey]);

  const pois =
    fetchedPois.length > 0
      ? fetchedPois
      : needsOfflineFallback
        ? (offlinePois ?? EMPTY_POIS)
        : fetchedPois;

  return { pois, hasFetched, isFetching, targetKm, isError, refetch, canSearch };
}
