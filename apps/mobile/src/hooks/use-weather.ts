import { useQueries } from '@tanstack/react-query';
import type {
  MapSegmentData,
  WeatherForecast,
  WeatherPoint,
} from '@ridenrest/shared';
import { useEffect, useMemo, useState } from 'react';

import { useNetworkStatus } from '@/hooks/use-network-status';
import { getWeatherForecast } from '@/lib/api/weather';
import { getCachedWeather, setCachedWeather } from '@/lib/cache/weather-cache';

// Météo du parcours (mode planning) — port iso du web. Une query par segment prêt,
// **gatée par `weatherActive`**. Les `km` des points météo sont segment-relatifs → on
// les ramène en **cumulé** (offset `cumulativeStartKm`) pour coller aux waypoints
// cumulés de la trace (overlay). `staleTime` 1 h (parité TTL serveur Redis = refresh
// horaire, PAS de `refetchInterval`).
//
// Offline (AC6) : write-through `setCachedWeather(adventureId, forecasts)` au succès
// complet, fallback `getCachedWeather` quand aucune donnée live (cold start hors-ligne).
// Le cache est indexé **par aventure** → on réaligne chaque prévision via le
// `cumulativeStartKm` du segment correspondant (clé `segmentId`).

const WEATHER_STALE_MS = 60 * 60 * 1000;

export interface UseWeatherParams {
  adventureId: string;
  segments: readonly MapSegmentData[];
  weatherActive: boolean;
  departureTime?: string | null;
  speedKmh?: number;
  stageDepartures?: string | null;
}

export interface UseWeatherResult {
  /** Points météo en km **cumulés** (alignés trace). */
  weatherPoints: WeatherPoint[];
  isFetching: boolean;
}

export function useWeather({
  adventureId,
  segments,
  weatherActive,
  departureTime,
  speedKmh,
  stageDepartures,
}: UseWeatherParams): UseWeatherResult {
  const { isOnline } = useNetworkStatus();

  const readySegments = useMemo(
    () =>
      segments.filter(
        (s) => s.parseStatus === 'done' && (s.waypoints?.length ?? 0) >= 2,
      ),
    [segments],
  );

  const live = useQueries({
    queries: (weatherActive ? readySegments : []).map((segment) => ({
      queryKey: [
        'weather',
        {
          segmentId: segment.id,
          departureTime: stageDepartures ? null : (departureTime ?? null),
          speedKmh: speedKmh ?? null,
          stageDepartures: stageDepartures ?? null,
        },
      ],
      queryFn: () =>
        getWeatherForecast({
          segmentId: segment.id,
          departureTime: stageDepartures
            ? undefined
            : (departureTime ?? undefined),
          speedKmh: speedKmh ?? undefined,
          stageDepartures: stageDepartures ?? undefined,
        }),
      enabled: weatherActive && isOnline && Boolean(segment.id),
      staleTime: WEATHER_STALE_MS,
    })),
    combine: (results) => {
      const forecasts: WeatherForecast[] = [];
      let isFetching = false;
      results.forEach((r, idx) => {
        if (r.isFetching) isFetching = true;
        if (readySegments[idx] && r.data) forecasts.push(r.data);
      });
      return {
        forecasts,
        isFetching,
        allLoaded:
          readySegments.length > 0 &&
          results.every((r) => r.isSuccess || r.isError),
      };
    },
  });

  // Write-through cache au succès complet (toutes les prévisions du jour chargées).
  // `useQueries(combine)` mémoïse son résultat (structural sharing react-query) →
  // l'identité de `live.forecasts` est stable tant que le contenu ne change pas :
  // sûr en dépendance d'effet.
  const hasLiveData = live.forecasts.length > 0;
  const liveForecasts = live.forecasts;
  const allLoaded = live.allLoaded;
  useEffect(() => {
    if (!weatherActive || !adventureId || !allLoaded) return;
    void setCachedWeather(adventureId, liveForecasts);
  }, [weatherActive, adventureId, allLoaded, liveForecasts]);

  // Fallback offline : on charge le cache fichier UNIQUEMENT quand aucune donnée live
  // n'est disponible (cold start hors-ligne / cache TanStack évincé). Tant que les
  // queries gardent leur data (réseau coupé en cours de session), le live prime — on
  // n'a alors pas besoin de réinitialiser `cached` (il est ignoré par `weatherPoints`).
  const [cached, setCached] = useState<WeatherForecast[] | null>(null);
  const shouldLoadCache = weatherActive && Boolean(adventureId) && !hasLiveData;
  useEffect(() => {
    if (!shouldLoadCache) return;
    let cancelled = false;
    void getCachedWeather(adventureId).then((data) => {
      if (!cancelled) setCached(data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [shouldLoadCache, adventureId]);

  // Réalignement km segment-relatif → cumulé (offset par segment, clé `segmentId`).
  // Source = live si dispo, sinon cache offline (sélection à l'intérieur du memo).
  const weatherPoints = useMemo<WeatherPoint[]>(() => {
    const source = hasLiveData ? liveForecasts : (cached ?? []);
    const offsetById = new Map(
      segments.map((s) => [s.id, s.cumulativeStartKm] as const),
    );
    const points: WeatherPoint[] = [];
    for (const forecast of source) {
      const offset = offsetById.get(forecast.segmentId) ?? 0;
      for (const wp of forecast.waypoints) {
        points.push({ ...wp, km: offset + wp.km });
      }
    }
    return points;
  }, [hasLiveData, liveForecasts, cached, segments]);

  return { weatherPoints, isFetching: live.isFetching };
}
