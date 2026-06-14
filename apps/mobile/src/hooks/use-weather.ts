import { useQueries } from '@tanstack/react-query';
import type { MapSegmentData, WeatherPoint } from '@ridenrest/shared';
import { useMemo } from 'react';

import { useNetworkStatus } from '@/hooks/use-network-status';
import { getWeatherForecast } from '@/lib/api/weather';

// Météo du parcours (mode planning) — port iso du web. Une query par segment prêt,
// **gatée par `weatherActive`**. Les `km` des points météo sont segment-relatifs → on
// les ramène en **cumulé** (offset `cumulativeStartKm`) pour coller aux waypoints
// cumulés de la trace (overlay). `staleTime` 1 h (parité TTL serveur).

const WEATHER_STALE_MS = 60 * 60 * 1000;

export interface UseWeatherParams {
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

  return useQueries({
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
    combine: (results): UseWeatherResult => {
      const weatherPoints: WeatherPoint[] = [];
      results.forEach((r, idx) => {
        const segment = readySegments[idx];
        if (!segment || !r.data) return;
        for (const wp of r.data.waypoints) {
          weatherPoints.push({
            ...wp,
            km: segment.cumulativeStartKm + wp.km,
          });
        }
      });
      return {
        weatherPoints,
        isFetching: results.some((r) => r.isFetching),
      };
    },
  });
}
