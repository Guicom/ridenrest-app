import { File } from 'expo-file-system';

import { ensureDir, GPX_DIR } from './cache-manager';

// Cache N2 — trace GPX (MOB-3.5 / archi §Data Architecture). **Câblé** :
// write-through online (après fetch API → `setCachedGpx`) / read-through offline
// (si `!isOnline` ou fetch en échec → `getCachedGpx`). Un fichier texte UTF-8 par
// segment : `/cache/gpx/{segmentId}.gpx`. Voir `loadSegmentGpx` (point de câblage).

function gpxFile(segmentId: string): File {
  return new File(`${GPX_DIR}/${segmentId}.gpx`);
}

/**
 * Lit la trace GPX cachée d'un segment (UTF-8). `null` si absente (cache miss) —
 * ne jette jamais (offline-safe). Read-through offline.
 */
export async function getCachedGpx(segmentId: string): Promise<string | null> {
  const file = gpxFile(segmentId);
  if (!file.exists) return null;
  try {
    return await file.text();
  } catch {
    // Fichier corrompu/illisible → traité comme un miss (pas de red-box).
    return null;
  }
}

/**
 * Écrit (write-through) la trace GPX d'un segment. `ensureDir` garantit le dossier
 * `gpx/`. Idempotent (écrase la version précédente).
 */
export async function setCachedGpx(
  segmentId: string,
  gpxText: string,
): Promise<void> {
  ensureDir(GPX_DIR);
  gpxFile(segmentId).write(gpxText);
}

/** Vrai si la trace GPX du segment est en cache. */
export async function hasCachedGpx(segmentId: string): Promise<boolean> {
  return gpxFile(segmentId).exists;
}

/**
 * Point de câblage N2 (write-through online / read-through offline) — à utiliser
 * par l'écran/loader qui consomme la trace GPX d'un segment (visualisation carte,
 * arrivée à un epic ultérieur ; MOB-3.2 ne charge que les métadonnées de segment).
 *
 * Contrat :
 *   - **online** : `fetcher()` (appel API), succès → `setCachedGpx` puis renvoie le
 *     texte. Échec réseau → fallback lecture cache (`getCachedGpx`).
 *   - **offline** (`!isOnline`) : lecture directe du cache, sans toucher au réseau.
 *
 * Garde un `null` propre en dernier recours (jamais de throw non géré offline).
 */
export async function loadSegmentGpx(
  segmentId: string,
  fetcher: () => Promise<string>,
  isOnline: boolean,
): Promise<string | null> {
  if (!isOnline) {
    return getCachedGpx(segmentId);
  }
  try {
    const text = await fetcher();
    await setCachedGpx(segmentId, text);
    return text;
  } catch {
    // Fetch en échec (réseau intermittent) → on retombe sur le cache si présent.
    return getCachedGpx(segmentId);
  }
}
