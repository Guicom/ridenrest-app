import type { CoverageGapSummary, MapSegmentData } from '@ridenrest/shared';

import { isValidLngLat } from '@/lib/map/maplibre-config';

// Construction des features de colorisation densité — port iso de
// `buildDensityColoredFeatures` (web map-canvas). La trace est découpée en tronçons de
// 10 km ; chaque tronçon prend la couleur de son `coverageGap` (sinon « high » = vert).
// PUR → testable hors React.

export const DENSITY_COLORS = {
  high: '#16a34a', // 2+ hébergements / 10 km
  medium: '#d97706', // 1 / 10 km
  critical: '#dc2626', // 0 / 10 km
} as const;

const CHUNK_KM = 10;
const EPSILON_KM = 0.01; // 10 m — tolère le float32 DB

export function buildDensityColoredFeatures(
  segments: readonly MapSegmentData[],
  coverageGaps: readonly CoverageGapSummary[],
): GeoJSON.Feature<GeoJSON.LineString>[] {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const segment of segments) {
    if (!segment.waypoints || segment.waypoints.length < 2) continue;
    const totalKm = segment.distanceKm;

    for (let fromKm = 0; fromKm < totalKm; fromKm += CHUNK_KM) {
      const toKm = Math.min(fromKm + CHUNK_KM, totalKm);
      const chunk = segment.waypoints.filter(
        (wp) =>
          wp.distKm >= fromKm &&
          wp.distKm <= toKm &&
          isValidLngLat(wp.lng, wp.lat),
      );
      if (chunk.length < 2) continue;

      const gap = coverageGaps.find(
        (g) =>
          g.segmentId === segment.id &&
          Math.abs(g.fromKm - fromKm) < EPSILON_KM &&
          Math.abs(g.toKm - toKm) < EPSILON_KM,
      );
      const severity = gap?.severity ?? 'none';
      const color =
        severity === 'critical'
          ? DENSITY_COLORS.critical
          : severity === 'medium'
            ? DENSITY_COLORS.medium
            : DENSITY_COLORS.high;

      features.push({
        type: 'Feature',
        properties: {
          color,
          severity,
          fromKmAbsolute: segment.cumulativeStartKm + fromKm,
          toKmAbsolute: segment.cumulativeStartKm + toKm,
        },
        geometry: {
          type: 'LineString',
          coordinates: chunk.map((wp) => [wp.lng, wp.lat]),
        },
      });
    }
  }

  return features;
}
