import { useCallback, useState } from 'react';
import type { MapLayer } from '@ridenrest/shared';

// Modèle de calques POI (MOB-4.2 / AC1, T2). État `visibleLayers` + `toggleLayer`,
// parité web (`map.store.ts` : `visibleLayers: Set<MapLayer>` défaut
// `{'accommodations'}`, toggle multi-sélection indépendant par calque).
//
// **Où vit l'état** : ce hook est appelé par la route carte (`map/[id].tsx`) — la
// page possède la sélection (pattern web) et la passe à `layer-toggles` + `poi-layer`.
// Pas de store global requis (Zustand reste l'option parité web mais non nécessaire
// pour 4 toggles locaux à l'écran). API volontairement extensible (sous-filtre
// `activeAccommodationTypes` reportable en MOB-4.x ultérieure, hors périmètre ici).
//
// `MapLayer` importé de `@ridenrest/shared` (jamais redéfini). Set immuable :
// chaque toggle crée une nouvelle référence → re-render fiable des consommateurs.

/** Les 4 calques POI dans l'ordre d'affichage (parité web). */
export const ALL_MAP_LAYERS: readonly MapLayer[] = [
  'accommodations',
  'restaurants',
  'supplies',
  'bike',
] as const;

export interface PoiLayersState {
  /** Calques actuellement visibles (toggle multi-sélection indépendant). */
  visibleLayers: Set<MapLayer>;
  /** Active/désactive un calque (immuable : nouvelle `Set` à chaque appel). */
  toggleLayer: (layer: MapLayer) => void;
  /** Raccourci de lecture pour l'UI (état actif/inactif d'un toggle). */
  isLayerVisible: (layer: MapLayer) => boolean;
}

/**
 * Gère la sélection des calques POI. Défaut : `accommodations` actif (parité web).
 * Conservé tant que l'écran carte est monté (AC1 : « l'état est conservé »).
 */
export function usePoiLayers(
  initial: readonly MapLayer[] = ['accommodations'],
): PoiLayersState {
  const [visibleLayers, setVisibleLayers] = useState<Set<MapLayer>>(
    () => new Set(initial),
  );

  const toggleLayer = useCallback((layer: MapLayer) => {
    setVisibleLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }, []);

  const isLayerVisible = useCallback(
    (layer: MapLayer) => visibleLayers.has(layer),
    [visibleLayers],
  );

  return { visibleLayers, toggleLayer, isLayerVisible };
}
