import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MapWaypoint } from '@ridenrest/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { DEFAULT_SEARCH_RADIUS_KM } from '@ridenrest/shared';

import { SearchRangeControl } from '@/components/map/search-range-control';
import { i18n } from '@/lib/i18n';
import { useMapStore } from '@/lib/stores/map.store';

// Carte Recherche — port iso web. Gate `searchCommitted` : bouger la largeur N'envoie
// PAS de recherche (dé-committe) ; seul « Rechercher » committe. Reverse-city mockée
// (dropdown Booking après commit).

jest.mock('@/lib/api/geo', () => ({
  getReverseCity: jest
    .fn()
    .mockResolvedValue({ city: null, postcode: null, state: null, country: null }),
}));

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
      searchRadiusKm: DEFAULT_SEARCH_RADIUS_KM,
    },
    true,
  );
});

const waypoints: MapWaypoint[] = [
  { lat: 45, lng: 5, ele: 100, distKm: 0 },
  { lat: 45.1, lng: 5.1, ele: 150, distKm: 5 },
  { lat: 45.2, lng: 5.2, ele: 120, distKm: 10 },
];

async function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <SearchRangeControl
        totalDistanceKm={100}
        waypoints={waypoints}
        isPoisPending={false}
        accommodationPois={[]}
        stages={[]}
        isOnline
      />
    </QueryClientProvider>,
  );
}

describe('SearchRangeControl', () => {
  it('augmenter la largeur → met à jour la plage mais NE committe PAS (gate, AC1)', async () => {
    await setup();
    fireEvent.press(
      screen.getByLabelText(i18n.t('pois.search.rangeIncrement')),
    );
    const s = useMapStore.getState();
    expect(s.toKm).toBe(16);
    expect(s.searchRangeInteracted).toBe(true);
    expect(s.searchCommitted).toBe(false);
  });

  it('clic « Rechercher » → committe (AC2)', async () => {
    await setup();
    fireEvent.press(
      screen.getByRole('button', { name: i18n.t('pois.search.button') }),
    );
    expect(useMapStore.getState().searchCommitted).toBe(true);
  });

  it('affiche les contrôles iso (largeur + position 0 km)', async () => {
    await setup();
    // « 0 km » apparaît au moins une fois (position courante + label gauche du slider).
    expect(screen.getAllByText('0 km').length).toBeGreaterThan(0);
    // Libellé largeur « Rechercher sur » présent (parité web).
    expect(
      screen.getByText(i18n.t('pois.search.rangeLabel')),
    ).toBeOnTheScreen();
  });

  describe('« Sur un rayon de » — rayon autour de la trace', () => {
    it('affiche le libellé et la valeur courante', async () => {
      await setup();
      expect(
        screen.getByText(i18n.t('pois.search.radiusLabel')),
      ).toBeOnTheScreen();
      expect(screen.getByTestId('radius-input').props.value).toBe(String(DEFAULT_SEARCH_RADIUS_KM));
    });

    it('le + augmente le rayon d’un km et dégage la recherche committée', async () => {
      useMapStore.setState({ searchCommitted: true });
      await setup();

      fireEvent.press(
        screen.getByRole('button', { name: i18n.t('pois.search.radiusIncrement') }),
      );

      expect(useMapStore.getState().searchRadiusKm).toBe(DEFAULT_SEARCH_RADIUS_KM + 1);
      // Sinon on afficherait le jeu de l'ancien rayon en laissant croire qu'il correspond.
      expect(useMapStore.getState().searchCommitted).toBe(false);
    });

    it('le − diminue le rayon d’un km', async () => {
      await setup();

      fireEvent.press(
        screen.getByRole('button', { name: i18n.t('pois.search.radiusDecrement') }),
      );

      expect(useMapStore.getState().searchRadiusKm).toBe(DEFAULT_SEARCH_RADIUS_KM - 1);
    });

    it('plafonne à 20 km — même limite qu’en mode live', async () => {
      useMapStore.setState({ searchRadiusKm: 20 });
      await setup();

      fireEvent.press(
        screen.getByRole('button', { name: i18n.t('pois.search.radiusIncrement') }),
      );
      expect(useMapStore.getState().searchRadiusKm).toBe(20);
    });

    it('ne descend pas sous 1 km', async () => {
      useMapStore.setState({ searchRadiusKm: 1 });
      await setup();

      fireEvent.press(
        screen.getByRole('button', { name: i18n.t('pois.search.radiusDecrement') }),
      );
      expect(useMapStore.getState().searchRadiusKm).toBe(1);
    });

    it('la saisie clavier est bornée à la validation', async () => {
      await setup();
      const input = screen.getByTestId('radius-input');

      fireEvent.changeText(input, '42');
      // Attendre le rendu : sans ça le handler de blur lit encore la valeur précédente
      // (les deux événements tomberaient dans le même tick).
      await waitFor(() =>
        expect(screen.getByTestId('radius-input').props.value).toBe('42'),
      );
      fireEvent(screen.getByTestId('radius-input'), 'blur');

      // Borné au plafond plutôt que rejeté en silence.
      expect(useMapStore.getState().searchRadiusKm).toBe(20);
    });
  });

});
