import { render, screen } from '@testing-library/react-native';
import type { AccessVariant } from '@ridenrest/shared';

import { AccessMapLayer } from './access-map-layer';

// AccessMapLayer (MOB-4.7 / T6). MapLibre mocké globalement : `GeoJSONSource`/`Layer`
// rendent une View `testID = id` (le mock ne transmet ni `onPress` ni `filter` à la View
// hôte → la logique de tap/filtre est testée via les helpers purs `access-features.test.ts`).
// Ici : présence des 3 calques quand des variantes existent, rien sinon (unicité AC2).

function makeVariant(coordinates: [number, number][]): AccessVariant {
  return {
    entryPoint: coordinates[0],
    distanceM: 1000,
    elevationGainM: 10,
    elevationLossM: 5,
    etaS: 240,
    usesMainRoad: false,
    mainRoadDistanceM: 0,
    geometry: { type: 'LineString', coordinates },
  };
}

const VARIANTS = [
  makeVariant([[6, 45], [6.1, 45.1]]),
  makeVariant([[6, 45], [6.2, 45.0]]),
];

describe('AccessMapLayer', () => {
  it('rend la source + les 3 calques (ghost / casing / line) quand des variantes existent', async () => {
    await render(
      <AccessMapLayer variants={VARIANTS} selectedIndex={0} onSelect={jest.fn()} />,
    );
    expect(screen.getByTestId('poi-access')).toBeOnTheScreen();
    expect(screen.getByTestId('poi-access-ghost')).toBeOnTheScreen();
    expect(screen.getByTestId('poi-access-casing')).toBeOnTheScreen();
    expect(screen.getByTestId('poi-access-line')).toBeOnTheScreen();
  });

  it('ne rend RIEN quand `variants` est null (unicité AC2 : fiche fermée → pas de polyline)', async () => {
    await render(<AccessMapLayer variants={null} selectedIndex={0} />);
    expect(screen.queryByTestId('poi-access')).toBeNull();
  });

  it('ne rend RIEN quand `variants` est vide', async () => {
    await render(<AccessMapLayer variants={[]} selectedIndex={0} />);
    expect(screen.queryByTestId('poi-access')).toBeNull();
  });

  it('ne rend RIEN quand aucune variante n’a de géométrie exploitable (≥ 2 points valides)', async () => {
    const degenerate = [makeVariant([[NaN, NaN], [Infinity, 1]])];
    await render(<AccessMapLayer variants={degenerate} selectedIndex={0} />);
    expect(screen.queryByTestId('poi-access')).toBeNull();
  });
});
