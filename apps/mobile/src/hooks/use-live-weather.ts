import { useQuery } from '@tanstack/react-query';
import type { WeatherForecast, WeatherPoint } from '@ridenrest/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { getWeatherForecast } from '@/lib/api/weather';
import { getCachedWeather, setCachedWeather } from '@/lib/cache/weather-cache';
import { useLiveStore } from '@/lib/stores/live.store';
import { useMapStore } from '@/lib/stores/map.store';

// Hook météo **Live** (MOB-5.6) — port de `apps/web/src/hooks/use-live-weather.ts`,
// augmenté du cache fichier offline (parité `use-weather` planning) et d'un garde
// `weatherActive` (anti-saturation Open-Meteo : on ne fetch que si la météo est affichée).
//
// La météo est calée sur la **position GPS projetée** (`currentKmOnRoute`, km cumulé
// aventure) et l'**allure** (`speedKmh`). RGPD (NFR-012) : la requête ne porte QUE
// `segmentId` + `fromKm` (km relatif cumulé) + `departureTime` + `speedKmh` — JAMAIS de
// lat/lng. Le `WeatherPoint.km` renvoyé est **déjà cumulé aventure** (serveur :
// `cumulativeStartKm + wp.dist_km`) → aucun ré-offset côté client (contrairement au
// planning multi-segment), il s'aligne directement sur les `waypoints.distKm` cumulés
// de la trace (overlay `WeatherLayer`).
//
// Seuil 5 km (AC3) : on ne re-fetch pas tant que la position n'a pas bougé d'au moins
// `TRIGGER_THRESHOLD_KM` depuis le dernier fetch (parité serveur `SAMPLE_KM=5`). La
// queryKey arrondit `fromKm` au multiple de 5 le plus proche (cache-hits) ; `placeholderData`
// conserve les données précédentes pendant le refetch (pas d'écran vide).
//
// Offline (AC5) : write-through `setCachedWeather` + fallback `getCachedWeather`. Clé de
// cache **distincte** (`${adventureId}:live`) pour ne PAS écraser le cache planning
// multi-segment de la même aventure (qui stocke `WeatherForecast[]` complet).

const TRIGGER_THRESHOLD_KM = 5;
const WEATHER_STALE_MS = 5 * 60 * 1000;

/** Clé de cache fichier dédiée au Live (séparée du cache planning par aventure). */
function liveCacheKey(adventureId: string): string {
  return `${adventureId}:live`;
}

export interface UseLiveWeatherOptions {
  /** Aventure (clé du cache fichier offline). Requis pour le write-through/fallback. */
  adventureId?: string;
  /** ISO 8601 — heure de départ saisie par l'utilisateur (override du pace-adjusted). */
  departureTime?: string;
}

export interface UseLiveWeatherResult {
  /** Points météo en km **cumulés** (alignés trace). */
  weatherPoints: WeatherPoint[];
  /** Chargement réel (paused-safe : faux hors-ligne sans données → pas de skeleton infini). */
  isPending: boolean;
  isError: boolean;
  /** Live actif + km connu mais position GPS perdue (AC5). */
  isGpsLost: boolean;
}

export function useLiveWeather(
  segmentId: string | undefined,
  options?: UseLiveWeatherOptions,
): UseLiveWeatherResult {
  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive);
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute);
  const speedKmh = useLiveStore((s) => s.speedKmh);
  const currentPosition = useLiveStore((s) => s.currentPosition);
  // `weatherActive` vit dans le store carte (visibilité de l'overlay météo, partagée
  // avec le planning) — il gate aussi le fetch Live (anti-saturation Open-Meteo).
  const weatherActive = useMapStore((s) => s.weatherActive);

  const adventureId = options?.adventureId;

  const lastFetchKmRef = useRef<number | null>(null);
  const [activeFetchKm, setActiveFetchKm] = useState<number | null>(null);

  // Réinitialise le seuil à la désactivation du Live — évite de bloquer le premier fetch
  // d'une nouvelle session si l'utilisateur se trouve dans les 5 km du dernier point connu.
  useEffect(() => {
    if (!isLiveModeActive) {
      lastFetchKmRef.current = null;
      // Sync légitime d'un flag externe (store Live → état local) : on remet le seuil à
      // zéro à la SORTIE du Live. Le React Compiler eslint flag ce setState-in-effect, mais
      // c'est exactement « subscribe to external system → setState » (cf. convention équipe
      // eslint-disable + rationale, MOB-5.4). [MOB-6.1 : correctif de lint pré-existant.]
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset sync depuis le store Live
      setActiveFetchKm(null);
    }
  }, [isLiveModeActive]);

  // Met à jour `activeFetchKm` quand la position GPS a bougé d'au moins 5 km (AC3).
  useEffect(() => {
    if (currentKmOnRoute === null) return;
    const shouldFetch =
      lastFetchKmRef.current === null ||
      Math.abs(currentKmOnRoute - lastFetchKmRef.current) >= TRIGGER_THRESHOLD_KM;
    if (shouldFetch) {
      lastFetchKmRef.current = currentKmOnRoute;
      setActiveFetchKm(currentKmOnRoute);
    }
  }, [currentKmOnRoute]);

  // L'override utilisateur (s'il existe) entre dans la queryKey ; le départ pace-adjusted,
  // lui, est calculé au moment du fetch (cf. queryFn) — `Date.now()` ne doit PAS être lu
  // pendant le rendu (pureté React).
  const userDepartureTime = options?.departureTime;

  const fromKmRounded =
    activeFetchKm !== null ? Math.round(activeFetchKm / 5) * 5 : null;

  const { data, isPending, isError, fetchStatus } = useQuery<WeatherForecast>({
    queryKey: [
      'weather',
      segmentId,
      'live',
      {
        fromKm: fromKmRounded,
        departureTime: userDepartureTime,
        speedKmh: speedKmh > 0 ? speedKmh : undefined,
      },
    ],
    queryFn: () => {
      // Départ pace-adjusted (AC1) : l'override prime ; sinon, si l'allure est connue, on
      // recule l'heure de départ pour que l'ETA à `activeFetchKm` soit « maintenant ».
      // Sans allure → `undefined` → fallback heure actuelle serveur (AC2, FR-055).
      const departureTime = userDepartureTime
        ? userDepartureTime
        : speedKmh > 0 && activeFetchKm !== null
          ? new Date(Date.now() - (activeFetchKm / speedKmh) * 3_600_000).toISOString()
          : undefined;
      return getWeatherForecast({
        segmentId: segmentId!,
        fromKm: activeFetchKm!,
        ...(departureTime ? { departureTime } : {}),
        ...(speedKmh > 0 ? { speedKmh } : {}),
      });
    },
    // Pas de garde `isOnline` ici : `networkMode: 'online'` (défaut) + `onlineManager`
    // bridgé NetInfo mettent la query en `fetchStatus: 'paused'` hors-ligne (pas de
    // queryFn appelé). Gater sur `isOnline` la passerait en `disabled` (status pending,
    // fetchStatus idle) → skeleton infini hors-ligne (interdit, cf. project-context).
    enabled:
      isLiveModeActive && weatherActive && activeFetchKm !== null && !!segmentId,
    staleTime: WEATHER_STALE_MS,
    placeholderData: (prev) => prev, // ne pas vider l'affichage au refetch (AC3)
  });

  const hasLiveData = (data?.waypoints?.length ?? 0) > 0;

  // Write-through cache au succès (données non vides) — clé Live dédiée (AC5).
  useEffect(() => {
    if (!weatherActive || !adventureId || !hasLiveData || !data) return;
    void setCachedWeather(liveCacheKey(adventureId), [data]);
  }, [weatherActive, adventureId, hasLiveData, data]);

  // Fallback offline : on charge le cache fichier UNIQUEMENT sans donnée live (cold start
  // hors-ligne / cache TanStack évincé). Tant que la query garde sa data, le live prime.
  const [cached, setCached] = useState<WeatherForecast | null>(null);
  const shouldLoadCache = weatherActive && Boolean(adventureId) && !hasLiveData;
  useEffect(() => {
    if (!shouldLoadCache || !adventureId) return;
    let cancelled = false;
    void getCachedWeather(liveCacheKey(adventureId)).then((c) => {
      if (!cancelled) setCached(c?.[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldLoadCache, adventureId]);

  const weatherPoints = useMemo<WeatherPoint[]>(
    () => (hasLiveData ? (data?.waypoints ?? []) : (cached?.waypoints ?? [])),
    [hasLiveData, data, cached],
  );

  const isGpsLost =
    isLiveModeActive && currentPosition === null && currentKmOnRoute !== null;

  // Paused-safe (project-context) : hors-ligne sans données, la query reste `pending` +
  // `fetchStatus: 'paused'` → ne JAMAIS afficher un skeleton infini.
  return {
    weatherPoints,
    isPending: isPending && fetchStatus !== 'paused',
    isError,
    isGpsLost,
  };
}
