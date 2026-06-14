import type { CoverageGapSummary, MapSegmentData } from '@ridenrest/shared';

import {
  buildDensityColoredFeatures,
  DENSITY_COLORS,
} from '@/lib/map/density-features';

// Colorisation densité (pur) — tronçons de 10 km, couleur par coverage gap.

function seg(): MapSegmentData {
  return {
    id: 's1',
    name: 'S1',
    orderIndex: 0,
    cumulativeStartKm: 0,
    distanceKm: 25,
    parseStatus: 'done',
    source: null,
    boundingBox: null,
    waypoints: [
      { lat: 45.0, lng: 5.0, distKm: 0 },
      { lat: 45.1, lng: 5.1, distKm: 5 },
      { lat: 45.2, lng: 5.2, distKm: 10 },
      { lat: 45.3, lng: 5.3, distKm: 15 },
      { lat: 45.4, lng: 5.4, distKm: 20 },
      { lat: 45.5, lng: 5.5, distKm: 25 },
    ],
  };
}

describe('buildDensityColoredFeatures', () => {
  it('découpe en tronçons de 10 km et colore selon le gap', () => {
    const gaps: CoverageGapSummary[] = [
      { segmentId: 's1', fromKm: 10, toKm: 20, severity: 'critical' },
    ];
    const features = buildDensityColoredFeatures([seg()], gaps);
    expect(features).toHaveLength(3); // 0–10, 10–20, 20–25
    expect(features[0]!.properties!.color).toBe(DENSITY_COLORS.high);
    expect(features[1]!.properties!.color).toBe(DENSITY_COLORS.critical);
    expect(features[1]!.properties!.severity).toBe('critical');
    expect(features[2]!.properties!.color).toBe(DENSITY_COLORS.high);
  });

  it('km absolus = cumulativeStartKm + local', () => {
    const s = seg();
    s.cumulativeStartKm = 100;
    const features = buildDensityColoredFeatures([s], []);
    expect(features[0]!.properties!.fromKmAbsolute).toBe(100);
    expect(features[0]!.properties!.toKmAbsolute).toBe(110);
  });

  it('ignore un segment sans waypoints exploitables', () => {
    const s = seg();
    s.waypoints = null;
    expect(buildDensityColoredFeatures([s], [])).toHaveLength(0);
  });
});
