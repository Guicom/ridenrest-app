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

export function buildBookingSearchUrl(city: string, postcode?: string | null, adminArea?: string | null, country?: string | null): string {
  let ss = postcode?.trim() ? `${city} ${postcode.trim()}` : city
  if (adminArea?.trim()) ss += `, ${adminArea.trim()}`
  if (country?.trim()) ss += `, ${country.trim()}`
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(ss)}`
}

/**
 * Extracts city and postcode from OSM rawData tags.
 * City priority: addr:city > addr:town > addr:village
 */
export function extractCityFromOsmRawData(
  rawData?: Record<string, unknown>,
): { city: string | null; postcode: string | null } {
  if (!rawData) return { city: null, postcode: null }
  const city =
    (rawData['addr:city'] as string | undefined) ??
    (rawData['addr:town'] as string | undefined) ??
    (rawData['addr:village'] as string | undefined) ??
    null
  const postcode = (rawData['addr:postcode'] as string | undefined) ?? null
  return { city, postcode }
}

/** Fallback when no city is available — uses GPS coordinates for Booking.com search */
export function buildBookingCoordUrl(center: { lat: number; lng: number }): string {
  return `https://www.booking.com/searchresults.html?latitude=${center.lat}&longitude=${center.lng}&dest_type=latlong`
}

/** Wraps a Booking.com URL through the redirect proxy to bypass mobile Universal Links / App Links */
export function wrapBookingUrl(url: string): string {
  return `${process.env['NEXT_PUBLIC_API_URL']}/api/go/booking?url=${encodeURIComponent(url)}`
}

/** Bounding box ±0.2° (≈ 22 km) autour du centre — Airbnb requiert un bbox pour la recherche par coordonnées */
export function buildAirbnbSearchUrl(center: { lat: number; lng: number }): string {
  const d = 0.2
  return `https://www.airbnb.com/s/homes?ne_lat=${center.lat + d}&ne_lng=${center.lng + d}&sw_lat=${center.lat - d}&sw_lng=${center.lng - d}`
}
