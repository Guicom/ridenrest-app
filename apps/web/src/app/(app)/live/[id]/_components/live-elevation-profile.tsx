'use client'

import { ElevationProfile } from '../../../map/[id]/_components/elevation-profile'
import type { MapWaypoint, MapSegmentData } from '@ridenrest/shared'

/** Horizon shown beyond the search target, in km (spec « ~100 km », FR-LP-009). */
const PROFILE_LOOKAHEAD_KM = 100

interface LiveElevationProfileProps {
  waypoints: MapWaypoint[]
  segments: MapSegmentData[]
  /** GPS position projected onto the trace (km). null until the first GPS snap. */
  currentKmOnRoute: number | null
  /** Look-ahead distance from the slider (km). */
  targetAheadKm: number
  /** Search radius around the target (km) — width of the highlighted zone. */
  searchRadiusKm: number
  /** Total trace length (km). Derived from waypoints when omitted. */
  totalDistKm?: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Live-mode wrapper around {@link ElevationProfile}. It reuses the same Recharts
 * AreaChart (no duplication, FR-LP-006) and only drives the X-axis window + reference
 * markers — the underlying `points[]` are never re-sliced, so the `useElevationProfile`
 * memoization is preserved on slider moves (NFR-LP-002).
 *
 * Window: left edge = current GPS position, right edge = target + ~100 km, bounded by the
 * real end of the trace. Moving the slider re-frames the window → zoom/dezoom effect.
 */
export function LiveElevationProfile({
  waypoints,
  segments,
  currentKmOnRoute,
  targetAheadKm,
  searchRadiusKm,
  totalDistKm,
}: LiveElevationProfileProps) {
  // GPS not snapped yet → render the full trace (default domain), no marker, no zone.
  if (currentKmOnRoute === null) {
    return (
      <ElevationProfile waypoints={waypoints} segments={segments} className="h-full w-full" compact />
    )
  }

  const total = totalDistKm ?? waypoints[waypoints.length - 1]?.distKm ?? 0

  // Window: start at GPS position (≥ 0), end ~100 km after the target, bounded by trace end.
  // `domainToKm` is floored to `domainFromKm` so the X domain can never invert/collapse if the
  // GPS position overshoots the trace end (float) or `total` is unknown (degenerate trace).
  const domainFromKm = Math.max(0, currentKmOnRoute)
  const domainToKm = Math.max(
    domainFromKm,
    Math.min(total, currentKmOnRoute + targetAheadKm + PROFILE_LOOKAHEAD_KM),
  )

  // Search zone, clamped inside the visible window to avoid overflowing the axis.
  const target = currentKmOnRoute + targetAheadKm
  const searchFromKm = clamp(target - searchRadiusKm, domainFromKm, domainToKm)
  const searchToKm = clamp(target + searchRadiusKm, domainFromKm, domainToKm)

  return (
    <ElevationProfile
      waypoints={waypoints}
      segments={segments}
      className="h-full w-full"
      compact
      domainFromKm={domainFromKm}
      domainToKm={domainToKm}
      currentKm={currentKmOnRoute}
      searchFromKm={searchFromKm}
      searchToKm={searchToKm}
      searchRangeActive
    />
  )
}
