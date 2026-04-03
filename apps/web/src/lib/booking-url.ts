import type { MapWaypoint } from '@ridenrest/shared'

/**
 * Returns the waypoint closest to targetKm along the route.
 * Used to compute a center point for global Booking.com search URLs.
 */
export function getCorridorCenter(
  waypoints: MapWaypoint[],
  targetKm: number,
): { lat: number; lng: number } | null {
  if (waypoints.length === 0) return null
  let closest = waypoints[0]!
  let minDiff = Math.abs(waypoints[0]!.distKm - targetKm)
  for (const wp of waypoints) {
    const diff = Math.abs(wp.distKm - targetKm)
    if (diff < minDiff) {
      minDiff = diff
      closest = wp
    }
  }
  return { lat: closest.lat, lng: closest.lng }
}

export function buildBookingSearchUrl(center: { lat: number; lng: number }): string {
  return `https://www.booking.com/searchresults.html?latitude=${center.lat}&longitude=${center.lng}`
}

/** Bounding box ±0.2° (≈ 22 km) autour du centre — Airbnb requiert un bbox pour la recherche par coordonnées */
export function buildAirbnbSearchUrl(center: { lat: number; lng: number }): string {
  const d = 0.2
  return `https://www.airbnb.com/s/homes?ne_lat=${center.lat + d}&ne_lng=${center.lng + d}&sw_lat=${center.lat - d}&sw_lng=${center.lng - d}`
}
