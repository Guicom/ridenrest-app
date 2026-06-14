import { fireEvent, render, screen } from '@testing-library/react-native';

import { LayerToggles } from '@/components/map/layer-toggles';

// LayerToggles (MOB-4.2 / AC1, T3). i18n auto-initialisé sur `fr` en test
// (expo-localization mocké). On vérifie : 4 switches, l'état `checked` reflète
// `visibleLayers`, et `onToggle` reçoit le bon calque.

describe('LayerToggles', () => {
  it('rend 4 switches a11y (un par calque)', async () => {
    await render(
      <LayerToggles visibleLayers={new Set(['accommodations'])} onToggle={jest.fn()} />,
    );
    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });

  it('reflète l’état actif/inactif via accessibilityState.checked', async () => {
    await render(
      <LayerToggles visibleLayers={new Set(['accommodations'])} onToggle={jest.fn()} />,
    );
    expect(screen.getByLabelText('Hébergements').props.accessibilityState).toMatchObject({
      checked: true,
    });
    expect(screen.getByLabelText('Restaurants').props.accessibilityState).toMatchObject({
      checked: false,
    });
  });

  it('appelle onToggle avec le calque tapé', async () => {
    const onToggle = jest.fn();
    await render(
      <LayerToggles visibleLayers={new Set(['accommodations'])} onToggle={onToggle} />,
    );
    fireEvent.press(screen.getByLabelText('Ravitaillement'));
    expect(onToggle).toHaveBeenCalledWith('supplies');
  });
});
