import type { MapWaypoint } from '@ridenrest/shared';

import { buildCorridorFeature } from '@/lib/map/corridor-features';

// Surbrillance corridor (pur) — LineString des waypoints dans [fromKm, toKm].

const waypoints: MapWaypoint[] = Array.from({ length: 11 }, (_, i) => ({
  lat: 45 + i * 0.1,
  lng: 5 + i * 0.1,
  distKm: i * 10, // 0,10,...,100 (cumulés)
}));

describe('buildCorridorFeature', () => {
  it('un LineString des waypoints dans la plage', () => {
    const fc = buildCorridorFeature(waypoints, 20, 50);
    expect(fc.features).toHaveLength(1);
    // waypoints distKm 20,30,40,50 (i=2..5) → 4 points.
    expect(fc.features[0]!.geometry.coordinates).toHaveLength(4);
    // ordre GeoJSON [lng, lat] — i=2 → lng 5.2, lat 45.2.
    expect(fc.features[0]!.geometry.coordinates[0]).toEqual([5.2, 45.2]);
  });

  it('aucune feature si < 2 waypoints dans la plage', () => {
    expect(buildCorridorFeature(waypoints, 12, 18).features).toHaveLength(0);
  });
});
