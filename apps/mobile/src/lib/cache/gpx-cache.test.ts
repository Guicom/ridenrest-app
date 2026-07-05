import * as ExpoFs from 'expo-file-system';

import { GPX_DIR } from './cache-manager';
import {
  getCachedGpx,
  hasCachedGpx,
  loadSegmentGpx,
  setCachedGpx,
} from './gpx-cache';

const mockFs = ExpoFs as unknown as {
  __files: Map<string, string>;
  __dirs: Set<string>;
  __resetFs: () => void;
};

const SAMPLE = '<gpx><trk><name>seg</name></trk></gpx>';

beforeEach(() => {
  mockFs.__resetFs();
});

describe('gpx-cache (MOB-3.5 / N2 — câblé)', () => {
  it('write → read round-trip', async () => {
    await setCachedGpx('seg1', SAMPLE);
    expect(await getCachedGpx('seg1')).toBe(SAMPLE);
  });

  it('read miss → null', async () => {
    expect(await getCachedGpx('ghost')).toBeNull();
  });

  it('setCachedGpx crée le répertoire gpx/ (ensureDir)', async () => {
    expect(mockFs.__dirs.has(GPX_DIR)).toBe(false);
    await setCachedGpx('seg1', SAMPLE);
    expect(mockFs.__dirs.has(GPX_DIR)).toBe(true);
  });

  it('hasCachedGpx reflète la présence du fichier', async () => {
    expect(await hasCachedGpx('seg1')).toBe(false);
    await setCachedGpx('seg1', SAMPLE);
    expect(await hasCachedGpx('seg1')).toBe(true);
  });
});

describe('loadSegmentGpx (write-through / read-through)', () => {
  it('online : fetch → write-through → renvoie le texte', async () => {
    const fetcher = jest.fn().mockResolvedValue(SAMPLE);
    const result = await loadSegmentGpx('seg1', fetcher, true);
    expect(result).toBe(SAMPLE);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Write-through : la valeur est désormais en cache.
    expect(await getCachedGpx('seg1')).toBe(SAMPLE);
  });

  it('offline : lit le cache sans appeler le réseau', async () => {
    await setCachedGpx('seg1', SAMPLE);
    const fetcher = jest.fn();
    const result = await loadSegmentGpx('seg1', fetcher, false);
    expect(result).toBe(SAMPLE);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('online mais fetch échoue : fallback cache', async () => {
    await setCachedGpx('seg1', SAMPLE);
    const fetcher = jest.fn().mockRejectedValue(new Error('network'));
    const result = await loadSegmentGpx('seg1', fetcher, true);
    expect(result).toBe(SAMPLE);
  });

  it('offline et cache vide → null (lecture seule sans crash)', async () => {
    const result = await loadSegmentGpx('ghost', jest.fn(), false);
    expect(result).toBeNull();
  });
});
