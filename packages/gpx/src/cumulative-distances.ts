import { haversine, type LatLng } from './haversine'

export interface GpxPoint extends LatLng {
  elevM?: number
}

export interface KmWaypoint extends GpxPoint {
  km: number // cumulative distance from start
}

/** Compute cumulative km for each point in the array */
export function computeCumulativeDistances(points: GpxPoint[]): KmWaypoint[] {
  if (points.length === 0) return []

  let cumulative = 0
  return points.map((point, i) => {
    if (i > 0) {
      cumulative += haversine(points[i - 1]!, point)
    }
    return { ...point, km: cumulative }
  })
}

/** Total distance of a GPX track in km */
export function totalDistance(points: GpxPoint[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1]!, points[i]!)
  }
  return total
}
