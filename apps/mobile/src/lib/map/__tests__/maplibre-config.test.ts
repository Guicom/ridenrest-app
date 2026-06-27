import type { MapSegmentData } from '@ridenrest/shared';

import {
  buildTraceFeatureCollection,
  collectTraceWaypoints,
  computeCorridorBounds,
  computeTraceBounds,
  FIT_PADDING,
  getMapStyle,
  hasTrace,
  isValidLngLat,
  safeFitPadding,
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

describe('computeCorridorBounds (zoom corridor après recherche)', () => {
  const wps = [
    { lat: 45.0, lng: 5.0, distKm: 0 },
    { lat: 45.1, lng: 5.1, distKm: 10 },
    { lat: 45.2, lng: 5.2, distKm: 20 },
    { lat: 45.3, lng: 5.3, distKm: 30 },
    { lat: 45.4, lng: 5.4, distKm: 40 },
  ];

  it('renvoie un bbox restreint aux waypoints dans [fromKm, toKm]', () => {
    const bounds = computeCorridorBounds(wps, 10, 20);
    expect(bounds).not.toBeNull();
    const [west, south, east, north] = bounds!;
    // Seuls les points distKm 10 et 20 (lng 5.1..5.2, lat 45.1..45.2) + buffer.
    expect(west).toBeLessThan(5.1);
    expect(east).toBeGreaterThan(5.2);
    expect(south).toBeLessThan(45.1);
    expect(north).toBeGreaterThan(45.2);
    // La plage exclut les extrémités (lng 5.0 / 5.4) — bbox plus serré que la trace entière.
    expect(west).toBeGreaterThan(computeTraceBounds(wps)![0]);
  });

  it('renvoie null si moins de 2 waypoints dans la plage (→ fallback trace)', () => {
    expect(computeCorridorBounds(wps, 12, 18)).toBeNull(); // aucun point
    expect(computeCorridorBounds(wps, 20, 25)).toBeNull(); // un seul point (distKm 20)
    expect(computeCorridorBounds([], 0, 100)).toBeNull();
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

  // Régression crash natif SIGABRT (2026-06-16) : une coordonnée non finie (point GPX
  // corrompu) faisait throw `mapbox::geojson` côté MapLibre Native → abort de l'app.
  // Web (GL JS) tolérait. On filtre les points invalides AVANT de bâtir la LineString.
  it('filtre les coordonnées non finies (null/NaN) au niveau du point', () => {
    const fc = buildTraceFeatureCollection([
      makeSegment('a', [
        { lat: 45, lng: 5, distKm: 0 },
        { lat: NaN, lng: 6, distKm: 1 }, // point corrompu → exclu
        { lat: 47, lng: null as unknown as number, distKm: 2 }, // lng null → exclu
        { lat: 48, lng: 8, distKm: 3 },
      ]),
    ]);
    expect(fc.features).toHaveLength(1);
    // Seuls les 2 points valides subsistent.
    expect(fc.features[0].geometry.coordinates).toEqual([
      [5, 45],
      [8, 48],
    ]);
  });

  it('exclut un segment qui retombe à < 2 points valides après filtrage', () => {
    const fc = buildTraceFeatureCollection([
      makeSegment('a', [
        { lat: 45, lng: 5, distKm: 0 },
        { lat: NaN, lng: NaN, distKm: 1 },
      ]),
    ]);
    expect(fc.features).toHaveLength(0);
  });
});

describe('isValidLngLat (garde anti-crash GeoJSON natif)', () => {
  it('vrai uniquement pour deux nombres finis', () => {
    expect(isValidLngLat(5, 45)).toBe(true);
    expect(isValidLngLat(0, 0)).toBe(true);
  });
  it('faux pour null/undefined/NaN/Infinity', () => {
    expect(isValidLngLat(null, 45)).toBe(false);
    expect(isValidLngLat(5, undefined)).toBe(false);
    expect(isValidLngLat(NaN, 45)).toBe(false);
    expect(isValidLngLat(5, Infinity)).toBe(false);
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

  it('écarte les waypoints à coordonnées non finies (anti-crash bbox/natif)', () => {
    const wp = collectTraceWaypoints([
      makeSegment('a', [
        { lat: 45, lng: 5, distKm: 0 },
        { lat: NaN, lng: 6, distKm: 1 },
        { lat: 46, lng: undefined as unknown as number, distKm: 2 },
      ]),
    ]);
    expect(wp).toEqual([{ lat: 45, lng: 5 }]);
  });

  it('retourne [] pour un segment entièrement invalide', () => {
    const wp = collectTraceWaypoints([
      makeSegment('a', [
        { lat: NaN, lng: NaN, distKm: 0 },
        { lat: NaN, lng: NaN, distKm: 1 },
      ]),
    ]);
    expect(wp).toEqual([]);
  });
});

describe('safeFitPadding (fit caméra robuste)', () => {
  it('renvoie le padding désiré quand la carte est assez grande', () => {
    expect(safeFitPadding(400, 800)).toBe(FIT_PADDING);
  });

  it('renvoie 0 si la carte n’est pas encore mesurée (0×0)', () => {
    expect(safeFitPadding(0, 0)).toBe(0);
    expect(safeFitPadding(400, 0)).toBe(0);
  });

  it('clampe le padding sous la moitié de la plus petite dimension', () => {
    // min(w,h) = 50 → max = floor(50/2) - 1 = 24 < FIT_PADDING (40).
    const padding = safeFitPadding(300, 50);
    expect(padding).toBe(24);
    expect(2 * padding).toBeLessThan(50);
  });

  it('garantit 2×padding < min(w,h) sur des tailles dégénérées', () => {
    for (const [w, h] of [
      [1, 1],
      [2, 2],
      [3, 80],
      [81, 4],
    ]) {
      const padding = safeFitPadding(w, h);
      expect(padding).toBeGreaterThanOrEqual(0);
      expect(2 * padding).toBeLessThan(Math.min(w, h));
    }
  });

  it('respecte un padding désiré custom', () => {
    expect(safeFitPadding(1000, 1000, 10)).toBe(10);
  });
});

describe('constantes', () => {
  it('TRACE_COLOR est le vert de marque', () => {
    expect(TRACE_COLOR).toBe('#2D6A4A');
  });
});
