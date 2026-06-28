import { fireEvent, render } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';

import { CollapsibleProfileSection } from '@/components/live/collapsible-profile-section';

// CollapsibleProfileSection (MOB-5.4 / T5, AC2-5, 7). `Animated.timing(...).start()`
// laisserait fuiter un timer en environnement Jest → on stub `timing` (pattern
// `live-filters-drawer.test`). `render` est async (RNTL/React 19 concurrent).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest
  .spyOn(Animated, 'timing')
  .mockReturnValue({
    start: jest.fn(),
  } as unknown as Animated.CompositeAnimation);

const PROFILE = <Text testID="profile-content">profil</Text>;

describe('CollapsibleProfileSection — garde hasProfile (AC7)', () => {
  it('sans contenu : toggle désactivé + section masquée a11y, onToggle non appelé', async () => {
    const onToggle = jest.fn();
    const { getByTestId, queryByTestId } = await render(
      <CollapsibleProfileSection open={false} onToggle={onToggle} />,
    );
    const toggle = getByTestId('btn-profile-toggle');
    expect(toggle.props.accessibilityState.disabled).toBe(true);
    expect(toggle.props.accessibilityState.expanded).toBeUndefined();
    // Repliée → exclue des requêtes a11y par défaut (preuve du masquage). On la
    // retrouve via `includeHiddenElements` pour confirmer le flag (AC7).
    expect(queryByTestId('profile-section')).toBeNull();
    expect(
      getByTestId('profile-section', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
    fireEvent.press(toggle);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('sans contenu : reste masqué même si open=true (jamais dépliable)', async () => {
    const { getByTestId, queryByTestId } = await render(
      <CollapsibleProfileSection open onToggle={jest.fn()} />,
    );
    expect(queryByTestId('profile-section')).toBeNull();
    expect(
      getByTestId('profile-section', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
  });
});

describe('CollapsibleProfileSection — avec contenu (AC2, 3, 5)', () => {
  it('repliée (open=false) : section masquée a11y + chevron ChevronUp (fermé)', async () => {
    const { getByTestId, queryByTestId } = await render(
      <CollapsibleProfileSection open={false} onToggle={jest.fn()} content={PROFILE} />,
    );
    expect(queryByTestId('profile-section')).toBeNull(); // masquée a11y quand repliée
    expect(
      getByTestId('profile-section', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(true);
    expect(getByTestId('profile-chevron-up')).toBeTruthy();
    expect(queryByTestId('profile-chevron-down')).toBeNull();
    expect(getByTestId('btn-profile-toggle').props.accessibilityState.expanded).toBe(
      false,
    );
  });

  it('ouverte (open=true) : section visible a11y + chevron ChevronDown (ouvert)', async () => {
    const { getByTestId, queryByTestId } = await render(
      <CollapsibleProfileSection open onToggle={jest.fn()} content={PROFILE} />,
    );
    expect(getByTestId('profile-section').props.accessibilityElementsHidden).toBe(
      false,
    );
    expect(getByTestId('profile-chevron-down')).toBeTruthy();
    expect(queryByTestId('profile-chevron-up')).toBeNull();
    expect(getByTestId('btn-profile-toggle').props.accessibilityState.expanded).toBe(
      true,
    );
  });

  it('chevron : toggle manuel appelle onToggle (AC5)', async () => {
    const onToggle = jest.fn();
    const { getByTestId } = await render(
      <CollapsibleProfileSection open={false} onToggle={onToggle} content={PROFILE} />,
    );
    fireEvent.press(getByTestId('btn-profile-toggle'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('rend le contenu fourni dans la section', async () => {
    const { getByTestId } = await render(
      <CollapsibleProfileSection open onToggle={jest.fn()} content={PROFILE} />,
    );
    expect(getByTestId('profile-content')).toBeTruthy();
  });
});
