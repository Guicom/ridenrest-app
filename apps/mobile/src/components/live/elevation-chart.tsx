import { useId, useMemo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';

import type { ElevationPoint, SegmentBoundary } from '@/hooks/use-elevation-profile';
import { useTranslation } from '@/lib/i18n';

// Rendu RN du profil d'élévation (MOB-5.5 / T2). Le web utilise Recharts (DOM/SVG web,
// **non portable**) → on re-rend en `react-native-svg` (déjà lié, pas de prebuild).
//
// **Zoom = domaine X, JAMAIS re-slice (NFR-LP-002)** — pierre angulaire de la story :
//   - le `<Path>` d'aire est construit UNE fois en coordonnées « monde » (x = km BRUT,
//     y = pixels), memoïsé sur `[points, height]` SEULEMENT → son `d` ne change jamais
//     quand le slider bouge ;
//   - la fenêtre visible (`domainFromKm`/`domainToKm`, props) est appliquée par un
//     `transform` sur le `<G>` englobant (`translate` + `scale` en x) — équivalent
//     `allowDataOverflow` de Recharts, combiné à un `clipPath` qui coupe le débordement ;
//   - **Y reste sur le domaine plein** (le windowing Y a été tenté puis REVERTÉ côté web
//     v1.4 — ne PAS le refaire) : l'échelle Y est figée dans le memo du Path.
//
// Marqueur position + zone recherchée + bornes de segment sont rendus en pixels écran
// (hors du `<G>` transformé) via `xPixel(km)` — identique à `km·sx + tx` du transform,
// donc parfaitement alignés sur l'aire.

const CHART_HEIGHT = 80;
const PAD_TOP = 6;
const PAD_BOTTOM = 4;

// Couleurs inline (Open Question 2 : pas de token design-system mobile pour ces teintes ;
// parité web + spec FR-LP-007/008).
export const AREA_COLOR = '#2D6A4A'; // vert brand (aire + ligne de crête)
export const MARKER_COLOR = '#16a34a'; // marqueur position GPS (FR-LP-007)
export const ZONE_COLOR = '#3498db'; // zone recherchée (FR-LP-008)
const BOUNDARY_COLOR = '#9ca3af'; // bornes de segment (pointillés)

/**
 * Construit le `d` du `<Path>` d'aire en coordonnées « monde » : x = km BRUT, y = pixels
 * (échelle Y figée = domaine plein). **Ne prend PAS le domaine en argument** → le résultat
 * est invariant au zoom : c'est la garantie NFR-LP-002 (pas de re-tranchage des points).
 * Le composant le memoïse sur `[points, height]`. `null` si < 2 points.
 */
export function buildAreaPathD(points: ElevationPoint[], height: number): string | null {
  if (points.length < 2) return null;
  let eleMin = Infinity;
  let eleMax = -Infinity;
  for (const p of points) {
    if (p.ele < eleMin) eleMin = p.ele;
    if (p.ele > eleMax) eleMax = p.ele;
  }
  const span = eleMax - eleMin || 1;
  const innerH = height - PAD_TOP - PAD_BOTTOM;
  const yOf = (ele: number) => PAD_TOP + ((eleMax - ele) / span) * innerH;
  const baseline = height;
  let d = `M ${points[0].distKm} ${baseline}`;
  for (const p of points) d += ` L ${p.distKm} ${yOf(p.ele)}`;
  d += ` L ${points[points.length - 1].distKm} ${baseline} Z`;
  return d;
}

/** Projette un km vers un pixel écran selon le domaine visible (zoom). Aligné sur le
 *  transform du `<G>` (`km·sx + tx`). */
export function projectX(
  km: number,
  domainFromKm: number,
  domainToKm: number,
  width: number,
): number {
  const sx = width / Math.max(domainToKm - domainFromKm, 1e-6);
  return (km - domainFromKm) * sx;
}

export interface ElevationChartProps {
  points: ElevationPoint[];
  boundaries: SegmentBoundary[];
  /** Domaine X visible (km) — bord gauche. */
  domainFromKm: number;
  /** Domaine X visible (km) — bord droit. */
  domainToKm: number;
  /** Marqueur position (km) — `null` → pas de marqueur (trace pleine, GPS non snappé). */
  currentKm: number | null;
  /** Zone recherchée — bord gauche (km). `null` → pas de zone. */
  searchFromKm: number | null;
  /** Zone recherchée — bord droit (km). `null` → pas de zone. */
  searchToKm: number | null;
  /** Libellé a11y (D+/D- fenêtre + position) — décrit le graphe pour les lecteurs d'écran. */
  accessibilityLabel?: string;
}

export function ElevationChart({
  points,
  boundaries,
  domainFromKm,
  domainToKm,
  currentKm,
  searchFromKm,
  searchToKm,
  accessibilityLabel,
}: ElevationChartProps) {
  const { t } = useTranslation();
  const height = CHART_HEIGHT;
  // Largeur mesurée (la hauteur est fixe) — l'aire/échelles ont besoin de pixels concrets.
  const [width, setWidth] = useState(0);
  // ID unique par instance : `ClipPath` est scopé par `<Svg>` sur iOS, mais globalement
  // enregistré sur Android (RNSVGRenderableManager) → deux instances simultanées collisionneraient.
  const clipId = useId();

  const handleLayout = (e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== width) setWidth(w);
  };

  // `d` du `<Path>` d'aire — memoïsé sur [points, height] UNIQUEMENT (pas le domaine).
  // x = km brut ; y = pixels (échelle Y figée = domaine plein). Le zoom est un transform.
  const pathD = useMemo(() => buildAreaPathD(points, height), [points, height]);

  // Échelle X dérivée du domaine visible (props) — délibérément HORS du memo du Path.
  // `sx`/`tx` pilotent le transform du <G> ; `xPixel` aligne marqueur/zone/bornes dessus.
  const domainSpan = Math.max(domainToKm - domainFromKm, 1e-6);
  const sx = width / domainSpan;
  const tx = -domainFromKm * sx;
  const xPixel = (km: number) => projectX(km, domainFromKm, domainToKm, width);

  // Garde-fou : moins de 2 points exploitables → pas de graphe vide (AC4). Le wrapper
  // gate déjà ce cas, mais on reste défensif (parité « Données non disponibles » web).
  if (points.length < 2 || pathD === null) {
    return (
      <View
        testID="elevation-chart-empty"
        style={{ height }}
        className="items-center justify-center"
      >
        <Text className="text-xs font-montserrat text-text-muted">
          {t('live.profile.noElevation')}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID="elevation-chart"
      onLayout={handleLayout}
      style={{ height }}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <ClipPath id={clipId}>
              <Rect x={0} y={0} width={width} height={height} />
            </ClipPath>
          </Defs>
          <G clipPath={`url(#${clipId})`}>
            {/* Zone recherchée (sous l'aire) — `target ± searchRadiusKm`, déjà clampée
                dans la fenêtre par `computeProfileWindow` (FR-LP-008). */}
            {searchFromKm !== null && searchToKm !== null ? (
              <Rect
                testID="elevation-search-zone"
                x={xPixel(searchFromKm)}
                y={0}
                width={Math.max(0, xPixel(searchToKm) - xPixel(searchFromKm))}
                height={height}
                fill={ZONE_COLOR}
                fillOpacity={0.2}
              />
            ) : null}

            {/* Aire memoïsée — zoom appliqué par transform (x), Y inchangé (domaine plein).
                `non-scaling-stroke` garde la crête à épaisseur constante malgré le scale x. */}
            <G transform={`translate(${tx} 0) scale(${sx} 1)`}>
              <Path
                testID="elevation-area"
                d={pathD}
                fill={AREA_COLOR}
                fillOpacity={0.2}
                stroke={AREA_COLOR}
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              />
            </G>

            {/* Bornes de segment (pointillés gris). */}
            {boundaries.map((b) => (
              <Line
                key={b.distKm}
                x1={xPixel(b.distKm)}
                y1={0}
                x2={xPixel(b.distKm)}
                y2={height}
                stroke={BOUNDARY_COLOR}
                strokeWidth={1}
                strokeDasharray="3 3"
              />
            ))}

            {/* Marqueur position GPS — ligne verticale verte au bord gauche (FR-LP-007). */}
            {currentKm !== null ? (
              <Line
                testID="elevation-marker"
                x1={xPixel(currentKm)}
                y1={0}
                x2={xPixel(currentKm)}
                y2={height}
                stroke={MARKER_COLOR}
                strokeWidth={2}
              />
            ) : null}
          </G>
        </Svg>
      ) : null}
    </View>
  );
}
