import * as ExpoFs from 'expo-file-system';

import { WEATHER_DIR } from './cache-manager';
import { getCachedWeather, setCachedWeather } from './weather-cache';

const mockFs = ExpoFs as unknown as {
  __files: Map<string, string>;
  __dirs: Set<string>;
  __resetFs: () => void;
};

const WEATHER = { tempC: 18, waypoints: [{ km: 0, rain: false }] };

beforeEach(() => {
  mockFs.__resetFs();
});

describe('weather-cache (MOB-3.5 / N3 — squelette, alimenté MOB-5/6)', () => {
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
