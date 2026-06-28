import {
  buildAreaPathD,
  MARKER_COLOR,
  projectX,
  ZONE_COLOR,
} from '@/components/live/elevation-chart';
import type { ElevationPoint } from '@/hooks/use-elevation-profile';

// MOB-5.5 / T6 — la géométrie du chart est extraite en helpers PURS (`buildAreaPathD`,
// `projectX`) : c'est là que vit la garantie NFR-LP-002 (le `<Path>` ne dépend pas du
// domaine) + le positionnement marqueur/zone. On les teste directement (robuste, sans
// dépendre du rendu natif react-native-svg, non disponible sous jest-expo). Le branchement
// SVG (couleurs, transform, clip) est couvert par la validation device Maestro (T7).

function pt(distKm: number, ele: number): ElevationPoint {
  return { distKm, ele, cumulativeDPlus: 0, cumulativeDMinus: 0, slope: 0 };
}

const POINTS: ElevationPoint[] = [pt(0, 100), pt(50, 200), pt(100, 150)];

describe('buildAreaPathD — `<Path>` invariant au domaine (NFR-LP-002)', () => {
  it('ne prend PAS le domaine : `d` identique quel que soit le zoom (pas de re-tranchage)', () => {
    // Le helper n'a pas de paramètre de domaine → par construction, le zoom ne le recompute
    // jamais. On vérifie que les points pilotent seuls le tracé (x = km brut).
    const d = buildAreaPathD(POINTS, 80);
    expect(d).not.toBeNull();
    expect(d).toContain('M 0 80'); // ancrage baseline au 1er km
    expect(d).toContain('L 0 '); // 1er point (km 0)
    expect(d).toContain('L 50 '); // x = km brut (pas un pixel dépendant du domaine)
    expect(d).toContain('L 100 '); // dernier point (km 100)
    expect(d!.endsWith('Z')).toBe(true);
    // Stable : même entrée → même sortie.
    expect(buildAreaPathD(POINTS, 80)).toBe(d);
  });

  it('< 2 points → null (pas de graphe vide, AC4)', () => {
    expect(buildAreaPathD([pt(0, 100)], 80)).toBeNull();
    expect(buildAreaPathD([], 80)).toBeNull();
  });

  it('élévation plate (eleMax === eleMin) → pas de division par zéro', () => {
    const d = buildAreaPathD([pt(0, 100), pt(10, 100)], 80);
    expect(d).not.toBeNull();
    expect(d).not.toContain('NaN');
    expect(d).not.toContain('Infinity');
  });
});

describe('projectX — positionnement marqueur/zone selon le domaine visible (zoom)', () => {
  it('mappe le bord gauche du domaine sur x=0, le bord droit sur x=width', () => {
    expect(projectX(0, 0, 100, 300)).toBe(0);
    expect(projectX(100, 0, 100, 300)).toBe(300);
  });

  it('marqueur position : currentKm projeté dans la fenêtre', () => {
    // Domaine [0,100], largeur 300 → sx = 3 → km 10 = px 30.
    expect(projectX(10, 0, 100, 300)).toBe(30);
    // Zoom [10,60] → sx = 6 → la position GPS (km 10) revient au bord gauche (px 0).
    expect(projectX(10, 10, 60, 300)).toBe(0);
  });

  it('zone recherchée : largeur en pixels = rayon projeté', () => {
    // Zone [20,30] dans [0,100] @300 → x=60, largeur=30.
    expect(projectX(20, 0, 100, 300)).toBe(60);
    expect(projectX(30, 0, 100, 300) - projectX(20, 0, 100, 300)).toBe(30);
  });

  it('garde la division par (domaine quasi nul) finie (anti-inversion en amont)', () => {
    expect(Number.isFinite(projectX(5, 5, 5, 300))).toBe(true);
  });
});

describe('couleurs (parité web + spec)', () => {
  it('marqueur vert #16a34a (FR-LP-007), zone bleue #3498db (FR-LP-008)', () => {
    expect(MARKER_COLOR).toBe('#16a34a');
    expect(ZONE_COLOR).toBe('#3498db');
  });
});
