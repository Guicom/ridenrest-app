export type AdventureStatus = 'planning' | 'active' | 'completed'
export type ParseStatus = 'pending' | 'processing' | 'done' | 'error'

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
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  createdAt: string
  updatedAt: string
}
