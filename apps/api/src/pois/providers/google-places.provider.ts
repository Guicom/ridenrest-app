import { Injectable, Logger } from '@nestjs/common'
import type { GooglePlaceDetails } from '@ridenrest/shared'

// Google place types mapped to our MapLayer categories
// Using includedType for accurate category filtering
export const GOOGLE_PLACE_TYPES: Record<string, string[]> = {
  hotel:        ['lodging'],
  hostel:       ['lodging'],
  camp_site:    ['campground', 'rv_park'],
  shelter:      ['lodging'],
  restaurant:   ['restaurant', 'food'],
  supermarket:  ['grocery_or_supermarket', 'supermarket'],
  convenience:  ['convenience_store'],
  bike_shop:    ['bicycle_store'],
  bike_repair:  ['bicycle_store'],
}

// Deduplicated Google types per MapLayer (for batching queries by layer)
// Google Places API (New) types — each becomes a separate Text Search query (IDs Only)
export const LAYER_GOOGLE_TYPES: Record<string, string[]> = {
  accommodations: ['lodging', 'campground', 'bed_and_breakfast', 'hostel', 'guest_house', 'camping_cabin', 'private_guest_room'],
  restaurants:    ['restaurant'],
  supplies:       ['grocery_or_supermarket', 'convenience_store'],
  bike:           ['bicycle_store'],
}

interface GoogleTextSearchRequest {
  textQuery: string
  includedType?: string
  locationRestriction: {
    rectangle: {
      low:  { latitude: number; longitude: number }
      high: { latitude: number; longitude: number }
    }
  }
  maxResultCount: number
  languageCode: string
}

interface GoogleTextSearchResponse {
  places?: Array<{ id: string; name?: string }>
}

// Map Google place types → our PoiCategory
export function mapGoogleTypesToCategory(types: string[], layer: string): string {
  if (layer === 'restaurants') return 'restaurant'
  if (layer === 'bike') return 'bike_shop'
  if (layer === 'supplies') {
    if (types.some((t) => ['grocery_or_supermarket', 'supermarket'].includes(t))) return 'supermarket'
    return 'convenience'
  }
  // accommodations layer
  if (types.some((t) => ['campground', 'rv_park', 'camping_cabin'].includes(t))) return 'camp_site'
  if (types.some((t) => ['hostel'].includes(t))) return 'hostel'
  if (types.some((t) => ['guest_house', 'bed_and_breakfast', 'private_guest_room', 'farmstay'].includes(t))) return 'guesthouse'
  return 'hotel'
}

@Injectable()
export class GooglePlacesProvider {
  private readonly logger = new Logger(GooglePlacesProvider.name)
  private readonly BASE_URL = 'https://places.googleapis.com/v1/places:searchText'
  private readonly API_KEY = process.env['GOOGLE_PLACES_API_KEY']

  isConfigured(): boolean {
    return !!this.API_KEY
  }

  async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
    if (!this.API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured')

    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=fr`
    const fieldMask = [
      'id',
      'displayName',
      'formattedAddress',
      'location',
      'rating',
      'regularOpeningHours.openNow',
      'regularOpeningHours.weekdayDescriptions',
      'regularOpeningHours.periods',
      'internationalPhoneNumber',
      'websiteUri',
      'types',
    ].join(',')

    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': this.API_KEY,
        'X-Goog-FieldMask': fieldMask,  // Pro tier (regularOpeningHours, phone, rating, website) — ~$5/1000 req
      },
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) {
      throw new Error(`Place Details error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      displayName?: { text?: string }
      formattedAddress?: string
      location?: { latitude?: number; longitude?: number }
      rating?: number
      regularOpeningHours?: {
        openNow?: boolean
        weekdayDescriptions?: string[]
        periods?: Array<{
          open:  { day: number; hour: number; minute: number }
          close: { day: number; hour: number; minute: number }
        }>
      }
      internationalPhoneNumber?: string
      websiteUri?: string
      types?: string[]
    }
    return {
      placeId,
      displayName: data.displayName?.text ?? null,
      formattedAddress: data.formattedAddress ?? null,
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
      rating: data.rating ?? null,
      isOpenNow: data.regularOpeningHours?.openNow ?? null,
      weekdayDescriptions: data.regularOpeningHours?.weekdayDescriptions ?? [],
      periods: data.regularOpeningHours?.periods ?? [],
      phone: data.internationalPhoneNumber ?? null,
      website: data.websiteUri ?? null,
      types: data.types ?? [],
    }
  }

  /** Text Search (IDs Only) to find Google place_id for a known POI by name + location. */
  async findPlaceId(
    name: string,
    lat: number,
    lng: number,
  ): Promise<string | null> {
    if (!this.API_KEY) return null

    const body = {
      textQuery: name,
      locationBias: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 150.0,  // 150m — tight radius for specific POI match
        },
      },
      maxResultCount: 1,
      languageCode: 'fr',
    }

    const response = await fetch(this.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.API_KEY,
        'X-Goog-FieldMask': 'places.id',  // IDs Only — unlimited, $0
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) return null

    const result = await response.json() as { places?: Array<{ id: string }> }
    return result.places?.[0]?.id ?? null
  }

  /**
   * Fetch Google place_ids for a given bounding box and Google place type.
   * Uses X-Goog-FieldMask: places.id → IDs Only tier → Unlimited, no cost.
   */
  async searchPlaceIds(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    googleType: string,
    textQuery: string,
  ): Promise<string[]> {
    if (!this.API_KEY) {
      this.logger.warn('GOOGLE_PLACES_API_KEY not set — skipping Google Places search')
      return []
    }

    const body: GoogleTextSearchRequest = {
      textQuery,
      includedType: googleType,
      locationRestriction: {
        rectangle: {
          low:  { latitude: bbox.minLat, longitude: bbox.minLng },
          high: { latitude: bbox.maxLat, longitude: bbox.maxLng },
        },
      },
      maxResultCount: 20,
      languageCode: 'fr',
    }

    const response = await fetch(this.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.API_KEY,
        'X-Goog-FieldMask': 'places.id',  // IDs Only — unlimited, zero cost
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
    }

    const result = (await response.json()) as GoogleTextSearchResponse
    return (result.places ?? []).map((p) => p.id).filter(Boolean)
  }

  /**
   * Run Text Search (IDs Only) for all types in a MapLayer category.
   * Returns deduplicated place_id array.
   */
  async searchLayerPlaceIds(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    layer: string,
  ): Promise<string[]> {
    const googleTypes = LAYER_GOOGLE_TYPES[layer] ?? []
    if (googleTypes.length === 0) return []
    if (!this.API_KEY) return []

    this.logger.debug(`Google Places searchLayer bbox: ${bbox.minLat.toFixed(4)},${bbox.minLng.toFixed(4)} → ${bbox.maxLat.toFixed(4)},${bbox.maxLng.toFixed(4)}, layer: ${layer}`)

    // Use a broad textQuery per layer so includedType does the actual filtering.
    // Using the type name as textQuery (e.g. "private guest room") causes Google
    // to score by text relevance, missing places whose name doesn't match the type.
    const LAYER_TEXT_QUERY: Record<string, string> = {
      accommodations: 'accommodation',
      restaurants:    'restaurant',
      supplies:       'grocery store',
      bike:           'bicycle bike shop',
    }
    const textQuery = LAYER_TEXT_QUERY[layer] ?? layer

    const results = await Promise.allSettled(
      googleTypes.map((type) =>
        this.searchPlaceIds(bbox, type, textQuery),
      ),
    )

    const allIds = new Set<string>()
    for (const result of results) {
      if (result.status === 'fulfilled') {
        result.value.forEach((id) => allIds.add(id))
      } else {
        this.logger.warn(`Google Places type search failed: ${result.reason}`)
      }
    }
    return [...allIds]
  }
}
