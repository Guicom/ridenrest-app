import type { MapSegmentData, MapWaypoint } from '@ridenrest/shared';
import { useMemo } from 'react';

// Concatène les waypoints de tous les segments en une liste **continue** à l'échelle de
// l'aventure : `distKm` cumulé = `cumulativeStartKm + wp.distKm` (les waypoints d'un
// segment portent un km **local**). Port iso du web. Alimente la carte Recherche (stats
// D+/D−, slider position) et le centre de corridor (Booking).

export function useAdventureWaypoints(
  segments: readonly MapSegmentData[],
): MapWaypoint[] {
  return useMemo(
    () =>
      segments.flatMap((s) =>
        (s.waypoints ?? []).map((wp) => ({
          ...wp,
          distKm: s.cumulativeStartKm + wp.distKm,
        })),
      ),
    [segments],
  );
}
