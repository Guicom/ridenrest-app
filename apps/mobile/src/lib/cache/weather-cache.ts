import { File } from 'expo-file-system';
import type { WeatherForecast } from '@ridenrest/shared';

import { ensureDir, WEATHER_DIR } from './cache-manager';

// Cache N3 — météo par aventure (MOB-3.5 / archi §Data Architecture). Branché à la
// carte planning en MOB-4.8 : write-through au succès de `use-weather`, fallback
// offline. Sérialisation JSON : `/cache/weather/{adventureId}.json`.
//
// Une aventure porte 1..N segments (MAX_SEGMENTS_FREE) → on cache **le tableau** des
// prévisions par segment (`WeatherForecast[]`). Le hook réaligne ensuite chaque point
// en km cumulés via le `cumulativeStartKm` du segment correspondant. (Type figé en
// MOB-4.8 — c'était le TODO du squelette MOB-3.5.)
export type CachedWeather = WeatherForecast[];

function weatherFile(adventureId: string): File {
  return new File(`${WEATHER_DIR}/${adventureId}.json`);
}

/**
 * Lit la météo cachée d'une aventure. `null` si absente ou JSON illisible (miss
 * propre — ne jette jamais, offline-safe).
 */
export async function getCachedWeather(
  adventureId: string,
): Promise<CachedWeather | null> {
  const file = weatherFile(adventureId);
  if (!file.exists) return null;
  try {
    return JSON.parse(await file.text()) as CachedWeather;
  } catch {
    return null;
  }
}

/** Écrit (write-through) la météo d'une aventure. `ensureDir` garantit `weather/`. */
export async function setCachedWeather(
  adventureId: string,
  data: CachedWeather,
): Promise<void> {
  ensureDir(WEATHER_DIR);
  weatherFile(adventureId).write(JSON.stringify(data));
}
