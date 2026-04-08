export interface OpeningPeriod {
  open:  { day: number; hour: number; minute: number }
  close: { day: number; hour: number; minute: number }
}

export interface GooglePlaceDetails {
  placeId: string
  displayName: string | null
  formattedAddress: string | null
  /** City/town/village extracted from addressComponents (locality type). */
  locality: string | null
  /** Postal code extracted from addressComponents (postal_code type). */
  postalCode: string | null
  /** Region/province extracted from addressComponents (administrative_area_level_1 type). */
  adminArea: string | null
  /** Country extracted from addressComponents (country type). */
  country: string | null
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
