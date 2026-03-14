import { haversine, type LatLng } from './haversine'
import type { KmWaypoint } from './cumulative-distances'

export interface SnapResult {
  nearestWaypoint: KmWaypoint
  distanceKm: number
  kmAlongRoute: number
}

/**
 * Find the nearest waypoint on a route to a given position.
 * Used for live mode: "where am I on my route?"
 * Note: position is NEVER sent to server (RGPD) — this runs client-side only.
 */
export function snapToTrace(position: LatLng, waypoints: KmWaypoint[]): SnapResult | null {
  if (waypoints.length === 0) return null

  let minDist = Infinity
  let nearest: KmWaypoint | null = null

  for (const wp of waypoints) {
    const dist = haversine(position, wp)
    if (dist < minDist) {
      minDist = dist
      nearest = wp
    }
  }

  if (!nearest) return null

  return {
    nearestWaypoint: nearest,
    distanceKm: minDist,
    kmAlongRoute: nearest.km,
  }
}
