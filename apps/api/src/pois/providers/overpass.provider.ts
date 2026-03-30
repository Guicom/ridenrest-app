import { Injectable, Logger } from '@nestjs/common'

export interface OverpassNode {
  type: 'node' | 'way' | 'relation'
  id: number
  lat: number  // For node; for way/relation use center
  lon: number
  tags: Record<string, string>
  center?: { lat: number; lon: number }  // For way elements with "out center"
}

export interface OverpassResult {
  elements: OverpassNode[]
}

// Overpass QL tag filters mapped to PoiCategory
// Each category can have multiple OSM tag variants
const CATEGORY_FILTERS: Record<string, string[]> = {
  hotel:        ['"amenity"="hotel"', '"tourism"="hotel"', '"tourism"="motel"', '"tourism"="chalet"'],
  hostel:       ['"amenity"="hostel"', '"tourism"="hostel"'],
  guesthouse:   ['"tourism"="guest_house"'],
  camp_site:    ['"tourism"="camp_site"', '"tourism"="caravan_site"'],
  shelter:      ['"amenity"="shelter"', '"tourism"="alpine_hut"', '"tourism"="wilderness_hut"'],
  restaurant:   ['"amenity"="restaurant"'],
  supermarket:  ['"shop"="supermarket"'],
  convenience:  ['"shop"="convenience"'],
  bike_shop:    ['"shop"="bicycle"'],
  bike_repair:  ['"amenity"="bicycle_repair_station"'],
}

// Public Overpass instances — tried in order, rotate on 429/503/504
const OVERPASS_INSTANCES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
]

@Injectable()
export class OverpassProvider {
  private readonly logger = new Logger(OverpassProvider.name)
  private readonly TIMEOUT_S = 25

  async queryPois(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    categories: string[],
  ): Promise<OverpassNode[]> {
    const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`

    const filters = categories.flatMap((cat) => (CATEGORY_FILTERS[cat] ?? []))
    if (filters.length === 0) return []

    const nodeQueries = filters.map((f) => `node[${f}](${bboxStr});`)
    const wayQueries  = filters.map((f) => `way[${f}](${bboxStr});`)

    const query = `[out:json][timeout:${this.TIMEOUT_S}];
(
${nodeQueries.join('\n')}
${wayQueries.join('\n')}
);
out center;`

    this.logger.debug(`Overpass query bbox: ${bboxStr}, categories: ${categories.join(',')}`)

    // Strategy based on Overpass docs: server queues requests up to 15s before returning 429.
    // → On 429: wait 20s and retry SAME instance (queue will clear)
    // → On 504/503/timeout: switch to next instance (server truly down)
    for (let i = 0; i < OVERPASS_INSTANCES.length; i++) {
      const url = OVERPASS_INSTANCES[i]
      let attempts = 0
      const MAX_RETRIES_PER_INSTANCE = 2

      while (attempts <= MAX_RETRIES_PER_INSTANCE) {
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `data=${encodeURIComponent(query)}`,
            signal: AbortSignal.timeout(20_000), // > 15s server queue window
          })

          if (response.status === 429) {
            attempts++
            if (attempts > MAX_RETRIES_PER_INSTANCE) break
            this.logger.warn(`Overpass 429 on ${url} — server busy, waiting 20s (attempt ${attempts}/${MAX_RETRIES_PER_INSTANCE})`)
            await new Promise((resolve) => setTimeout(resolve, 20_000))
            continue
          }

          if (response.status === 403 || response.status === 503 || response.status === 504) {
            this.logger.warn(`Overpass ${response.status} on ${url} — switching instance`)
            break // Try next instance
          }

          if (!response.ok) {
            throw new Error(`Overpass API error: ${response.status} ${response.statusText}`)
          }

          const result = (await response.json()) as OverpassResult
          return result.elements
        } catch (err) {
          const msg = (err as Error).message
          if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('network')) {
            this.logger.warn(`Overpass timeout on ${url} — switching instance`)
            break // Try next instance
          }
          throw err // Non-transient error → propagate
        }
      }
    }

    throw new Error('All Overpass instances unavailable')
  }
}
