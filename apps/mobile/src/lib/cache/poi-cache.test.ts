import * as ExpoFs from 'expo-file-system';
import type { Poi } from '@ridenrest/shared';

import { POIS_DIR } from './cache-manager';
import { getCachedPois, setCachedPois } from './poi-cache';

const mockFs = ExpoFs as unknown as {
  __files: Map<string, string>;
  __dirs: Set<string>;
  __resetFs: () => void;
};

const POIS: Poi[] = [
  {
    id: 'p1',
    externalId: 'ext1',
    source: 'overpass',
    category: 'hotel',
    name: 'Hôtel du Col',
    lat: 45.9,
    lng: 6.8,
    distFromTraceM: 120,
    distAlongRouteKm: 42,
  },
];

beforeEach(() => {
  mockFs.__resetFs();
});

describe('poi-cache (MOB-3.5 / N3 — squelette, alimenté MOB-4)', () => {
  it('write → read round-trip', async () => {
    await setCachedPois('a1', POIS);
    expect(await getCachedPois('a1')).toEqual(POIS);
  });

  it('read miss → null', async () => {
    expect(await getCachedPois('ghost')).toBeNull();
  });

  it('setCachedPois crée le répertoire pois/', async () => {
    expect(mockFs.__dirs.has(POIS_DIR)).toBe(false);
    await setCachedPois('a1', POIS);
    expect(mockFs.__dirs.has(POIS_DIR)).toBe(true);
  });

  it('JSON corrompu → null (pas de crash)', async () => {
    mockFs.__files.set(`${POIS_DIR}/a1.json`, '{not-json');
    expect(await getCachedPois('a1')).toBeNull();
  });
});
