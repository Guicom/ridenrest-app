import { fireEvent, render, screen } from '@testing-library/react-native';
import type { AccessVariant } from '@ridenrest/shared';

import { VariantSelector } from '@/components/poi-access/variant-selector';

// MOB-4.6 / T5, T8 — sélecteur de variantes + avertissement route nationale.

function makeVariant(over: Partial<AccessVariant> = {}): AccessVariant {
  return {
    entryPoint: [6, 45],
    distanceM: 1500,
    elevationGainM: 40,
    elevationLossM: 10,
    etaS: 360,
    usesMainRoad: false,
    mainRoadDistanceM: 0,
    geometry: { type: 'LineString', coordinates: [[6, 45], [6.1, 45.1]] },
    ...over,
  };
}

describe('VariantSelector', () => {
  it('1 variante sans nationale → rien (null)', async () => {
    await render(
      <VariantSelector variants={[makeVariant()]} selected={0} onSelect={jest.fn()} />,
    );
    expect(screen.queryByTestId('access-variant-selector')).toBeNull();
    expect(screen.queryByTestId('access-main-road-warning')).toBeNull();
  });

  it('> 1 variante → chips (radiogroup) affichées', async () => {
    await render(
      <VariantSelector
        variants={[makeVariant(), makeVariant({ distanceM: 2200, etaS: 600 })]}
        selected={0}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId('access-variant-selector')).toBeOnTheScreen();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('sélection d’une chip → callback avec l’index', async () => {
    const onSelect = jest.fn();
    await render(
      <VariantSelector
        variants={[makeVariant(), makeVariant({ distanceM: 2200, etaS: 600 })]}
        selected={0}
        onSelect={onSelect}
      />,
    );
    fireEvent.press(screen.getAllByRole('radio')[1]);
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('avertissement « Route nationale » même avec UNE seule variante', async () => {
    await render(
      <VariantSelector
        variants={[makeVariant({ usesMainRoad: true })]}
        selected={0}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId('access-main-road-warning')).toBeOnTheScreen();
    expect(screen.getByText('Route nationale')).toBeOnTheScreen();
    // Mono-variante : pas de chips de choix.
    expect(screen.queryByTestId('access-variant-selector')).toBeNull();
  });

  it('avertissement si la variante AFFICHÉE emprunte une nationale (multi-variantes)', async () => {
    await render(
      <VariantSelector
        variants={[
          makeVariant(),
          makeVariant({ usesMainRoad: true, distanceM: 2200, etaS: 600 }),
        ]}
        selected={1}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId('access-variant-selector')).toBeOnTheScreen();
    expect(screen.getByTestId('access-main-road-warning')).toBeOnTheScreen();
  });

  it('pas de nationale sur la variante affichée → pas d’avertissement', async () => {
    await render(
      <VariantSelector
        variants={[
          makeVariant(),
          makeVariant({ usesMainRoad: true, distanceM: 2200, etaS: 600 }),
        ]}
        selected={0}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('access-main-road-warning')).toBeNull();
  });
});
