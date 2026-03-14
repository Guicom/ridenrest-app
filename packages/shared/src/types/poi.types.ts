export type PoiCategory = 'hotel' | 'hostel' | 'camp_site' | 'shelter' | 'restaurant' | 'supermarket' | 'convenience' | 'bike_shop' | 'bike_repair'

export interface Poi {
  id: string
  externalId: string
  source: 'overpass' | 'amadeus'
  category: PoiCategory
  name: string
  lat: number
  lng: number
  distFromTraceM: number
  distAlongRouteKm: number
  bookingUrl?: string  // Deep link (Hotels.com / Booking.com parameterized)
  rawData?: Record<string, unknown>
}
