export interface GooglePlaceDetails {
  placeId: string
  displayName: string | null
  formattedAddress: string | null
  lat: number | null
  lng: number | null
  rating: number | null
  isOpenNow: boolean | null
  phone: string | null
  website: string | null
  types: string[]
}
