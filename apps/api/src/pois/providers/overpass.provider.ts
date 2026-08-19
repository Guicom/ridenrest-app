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

/**
 * Instances publiques, essayées dans l'ordre. Mesures du 2026-08-19 (requête « hébergements »
 * réelle, une bbox DE/CH et une bbox France) :
 *
 * | instance                | France          | DE/CH           |
 * |-------------------------|-----------------|-----------------|
 * | overpass-api.de         | 154 POI / 4,7 s | 15 POI / 1,0 s  |
 * | overpass.private.coffee | timeout 45 s    | 15 POI / 35,6 s |
 * | overpass.kumi.systems   | timeout         | timeout         |
 * | maps.mail.ru (VK)       | 154 POI / 14,9 s| HTTP 504        |
 * | overpass.osm.ch         | **0 POI** / 0,4s| 2 POI / 0,1 s   |
 *
 * D'où cette liste :
 * - `overpass.osm.ch` est RETIRÉE : le wiki OSM la classe dans « instances with data only for a
 *   specific region » (Suisse). Elle répond HTTP 200 avec zéro résultat hors de Suisse —
 *   indiscernable de « il n'y a pas de POI ici ». C'est une perte de données silencieuse.
 * - `kumi.systems` est REMPLACÉE par `private.coffee` : même opérateur, l'ancienne URL ne
 *   répond plus (« Previously known as overpass.kumi.systems »).
 * - `maps.mail.ru` gardée en DERNIER recours (décision Guillaume, 2026-08-19) : ~50 % d'échecs
 *   mesurés et ~10-14 s de plancher même sur une requête triviale (son 504 vient de son nginx
 *   frontal, pas d'Overpass) — mais un repli à moitié fiable vaut mieux que pas de repli, l'UI
 *   n'attendant plus (flux découplés, story 17.14). Infra VK : aucune donnée personnelle n'y
 *   transite, uniquement une bbox.
 */
export const OVERPASS_INSTANCES = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
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
  private readonly userAgent = process.env['OVERPASS_USER_AGENT'] ?? DEFAULT_USER_AGENT
  // 429 = request queued server-side; the queue clears within ~20s. Overridable for tests.
  // La politique d'usage d'overpass-api.de demande explicitement 30 s de pause après un 429.
  private readonly retryDelayMs = Number(process.env['OVERPASS_RETRY_DELAY_MS'] ?? 30_000)
  /** Timeout d'un appel isolé. Généreux : l'UI n'attend plus Overpass (flux découplé). */
  private readonly instanceTimeoutMs = Number(process.env['OVERPASS_INSTANCE_TIMEOUT_MS'] ?? 20_000)
  /**
   * Plafond de l'appel COMPLET, rotation et attentes 429 comprises. Sans lui, 2 instances ×
   * (20 s + 2 × 30 s d'attente 429) = plusieurs minutes de connexion tenue par recherche.
   * Il ne protège pas l'utilisateur (il n'attend plus) mais le serveur.
   */
  private readonly totalBudgetMs = Number(process.env['OVERPASS_TOTAL_BUDGET_MS'] ?? 45_000)

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

    const query = `[out:json][timeout:${Math.ceil(this.instanceTimeoutMs / 1000)}];
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
    const deadline = Date.now() + this.totalBudgetMs

    for (const url of OVERPASS_INSTANCES) {
      for (let attempt = 0; attempt <= MAX_RETRIES_PER_INSTANCE; attempt++) {
        if (Date.now() >= deadline) {
          this.logger.warn(`Overpass total budget (${this.totalBudgetMs}ms) exhausted — giving up`)
          throw new Error('All Overpass instances unavailable')
        }
        let response: Response
        try {
          response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': this.userAgent,
            },
            body: `data=${encodeURIComponent(query)}`,
            // Jamais au-delà de ce qu'il reste du budget global
            signal: AbortSignal.timeout(Math.max(1_000, Math.min(this.instanceTimeoutMs, deadline - Date.now()))),
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

        // 429 : la politique demande 30 s de pause. On ne la tient que si le budget le permet,
        // sinon on abandonne — dormir 30 s dans une requête HTTP n'a pas de sens.
        if (response.status === 429 && attempt < MAX_RETRIES_PER_INSTANCE
            && Date.now() + this.retryDelayMs < deadline) {
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
