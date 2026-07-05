import type { MapSegmentData, MapWaypoint } from '@ridenrest/shared';
import { render } from '@testing-library/react-native';
import { createElement } from 'react';

import {
  useElevationProfile,
  type UseElevationProfileResult,
} from '@/hooks/use-elevation-profile';

// MOB-5.5 / T6 — hook PUR porté verbatim du web. On vérifie : points/boundaries/
// hasElevationData/D+/D-, filtrage des `ele` invalides, et la STABILITÉ de la référence
// `points` (NFR-LP-002 : le zoom est un re-cadrage de domaine, jamais un re-tranchage).
//
// `renderHook` est jugé peu fiable dans ce repo (leçon MOB-3.1) → composant-sonde + `render`.

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

function setup(waypoints: MapWaypoint[], segments: MapSegmentData[]) {
  const ref: { current: UseElevationProfileResult | null } = { current: null };
  function Probe() {
    ref.current = useElevationProfile(waypoints, segments);
    return null;
  }
  return { ref, Probe };
}

describe('useElevationProfile (MOB-5.5)', () => {
  it('calcule points, D+/D- cumulés, pente % et bornes de segment', async () => {
    const waypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, ele: 100, distKm: 0 },
      { lat: 0, lng: 0, ele: 150, distKm: 1 }, // +50
      { lat: 0, lng: 0, ele: 120, distKm: 2 }, // -30
      { lat: 0, lng: 0, ele: 140, distKm: 3 }, // +20
    ];
    const segments: MapSegmentData[] = [
      seg({ id: 's1', name: 'A', cumulativeStartKm: 0 }),
      seg({ id: 's2', name: 'B', cumulativeStartKm: 2 }),
    ];
    const { ref, Probe } = setup(waypoints, segments);
    await render(createElement(Probe));

    const r = ref.current!;
    expect(r.hasElevationData).toBe(true);
    expect(r.points).toHaveLength(4);
    expect(r.totalDPlus).toBe(70); // 50 + 20
    expect(r.totalDMinus).toBe(30);
    expect(r.points[1].slope).toBeCloseTo(5, 5); // +50 m sur 1 km → 5 %
    expect(r.boundaries).toEqual([{ distKm: 2, name: 'B' }]);
  });

  it('filtre les waypoints sans élévation valide (null/undefined)', async () => {
    const waypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, ele: 100, distKm: 0 },
      { lat: 0, lng: 0, ele: null, distKm: 1 },
      { lat: 0, lng: 0, distKm: 2 }, // ele undefined
      { lat: 0, lng: 0, ele: 130, distKm: 3 },
    ];
    const { ref, Probe } = setup(waypoints, [seg({ id: 's1', name: 'A' })]);
    await render(createElement(Probe));

    expect(ref.current!.points).toHaveLength(2);
    expect(ref.current!.points.map((p) => p.ele)).toEqual([100, 130]);
  });

  it('aucune élévation valide → hasElevationData=false, points vides', async () => {
    const waypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, ele: null, distKm: 0 },
      { lat: 0, lng: 0, distKm: 1 },
    ];
    const { ref, Probe } = setup(waypoints, [seg({})]);
    await render(createElement(Probe));

    expect(ref.current!.hasElevationData).toBe(false);
    expect(ref.current!.points).toEqual([]);
    expect(ref.current!.totalDPlus).toBe(0);
    expect(ref.current!.totalDMinus).toBe(0);
  });

  it('mémoïse `points` : référence stable tant que waypoints/segments ne changent pas (NFR-LP-002)', async () => {
    const waypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, ele: 100, distKm: 0 },
      { lat: 0, lng: 0, ele: 120, distKm: 1 },
    ];
    const segments: MapSegmentData[] = [seg({})];
    const { ref, Probe } = setup(waypoints, segments);
    const { rerender } = await render(createElement(Probe));

    const firstRef = ref.current!.points;
    rerender(createElement(Probe));
    expect(ref.current!.points).toBe(firstRef); // même référence → pas de recompute
  });
});
