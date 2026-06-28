import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';

import {
  LiveControls,
  formatEtaSummary,
  roundDownToStep,
} from '@/components/live/live-controls';
import { useLiveStore } from '@/lib/stores/live.store';

// LiveControls (MOB-5.4 / T5 — re-design panneau + section PROFIL). `useSafeAreaInsets`
// mocké (pattern repo). `Animated.timing(...).start()` de la section repliable laisserait
// fuiter un timer Jest → stub `timing` (pattern `live-filters-drawer.test`). `render` est
// async (RNTL/React 19 concurrent) → on `await` et on lit les requêtes du RÉSULTAT.
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest
  .spyOn(Animated, 'timing')
  .mockReturnValue({
    start: jest.fn(),
  } as unknown as Animated.CompositeAnimation);

const PROFILE = <Text testID="profile-content">profil</Text>;

function renderControls(
  props: Partial<React.ComponentProps<typeof LiveControls>> = {},
) {
  return render(
    <LiveControls
      onFiltersOpen={jest.fn()}
      onSearch={jest.fn()}
      activeFilterCount={0}
      isOnline
      elevationGain={null}
      elevationLoss={null}
      searchCenter={null}
      profileOpen={false}
      onProfileToggle={jest.fn()}
      onProfileAutoOpen={jest.fn()}
      {...props}
    />,
  );
}

/** Collecte les `testID` dans l'ordre DFS de l'arbre rendu (vérif. d'ordre de layout). */
function collectTestIds(node: unknown, acc: string[] = []): string[] {
  if (node == null) return acc;
  if (Array.isArray(node)) {
    node.forEach((n) => collectTestIds(n, acc));
    return acc;
  }
  if (typeof node !== 'object') return acc;
  const n = node as { props?: { testID?: string }; children?: unknown };
  if (n.props?.testID) acc.push(n.props.testID);
  if (n.children) collectTestIds(n.children, acc);
  return acc;
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

describe('LiveControls — ordre du layout (AC1)', () => {
  it('PROFIL → séparateur → slider → métriques → boutons', async () => {
    const { toJSON } = await renderControls({ profileContent: PROFILE });
    const ids = collectTestIds(toJSON());
    const order = [
      'btn-profile-toggle',
      'profile-separator',
      'btn-minus',
      'metrics-row',
      'btn-search',
    ];
    const indices = order.map((id) => ids.indexOf(id));
    indices.forEach((idx) => expect(idx).toBeGreaterThanOrEqual(0));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]!);
    }
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

describe('LiveControls — auto-open section PROFIL (AC3)', () => {
  it('bouton + appelle onProfileAutoOpen', async () => {
    const onProfileAutoOpen = jest.fn();
    const { getByTestId } = await renderControls({ onProfileAutoOpen });
    fireEvent.press(getByTestId('btn-plus'));
    expect(onProfileAutoOpen).toHaveBeenCalledTimes(1);
  });

  it('bouton − appelle onProfileAutoOpen', async () => {
    useLiveStore.setState({ targetAheadKm: 20 });
    const onProfileAutoOpen = jest.fn();
    const { getByTestId } = await renderControls({ onProfileAutoOpen });
    fireEvent.press(getByTestId('btn-minus'));
    expect(onProfileAutoOpen).toHaveBeenCalledTimes(1);
  });
});

describe('LiveControls — section PROFIL forwarding (AC5, 7)', () => {
  it('profileContent absent → toggle désactivé (AC7)', async () => {
    const { getByTestId } = await renderControls({ profileContent: undefined });
    expect(getByTestId('btn-profile-toggle').props.accessibilityState.disabled).toBe(
      true,
    );
  });

  it('profileContent présent → toggle actif', async () => {
    const { getByTestId } = await renderControls({ profileContent: PROFILE });
    expect(
      getByTestId('btn-profile-toggle').props.accessibilityState.disabled,
    ).toBeFalsy();
  });

  it('profileOpen=true → chevron ChevronDown (ouvert)', async () => {
    const { getByTestId } = await renderControls({
      profileContent: PROFILE,
      profileOpen: true,
    });
    expect(getByTestId('profile-chevron-down')).toBeTruthy();
  });

  it('profileOpen=false → chevron ChevronUp (fermé)', async () => {
    const { getByTestId } = await renderControls({
      profileContent: PROFILE,
      profileOpen: false,
    });
    expect(getByTestId('profile-chevron-up')).toBeTruthy();
  });
});

describe('LiveControls — métriques ↑D+ · ↓D- · ~ETA (AC1)', () => {
  it('D+ et D- présents : joints par « · », ETA préfixé « · »', async () => {
    const { getByTestId } = await renderControls({
      elevationGain: 120,
      elevationLoss: 80,
    });
    expect(getByTestId('elevation-display').props.children).toBe('↑ 120 m · ↓ 80 m');
    // targetAheadKm=15, speed=15 → ~1h00, préfixé « · » car dénivelé présent.
    expect(getByTestId('eta-display').props.children).toBe('· ~1h00');
  });

  it('D+ seul : pas de séparateur orphelin', async () => {
    const { getByTestId } = await renderControls({
      elevationGain: 120,
      elevationLoss: null,
    });
    expect(getByTestId('elevation-display').props.children).toBe('↑ 120 m');
  });

  it('D- seul : pas de séparateur orphelin', async () => {
    const { getByTestId } = await renderControls({
      elevationGain: null,
      elevationLoss: 80,
    });
    expect(getByTestId('elevation-display').props.children).toBe('↓ 80 m');
  });

  it('aucun dénivelé : « — » et ETA sans préfixe « · »', async () => {
    const { getByTestId } = await renderControls({
      elevationGain: null,
      elevationLoss: null,
    });
    expect(getByTestId('elevation-display').props.children).toBe('—');
    expect(getByTestId('eta-display').props.children).toBe('~1h00');
  });

  it('allure ≤ 0 → pas de ligne ETA', async () => {
    useLiveStore.setState({ speedKmh: 0 });
    const { queryByTestId } = await renderControls({ elevationGain: 100 });
    expect(queryByTestId('eta-display')).toBeNull();
  });
});

describe('LiveControls — actions (AC1, AC4 côté écran)', () => {
  it('RECHERCHER appelle onSearch', async () => {
    const onSearch = jest.fn();
    const { getByTestId } = await renderControls({ onSearch });
    fireEvent.press(getByTestId('btn-search'));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('RECHERCHER désactivé hors-ligne', async () => {
    const { getByTestId } = await renderControls({ isOnline: false });
    expect(getByTestId('btn-search').props.accessibilityState.disabled).toBe(true);
  });

  it('bouton filtres appelle onFiltersOpen', async () => {
    const onFiltersOpen = jest.fn();
    const { getByTestId } = await renderControls({ onFiltersOpen });
    fireEvent.press(getByTestId('btn-filters'));
    expect(onFiltersOpen).toHaveBeenCalledTimes(1);
  });
});
