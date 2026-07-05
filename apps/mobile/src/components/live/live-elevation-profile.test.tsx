import type { MapSegmentData, MapWaypoint } from '@ridenrest/shared';
import { render } from '@testing-library/react-native';

import { ElevationChart } from '@/components/live/elevation-chart';
import {
  computeProfileWindow,
  computeWindowElevation,
  LiveElevationProfile,
  PROFILE_LOOKAHEAD_KM,
} from '@/components/live/live-elevation-profile';

// MOB-5.5 / T6 — fenêtrage (math pure) + garde AC4 du wrapper. `ElevationChart` est mocké
// pour isoler la logique (et éviter de monter react-native-svg ici — testé à part).
jest.mock('@/components/live/elevation-chart', () => ({
  ElevationChart: jest.fn(() => null),
}));

const ElevationChartMock = ElevationChart as unknown as jest.Mock;

function seg(partial: Partial<MapSegmentData>): MapSegmentData {
  return {
    id: 'seg',
    name: 'Segment',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 1,
    parseStatus: 'done',
    source: null,
    waypoints: null,
    boundingBox: null,
    ...partial,
  };
}

beforeEach(() => ElevationChartMock.mockClear());

describe('computeProfileWindow (MOB-5.5 / T3)', () => {
  it('PROFILE_LOOKAHEAD_KM vaut 100 (constante nommée, FR-LP-009)', () => {
    expect(PROFILE_LOOKAHEAD_KM).toBe(100);
  });

  it('bord gauche = position, bord droit = cible + 100 km borné par la fin de trace', () => {
    const win = computeProfileWindow({
      currentKmOnRoute: 10,
      targetAheadKm: 30,
      searchRadiusKm: 5,
      dataMinKm: 0,
      dataMaxKm: 500,
    });
    expect(win.domainFromKm).toBe(10);
    expect(win.domainToKm).toBe(10 + 30 + 100); // 140, < dataMax → non borné
    expect(win.currentKm).toBe(10);
  });

  it('borne le bord droit par la fin de trace (dataMaxKm)', () => {
    const win = computeProfileWindow({
      currentKmOnRoute: 100,
      targetAheadKm: 30,
      searchRadiusKm: 5,
      dataMinKm: 0,
      dataMaxKm: 200,
    });
    expect(win.domainToKm).toBe(200); // min(200, 230)
  });

  it('garde anti-inversion : domainToKm >= domainFromKm même en overshoot fin de trace', () => {
    const win = computeProfileWindow({
      currentKmOnRoute: 250, // dépasse la fin de trace (float / trace dégénérée)
      targetAheadKm: 30,
      searchRadiusKm: 5,
      dataMinKm: 0,
      dataMaxKm: 200,
    });
    expect(win.domainToKm).toBeGreaterThanOrEqual(win.domainFromKm);
    expect(win.domainToKm).toBe(250); // planché à domainFromKm, jamais 200 < 250
  });

  it('zone clampée DANS la fenêtre visible (ne déborde pas l’axe)', () => {
    const win = computeProfileWindow({
      currentKmOnRoute: 100,
      targetAheadKm: 95,
      searchRadiusKm: 10,
      dataMinKm: 0,
      dataMaxKm: 200,
    });
    // target = 195, rayon 10 → [185, 205] mais clampé à [domainFrom, domainTo=200]
    expect(win.searchFromKm).toBe(185);
    expect(win.searchToKm).toBe(200);
    expect(win.searchToKm!).toBeLessThanOrEqual(win.domainToKm);
  });

  it('currentKmOnRoute=null → trace pleine, pas de marqueur, pas de zone', () => {
    const win = computeProfileWindow({
      currentKmOnRoute: null,
      targetAheadKm: 30,
      searchRadiusKm: 5,
      dataMinKm: 3,
      dataMaxKm: 200,
    });
    expect(win.domainFromKm).toBe(3);
    expect(win.domainToKm).toBe(200);
    expect(win.currentKm).toBeNull();
    expect(win.searchFromKm).toBeNull();
    expect(win.searchToKm).toBeNull();
  });
});

describe('computeWindowElevation (single source D+/D-, MOB-5.5 / T4)', () => {
  const waypoints: MapWaypoint[] = [
    { lat: 0, lng: 0, ele: 100, distKm: 0 },
    { lat: 0, lng: 0, ele: 150, distKm: 1 }, // +50
    { lat: 0, lng: 0, ele: 120, distKm: 2 }, // -30
    { lat: 0, lng: 0, ele: 140, distKm: 3 }, // +20
  ];

  it('calcule D+/D- sur la fenêtre [from, to]', () => {
    const { gain, loss } = computeWindowElevation(waypoints, 0, 2);
    expect(gain).toBe(50);
    expect(loss).toBe(30);
  });

  it('< 2 points dans la fenêtre → null/null', () => {
    expect(computeWindowElevation(waypoints, 2.5, 2.9)).toEqual({
      gain: null,
      loss: null,
    });
  });

  it('aucune élévation dans la tranche → null/null (affiche « — »)', () => {
    const flat: MapWaypoint[] = [
      { lat: 0, lng: 0, distKm: 0 },
      { lat: 0, lng: 0, distKm: 1 },
    ];
    expect(computeWindowElevation(flat, 0, 1)).toEqual({ gain: null, loss: null });
  });
});

describe('LiveElevationProfile — garde hasElevationData (AC4)', () => {
  it('sans données d’élévation → ne rend RIEN (pas de graphe vide)', async () => {
    const waypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, distKm: 0 },
      { lat: 0, lng: 0, distKm: 1 },
    ];
    await render(
      <LiveElevationProfile
        waypoints={waypoints}
        segments={[seg({})]}
        currentKmOnRoute={0}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    );
    expect(ElevationChartMock).not.toHaveBeenCalled();
  });

  it('avec données → rend ElevationChart avec le domaine fenêtré', async () => {
    const waypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, ele: 100, distKm: 0 },
      { lat: 0, lng: 0, ele: 120, distKm: 50 },
      { lat: 0, lng: 0, ele: 110, distKm: 200 },
    ];
    await render(
      <LiveElevationProfile
        waypoints={waypoints}
        segments={[seg({})]}
        currentKmOnRoute={10}
        targetAheadKm={30}
        searchRadiusKm={5}
      />,
    );
    expect(ElevationChartMock).toHaveBeenCalledTimes(1);
    const props = ElevationChartMock.mock.calls[0][0];
    expect(props.domainFromKm).toBe(10);
    expect(props.domainToKm).toBe(140); // 10 + 30 + 100, < dataMax 200
    expect(props.currentKm).toBe(10);
    expect(props.searchFromKm).toBe(35); // target 40 ± 5
    expect(props.searchToKm).toBe(45);
    expect(props.points).toHaveLength(3);
  });
});
