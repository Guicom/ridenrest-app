import { File } from 'expo-file-system';
import type { Poi } from '@ridenrest/shared';

import { ensureDir, POIS_DIR } from './cache-manager';

// Cache N3 — POIs par aventure (MOB-3.5 / archi §Data Architecture). **SQUELETTE** :
// API stable + tests read/write/miss, NON branché à un écran. Alimenté en MOB-4
// (recherche corridor POIs). Sérialisation JSON : `/cache/pois/{adventureId}.json`.
// Type `Poi` importé de `@ridenrest/shared` (jamais redéfini localement).

function poiFile(adventureId: string): File {
  return new File(`${POIS_DIR}/${adventureId}.json`);
}

/**
 * Lit les POIs cachés d'une aventure. `null` si absent ou JSON illisible (miss
 * propre — ne jette jamais, offline-safe).
 */
export async function getCachedPois(adventureId: string): Promise<Poi[] | null> {
  const file = poiFile(adventureId);
  if (!file.exists) return null;
  try {
    return JSON.parse(await file.text()) as Poi[];
  } catch {
    return null;
  }
}

/** Écrit (write-through) les POIs d'une aventure. `ensureDir` garantit `pois/`. */
export async function setCachedPois(
  adventureId: string,
  pois: Poi[],
): Promise<void> {
  ensureDir(POIS_DIR);
  poiFile(adventureId).write(JSON.stringify(pois));
}
