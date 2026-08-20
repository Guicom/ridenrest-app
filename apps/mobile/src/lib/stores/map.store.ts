import type { MapLayer, PoiCategory } from '@ridenrest/shared';
import { DEFAULT_SEARCH_RADIUS_KM, LAYER_CATEGORIES } from '@ridenrest/shared';
import { create } from 'zustand';

// Store client du mode **planning** carte (mobile) — port iso de `apps/web/src/stores/
// map.store.ts`. Premier store Zustand du mobile (convention projet : client state =
// Zustand, `use{Domain}Store`, fichier `stores/{domain}.store.ts`, structure plate,
// actions à verbes impératifs). Le serveur state (POI/segments/météo…) reste TanStack
// Query — ce store ne porte QUE l'état UI/interaction de l'écran carte.
//
// Parité web : `fromKm/toKm` = corridor en km **cumulés** (position + largeur), gate
// `searchCommitted` (la recherche POI ne part qu'au clic « Rechercher »), filtres de
// calques + sous-types d'hébergement, étape sélectionnée (« À partir »), POI sélectionné.
// Les champs météo/densité sont présents pour la Phase 2 (cartes Météo/Densité) mais
// ne sont câblés qu'à ce moment-là.

export type { MapLayer };

/** Dimension affichée par la carte Météo (Phase 2). Port iso de `weather-layer`. */
export type WeatherDimension = 'temperature' | 'precipitation' | 'wind';

interface MapState {
  // Visibilité des calques POI
  visibleLayers: Set<MapLayer>;

  // Plage de recherche corridor (km cumulés) + gate
  fromKm: number;
  toKm: number;
  /**
   * Rayon de recherche autour de la trace, en km. Réglable, comme en mode live — le planning
   * imposait 3 km en dur et invisible alors que le live laissait déjà choisir (défaut 5, max 20).
   */
  searchRadiusKm: number;
  searchRangeInteracted: boolean;
  searchCommitted: boolean;

  // Sous-types d'hébergement actifs (filtre d'affichage + compteurs)
  activeAccommodationTypes: Set<PoiCategory>;

  // Étape sélectionnée (« À partir ») — bascule le slider en référentiel relatif
  selectedStageId: string | null;

  // POI sélectionné (alimente la popin + le recentrage caméra)
  selectedPoiId: string | null;

  // Visibilité des marqueurs d'étapes sur la carte
  stagesVisible: boolean;

  // Colorisation densité (Phase 2)
  densityColorEnabled: boolean;

  // État météo (Phase 2)
  weatherActive: boolean;
  weatherDimension: WeatherDimension;

  // Actions
  toggleLayer: (layer: MapLayer) => void;
  setSearchRange: (fromKm: number, toKm: number) => void;
  setSearchRadius: (km: number) => void;
  setSearchCommitted: (v: boolean) => void;
  toggleAccommodationType: (type: PoiCategory) => void;
  resetAccommodationTypes: () => void;
  setSelectedStageId: (id: string | null) => void;
  setSelectedPoiId: (id: string | null) => void;
  setStagesVisible: (visible: boolean) => void;
  toggleDensityColor: () => void;
  setWeatherActive: (active: boolean) => void;
  setWeatherDimension: (dimension: WeatherDimension) => void;
}

export const useMapStore = create<MapState>((set) => ({
  visibleLayers: new Set(['accommodations'] as MapLayer[]),
  fromKm: 0,
  toKm: 15,
  searchRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
  searchRangeInteracted: false,
  searchCommitted: false,
  activeAccommodationTypes: new Set(['hotel'] as PoiCategory[]),
  selectedStageId: null,
  selectedPoiId: null,
  stagesVisible: true,
  densityColorEnabled: false,
  weatherActive: false,
  weatherDimension: 'temperature',

  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.visibleLayers);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return { visibleLayers: next };
    }),

  setSearchRange: (fromKm, toKm) =>
    set({ fromKm, toKm, searchRangeInteracted: true, searchCommitted: false }),

  // Comme un déplacement de plage : changer le rayon dégage la recherche committée, sinon on
  // afficherait le jeu de l'ancien rayon en laissant croire qu'il correspond au nouveau.
  setSearchRadius: (km) => set({ searchRadiusKm: km, searchCommitted: false }),

  setSearchCommitted: (v) =>
    set(
      v
        ? { searchCommitted: true, searchRangeInteracted: true }
        : { searchCommitted: false },
    ),

  toggleAccommodationType: (type) =>
    set((state) => {
      const next = new Set(state.activeAccommodationTypes);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      // Le jeu de sous-types pilote désormais ce qu'on DEMANDE au serveur, pas seulement ce
      // qu'on affiche : il faut relancer une recherche, comme pour la plage ou le rayon.
      return { activeAccommodationTypes: next, searchCommitted: false };
    }),

  resetAccommodationTypes: () =>
    set({ activeAccommodationTypes: new Set(LAYER_CATEGORIES.accommodations), searchCommitted: false }),

  setSelectedStageId: (id) => set({ selectedStageId: id }),
  setSelectedPoiId: (id) => set({ selectedPoiId: id }),
  setStagesVisible: (visible) => set({ stagesVisible: visible }),
  toggleDensityColor: () =>
    set((state) => ({ densityColorEnabled: !state.densityColorEnabled })),
  setWeatherActive: (active) => set({ weatherActive: active }),
  setWeatherDimension: (dimension) => set({ weatherDimension: dimension }),
}));
