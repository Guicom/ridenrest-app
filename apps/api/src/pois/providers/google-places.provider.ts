import { Injectable, Logger } from '@nestjs/common'

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
export const LAYER_GOOGLE_TYPES: Record<string, string[]> = {
  accommodations: ['lodging', 'campground'],
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

@Injectable()
export class GooglePlacesProvider {
  private readonly logger = new Logger(GooglePlacesProvider.name)
  private readonly BASE_URL = 'https://places.googleapis.com/v1/places:searchText'
  private readonly API_KEY = process.env['GOOGLE_PLACES_API_KEY']

  isConfigured(): boolean {
    return !!this.API_KEY
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

    const results = await Promise.allSettled(
      googleTypes.map((type) =>
        this.searchPlaceIds(bbox, type, type.replace(/_/g, ' ')),
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
