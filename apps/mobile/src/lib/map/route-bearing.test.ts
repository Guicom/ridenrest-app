import {
  lookAheadPadding,
  LOOK_AHEAD_PX,
  routeBearingAtPosition,
} from './maplibre-config';

// Helpers PURS de l'offset look-ahead caméra (MOB-5.2 / T4, AC5). Testables hors React.

describe('routeBearingAtPosition', () => {
  it('< 2 waypoints → 0', () => {
    expect(routeBearingAtPosition([], { lat: 0, lng: 0 })).toBe(0);
    expect(routeBearingAtPosition([{ lat: 1, lng: 1 }], { lat: 0, lng: 0 })).toBe(0);
  });

  it('trace vers le nord → cap ≈ 0', () => {
    const wps = [
      { lat: 45, lng: 5 },
      { lat: 46, lng: 5 },
    ];
    expect(routeBearingAtPosition(wps, { lat: 45, lng: 5 })).toBeCloseTo(0, 5);
  });

  it("trace vers l'est → cap ≈ π/2", () => {
    const wps = [
      { lat: 45, lng: 5 },
      { lat: 45, lng: 6 },
    ];
    expect(routeBearingAtPosition(wps, { lat: 45, lng: 5 })).toBeCloseTo(Math.PI / 2, 5);
  });

  it('utilise le waypoint le plus proche pour le segment de cap', () => {
    const wps = [
      { lat: 45, lng: 5 }, // nord…
      { lat: 46, lng: 5 },
      { lat: 46, lng: 6 }, // …puis est
    ];
    // Position près du 2e waypoint → segment [1]→[2] = est.
    expect(routeBearingAtPosition(wps, { lat: 46, lng: 5.01 })).toBeCloseTo(
      Math.PI / 2,
      4,
    );
  });
});

describe('lookAheadPadding', () => {
  it('cap nord → padding en haut uniquement (GPS placé en bas, on voit devant)', () => {
    const p = lookAheadPadding(0, 100);
    expect(p.top).toBeCloseTo(100);
    expect(p.bottom).toBe(0);
    expect(p.left).toBe(0);
    expect(p.right).toBe(0);
  });

  it("cap est → padding à droite (GPS placé à gauche)", () => {
    const p = lookAheadPadding(Math.PI / 2, 100);
    expect(p.right).toBeCloseTo(100);
    expect(p.top).toBeCloseTo(0);
    expect(p.bottom).toBe(0);
    expect(p.left).toBe(0);
  });

  it('cap sud → padding en bas', () => {
    const p = lookAheadPadding(Math.PI, 100);
    expect(p.bottom).toBeCloseTo(100);
    expect(p.top).toBe(0);
  });

  it('utilise LOOK_AHEAD_PX par défaut', () => {
    expect(lookAheadPadding(0).top).toBeCloseTo(LOOK_AHEAD_PX);
  });
});
