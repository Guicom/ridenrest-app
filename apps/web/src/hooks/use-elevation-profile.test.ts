import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useElevationProfile } from './use-elevation-profile'
import type { MapWaypoint, MapSegmentData } from '@ridenrest/shared'

function makeWaypoint(distKm: number, ele: number | null): MapWaypoint {
  return { lat: 0, lng: 0, distKm, ele }
}

function makeSegment(id: string, name: string, cumulativeStartKm: number, distanceKm: number): MapSegmentData {
  return {
    id,
    name,
    orderIndex: 0,
    cumulativeStartKm,
    distanceKm,
    parseStatus: 'done',
    waypoints: null,
    boundingBox: null,
  }
}

describe('useElevationProfile', () => {
  it('accumulates D+ only on positive gains (ignores descents)', () => {
    const waypoints: MapWaypoint[] = [
      makeWaypoint(0, 100),
      makeWaypoint(1, 200), // +100
      makeWaypoint(2, 150), // -50 → ignored
      makeWaypoint(3, 250), // +100
    ]
    const { result } = renderHook(() => useElevationProfile(waypoints, []))
    expect(result.current.hasElevationData).toBe(true)
    expect(result.current.points).toHaveLength(4)
    expect(result.current.points[0].cumulativeDPlus).toBe(0)
    expect(result.current.points[1].cumulativeDPlus).toBe(100)
    expect(result.current.points[2].cumulativeDPlus).toBe(100) // descent not counted
    expect(result.current.points[3].cumulativeDPlus).toBe(200)
    expect(result.current.totalDPlus).toBe(200)
  })

  it('computes slope correctly (% gradient)', () => {
    // 100m elevation gain over 1km = 10% slope
    const waypoints: MapWaypoint[] = [
      makeWaypoint(0, 0),
      makeWaypoint(1, 100),  // +100m over 1000m = 10%
      makeWaypoint(2, 50),   // -50m over 1000m = -5%
    ]
    const { result } = renderHook(() => useElevationProfile(waypoints, []))
    expect(result.current.points[0].slope).toBe(0)
    expect(result.current.points[1].slope).toBeCloseTo(10)
    expect(result.current.points[2].slope).toBeCloseTo(-5)
  })

  it('computes boundaries correctly for multi-segment adventure', () => {
    const waypoints: MapWaypoint[] = [
      makeWaypoint(0, 100),
      makeWaypoint(50, 200),
      makeWaypoint(100, 150),
    ]
    const segments: MapSegmentData[] = [
      makeSegment('s1', 'Seg 1', 0, 50),
      makeSegment('s2', 'Seg 2', 50, 50),
    ]
    const { result } = renderHook(() => useElevationProfile(waypoints, segments))
    expect(result.current.boundaries).toHaveLength(1)
    expect(result.current.boundaries[0].distKm).toBe(50)
    expect(result.current.boundaries[0].name).toBe('Seg 2')
  })

  it('returns hasElevationData=false when all ele are null', () => {
    const waypoints: MapWaypoint[] = [
      makeWaypoint(0, null),
      makeWaypoint(1, null),
    ]
    const { result } = renderHook(() => useElevationProfile(waypoints, []))
    expect(result.current.hasElevationData).toBe(false)
    expect(result.current.points).toHaveLength(0)
    expect(result.current.totalDPlus).toBe(0)
  })

  it('returns empty result for empty waypoints', () => {
    const { result } = renderHook(() => useElevationProfile([], []))
    expect(result.current.hasElevationData).toBe(false)
    expect(result.current.points).toHaveLength(0)
    expect(result.current.boundaries).toHaveLength(0)
    expect(result.current.totalDPlus).toBe(0)
  })

  it('filters out waypoints with undefined ele', () => {
    const waypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, distKm: 0, ele: undefined },
      makeWaypoint(1, 100),
      { lat: 0, lng: 0, distKm: 2, ele: undefined },
      makeWaypoint(3, 200),
    ]
    const { result } = renderHook(() => useElevationProfile(waypoints, []))
    expect(result.current.hasElevationData).toBe(true)
    expect(result.current.points).toHaveLength(2)
    expect(result.current.points[0].ele).toBe(100)
    expect(result.current.points[1].ele).toBe(200)
  })
})
