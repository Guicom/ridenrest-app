import { fireEvent, render, waitFor } from '@testing-library/react-native';

import {
  LiveControls,
  formatEtaSummary,
  roundDownToStep,
} from '@/components/live/live-controls';
import { useLiveStore } from '@/lib/stores/live.store';

// LiveControls (MOB-5.3 / T6, T10). `useSafeAreaInsets` mocké (pattern repo). `render` est
// async (RNTL/React 19 concurrent) → on `await` et on lit les requêtes du RÉSULTAT (pas le
// global `screen`, instable entre plusieurs rendus async dans un même fichier).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

function renderControls(
  props: Partial<React.ComponentProps<typeof LiveControls>> = {},
) {
  return render(
    <LiveControls
      onFiltersOpen={jest.fn()}
      onSearch={jest.fn()}
      activeFilterCount={0}
      isOnline
      {...props}
    />,
  );
}

beforeEach(() => {
  useLiveStore.setState({ targetAheadKm: 15, speedKmh: 15 });
});

describe('roundDownToStep / formatEtaSummary (purs)', () => {
  it('roundDownToStep', () => {
    expect(roundDownToStep(97, 5)).toBe(95);
    expect(roundDownToStep(5, 5)).toBe(5);
    expect(roundDownToStep(4, 5)).toBe(0);
  });

  it('formatEtaSummary', () => {
    expect(formatEtaSummary(30, 15)).toBe('~2h00');
    expect(formatEtaSummary(10, 15)).toBe('~40min');
    expect(formatEtaSummary(10, 0)).toBe('');
  });
});

describe('LiveControls — slider max dynamique (AC1)', () => {
  it('clampe targetAheadKm quand le max rétrécit sous la valeur', async () => {
    useLiveStore.setState({ targetAheadKm: 80 });
    await renderControls({ maxAheadKm: 30 });
    await waitFor(() => expect(useLiveStore.getState().targetAheadKm).toBe(30));
  });

  it('bouton + incrémente de 5', async () => {
    const { getByTestId } = await renderControls();
    fireEvent.press(getByTestId('btn-plus'));
    expect(useLiveStore.getState().targetAheadKm).toBe(20);
  });

  it('bouton − décrémente de 5', async () => {
    useLiveStore.setState({ targetAheadKm: 20 });
    const { getByTestId } = await renderControls();
    fireEvent.press(getByTestId('btn-minus'));
    expect(useLiveStore.getState().targetAheadKm).toBe(15);
  });

  it('− désactivé au plancher (5 km)', async () => {
    useLiveStore.setState({ targetAheadKm: 5 });
    const { getByTestId } = await renderControls();
    expect(getByTestId('btn-minus').props.accessibilityState.disabled).toBe(true);
  });

  it('+ désactivé au max effectif', async () => {
    useLiveStore.setState({ targetAheadKm: 10 });
    const { getByTestId } = await renderControls({ maxAheadKm: 10 });
    expect(getByTestId('btn-plus').props.accessibilityState.disabled).toBe(true);
  });
});

describe('LiveControls — actions (AC2)', () => {
  it('RECHERCHER appelle onSearch', async () => {
    const onSearch = jest.fn();
    const { getByTestId } = await renderControls({ onSearch });
    fireEvent.press(getByTestId('btn-search'));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('RECHERCHER désactivé hors-ligne', async () => {
    const { getByTestId } = await renderControls({ isOnline: false });
    expect(getByTestId('btn-search').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('bouton filtres appelle onFiltersOpen', async () => {
    const onFiltersOpen = jest.fn();
    const { getByTestId } = await renderControls({ onFiltersOpen });
    fireEvent.press(getByTestId('btn-filters'));
    expect(onFiltersOpen).toHaveBeenCalledTimes(1);
  });
});
