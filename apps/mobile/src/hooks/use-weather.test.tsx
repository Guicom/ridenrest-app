import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import type { MapSegmentData, WeatherForecast } from '@ridenrest/shared';
import { createElement, type ReactNode } from 'react';

import { useWeather, type UseWeatherParams } from '@/hooks/use-weather';
import * as weatherApi from '@/lib/api/weather';
import * as weatherCache from '@/lib/cache/weather-cache';

// Hook météo planning (MOB-4.8 / T8). On exerce le hook réel dans un QueryClientProvider
// en mockant la façade réseau, le cache fichier offline et la connectivité. On vérifie :
// query key {segmentId,departureTime,speedKmh,stageDepartures}, staleTime 1 h, PAS de
// refetchInterval, le réalignement km cumulés, le write-through au succès, et le fallback
// offline (cache fichier quand aucune donnée live).
//
// Pattern probe-component (PAS `renderHook` — peu fiable RNTL v14 + React 19, cf.
// use-segments.test). Le hook est capturé dans le corps de rendu synchrone d'une sonde.

jest.mock('@/lib/api/weather', () => ({ getWeatherForecast: jest.fn() }));
jest.mock('@/lib/cache/weather-cache', () => ({
  getCachedWeather: jest.fn(),
  setCachedWeather: jest.fn(),
}));

let mockOnline = true;
jest.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: () => ({ isOnline: mockOnline, isInternetReachable: mockOnline }),
}));

const mockGet = weatherApi.getWeatherForecast as jest.Mock;
const mockGetCached = weatherCache.getCachedWeather as jest.Mock;
const mockSetCached = weatherCache.setCachedWeather as jest.Mock;

function makeSegment(id: string, cumulativeStartKm: number): MapSegmentData {
  return {
    id,
    name: `Segment ${id}`,
    orderIndex: 0,
    cumulativeStartKm,
    distanceKm: 10,
    parseStatus: 'done',
    source: null,
    waypoints: [
      { lat: 45, lng: 5, distKm: cumulativeStartKm },
      { lat: 45.1, lng: 5.1, distKm: cumulativeStartKm + 5 },
    ],
    boundingBox: null,
  };
}

function makeForecast(segmentId: string): WeatherForecast {
  return {
    segmentId,
    cachedAt: '2026-06-15T08:00:00.000Z',
    expiresAt: '2026-06-15T09:00:00.000Z',
    waypoints: [
      {
        km: 0,
        forecastAt: '2026-06-15T08:00:00.000Z',
        temperatureC: 18,
        precipitationProbability: 10,
        windSpeedKmh: 20,
        windDirection: 90,
        weatherCode: 0,
        iconEmoji: '☀️',
      },
      {
        km: 5,
        forecastAt: '2026-06-15T09:00:00.000Z',
        temperatureC: 20,
        precipitationProbability: 5,
        windSpeedKmh: 12,
        windDirection: 180,
        weatherCode: 1,
        iconEmoji: '🌤',
      },
    ],
  };
}

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

async function mountHook(
  params: UseWeatherParams,
  qc: QueryClient,
): Promise<{ current: ReturnType<typeof useWeather> }> {
  const ref = { current: undefined as unknown as ReturnType<typeof useWeather> };
  function Probe() {
    ref.current = useWeather(params);
    return null;
  }
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }
  render(createElement(Wrapper, null, createElement(Probe)));
  return ref;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  mockGetCached.mockResolvedValue(null);
  mockSetCached.mockResolvedValue(undefined);
});

describe('useWeather (online)', () => {
  it('appelle la façade avec les params pace + réaligne les km en cumulé', async () => {
    mockGet.mockResolvedValue(makeForecast('s1'));
    const qc = newClient();
    const ref = await mountHook(
      {
        adventureId: 'adv-1',
        segments: [makeSegment('s1', 10)],
        weatherActive: true,
        departureTime: '2026-06-15T07:30:00.000Z',
        speedKmh: 18,
        stageDepartures: null,
      },
      qc,
    );

    await waitFor(() => expect(ref.current.weatherPoints).toHaveLength(2));
    // km segment-relatifs (0,5) + offset cumulativeStartKm (10) → 10,15.
    expect(ref.current.weatherPoints.map((p) => p.km)).toEqual([10, 15]);
    expect(mockGet).toHaveBeenCalledWith({
      segmentId: 's1',
      departureTime: '2026-06-15T07:30:00.000Z',
      speedKmh: 18,
      stageDepartures: undefined,
    });
  });

  it('query key = [weather, {segmentId,departureTime,speedKmh,stageDepartures}], staleTime 1 h, sans refetchInterval', async () => {
    mockGet.mockResolvedValue(makeForecast('s1'));
    const qc = newClient();
    await mountHook(
      {
        adventureId: 'adv-1',
        segments: [makeSegment('s1', 0)],
        weatherActive: true,
        departureTime: '2026-06-15T07:30:00.000Z',
        speedKmh: 18,
        stageDepartures: null,
      },
      qc,
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const query = qc.getQueryCache().getAll()[0]!;
    expect(query.queryKey).toEqual([
      'weather',
      {
        segmentId: 's1',
        departureTime: '2026-06-15T07:30:00.000Z',
        speedKmh: 18,
        stageDepartures: null,
      },
    ]);
    // `staleTime`/`refetchInterval` vivent sur QueryObserverOptions (pas le type
    // de base `query.options`) → cast pour l'assertion runtime.
    const opts = query.options as {
      staleTime?: number;
      refetchInterval?: unknown;
    };
    expect(opts.staleTime).toBe(3_600_000);
    expect(opts.refetchInterval).toBeUndefined();
  });

  it('stageDepartures prioritaire → departureTime null dans la key, non envoyé', async () => {
    mockGet.mockResolvedValue(makeForecast('s1'));
    const qc = newClient();
    const sd = JSON.stringify([
      { startKm: 0, endKm: 10, departureTime: '2026-06-15T07:00:00.000Z' },
    ]);
    await mountHook(
      {
        adventureId: 'adv-1',
        segments: [makeSegment('s1', 0)],
        weatherActive: true,
        departureTime: '2026-06-15T07:30:00.000Z',
        speedKmh: 18,
        stageDepartures: sd,
      },
      qc,
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith({
      segmentId: 's1',
      departureTime: undefined,
      speedKmh: 18,
      stageDepartures: sd,
    });
    expect((qc.getQueryCache().getAll()[0]!.queryKey[1] as { departureTime: unknown }).departureTime).toBeNull();
  });

  it('write-through cache au succès complet', async () => {
    const fc = makeForecast('s1');
    mockGet.mockResolvedValue(fc);
    const qc = newClient();
    await mountHook(
      {
        adventureId: 'adv-1',
        segments: [makeSegment('s1', 0)],
        weatherActive: true,
        stageDepartures: null,
      },
      qc,
    );

    await waitFor(() => expect(mockSetCached).toHaveBeenCalledWith('adv-1', [fc]));
  });

  it('sans pace → API appelée sans departureTime ni speedKmh (fallback serveur AC3)', async () => {
    mockGet.mockResolvedValue(makeForecast('s1'));
    const qc = newClient();
    await mountHook(
      {
        adventureId: 'adv-1',
        segments: [makeSegment('s1', 0)],
        weatherActive: true,
        stageDepartures: null,
      },
      qc,
    );

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith({
      segmentId: 's1',
      departureTime: undefined,
      speedKmh: undefined,
      stageDepartures: undefined,
    });
  });

  it('weatherActive=false → aucune requête', async () => {
    const qc = newClient();
    await mountHook(
      {
        adventureId: 'adv-1',
        segments: [makeSegment('s1', 0)],
        weatherActive: false,
        stageDepartures: null,
      },
      qc,
    );
    await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(0));
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('useWeather (offline)', () => {
  it('hors-ligne sans data live → fallback cache fichier (km réalignés)', async () => {
    mockOnline = false;
    mockGetCached.mockResolvedValue([makeForecast('s1')]);
    const qc = newClient();
    const ref = await mountHook(
      {
        adventureId: 'adv-1',
        segments: [makeSegment('s1', 10)],
        weatherActive: true,
        stageDepartures: null,
      },
      qc,
    );

    await waitFor(() => expect(ref.current.weatherPoints).toHaveLength(2));
    expect(ref.current.weatherPoints.map((p) => p.km)).toEqual([10, 15]);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGetCached).toHaveBeenCalledWith('adv-1');
  });
});
