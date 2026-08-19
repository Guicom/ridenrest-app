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

/**
 * `amenity=shelter` couvre en OSM bien plus que « abri où dormir » : mesuré sur un segment
 * suisse/allemand, **238 des 291 shelters remontés étaient des abribus**
 * (`shelter_type=public_transport`, 237 sans nom), plus 12 abris de pique-nique et quelques
 * gazebos. L'utilisateur voyait « Refuge / Abri (189) » sans presque aucun abri exploitable.
 *
 * On exige donc un `shelter_type` explicitement utile pour la nuit. Les `amenity=shelter`
 * **sans** `shelter_type` sont exclus : dans l'échantillon, 26 des 32 étaient sans nom (des
 * abribus non tagués). Les vrais refuges de montagne passent par `tourism=alpine_hut` /
 * `wilderness_hut`, qui ne dépendent pas de ce tag.
 */
export const SLEEPABLE_SHELTER_TYPES = ['basic_hut', 'weather_shelter', 'lean_to', 'rock_shelter']

/**
 * Overpass QL tag filters mapped to PoiCategory.
 *
 * Each category holds several OSM tag variants; **each variant is a list of predicates ANDed
 * together** (rendered as `node["a"="b"]["c"~"d"](bbox);`). One predicate = the common case.
 */
const CATEGORY_FILTERS: Record<string, string[][]> = {
  hotel:        [['"amenity"="hotel"'], ['"tourism"="hotel"'], ['"tourism"="motel"'], ['"tourism"="chalet"']],
  hostel:       [['"amenity"="hostel"'], ['"tourism"="hostel"']],
  guesthouse:   [['"tourism"="guest_house"']],
  camp_site:    [['"tourism"="camp_site"'], ['"tourism"="caravan_site"']],
  shelter:      [
    ['"amenity"="shelter"', `"shelter_type"~"^(${SLEEPABLE_SHELTER_TYPES.join('|')})$"`],
    ['"tourism"="alpine_hut"'],
    ['"tourism"="wilderness_hut"'],
  ],
  restaurant:   [['"amenity"="restaurant"']],
  supermarket:  [['"shop"="supermarket"']],
  convenience:  [['"shop"="convenience"']],
  bike_shop:    [['"shop"="bicycle"']],
  bike_repair:  [['"amenity"="bicycle_repair_station"']],
}

// Public Overpass instances — tried in order, rotate on any non-200 status
const OVERPASS_INSTANCES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
]

/**
 * MANDATORY per Overpass fair-use policy: identify the client.
 *
 * Node's global `fetch` (undici) sends NO User-Agent header. Without one:
 *   - overpass-api.de       → HTTP 406 Not Acceptable
 *   - overpass.kumi.systems → HTTP 429 "Please include a meaningful User-Agent string"
 * i.e. Overpass was silently unreachable from the API (regression 2026-03-29 → 2026-08-19).
 * Override via OVERPASS_USER_AGENT (e.g. to add a contact address).
 */
const DEFAULT_USER_AGENT = "Ride'n'Rest/1.0 (bikepacking trip planner; +https://ridenrest.app)"

@Injectable()
export class OverpassProvider {
  private readonly logger = new Logger(OverpassProvider.name)
  private readonly TIMEOUT_S = 25
  private readonly userAgent = process.env['OVERPASS_USER_AGENT'] ?? DEFAULT_USER_AGENT
  // 429 = request queued server-side; the queue clears within ~20s. Overridable for tests.
  private readonly retryDelayMs = Number(process.env['OVERPASS_RETRY_DELAY_MS'] ?? 20_000)

  async queryPois(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    categories: string[],
  ): Promise<OverpassNode[]> {
    const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`

    const filters = categories.flatMap((cat) => (CATEGORY_FILTERS[cat] ?? []))
    if (filters.length === 0) return []

    // Each variant is a predicate list ANDed together: ["a"="b", "c"~"d"] → ["a"="b"]["c"~"d"]
    const tagSelectors = filters.map((predicates) => `[${predicates.join('][')}]`)
    const nodeQueries = tagSelectors.map((sel) => `node${sel}(${bboxStr});`)
    const wayQueries  = tagSelectors.map((sel) => `way${sel}(${bboxStr});`)

    const query = `[out:json][timeout:${this.TIMEOUT_S}];
(
${nodeQueries.join('\n')}
${wayQueries.join('\n')}
);
out center;`

    this.logger.debug(`Overpass query bbox: ${bboxStr}, categories: ${categories.join(',')}`)

    // Strategy based on Overpass docs: server queues requests up to 15s before returning 429.
    // → On 429: wait 20s and retry the SAME instance (queue will clear)
    // → On ANY other non-200 status (403/406/500/503/504…) or network failure: next instance
    // NEVER propagate a per-instance failure: every instance must get its chance before we
    // give up, otherwise a single misbehaving instance disables Overpass entirely.
    const MAX_RETRIES_PER_INSTANCE = 2

    for (const url of OVERPASS_INSTANCES) {
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_INSTANCE; attempt++) {
        let response: Response
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': this.userAgent,
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: AbortSignal.timeout(20_000), // > 15s server queue window
          })
        } catch (err) {
          const { name, message } = err as Error
          this.logger.warn(`Overpass unreachable on ${url} (${name}: ${message}) — switching instance`)
          break // Network error / timeout / abort → try next instance
        }

        if (response.ok) {
          try {
            const result = (await response.json()) as OverpassResult
            return result.elements ?? []
          } catch (err) {
            this.logger.warn(`Overpass returned an unparseable body on ${url} (${(err as Error).message}) — switching instance`)
            break
          }
        }

        if (response.status === 429 && attempt < MAX_RETRIES_PER_INSTANCE) {
          this.logger.warn(`Overpass 429 on ${url} — server busy, waiting ${this.retryDelayMs}ms (attempt ${attempt + 1}/${MAX_RETRIES_PER_INSTANCE})`)
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs))
          continue
        }

        this.logger.warn(`Overpass ${response.status} ${response.statusText} on ${url} — switching instance`)
        break
      }
    }

    throw new Error('All Overpass instances unavailable')
  }
}
