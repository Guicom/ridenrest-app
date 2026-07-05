import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { WeatherForecast } from '@ridenrest/shared';
import { createElement, type ReactNode } from 'react';

import {
  useLiveWeather,
  type UseLiveWeatherOptions,
} from '@/hooks/use-live-weather';
import * as weatherApi from '@/lib/api/weather';
import * as weatherCache from '@/lib/cache/weather-cache';
import { useLiveStore } from '@/lib/stores/live.store';
import { useMapStore } from '@/lib/stores/map.store';

// Hook météo Live (MOB-5.6 / T6). On exerce le hook réel dans un QueryClientProvider
// en mockant la façade réseau, le cache fichier et la connectivité, et en pilotant les
// stores Live/carte. On vérifie : query key ['weather','live',{segmentId,fromKm,departureTime}],
// seuil 5 km (pas de refetch < 5, refetch ≥ 5), fromKm arrondi /5, départ pace-adjusted +
// override + fallback sans allure, placeholderData, isGpsLost, write-through + fallback cache.
//
// Pattern probe-component (PAS `renderHook` — peu fiable RNTL v14 + React 19).

jest.mock('@/lib/api/weather', () => ({ getWeatherForecast: jest.fn() }));
jest.mock('@/lib/cache/weather-cache', () => ({
  getCachedWeather: jest.fn(),
  setCachedWeather: jest.fn(),
}));

const mockGet = weatherApi.getWeatherForecast as jest.Mock;
const mockGetCached = weatherCache.getCachedWeather as jest.Mock;
const mockSetCached = weatherCache.setCachedWeather as jest.Mock;

const NOW = new Date('2026-06-15T10:00:00.000Z').getTime();

function makeForecast(segmentId = 's1'): WeatherForecast {
  return {
    segmentId,
    cachedAt: '2026-06-15T08:00:00.000Z',
    expiresAt: '2026-06-15T09:00:00.000Z',
    waypoints: [
      {
        km: 10,
        forecastAt: '2026-06-15T10:00:00.000Z',
        temperatureC: 18,
        precipitationProbability: 10,
        windSpeedKmh: 20,
        windDirection: 90,
        weatherCode: 0,
        iconEmoji: '☀️',
      },
    ],
  };
}

function newClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function mountHook(
  segmentId: string | undefined,
  options: UseLiveWeatherOptions,
  qc: QueryClient,
): { current: ReturnType<typeof useLiveWeather> } {
  const ref = { current: undefined as unknown as ReturnType<typeof useLiveWeather> };
  function Probe() {
    ref.current = useLiveWeather(segmentId, options);
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
  onlineManager.setOnline(true);
  mockGetCached.mockResolvedValue(null);
  mockSetCached.mockResolvedValue(undefined);
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  // Live actif + météo active par défaut (gate du fetch).
  useLiveStore.setState({
    isLiveModeActive: true,
    currentPosition: { lat: 45, lng: 5 },
    currentKmOnRoute: null,
    speedKmh: 15,
    weatherDepartureTime: null,
  });
  useMapStore.setState({ weatherActive: true });
});

afterEach(() => {
  (Date.now as jest.Mock).mockRestore?.();
  onlineManager.setOnline(true);
});

describe('useLiveWeather (online)', () => {
  it('query key ["weather",segmentId,"live",{fromKm arrondi /5,departureTime,speedKmh}] + fromKm brut envoyé', async () => {
    mockGet.mockResolvedValue(makeForecast());
    useLiveStore.setState({ currentKmOnRoute: 12, speedKmh: 0 });
    const qc = newClient();
    mountHook('s1', {}, qc);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    // La 1re query (activeFetchKm null) est désactivée ; on cible celle réellement émise.
    const query = qc
      .getQueryCache()
      .getAll()
      .find((q) => (q.queryKey[3] as { fromKm: number | null }).fromKm === 10)!;
    expect(query.queryKey).toEqual([
      'weather',
      's1',
      'live',
      { fromKm: 10, departureTime: undefined, speedKmh: undefined },
    ]);
    // fromKm BRUT (12) envoyé à l'API, mais arrondi (10) dans la clé.
    expect(mockGet).toHaveBeenCalledWith({ segmentId: 's1', fromKm: 12 });
  });

  it('seuil 5 km : pas de refetch < 5 km, refetch ≥ 5 km', async () => {
    mockGet.mockResolvedValue(makeForecast());
    useLiveStore.setState({ currentKmOnRoute: 10, speedKmh: 0 });
    const qc = newClient();
    mountHook('s1', {}, qc);

    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(1));
    expect(mockGet).toHaveBeenLastCalledWith({ segmentId: 's1', fromKm: 10 });

    // +3 km (< 5) → pas de nouveau fetch.
    await act(async () => {
      useLiveStore.setState({ currentKmOnRoute: 13 });
    });
    expect(mockGet).toHaveBeenCalledTimes(1);

    // +6 km depuis le dernier fetch (10 → 16) → refetch.
    await act(async () => {
      useLiveStore.setState({ currentKmOnRoute: 16 });
    });
    await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(2));
    expect(mockGet).toHaveBeenLastCalledWith({ segmentId: 's1', fromKm: 16 });
  });

  it('départ pace-adjusted : now − (fromKm/speed)×3,6e6, + speedKmh', async () => {
    mockGet.mockResolvedValue(makeForecast());
    useLiveStore.setState({ currentKmOnRoute: 20, speedKmh: 10 });
    const qc = newClient();
    mountHook('s1', {}, qc);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    // 20 km à 10 km/h = 2 h → departureTime = NOW − 2 h.
    const expectedDeparture = new Date(NOW - 2 * 3_600_000).toISOString();
    expect(mockGet).toHaveBeenCalledWith({
      segmentId: 's1',
      fromKm: 20,
      departureTime: expectedDeparture,
      speedKmh: 10,
    });
  });

  it('override weatherDepartureTime : prioritaire dans la clé et envoyé tel quel', async () => {
    mockGet.mockResolvedValue(makeForecast());
    useLiveStore.setState({ currentKmOnRoute: 20, speedKmh: 10 });
    const qc = newClient();
    const override = '2026-06-15T07:00:00.000Z';
    mountHook('s1', { departureTime: override }, qc);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const query = qc.getQueryCache().getAll()[0]!;
    expect((query.queryKey[3] as { departureTime: unknown }).departureTime).toBe(override);
    expect(mockGet).toHaveBeenCalledWith({
      segmentId: 's1',
      fromKm: 20,
      departureTime: override,
      speedKmh: 10,
    });
  });

  it('sans allure (speed=0) → ni departureTime ni speedKmh (fallback serveur AC2)', async () => {
    mockGet.mockResolvedValue(makeForecast());
    useLiveStore.setState({ currentKmOnRoute: 10, speedKmh: 0 });
    const qc = newClient();
    mountHook('s1', {}, qc);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(mockGet).toHaveBeenCalledWith({ segmentId: 's1', fromKm: 10 });
  });

  it('placeholderData défini (ne vide pas au refetch) + staleTime 5 min', async () => {
    mockGet.mockResolvedValue(makeForecast());
    useLiveStore.setState({ currentKmOnRoute: 10, speedKmh: 0 });
    const qc = newClient();
    mountHook('s1', {}, qc);

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    const opts = qc.getQueryCache().getAll()[0]!.options as {
      staleTime?: number;
      placeholderData?: unknown;
    };
    expect(opts.staleTime).toBe(5 * 60 * 1000);
    expect(typeof opts.placeholderData).toBe('function');
  });

  it('weatherActive=false → aucune requête', async () => {
    useMapStore.setState({ weatherActive: false });
    useLiveStore.setState({ currentKmOnRoute: 10 });
    const qc = newClient();
    mountHook('s1', {}, qc);
    await waitFor(() => expect(qc.getQueryCache().getAll()).toHaveLength(0));
    expect(mockGet).not.toHaveBeenCalled();
  });

  it('write-through cache au succès (clé Live dédiée)', async () => {
    const fc = makeForecast();
    mockGet.mockResolvedValue(fc);
    useLiveStore.setState({ currentKmOnRoute: 10, speedKmh: 0 });
    const qc = newClient();
    mountHook('s1', { adventureId: 'adv-1' }, qc);

    await waitFor(() =>
      expect(mockSetCached).toHaveBeenCalledWith('adv-1:live', [fc]),
    );
  });

  it('isGpsLost quand Live actif + km connu mais position nulle', async () => {
    useLiveStore.setState({ currentKmOnRoute: 10, currentPosition: null });
    const qc = newClient();
    const ref = mountHook('s1', {}, qc);
    await waitFor(() => expect(ref.current.isGpsLost).toBe(true));
  });
});

describe('useLiveWeather (offline)', () => {
  it('hors-ligne sans data live → fallback cache fichier (clé Live)', async () => {
    onlineManager.setOnline(false); // query paused (networkMode online), pas de fetch
    mockGetCached.mockResolvedValue([makeForecast()]);
    useLiveStore.setState({ currentKmOnRoute: 10, speedKmh: 0 });
    const qc = newClient();
    const ref = mountHook('s1', { adventureId: 'adv-1' }, qc);

    await waitFor(() => expect(ref.current.weatherPoints).toHaveLength(1));
    expect(ref.current.weatherPoints[0]!.km).toBe(10);
    expect(mockGet).not.toHaveBeenCalled();
    expect(mockGetCached).toHaveBeenCalledWith('adv-1:live');
  });
});
