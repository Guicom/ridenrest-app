import type { MapSegmentData, MapWaypoint } from '@ridenrest/shared';
import { useMemo } from 'react';

import { isValidLngLat } from '@/lib/map/maplibre-config';

// Concatène les waypoints de tous les segments en une liste **continue** à l'échelle de
// l'aventure : `distKm` cumulé = `cumulativeStartKm + wp.distKm` (les waypoints d'un
// segment portent un km **local**). Port iso du web. Alimente la carte Recherche (stats
// D+/D−, slider position) et le centre de corridor (Booking).
//
// ⚠️ Filtre les waypoints à coordonnées non finies (point GPX corrompu) : cette liste
// alimente des `<GeoJSONSource>` natifs (corridor/étapes/météo/marqueurs) et MapLibre
// Native crash (SIGABRT) sur une coordonnée non numérique. Cf. `isValidLngLat`.

export function useAdventureWaypoints(
  segments: readonly MapSegmentData[],
): MapWaypoint[] {
  return useMemo(
    () =>
      segments.flatMap((s) =>
        (s.waypoints ?? [])
          .filter((wp) => isValidLngLat(wp.lng, wp.lat))
          .map((wp) => ({
            ...wp,
            distKm: s.cumulativeStartKm + wp.distKm,
          })),
      ),
    [segments],
  );
}
