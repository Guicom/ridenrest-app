import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated } from 'react-native';

import { LiveFiltersDrawer } from '@/components/live/live-filters-drawer';
import { i18n } from '@/lib/i18n';
import { useLiveStore } from '@/lib/stores/live.store';
import { useMapStore } from '@/lib/stores/map.store';

// LiveFiltersDrawer (MOB-5.3 / T7, T10). `useSafeAreaInsets` mocké. `render` async → on lit
// les requêtes du résultat (pas le global `screen`).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// `Animated.timing(...useNativeDriver:true).start()` laisse fuiter un timer JS (pas de
// module natif en jest) qui pollue les rendus suivants. On rend l'animation synchrone —
// on teste la persistance/les toggles, pas l'animation.
beforeAll(() => {
  jest
    .spyOn(Animated, 'timing')
    .mockReturnValue({
      start: (cb?: (r: { finished: boolean }) => void) => cb?.({ finished: true }),
      stop: jest.fn(),
      reset: jest.fn(),
    } as unknown as Animated.CompositeAnimation);
});

const t = (k: string) => i18n.t(k);

beforeEach(() => {
  useLiveStore.setState({ searchRadiusKm: 5, speedKmh: 15 });
  useMapStore.setState({
    visibleLayers: new Set(['accommodations']),
    activeAccommodationTypes: new Set(['hotel']),
  });
});

describe('LiveFiltersDrawer — persist à la fermeture (AC7, 16-25)', () => {
  it('rayon + vitesse modifiés → commités au store sur ✕ (sans bouton Appliquer)', async () => {
    const onOpenChange = jest.fn();
    const { getByTestId } = await render(
      <LiveFiltersDrawer open onOpenChange={onOpenChange} />,
    );

    // On laisse chaque mise à jour concurrente se committer (waitFor) avant la suivante,
    // pour éviter des act() chevauchants qui fuiraient sur le test suivant.
    fireEvent.press(getByTestId('filter-radius-plus')); // 5 → 5.5
    await waitFor(() =>
      expect(getByTestId('filter-radius-value').props.children).toBe('5.5 km'),
    );
    fireEvent.press(getByTestId('filter-speed-plus')); // 15 → 16
    await waitFor(() =>
      expect(getByTestId('filter-speed-value').props.children).toBe('16 km/h'),
    );

    // Pas encore commité au store avant la fermeture (persist-on-close).
    expect(useLiveStore.getState().searchRadiusKm).toBe(5);

    fireEvent.press(getByTestId('filters-close-btn'));

    await waitFor(() =>
      expect(useLiveStore.getState().searchRadiusKm).toBe(5.5),
    );
    expect(useLiveStore.getState().speedKmh).toBe(16);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('rayon capé : − désactivé à 0,5 km', async () => {
    useLiveStore.setState({ searchRadiusKm: 0.5 });
    // `findBy*` (async) attend le commit concurrent (un rendu non-premier dans le fichier
    // ne flushe pas toujours synchrone après `await render`).
    const { findByTestId } = await render(
      <LiveFiltersDrawer open onOpenChange={jest.fn()} />,
    );
    const minus = await findByTestId('filter-radius-minus');
    expect(minus.props.accessibilityState.disabled).toBe(true);
  });
});

describe('LiveFiltersDrawer — toggles immédiats (AC7)', () => {
  it('toggle calque écrit le store immédiatement (pas de persist-on-close)', async () => {
    const { findByLabelText } = await render(
      <LiveFiltersDrawer open onOpenChange={jest.fn()} />,
    );
    fireEvent.press(await findByLabelText(t('pois.layers.restaurants')));
    expect(useMapStore.getState().visibleLayers.has('restaurants')).toBe(true);
  });
});
