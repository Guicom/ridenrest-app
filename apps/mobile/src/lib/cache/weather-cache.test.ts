import type { WeatherForecast } from '@ridenrest/shared';
import * as ExpoFs from 'expo-file-system';

import { WEATHER_DIR } from './cache-manager';
import { getCachedWeather, setCachedWeather } from './weather-cache';

const mockFs = ExpoFs as unknown as {
  __files: Map<string, string>;
  __dirs: Set<string>;
  __resetFs: () => void;
};

// Payload typé `WeatherForecast[]` depuis MOB-4.8 (1 entrée par segment d'aventure).
const WEATHER: WeatherForecast[] = [
  {
    segmentId: 's1',
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
    ],
  },
];

beforeEach(() => {
  mockFs.__resetFs();
});

describe('weather-cache (N3 — typé WeatherForecast[], branché carte MOB-4.8)', () => {
  it('write → read round-trip', async () => {
    await setCachedWeather('a1', WEATHER);
    expect(await getCachedWeather('a1')).toEqual(WEATHER);
  });

  it('read miss → null', async () => {
    expect(await getCachedWeather('ghost')).toBeNull();
  });

  it('setCachedWeather crée le répertoire weather/', async () => {
    expect(mockFs.__dirs.has(WEATHER_DIR)).toBe(false);
    await setCachedWeather('a1', WEATHER);
    expect(mockFs.__dirs.has(WEATHER_DIR)).toBe(true);
  });

  it('JSON corrompu → null (pas de crash)', async () => {
    mockFs.__files.set(`${WEATHER_DIR}/a1.json`, 'broken{');
    expect(await getCachedWeather('a1')).toBeNull();
  });
});
