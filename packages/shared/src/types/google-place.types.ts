export interface OpeningPeriod {
  open:  { day: number; hour: number; minute: number }
  close: { day: number; hour: number; minute: number }
}

export interface GooglePlaceDetails {
  placeId: string
  displayName: string | null
  formattedAddress: string | null
  lat: number | null
  lng: number | null
  rating: number | null
  isOpenNow: boolean | null
  weekdayDescriptions: string[]   // [] si non disponible
  periods: OpeningPeriod[]        // [] si non disponible
  phone: string | null
  website: string | null
  types: string[]
}
