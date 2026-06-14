import type { MapSegmentData } from '@ridenrest/shared';

import {
  buildTraceFeatureCollection,
  collectTraceWaypoints,
  computeTraceBounds,
  getMapStyle,
  hasTrace,
  TRACE_COLOR,
} from '@/lib/map/maplibre-config';

// Tests purs de la config carte (MOB-4.1 / T8) — aucune dépendance React/native.
// Couvre AC1/AC2 : style light ≠ dark, bbox cohérent (ordre `[lng, lat]`), GeoJSON.

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

describe('getMapStyle (AC2 — light/dark)', () => {
  it('renvoie des styles distincts pour light et dark', () => {
    expect(getMapStyle('light')).not.toBe(getMapStyle('dark'));
  });

  it('renvoie des URLs https (tuiles OpenFreeMap, sans clé)', () => {
    expect(getMapStyle('light')).toMatch(/^https:\/\//);
    expect(getMapStyle('dark')).toMatch(/^https:\/\//);
  });
});

describe('hasTrace', () => {
  it('vrai dès qu’un segment a ≥ 2 waypoints', () => {
    expect(
      hasTrace([
        makeSegment('a', [
          { lat: 45, lng: 5, distKm: 0 },
          { lat: 46, lng: 6, distKm: 1 },
        ]),
      ]),
    ).toBe(true);
  });

  it('faux si aucun waypoint / un seul point / undefined', () => {
    expect(hasTrace(undefined)).toBe(false);
    expect(hasTrace([makeSegment('a', null)])).toBe(false);
    expect(hasTrace([makeSegment('a', [{ lat: 45, lng: 5, distKm: 0 }])])).toBe(
      false,
    );
  });
});

describe('computeTraceBounds', () => {
  it('renvoie null pour une liste vide', () => {
    expect(computeTraceBounds([])).toBeNull();
  });

  it('renvoie un bbox [west, south, east, north] cohérent', () => {
    const bounds = computeTraceBounds([
      { lat: 45, lng: 5 },
      { lat: 46, lng: 6 },
    ]);
    expect(bounds).not.toBeNull();
    const [west, south, east, north] = bounds!;
    // west < east et south < north (ordre lng/lat respecté).
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    // Le buffer élargit la bbox au-delà des points bruts.
    expect(west).toBeLessThan(5);
    expect(east).toBeGreaterThan(6);
  });
});

describe('buildTraceFeatureCollection (ordre GeoJSON [lng, lat])', () => {
  it('produit une LineString par segment ≥ 2 waypoints, en [lng, lat]', () => {
    const fc = buildTraceFeatureCollection([
      makeSegment('a', [
        { lat: 45, lng: 5, distKm: 0 },
        { lat: 46, lng: 6, distKm: 1 },
      ]),
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].geometry.type).toBe('LineString');
    // [lng, lat] — surtout PAS [lat, lng].
    expect(fc.features[0].geometry.coordinates[0]).toEqual([5, 45]);
    expect(fc.features[0].properties).toMatchObject({ segmentId: 'a' });
  });

  it('exclut les segments sans waypoints ou < 2 points', () => {
    const fc = buildTraceFeatureCollection([
      makeSegment('a', null),
      makeSegment('b', [{ lat: 45, lng: 5, distKm: 0 }]),
    ]);
    expect(fc.features).toHaveLength(0);
  });
});

describe('collectTraceWaypoints', () => {
  it('aplati les waypoints de tous les segments en {lat,lng}', () => {
    const wp = collectTraceWaypoints([
      makeSegment('a', [{ lat: 45, lng: 5, distKm: 0 }]),
      makeSegment('b', [{ lat: 46, lng: 6, distKm: 0 }]),
    ]);
    expect(wp).toEqual([
      { lat: 45, lng: 5 },
      { lat: 46, lng: 6 },
    ]);
  });
});

describe('constantes', () => {
  it('TRACE_COLOR est le vert de marque', () => {
    expect(TRACE_COLOR).toBe('#2D6A4A');
  });
});
