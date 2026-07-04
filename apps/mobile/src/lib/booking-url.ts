import type { MapWaypoint } from '@ridenrest/shared';

// Construction des URLs de recherche d'hébergement externe (Booking.com / Airbnb) —
// port iso de `apps/web/src/lib/booking-url.ts`. Ouvertes via `Linking.openURL` côté
// mobile. NB : depuis MOB-6.1, l'analytics mobile EST branché (PostHog via la façade
// `@ridenrest/analytics`) — le `trackBookingClick` est émis par `booking-links.tsx`,
// pas ici (ce module ne fait que bâtir les URLs).

/** Waypoint le plus proche de `targetKm` le long de la trace (centre du corridor). */
export function getCorridorCenter(
  waypoints: MapWaypoint[],
  targetKm: number,
): { lat: number; lng: number } | null {
  if (waypoints.length === 0) return null;
  let closest = waypoints[0]!;
  let minDiff = Math.abs(waypoints[0]!.distKm - targetKm);
  for (const wp of waypoints) {
    const diff = Math.abs(wp.distKm - targetKm);
    if (diff < minDiff) {
      minDiff = diff;
      closest = wp;
    }
  }
  return { lat: closest.lat, lng: closest.lng };
}

export function buildBookingSearchUrl(
  city: string,
  center?: { lat: number; lng: number } | null,
): string {
  let url = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(city)}&dest_type=city`;
  if (center) url += `&latitude=${center.lat}&longitude=${center.lng}`;
  return url;
}

/** Repli sans ville — recherche Booking.com par coordonnées GPS. */
export function buildBookingCoordUrl(center: { lat: number; lng: number }): string {
  return `https://www.booking.com/searchresults.html?latitude=${center.lat}&longitude=${center.lng}&dest_type=latlong`;
}

/** Bbox ±0.2° (~22 km) autour du centre — Airbnb requiert un bbox par coordonnées. */
export function buildAirbnbSearchUrl(center: { lat: number; lng: number }): string {
  const d = 0.2;
  return `https://www.airbnb.com/s/homes?ne_lat=${center.lat + d}&ne_lng=${center.lng + d}&sw_lat=${center.lat - d}&sw_lng=${center.lng - d}`;
}
