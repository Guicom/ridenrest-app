import type { GpxPoint } from './cumulative-distances'

/**
 * Parse GPX XML string into an array of GpxPoints from track segments (<trkpt>).
 * Attribute order (lat/lon) is handled regardless of order in the tag.
 */
export function parseGpx(gpxXml: string): GpxPoint[] {
  const points: GpxPoint[] = []

  // Step 1: match full <trkpt ...>...</trkpt> elements (attributes in any order)
  const trkptRegex = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g
  let match: RegExpExecArray | null

  while ((match = trkptRegex.exec(gpxXml)) !== null) {
    const attrs = match[1]!
    const inner = match[2]!

    // Extract lat and lon from attributes — order-independent
    const latMatch = /\blat="([^"]+)"/.exec(attrs)
    const lonMatch = /\blon="([^"]+)"/.exec(attrs)

    if (!latMatch || !lonMatch) continue

    const lat = parseFloat(latMatch[1]!)
    const lng = parseFloat(lonMatch[1]!)

    if (isNaN(lat) || isNaN(lng)) continue

    // Extract elevation if present
    const eleMatch = /<ele>([^<]+)<\/ele>/.exec(inner)
    const elevM = eleMatch ? parseFloat(eleMatch[1]!) : undefined

    points.push({ lat, lng, ...(elevM !== undefined ? { elevM } : {}) })
  }

  return points
}

/** Compute total elevation gain in meters from GPX points */
export function computeElevationGain(points: GpxPoint[]): number {
  let gain = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.elevM
    const curr = points[i]!.elevM
    if (prev !== undefined && curr !== undefined && curr > prev) {
      gain += curr - prev
    }
  }
  return gain
}

/** Compute total elevation loss in meters from GPX points (absolute value) */
export function computeElevationLoss(points: GpxPoint[]): number {
  let loss = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.elevM
    const curr = points[i]!.elevM
    if (
      prev !== undefined && curr !== undefined &&
      Number.isFinite(prev) && Number.isFinite(curr) &&
      curr < prev
    ) {
      loss += prev - curr
    }
  }
  return Math.round(loss)
}
