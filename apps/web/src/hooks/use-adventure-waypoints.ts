import { useMemo } from 'react'
import type { MapSegmentData, MapWaypoint } from '@ridenrest/shared'

/**
 * Concatenate waypoints from all ready segments, adjusting distKm by each segment's
 * cumulativeStartKm to produce a continuous adventure-wide waypoint array.
 * Shared between MapCanvas (search-range marker/highlight) and SearchRangeControl (D+ display).
 */
export function useAdventureWaypoints(segments: MapSegmentData[]): MapWaypoint[] {
  return useMemo(
    () =>
      segments.flatMap((s) =>
        (s.waypoints ?? []).map((wp) => ({
          ...wp,
          distKm: s.cumulativeStartKm + wp.distKm,
        })),
      ),
    [segments],
  )
}
