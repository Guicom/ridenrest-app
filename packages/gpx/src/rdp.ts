import { haversine, type LatLng } from './haversine'

/** Perpendicular distance from point p to line segment (a, b) in km */
function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const dLat = b.lat - a.lat
  const dLng = b.lng - a.lng
  const len2 = dLat * dLat + dLng * dLng

  // Degenerate segment — a and b are the same point
  if (len2 === 0) return haversine(p, a)

  // Project p onto line segment ab, clamped to [0, 1]
  const t = ((p.lat - a.lat) * dLat + (p.lng - a.lng) * dLng) / len2
  const tClamped = Math.max(0, Math.min(1, t))

  const projection: LatLng = {
    lat: a.lat + tClamped * dLat,
    lng: a.lng + tClamped * dLng,
  }

  return haversine(p, projection)
}

/**
 * Ramer-Douglas-Peucker simplification (iterative — no stack overflow risk on large arrays).
 * @param points - Array of LatLng points
 * @param epsilon - Max deviation in km (0.0001 ≈ 10m)
 *
 * Note: projection uses degree-space (flat-earth approximation), which introduces
 * small inaccuracies at high latitudes (>60°N). Acceptable for European cycling routes.
 */
export function rdpSimplify<T extends LatLng>(points: T[], epsilon: number): T[] {
  if (points.length <= 2) return points

  // Mark which points to retain (avoids recursive call stack overflow for 50k+ point arrays)
  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  // Explicit stack of [startIdx, endIdx] pairs
  const stack: Array<[number, number]> = [[0, points.length - 1]]

  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    if (end - start <= 1) continue

    let maxDist = 0
    let maxIdx = start

    const a = points[start]!
    const b = points[end]!

    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(points[i]!, a, b)
      if (dist > maxDist) {
        maxDist = dist
        maxIdx = i
      }
    }

    if (maxDist > epsilon) {
      keep[maxIdx] = 1
      stack.push([start, maxIdx])
      stack.push([maxIdx, end])
    }
  }

  return points.filter((_, i) => keep[i] === 1)
}
