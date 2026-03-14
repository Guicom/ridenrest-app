import type { LatLng } from './haversine'
import type { KmWaypoint } from './cumulative-distances'

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/** km per degree of latitude (roughly constant) */
const KM_PER_DEG_LAT = 111.32

/**
 * Extract waypoints between fromKm and toKm from a precomputed waypoint array.
 * Max range: 30km (enforced by API DTO — reminder only, not validated here).
 */
export function extractSegment(waypoints: KmWaypoint[], fromKm: number, toKm: number): KmWaypoint[] {
  return waypoints.filter((wp) => wp.km >= fromKm && wp.km <= toKm)
}

/**
 * Compute bounding box for a set of points + symmetric buffer in km.
 * Longitude buffer is latitude-adjusted to ensure equal distance on all sides.
 * Default: 1km buffer (suitable for 500m corridor + safety margin).
 */
export function computeBoundingBox(points: LatLng[], bufferKm = 1): BoundingBox {
  if (points.length === 0) {
    throw new Error('Cannot compute bounding box for empty points array')
  }

  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }

  const midLat = (minLat + maxLat) / 2
  const latBuf = bufferKm / KM_PER_DEG_LAT
  const lngBuf = bufferKm / (KM_PER_DEG_LAT * Math.cos((midLat * Math.PI) / 180))

  return {
    minLat: minLat - latBuf,
    maxLat: maxLat + latBuf,
    minLng: minLng - lngBuf,
    maxLng: maxLng + lngBuf,
  }
}
