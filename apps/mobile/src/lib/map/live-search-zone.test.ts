import {
  computeSearchZoneBounds,
  createCirclePolygon,
} from '@/lib/map/maplibre-config';

// Helpers purs de la zone de recherche Live (MOB-5.3 / T4, T10).

describe('createCirclePolygon (T4)', () => {
  const center = { lat: 45, lng: 6 };

  it('64 sommets + fermeture explicite de l’anneau (65 coords, premier = dernier)', () => {
    const circle = createCirclePolygon(center, 5, 64)!;
    const ring = circle.geometry.coordinates[0]!;
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[64]);
  });

  it('toutes les coordonnées sont finies (anti-SIGABRT)', () => {
    const ring = createCirclePolygon(center, 12, 64)!.geometry.coordinates[0]!;
    for (const [lng, lat] of ring) {
      expect(Number.isFinite(lng)).toBe(true);
      expect(Number.isFinite(lat)).toBe(true);
    }
  });

  it('rayon correct : le sommet nord (cap 0) est à ~radius/111 km au nord', () => {
    const ring = createCirclePolygon(center, 5, 64)!.geometry.coordinates[0]!;
    // i=0 → cap nord : longitude inchangée, latitude = center + 5 km en degrés.
    expect(ring[0]![0]).toBeCloseTo(center.lng, 3);
    expect(ring[0]![1]).toBeCloseTo(center.lat + 5 / 111.19, 3);
  });

  it('centre non fini → null (pas de feature à coordonnée NaN)', () => {
    expect(createCirclePolygon({ lat: NaN, lng: 6 }, 5)).toBeNull();
    expect(
      createCirclePolygon({ lat: 45, lng: Infinity }, 5),
    ).toBeNull();
    expect(createCirclePolygon(center, NaN)).toBeNull();
  });
});

describe('computeSearchZoneBounds (T5)', () => {
  const waypoints = [
    { lat: 45.0, lng: 6.0, distKm: 0 },
    { lat: 45.1, lng: 6.1, distKm: 5 },
    { lat: 45.2, lng: 6.2, distKm: 10 },
    { lat: 45.3, lng: 6.3, distKm: 15 },
    { lat: 45.4, lng: 6.4, distKm: 20 },
  ];

  it('englobe les waypoints dans [target−radius, target+radius] avec marge', () => {
    const bounds = computeSearchZoneBounds(waypoints, 10, 5)!;
    expect(bounds).not.toBeNull();
    const [minLng, minLat, maxLng, maxLat] = bounds;
    // In-range = distKm 5, 10, 15 (lat 45.1..45.3, lng 6.1..6.3), élargi.
    expect(minLng).toBeLessThan(6.1);
    expect(minLat).toBeLessThan(45.1);
    expect(maxLng).toBeGreaterThan(6.3);
    expect(maxLat).toBeGreaterThan(45.3);
  });

  it('aucun waypoint dans la plage → null (fallback trace par l’appelant)', () => {
    expect(computeSearchZoneBounds(waypoints, 100, 1)).toBeNull();
  });

  it('ignore les waypoints à coordonnées non finies', () => {
    const wp = [
      { lat: NaN, lng: 6.1, distKm: 8 },
      { lat: 45.2, lng: 6.2, distKm: 10 },
    ];
    const bounds = computeSearchZoneBounds(wp, 10, 5)!;
    // Seul le waypoint valide compte → bornes autour de 45.2 / 6.2.
    expect(bounds[1]).toBeLessThan(45.2);
    expect(bounds[3]).toBeGreaterThan(45.2);
  });
});
