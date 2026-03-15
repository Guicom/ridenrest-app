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
const CATEGORY_FILTERS: Record<string, string[]> = {
  hotel:        ['"amenity"="hotel"'],
  hostel:       ['"amenity"="hostel"'],
  camp_site:    ['"tourism"="camp_site"'],
  shelter:      ['"amenity"="shelter"'],
  restaurant:   ['"amenity"="restaurant"'],
  supermarket:  ['"shop"="supermarket"'],
  convenience:  ['"shop"="convenience"'],
  bike_shop:    ['"shop"="bicycle"'],
  bike_repair:  ['"amenity"="bicycle_repair_station"'],
}

@Injectable()
export class OverpassProvider {
  private readonly logger = new Logger(OverpassProvider.name)
  private readonly OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
  private readonly TIMEOUT_S = 25

  async queryPois(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    categories: string[],
  ): Promise<OverpassNode[]> {
    const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`

    const filters = categories
      .flatMap((cat) => (CATEGORY_FILTERS[cat] ?? []))

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

    const response = await fetch(this.OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(30_000),
    })

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`)
    }

    const result = (await response.json()) as OverpassResult
    return result.elements
  }
}
