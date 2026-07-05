import { useCallback, useState } from 'react';

import { clearAllCache, hasCachedData } from '@/lib/cache/cache-manager';

// Façade hook de la section « Cache hors ligne » des Paramètres (MOB-3.5 / AC4).
// Expose la présence de cache (pour n'afficher la section QUE s'il y a quelque chose
// à vider) + la purge GLOBALE manuelle. Fine couche sur `cache-manager` ; lecture FS
// synchrone (nouvelle API SDK 56), relue après une purge.

export interface UseOfflineCache {
  /** Au moins un fichier de cache offline existe (gpx/pois/weather). */
  hasCache: boolean;
  /** Vrai pendant la purge (anti double-tap + spinner bouton). */
  isClearing: boolean;
  /** Vide TOUT le cache offline (toutes aventures). */
  clearAll: () => Promise<void>;
}

export function useOfflineCache(): UseOfflineCache {
  // Lecture FS SYNCHRONE (nouvelle API SDK 56) au 1er render via l'initialiseur
  // paresseux de `useState` — évite un `setState` dans un effet (règle
  // react-hooks/set-state-in-effect). Relue après une purge dans `clearAll`.
  const [hasCache, setHasCache] = useState<boolean>(() => hasCachedData());
  const [isClearing, setIsClearing] = useState(false);

  const clearAll = useCallback(async () => {
    setIsClearing(true);
    try {
      await clearAllCache();
    } finally {
      setIsClearing(false);
      setHasCache(hasCachedData());
    }
  }, []);

  return { hasCache, isClearing, clearAll };
}
