import { render, screen } from '@testing-library/react-native';
import type { MapSegmentData } from '@ridenrest/shared';

import { MapCanvas } from '@/components/map/map-canvas';

// `useColorScheme` (NativeWind) jette hors runtime natif (`setColorScheme` sans
// darkMode:class en jest) → on mocke le WRAPPER avec une valeur statique (parité
// segment-list.test / strava-import-sheet.test).
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}));

// Tests du canvas carte (MOB-4.1 / T8, AC1/AC3). MapLibre Native est mocké
// globalement (`__mocks__/@maplibre/maplibre-react-native.js`, API v11) : les
// composants rendent une View `testID` dérivé de leur `id` → on cible la source
// (`trace`) et le calque (`trace-line`). L'attribution OSM doit être TOUJOURS rendue.

function makeSegment(
  id: string,
  waypoints: MapSegmentData['waypoints'],
): MapSegmentData {
  return {
    id,
    name: `Segment ${id}`,
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 10,
    parseStatus: 'done',
    source: null,
    waypoints,
    boundingBox: null,
  };
}

const TRACE = [
  makeSegment('a', [
    { lat: 45, lng: 5, distKm: 0 },
    { lat: 46, lng: 6, distKm: 1 },
  ]),
];

describe('MapCanvas', () => {
  it('rend la trace (source + calque ligne) quand des waypoints existent', async () => {
    await render(<MapCanvas segments={TRACE} />);
    expect(await screen.findByTestId('trace')).toBeOnTheScreen();
    expect(screen.getByTestId('trace-line')).toBeOnTheScreen();
  });

  it('ne rend PAS de calque trace quand aucun waypoint', async () => {
    await render(<MapCanvas segments={[]} />);
    // L'attribution flushe les effets ; la trace est absente.
    expect(await screen.findByLabelText('Attribution OpenStreetMap')).toBeOnTheScreen();
    expect(screen.queryByTestId('trace-line')).toBeNull();
  });

  it('affiche TOUJOURS l’attribution OSM (AC3)', async () => {
    await render(<MapCanvas segments={TRACE} />);
    expect(
      await screen.findByText('© OpenStreetMap contributors'),
    ).toBeOnTheScreen();
  });
});
