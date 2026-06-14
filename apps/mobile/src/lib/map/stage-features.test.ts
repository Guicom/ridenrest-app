import type { AdventureStageResponse, MapWaypoint } from '@ridenrest/shared';

import { buildStageColoredFeatures } from '@/lib/map/stage-features';

// Colorisation trace par étape (pur).

const waypoints: MapWaypoint[] = Array.from({ length: 11 }, (_, i) => ({
  lat: 45 + i * 0.1,
  lng: 5 + i * 0.1,
  distKm: i * 10, // 0,10,...,100 (cumulés)
}));

function stage(
  id: string,
  startKm: number,
  endKm: number,
  color: string,
): AdventureStageResponse {
  return {
    id,
    adventureId: 'a',
    name: id,
    color,
    orderIndex: 0,
    startKm,
    endKm,
    distanceKm: endKm - startKm,
    elevationGainM: null,
    elevationLossM: null,
    etaMinutes: null,
    departureTime: null,
    speedKmh: null,
    pauseHours: null,
    createdAt: '',
    updatedAt: '',
  };
}

describe('buildStageColoredFeatures', () => {
  it('une LineString colorée par étape, sur sa plage [startKm, endKm]', () => {
    const features = buildStageColoredFeatures(waypoints, [
      stage('s1', 0, 30, '#f97316'),
      stage('s2', 30, 60, '#3b82f6'),
    ]);
    expect(features).toHaveLength(2);
    expect(features[0]!.properties!.color).toBe('#f97316');
    expect(features[1]!.properties!.color).toBe('#3b82f6');
    // s1 = waypoints 0,10,20,30 → 4 points.
    expect(features[0]!.geometry.coordinates).toHaveLength(4);
  });

  it('ignore une étape sans assez de waypoints', () => {
    const features = buildStageColoredFeatures(waypoints, [
      stage('s1', 0, 5, '#f97316'), // seul le wp 0 est dans [0,5]
    ]);
    expect(features).toHaveLength(0);
  });
});
