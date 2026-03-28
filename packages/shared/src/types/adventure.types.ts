export const DENSITY_ACCOMMODATION_CATEGORIES = ['hotel', 'camp_site', 'shelter', 'hostel', 'guesthouse'] as const
export type DensityAccommodationCategory = typeof DENSITY_ACCOMMODATION_CATEGORIES[number]

export type AdventureStatus = 'planning' | 'active' | 'completed'
export type ParseStatus = 'pending' | 'processing' | 'done' | 'error'
export type DensityStatus = 'idle' | 'pending' | 'processing' | 'success' | 'error'

export interface MapWaypoint {
  lat: number
  lng: number
  ele?: number | null
  distKm: number
}

export interface MapSegmentData {
  id: string
  name: string
  orderIndex: number
  cumulativeStartKm: number
  distanceKm: number
  parseStatus: ParseStatus
  waypoints: MapWaypoint[] | null  // null if not parsed yet
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
}

export interface AdventureMapResponse {
  adventureId: string
  adventureName: string
  totalDistanceKm: number
  totalElevationGainM: number | null
  segments: MapSegmentData[]
}

// API response shapes (camelCase — JSON fields)
export interface AdventureResponse {
  id: string
  userId: string
  name: string
  totalDistanceKm: number
  totalElevationGainM?: number | null
  status: AdventureStatus
  densityStatus: DensityStatus
  densityProgress: number  // 0–100
  createdAt: string  // ISO 8601
  updatedAt: string
}

export interface CoverageGapSummary {
  segmentId: string
  fromKm: number
  toKm: number
  severity: 'medium' | 'critical'
}

export interface DensityStatusResponse {
  densityStatus: DensityStatus
  densityProgress: number  // 0–100
  coverageGaps: CoverageGapSummary[]
  densityCategories: string[]  // empty array when no analysis run yet
}

export interface AdventureStageResponse {
  id: string
  adventureId: string
  name: string
  color: string              // hex
  orderIndex: number
  startKm: number
  endKm: number
  distanceKm: number
  // elevationGainM and etaMinutes absent until Story 11.3
  createdAt: string
  updatedAt: string
}

export interface AdventureSegmentResponse {
  id: string
  adventureId: string
  name: string
  orderIndex: number
  cumulativeStartKm: number
  distanceKm: number
  elevationGainM: number | null
  parseStatus: ParseStatus
  source: string | null  // null = manual upload, 'strava' = Strava import
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  createdAt: string
  updatedAt: string
}
