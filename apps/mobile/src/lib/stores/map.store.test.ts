import { LAYER_CATEGORIES } from '@ridenrest/shared';

import { useMapStore } from '@/lib/stores/map.store';

// Store planning (Zustand) — port iso du web. Couvre le gate `searchCommitted` et les
// filtres (calques / sous-types). État global → on snapshot l'init et on le restaure.

const initial = useMapStore.getState();

beforeEach(() => {
  useMapStore.setState(
    {
      ...initial,
      visibleLayers: new Set(['accommodations']),
      activeAccommodationTypes: new Set(['hotel']),
      fromKm: 0,
      toKm: 15,
      searchRangeInteracted: false,
      searchCommitted: false,
      selectedStageId: null,
    },
    true,
  );
});

describe('useMapStore', () => {
  it('toggleLayer ajoute/retire un calque (multi-sélection)', () => {
    useMapStore.getState().toggleLayer('restaurants');
    expect(useMapStore.getState().visibleLayers.has('restaurants')).toBe(true);
    useMapStore.getState().toggleLayer('accommodations');
    expect(useMapStore.getState().visibleLayers.has('accommodations')).toBe(
      false,
    );
  });

  it('setSearchRange pose la plage et DÉ-committe (gate, AC1)', () => {
    useMapStore.setState({ searchCommitted: true });
    useMapStore.getState().setSearchRange(10, 25);
    const s = useMapStore.getState();
    expect(s.fromKm).toBe(10);
    expect(s.toKm).toBe(25);
    expect(s.searchRangeInteracted).toBe(true);
    expect(s.searchCommitted).toBe(false);
  });

  it('setSearchCommitted(true) committe + marque interacted (AC2)', () => {
    useMapStore.getState().setSearchCommitted(true);
    const s = useMapStore.getState();
    expect(s.searchCommitted).toBe(true);
    expect(s.searchRangeInteracted).toBe(true);
  });

  it('toggleAccommodationType ajoute/retire un sous-type', () => {
    useMapStore.getState().toggleAccommodationType('camp_site');
    expect(
      useMapStore.getState().activeAccommodationTypes.has('camp_site'),
    ).toBe(true);
    useMapStore.getState().toggleAccommodationType('hotel');
    expect(useMapStore.getState().activeAccommodationTypes.has('hotel')).toBe(
      false,
    );
  });

  it('resetAccommodationTypes restaure tous les types hébergement', () => {
    useMapStore.getState().resetAccommodationTypes();
    const active = useMapStore.getState().activeAccommodationTypes;
    for (const cat of LAYER_CATEGORIES.accommodations) {
      expect(active.has(cat)).toBe(true);
    }
  });
});
