import { File } from 'expo-file-system';

import { ensureDir, WEATHER_DIR } from './cache-manager';

// Cache N3 — météo par aventure (MOB-3.5 / archi §Data Architecture). **SQUELETTE** :
// API stable + tests read/write/miss, NON branché à un écran. Alimenté en MOB-5/6
// (météo par waypoint). Sérialisation JSON : `/cache/weather/{adventureId}.json`.
//
// Le type météo réel arrivera avec MOB-5/6 (packages/shared). En attendant on type
// le payload `unknown` (sérialisé/désérialisé en JSON) pour ne pas figer un contrat.
// TODO MOB-5/6 : typer via `packages/shared` (ex. `AdventureWeather`).
export type CachedWeather = unknown;

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
