import { useCallback, useState } from 'react';

import { clearAdventureCache } from '@/lib/cache/cache-manager';

// Façade hook du bouton « Vider le cache de cette aventure » (MOB-3.5 / AC4 —
// fallback manuel). Fine couche sur `cache-manager.clearAdventureCache` (purge
// SANS condition de date), avec un état `isPurging` pour le bouton.

export interface UseCachePurge {
  /** Purge manuelle du cache d'une aventure (gpx des segments + pois + weather). */
  clear: (adventureId: string, segmentIds?: string[]) => Promise<void>;
  /** Vrai pendant la purge (anti double-tap + spinner bouton). */
  isPurging: boolean;
}

export function useCachePurge(): UseCachePurge {
  const [isPurging, setIsPurging] = useState(false);

  const clear = useCallback(
    async (adventureId: string, segmentIds: string[] = []) => {
      setIsPurging(true);
      try {
        await clearAdventureCache(adventureId, segmentIds);
      } finally {
        setIsPurging(false);
      }
    },
    [],
  );

  return { clear, isPurging };
}
