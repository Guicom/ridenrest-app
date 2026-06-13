import { Directory, File, Paths } from 'expo-file-system';
import type { AdventureResponse } from '@ridenrest/shared';

// Orchestrateur du cache offline fichiers (MOB-3.5 / archi §Data Architecture —
// table N1/N2/N3 + politique de purge). API **nouvelle** `expo-file-system` SDK 56
// (`File`/`Directory`/`Paths`) — pas l'API legacy. Le cache vit sous le répertoire
// **cache** OS (`Paths.cache`) : purgeable par le système, cohérent avec un cache
// offline non critique. Données non sensibles → AUCUN chiffrement (les secrets
// restent en `expo-secure-store`, jamais ici — cf. AGENTS.md §Auth).

// --- Chemins canoniques (archi : /cache/gpx, /cache/pois, /cache/weather) ---

/** Racine du cache offline = répertoire cache OS. */
export const CACHE_ROOT = Paths.cache.uri;
/** Sous-dossier des traces GPX (N2). Un fichier par segment : `{segmentId}.gpx`. */
export const GPX_DIR = `${CACHE_ROOT}/gpx`;
/** Sous-dossier des POIs (N3, squelette). Un fichier par aventure : `{adventureId}.json`. */
export const POIS_DIR = `${CACHE_ROOT}/pois`;
/** Sous-dossier météo (N3, squelette). Un fichier par aventure : `{adventureId}.json`. */
export const WEATHER_DIR = `${CACHE_ROOT}/weather`;

const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;
const TWENTY_DAYS = 20 * 24 * 60 * 60 * 1000;

/**
 * Crée le répertoire `dirUri` s'il n'existe pas (idempotent). `intermediates`
 * crée la chaîne parente au besoin. Appelé avant toute écriture par les caches
 * (gpx/poi/weather).
 */
export function ensureDir(dirUri: string): void {
  const dir = new Directory(dirUri);
  if (!dir.exists) {
    dir.create({ intermediates: true });
  }
}

/**
 * Politique de purge — RECOPIE FIDÈLE du pseudo-code archi (l.690-707).
 *
 * - `endDate` dépassée de **> 10 jours** → purge.
 * - sinon, sans `endDate` mais `startDate` **> 20 jours** → purge.
 * - sinon (ni l'un ni l'autre, ou trop récent) → pas de purge auto (fallback manuel).
 *
 * Dates en **camelCase** ISO 8601 (sérialisation Drizzle/API). `now` injectable
 * pour des tests déterministes (défaut `Date.now()`). Synchrone (calcul pur) — la
 * version archi était `async` mais aucun await n'y est nécessaire.
 */
export function shouldPurgeAdventure(
  adventure: Pick<AdventureResponse, 'startDate' | 'endDate'>,
  now: number = Date.now(),
): boolean {
  if (adventure.endDate) {
    return now - new Date(adventure.endDate).getTime() > TEN_DAYS;
  }
  if (adventure.startDate) {
    return now - new Date(adventure.startDate).getTime() > TWENTY_DAYS;
  }
  return false; // Ni start ni end : pas de purge auto, fallback manuel (AC4).
}

/** Supprime un fichier s'il existe (idempotent — ignore les absents). */
function deleteIfExists(fileUri: string): void {
  const file = new File(fileUri);
  if (file.exists) file.delete();
}

/**
 * Purge les fichiers cache d'UNE aventure (idempotent) :
 *   - `/cache/gpx/{segmentId}.gpx` pour chaque segment fourni,
 *   - `/cache/pois/{adventureId}.json`,
 *   - `/cache/weather/{adventureId}.json`.
 * Ignore silencieusement les fichiers absents. Ne touche QUE cette aventure.
 */
export function purgeAdventureCache(
  adventureId: string,
  segmentIds: string[] = [],
): Promise<void> {
  for (const segmentId of segmentIds) {
    deleteIfExists(`${GPX_DIR}/${segmentId}.gpx`);
  }
  deleteIfExists(`${POIS_DIR}/${adventureId}.json`);
  deleteIfExists(`${WEATHER_DIR}/${adventureId}.json`);
  return Promise.resolve();
}

/**
 * Résout les ids de segments d'une aventure (les GPX étant indexés par segment).
 * La liste N1 (TanStack Query persisté) ne porte PAS les segments → on injecte un
 * resolver optionnel (le listener T6 peut le brancher sur le cache `segments`).
 * Sans resolver, on purge tout de même pois/weather (indexés par aventure).
 */
export type SegmentIdsResolver = (adventureId: string) => string[] | undefined;

/**
 * Itère la liste N1 (issue du cache persisté), applique `shouldPurgeAdventure`,
 * purge les éligibles. Appelé au passage **foreground** via le listener centralisé
 * (T6 — `use-app-state-refetch`), JAMAIS via un listener `AppState` séparé.
 * Robuste : liste vide/indéfinie → no-op.
 */
export async function runCachePurge(
  adventures: AdventureResponse[] | undefined,
  getSegmentIds?: SegmentIdsResolver,
  now: number = Date.now(),
): Promise<void> {
  if (!adventures || adventures.length === 0) return;
  for (const adventure of adventures) {
    if (shouldPurgeAdventure(adventure, now)) {
      await purgeAdventureCache(adventure.id, getSegmentIds?.(adventure.id) ?? []);
    }
  }
}

/**
 * Purge MANUELLE d'une aventure (SANS condition de date). Conservée pour la purge
 * ciblée par aventure ; même effet que `purgeAdventureCache`.
 */
export function clearAdventureCache(
  adventureId: string,
  segmentIds: string[] = [],
): Promise<void> {
  return purgeAdventureCache(adventureId, segmentIds);
}

/**
 * Vrai si au moins un fichier de cache offline existe (gpx/pois/weather). Lecture
 * SYNCHRONE du FS (nouvelle API SDK 56). Sert à n'afficher la section « Vider le
 * cache hors ligne » des Paramètres QUE s'il y a réellement quelque chose à vider.
 */
export function hasCachedData(): boolean {
  for (const dirUri of [GPX_DIR, POIS_DIR, WEATHER_DIR]) {
    const dir = new Directory(dirUri);
    if (dir.exists && dir.list().length > 0) return true;
  }
  return false;
}

/**
 * Purge GLOBALE du cache offline (toutes aventures) — action manuelle des
 * Paramètres (fallback AC4, couvre aussi les aventures sans dates jamais purgées
 * auto). Supprime les répertoires gpx/pois/weather + leur contenu (idempotent ;
 * recréés à la prochaine écriture).
 */
export function clearAllCache(): Promise<void> {
  for (const dirUri of [GPX_DIR, POIS_DIR, WEATHER_DIR]) {
    const dir = new Directory(dirUri);
    if (dir.exists) dir.delete();
  }
  return Promise.resolve();
}
