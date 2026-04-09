import { useMemo } from 'react'
import type { MapWaypoint, MapSegmentData } from '@ridenrest/shared'

export interface ElevationPoint {
  distKm: number
  ele: number
  cumulativeDPlus: number
  cumulativeDMinus: number
  slope: number  // gradient in % (positive = uphill, negative = downhill)
}

export interface SegmentBoundary {
  distKm: number
  name: string
}

export interface UseElevationProfileResult {
  points: ElevationPoint[]
  boundaries: SegmentBoundary[]
  hasElevationData: boolean
  totalDPlus: number
  totalDMinus: number
}

export function useElevationProfile(
  waypoints: MapWaypoint[],
  segments: MapSegmentData[],
): UseElevationProfileResult {
  return useMemo(() => {
    // Filter to waypoints with valid elevation
    const validWaypoints = waypoints.filter(
      (wp) => wp.ele !== null && wp.ele !== undefined,
    ) as (MapWaypoint & { ele: number })[]

    if (validWaypoints.length === 0) {
      return { points: [], boundaries: [], hasElevationData: false, totalDPlus: 0, totalDMinus: 0 }
    }

    // Compute elevation points with cumulative D+, D- and slope %
    const points: ElevationPoint[] = []
    let cumulativeDPlus = 0
    let cumulativeDMinus = 0
    for (let i = 0; i < validWaypoints.length; i++) {
      let slope = 0
      if (i > 0) {
        const deltaEle = validWaypoints[i].ele - validWaypoints[i - 1].ele
        const deltaM = (validWaypoints[i].distKm - validWaypoints[i - 1].distKm) * 1000
        if (deltaEle > 0) cumulativeDPlus += deltaEle
        else cumulativeDMinus += Math.abs(deltaEle)
        slope = deltaM > 0 ? (deltaEle / deltaM) * 100 : 0
      }
      points.push({
        distKm: validWaypoints[i].distKm,
        ele: validWaypoints[i].ele,
        cumulativeDPlus,
        cumulativeDMinus,
        slope,
      })
    }

    // Compute segment boundaries (all segments except the first)
    const boundaries: SegmentBoundary[] = segments.slice(1).map((seg) => ({
      distKm: seg.cumulativeStartKm,
      name: seg.name,
    }))

    const totalDPlus = points[points.length - 1]?.cumulativeDPlus ?? 0
    const totalDMinus = points[points.length - 1]?.cumulativeDMinus ?? 0

    return { points, boundaries, hasElevationData: true, totalDPlus, totalDMinus }
  }, [waypoints, segments])
}
