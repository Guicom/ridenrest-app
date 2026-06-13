import * as ExpoFs from 'expo-file-system';
import type { AdventureResponse } from '@ridenrest/shared';

import {
  CACHE_ROOT,
  clearAdventureCache,
  ensureDir,
  GPX_DIR,
  POIS_DIR,
  purgeAdventureCache,
  runCachePurge,
  shouldPurgeAdventure,
  WEATHER_DIR,
} from './cache-manager';

// Helpers FS en mémoire exposés par `__mocks__/expo-file-system.js` (non typés par
// le vrai module → on importe le namespace mocké et on caste). MÊME instance que
// celle importée par le code de prod (auto-mock jest sur le node_module).
const mockFs = ExpoFs as unknown as {
  __files: Map<string, string>;
  __dirs: Set<string>;
  __resetFs: () => void;
};

const DAY = 24 * 60 * 60 * 1000;

function adv(partial: Partial<AdventureResponse>): AdventureResponse {
  return {
    id: 'a1',
    userId: 'u1',
    name: 'Test',
    totalDistanceKm: 0,
    status: 'planning',
    densityStatus: 'idle',
    densityProgress: 0,
    avgSpeedKmh: 20,
    routingProfile: 'road' as AdventureResponse['routingProfile'],
    hasStravaSegment: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...partial,
  };
}

beforeEach(() => {
  mockFs.__resetFs();
});

describe('shouldPurgeAdventure (MOB-3.5 / AC4 — bornes exactes)', () => {
  const now = Date.now();

  it('endDate dépassée de > 10 j → true', () => {
    const a = adv({ endDate: new Date(now - 11 * DAY).toISOString() });
    expect(shouldPurgeAdventure(a, now)).toBe(true);
  });

  it('endDate dépassée de exactement 10 j → false (borne stricte >)', () => {
    const a = adv({ endDate: new Date(now - 10 * DAY).toISOString() });
    expect(shouldPurgeAdventure(a, now)).toBe(false);
  });

  it('endDate dépassée de < 10 j → false', () => {
    const a = adv({ endDate: new Date(now - 5 * DAY).toISOString() });
    expect(shouldPurgeAdventure(a, now)).toBe(false);
  });

  it('endDate prioritaire sur startDate (endDate récente, startDate ancienne) → false', () => {
    const a = adv({
      startDate: new Date(now - 100 * DAY).toISOString(),
      endDate: new Date(now - 1 * DAY).toISOString(),
    });
    expect(shouldPurgeAdventure(a, now)).toBe(false);
  });

  it('pas d’endDate, startDate > 20 j → true', () => {
    const a = adv({
      startDate: new Date(now - 21 * DAY).toISOString(),
      endDate: null,
    });
    expect(shouldPurgeAdventure(a, now)).toBe(true);
  });

  it('pas d’endDate, startDate exactement 20 j → false (borne stricte >)', () => {
    const a = adv({
      startDate: new Date(now - 20 * DAY).toISOString(),
      endDate: null,
    });
    expect(shouldPurgeAdventure(a, now)).toBe(false);
  });

  it('ni startDate ni endDate → false (fallback manuel uniquement)', () => {
    const a = adv({ startDate: null, endDate: null });
    expect(shouldPurgeAdventure(a, now)).toBe(false);
  });
});

describe('ensureDir (MOB-3.5)', () => {
  it('crée le répertoire s’il est absent puis est idempotent', () => {
    expect(mockFs.__dirs.has(GPX_DIR)).toBe(false);
    ensureDir(GPX_DIR);
    expect(mockFs.__dirs.has(GPX_DIR)).toBe(true);
    // Idempotent : un second appel ne jette pas.
    expect(() => ensureDir(GPX_DIR)).not.toThrow();
  });
});

describe('purgeAdventureCache (MOB-3.5 / AC4)', () => {
  it('supprime gpx de tous les segments + pois + weather', async () => {
    ensureDir(GPX_DIR);
    ensureDir(POIS_DIR);
    ensureDir(WEATHER_DIR);
    mockFs.__files.set(`${GPX_DIR}/seg1.gpx`, '<gpx/>');
    mockFs.__files.set(`${GPX_DIR}/seg2.gpx`, '<gpx/>');
    mockFs.__files.set(`${POIS_DIR}/a1.json`, '[]');
    mockFs.__files.set(`${WEATHER_DIR}/a1.json`, '{}');
    // Fichier d’une AUTRE aventure : ne doit PAS être touché.
    mockFs.__files.set(`${GPX_DIR}/other.gpx`, '<gpx/>');

    await purgeAdventureCache('a1', ['seg1', 'seg2']);

    expect(mockFs.__files.has(`${GPX_DIR}/seg1.gpx`)).toBe(false);
    expect(mockFs.__files.has(`${GPX_DIR}/seg2.gpx`)).toBe(false);
    expect(mockFs.__files.has(`${POIS_DIR}/a1.json`)).toBe(false);
    expect(mockFs.__files.has(`${WEATHER_DIR}/a1.json`)).toBe(false);
    expect(mockFs.__files.has(`${GPX_DIR}/other.gpx`)).toBe(true);
  });

  it('idempotent : ne jette pas sur fichiers absents', async () => {
    await expect(
      purgeAdventureCache('ghost', ['nope']),
    ).resolves.toBeUndefined();
  });
});

describe('runCachePurge (MOB-3.5 / AC4)', () => {
  it('purge uniquement les aventures éligibles', async () => {
    const now = Date.now();
    ensureDir(POIS_DIR);
    mockFs.__files.set(`${POIS_DIR}/stale.json`, '[]');
    mockFs.__files.set(`${POIS_DIR}/fresh.json`, '[]');

    const adventures = [
      adv({ id: 'stale', endDate: new Date(now - 30 * DAY).toISOString() }),
      adv({ id: 'fresh', endDate: new Date(now - 1 * DAY).toISOString() }),
    ];

    await runCachePurge(adventures, undefined, now);

    expect(mockFs.__files.has(`${POIS_DIR}/stale.json`)).toBe(false);
    expect(mockFs.__files.has(`${POIS_DIR}/fresh.json`)).toBe(true);
  });

  it('liste vide ou indéfinie → no-op sans erreur', async () => {
    await expect(runCachePurge([])).resolves.toBeUndefined();
    await expect(runCachePurge(undefined)).resolves.toBeUndefined();
  });
});

describe('clearAdventureCache (MOB-3.5 / AC4 — fallback manuel)', () => {
  it('purge sans condition de date', async () => {
    ensureDir(POIS_DIR);
    mockFs.__files.set(`${POIS_DIR}/manual.json`, '[]');
    mockFs.__files.set(`${GPX_DIR}/s.gpx`, '<gpx/>');

    await clearAdventureCache('manual', ['s']);

    expect(mockFs.__files.has(`${POIS_DIR}/manual.json`)).toBe(false);
    expect(mockFs.__files.has(`${GPX_DIR}/s.gpx`)).toBe(false);
  });
});

describe('CACHE_ROOT (MOB-3.5)', () => {
  it('pointe sous le répertoire cache OS', () => {
    expect(CACHE_ROOT).toContain('mock-cache');
  });
});
