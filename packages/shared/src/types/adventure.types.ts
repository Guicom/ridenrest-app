export type AdventureStatus = 'planning' | 'active' | 'completed'
export type ParseStatus = 'pending' | 'processing' | 'done' | 'error'

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
  segments: MapSegmentData[]
}

// API response shapes (camelCase — JSON fields)
export interface AdventureResponse {
  id: string
  userId: string
  name: string
  totalDistanceKm: number
  status: AdventureStatus
  createdAt: string  // ISO 8601
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
