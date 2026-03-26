import type { KmWaypoint } from './cumulative-distances'
import type { LatLng } from './haversine'

export function findPointAtKm(waypoints: KmWaypoint[], targetKm: number): LatLng | null {
  if (waypoints.length === 0) return null
  if (targetKm <= waypoints[0].km) return { lat: waypoints[0].lat, lng: waypoints[0].lng }

  const last = waypoints[waypoints.length - 1]
  if (targetKm >= last.km) return { lat: last.lat, lng: last.lng }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    if (a.km <= targetKm && targetKm <= b.km) {
      const t = (targetKm - a.km) / (b.km - a.km)
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng),
      }
    }
  }
  return null
}
