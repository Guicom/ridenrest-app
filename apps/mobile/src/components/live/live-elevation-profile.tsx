import { computeElevationGain, computeElevationLoss } from '@ridenrest/gpx';
import type { MapSegmentData, MapWaypoint } from '@ridenrest/shared';

import { ElevationChart } from '@/components/live/elevation-chart';
import { useElevationProfile } from '@/hooks/use-elevation-profile';

// Wrapper Live (MOB-5.5 / T3) — port de la math web `live-elevation-profile.tsx` (pure).
// Calcule la fenêtre visible (zoom) + la zone recherchée et délègue le rendu à
// `ElevationChart`. Les `points[]` ne sont JAMAIS re-tranchés : seul le domaine X change
// (NFR-LP-002). Frontend-only, aucun appel serveur (NFR-LP-005).

/** Horizon montré au-delà de la cible, en km (« ~100 km », FR-LP-009). Constante nommée. */
export const PROFILE_LOOKAHEAD_KM = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export interface ProfileWindow {
  /** Bord gauche du domaine X (km). */
  domainFromKm: number;
  /** Bord droit du domaine X (km). */
  domainToKm: number;
  /** Marqueur position (km) — `null` quand le GPS n'est pas encore projeté. */
  currentKm: number | null;
  /** Zone recherchée — bord gauche (km) — `null` sans position. */
  searchFromKm: number | null;
  /** Zone recherchée — bord droit (km) — `null` sans position. */
  searchToKm: number | null;
}

/**
 * Fenêtrage pur (testable, T6). Bord gauche = position GPS (≥ 0) ; bord droit = cible
 * + `PROFILE_LOOKAHEAD_KM`, borné par la fin de trace (`dataMaxKm`).
 *
 * **Garde anti-inversion** (patch review web P1 v1.7) : `domainToKm` est planché à
 * `domainFromKm` → l'axe ne peut jamais s'effondrer/s'inverser quand la position dépasse
 * la fin de trace (overshoot float) ou que la trace est dégénérée.
 *
 * `currentKmOnRoute === null` → trace pleine (domaine = [dataMinKm, dataMaxKm]), pas de
 * marqueur, pas de zone (T3).
 */
export function computeProfileWindow(args: {
  currentKmOnRoute: number | null;
  targetAheadKm: number;
  searchRadiusKm: number;
  dataMinKm: number;
  dataMaxKm: number;
}): ProfileWindow {
  const { currentKmOnRoute, targetAheadKm, searchRadiusKm, dataMinKm, dataMaxKm } = args;

  if (currentKmOnRoute === null) {
    return {
      domainFromKm: dataMinKm,
      domainToKm: dataMaxKm,
      currentKm: null,
      searchFromKm: null,
      searchToKm: null,
    };
  }

  const domainFromKm = Math.max(0, currentKmOnRoute);
  const domainToKm = Math.max(
    domainFromKm,
    Math.min(dataMaxKm, currentKmOnRoute + targetAheadKm + PROFILE_LOOKAHEAD_KM),
  );

  // Zone recherchée, clampée DANS la fenêtre visible (ne déborde pas l'axe, FR-LP-008).
  const target = currentKmOnRoute + targetAheadKm;
  const searchFromKm = clamp(target - searchRadiusKm, domainFromKm, domainToKm);
  const searchToKm = clamp(target + searchRadiusKm, domainFromKm, domainToKm);

  return { domainFromKm, domainToKm, currentKm: currentKmOnRoute, searchFromKm, searchToKm };
}

/**
 * D+/D- de la fenêtre `[fromKm, toKm]` (`computeElevationGain/Loss`) — **single source**
 * pour la ligne métriques de MOB-5.4 (résout l'Open Question 5.4 : un seul calcul partagé
 * entre l'écran et le profil). Retourne `{ null, null }` si < 2 points ou pas d'élévation
 * → l'UI affiche « — » plutôt que « ↑ 0 m · ↓ 0 m ».
 */
export function computeWindowElevation(
  waypoints: MapWaypoint[],
  fromKm: number,
  toKm: number,
): { gain: number | null; loss: number | null } {
  const slice = waypoints.filter((wp) => wp.distKm >= fromKm && wp.distKm <= toKm);
  if (slice.length < 2) return { gain: null, loss: null };
  const gpxPoints = slice.map((wp) => ({
    lat: wp.lat,
    lng: wp.lng,
    elevM: wp.ele ?? undefined,
  }));
  // GPX sans élévation : computeElevationGain/Loss renverrait 0 → on force null.
  if (!gpxPoints.some((p) => p.elevM !== undefined)) return { gain: null, loss: null };
  return {
    gain: computeElevationGain(gpxPoints),
    loss: computeElevationLoss(gpxPoints),
  };
}

export interface LiveElevationProfileProps {
  /** Waypoints cumulés (km à l'échelle de l'aventure) — `useAdventureWaypoints`. */
  waypoints: MapWaypoint[];
  segments: MapSegmentData[];
  /** Position GPS projetée sur la trace (km) — `null` avant le 1er snap. Client-side. */
  currentKmOnRoute: number | null;
  /** Distance « en avant » du slider (km). */
  targetAheadKm: number;
  /** Rayon de recherche autour de la cible (km) — largeur de la zone surlignée. */
  searchRadiusKm: number;
  /** Libellé a11y du graphe (transmis à `ElevationChart`). */
  accessibilityLabel?: string;
}

export function LiveElevationProfile({
  waypoints,
  segments,
  currentKmOnRoute,
  targetAheadKm,
  searchRadiusKm,
  accessibilityLabel,
}: LiveElevationProfileProps) {
  const { points, boundaries, hasElevationData } = useElevationProfile(waypoints, segments);

  // AC4 : pas de données d'élévation (ou trace dégénérée < 2 points) → ne RIEN rendre.
  // Côté MOB-5.4, `profileContent` doit être `null`/`undefined` pour que la section reste
  // non dépliable — l'écran gate déjà ce cas en amont, mais on reste défensif.
  if (!hasElevationData || points.length < 2) return null;

  const dataMinKm = points[0].distKm;
  const dataMaxKm = points[points.length - 1].distKm;
  const win = computeProfileWindow({
    currentKmOnRoute,
    targetAheadKm,
    searchRadiusKm,
    dataMinKm,
    dataMaxKm,
  });

  return (
    <ElevationChart
      points={points}
      boundaries={boundaries}
      domainFromKm={win.domainFromKm}
      domainToKm={win.domainToKm}
      currentKm={win.currentKm}
      searchFromKm={win.searchFromKm}
      searchToKm={win.searchToKm}
      accessibilityLabel={accessibilityLabel}
    />
  );
}
