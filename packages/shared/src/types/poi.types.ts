import type { MapLayer } from './map.types'

export type { MapLayer }

export type PoiCategory = 'hotel' | 'hostel' | 'camp_site' | 'shelter' | 'guesthouse' | 'restaurant' | 'cafe_bar' | 'gas_station' | 'supermarket' | 'convenience' | 'bike_shop' | 'bike_repair'

export interface Poi {
  id: string
  externalId: string
  source: 'overpass' | 'amadeus' | 'google'
  category: PoiCategory
  name: string
  lat: number
  lng: number
  distFromTraceM: number
  distAlongRouteKm: number
  distFromTargetM?: number  // Only present in live mode responses
  bookingUrl?: string  // Deep link (Hotels.com / Booking.com parameterized)
  rawData?: Record<string, unknown>
}

export interface PoiSearchResponse {
  pois: Poi[]
}

// Maps each UI MapLayer toggle to its PoiCategory values
export const LAYER_CATEGORIES: Record<MapLayer, PoiCategory[]> = {
  accommodations: ['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'],
  restaurants:    ['restaurant', 'cafe_bar', 'gas_station'],
  supplies:       ['supermarket', 'convenience'],
  bike:           ['bike_shop', 'bike_repair'],
} as const

// Reverse lookup: PoiCategory → MapLayer (for pin grouping on map)
export const CATEGORY_TO_LAYER: Record<PoiCategory, MapLayer> = {
  hotel:        'accommodations',
  hostel:       'accommodations',
  camp_site:    'accommodations',
  shelter:      'accommodations',
  guesthouse:   'accommodations',
  restaurant:   'restaurants',
  cafe_bar:     'restaurants',
  gas_station:  'restaurants',
  supermarket:  'supplies',
  convenience:  'supplies',
  bike_shop:    'bike',
  bike_repair:  'bike',
} as const
