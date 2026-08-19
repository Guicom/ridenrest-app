import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider, SLEEPABLE_SHELTER_TYPES } from './providers/overpass.provider.js'
import { GooglePlacesProvider, mapGoogleTypesToCategory } from './providers/google-places.provider.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { Poi, GooglePlaceDetails } from '@ridenrest/shared'
import { MAX_SEARCH_RANGE_KM, CORRIDOR_WIDTH_M, POI_BBOX_CACHE_TTL, GOOGLE_PLACES_CACHE_TTL } from '@ridenrest/shared'
import type { FindPoisDto } from './dto/find-pois.dto.js'
import type { Redis } from 'ioredis'
import { isLikelySamePlace, POI_DEDUP_RADIUS_M } from './poi-dedup.js'
import { mapWithConcurrency } from '../common/utils/map-with-concurrency.js'

// Layer → PoiCategory mapping (mirrors frontend LAYER_CATEGORIES constant)
const CATEGORY_TO_OVERPASS_TAGS: Record<string, string[]> = {
  hotel:        ['hotel'],
  hostel:       ['hostel'],
  camp_site:    ['camp_site'],
  shelter:      ['shelter'],
  guesthouse:   ['guesthouse'],
  restaurant:   ['restaurant'],
  supermarket:  ['supermarket'],
  convenience:  ['convenience'],
  bike_shop:    ['bike_shop'],
  bike_repair:  ['bike_repair'],
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

/** Place Details en vol simultanément par calque. Borné : quotas Google + charge PostGIS. */
const GOOGLE_DETAILS_CONCURRENCY = 6

/**
 * Sources masquées à la lecture quand la « recherche étendue (Overpass) » est désactivée.
 *
 * Le toggle ne gouvernait que la COLLECTE : les POI `overpass` déjà en cache (TTL 30 j, contre
 * 7 j pour Google) restaient affichés, donc ON et OFF renvoyaient exactement le même jeu dès
 * qu'une recherche ON avait eu lieu sur la zone — l'option paraissait ignorée. On filtre donc
 * aussi à la lecture : OFF = uniquement les sources non-Overpass.
 */
const OVERPASS_SOURCES = ['overpass']

/** Sources « Google » au sens large (`amadeus` est un reliquat historique du schéma). */
const GOOGLE_SOURCES = ['google', 'amadeus']

/**
 * Quelles sources interroger et lesquelles masquer à la lecture, à partir du DTO.
 *
 * `source` permet au client de dissocier les deux flux d'une même recherche : les POI Google
 * s'affichent en ~200 ms (tièdes) pendant qu'Overpass, mesuré entre 1 et 31 s sur les instances
 * publiques, arrive quand il peut. Sans le paramètre, comportement historique (les deux dans
 * une seule réponse) — c'est encore ce que fait le mobile.
 */
function resolveSourcePlan(dto: { source?: string; overpassEnabled?: boolean }): {
  wantsGoogle: boolean
  wantsOverpass: boolean
  excludeSources: string[]
} {
  const wantsGoogle = dto.source !== 'overpass'
  // Le toggle reste maître : `source=overpass` avec l'option coupée ne doit rien interroger.
  const wantsOverpass = dto.source !== 'google' && Boolean(dto.overpassEnabled)
  return {
    wantsGoogle,
    wantsOverpass,
    excludeSources: [
      ...(wantsOverpass ? [] : OVERPASS_SOURCES),
      ...(wantsGoogle ? [] : GOOGLE_SOURCES),
    ],
  }
}

// Stripped POI format stored in Redis — no segment-specific distances (Option A)
type RawCacheablePoi = {
  externalId: string
  source: 'overpass' | 'amadeus' | 'google'
  name: string
  lat: number
  lng: number
  category: string
  rawData?: Record<string, unknown>
}

@Injectable()
export class PoisService {
  private readonly logger = new Logger(PoisService.name)

  constructor(
    private readonly poisRepository: PoisRepository,
    private readonly overpassProvider: OverpassProvider,
    private readonly googlePlacesProvider: GooglePlacesProvider,
    private readonly redisProvider: RedisProvider,
  ) {}

  async findPois(dto: FindPoisDto, userId: string): Promise<Poi[]> {
    // Live mode branch — radius-based search around interpolated point
    if (dto.targetKm !== undefined) {
      return this.findLiveModePois(dto, userId, dto.overpassEnabled ?? false)
    }

    const { segmentId, categories } = dto
    const fromKm = dto.fromKm!
    const toKm = dto.toKm!

    // Validate range (corridor mode only)
    if (toKm <= fromKm) {
      throw new BadRequestException('toKm must be greater than fromKm')
    }
    if (toKm - fromKm > MAX_SEARCH_RANGE_KM) {
      throw new BadRequestException(`Search range cannot exceed ${MAX_SEARCH_RANGE_KM} km`)
    }

    const activeCategories = categories ?? Object.keys(CATEGORY_TO_OVERPASS_TAGS)
    const sortedCategories = [...activeCategories].sort().join(',')

    // 1. Get segment waypoints for bbox computation (also verifies ownership)
    const waypoints = await this.poisRepository.getSegmentWaypoints(segmentId, userId)
    if (!waypoints || waypoints.length < 2) {
      return []  // Segment not parsed yet
    }

    // 2. Extract waypoints in [fromKm, toKm] range
    const rangeWaypoints = waypoints.filter(
      (wp) => wp.distKm >= fromKm && wp.distKm <= toKm,
    )
    if (rangeWaypoints.length < 2) return []

    // 3. Compute bbox with buffer (CORRIDOR_WIDTH_M / 111_000 degrees ≈ 0.0045°)
    const bufferDeg = CORRIDOR_WIDTH_M / 111_000
    const minLat = Math.min(...rangeWaypoints.map((wp) => wp.lat)) - bufferDeg
    const maxLat = Math.max(...rangeWaypoints.map((wp) => wp.lat)) + bufferDeg
    const minLng = Math.min(...rangeWaypoints.map((wp) => wp.lng)) - bufferDeg
    const maxLng = Math.max(...rangeWaypoints.map((wp) => wp.lng)) + bufferDeg

    const bbox = { minLat, maxLat, minLng, maxLng }
    const redis = this.redisProvider.getClient()

    const { wantsGoogle, wantsOverpass, excludeSources } = resolveSourcePlan(dto)

    // 4. Overpass (si demandé) — best effort, il ne fait que COMPLÉTER Google Places
    let overpassSucceeded = false
    const cacheKey = `pois:bbox:${round3(minLat)}:${round3(minLng)}:${round3(maxLat)}:${round3(maxLng)}:${sortedCategories}`

    if (wantsOverpass) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        this.logger.debug(`Cache HIT: ${cacheKey}`)
        // Option A: re-insert raw POIs for this segment + recompute PostGIS distances
        const rawPois = JSON.parse(cached) as RawCacheablePoi[]
        const expiresAt = new Date(Date.now() + POI_BBOX_CACHE_TTL * 1000)
        await this.poisRepository.insertRawPoisForSegment(segmentId, rawPois, expiresAt)
        await this.poisRepository.updatePoiDistances(segmentId)
      } else {
        this.logger.debug(`Cache MISS: ${cacheKey}`)
        try {
          const nodes = await this.overpassProvider.queryPois(bbox, activeCategories)

          // Build node→category lookup
          const categoryMap: Record<number, string> = {}
          for (const node of nodes) {
            categoryMap[node.id] = resolveCategory(node.tags)
          }

          const expiresAt = new Date(Date.now() + POI_BBOX_CACHE_TTL * 1000)
          await this.poisRepository.insertOverpassPois(segmentId, nodes, categoryMap, expiresAt)
          await this.poisRepository.updatePoiDistances(segmentId)
          overpassSucceeded = true
        } catch (error) {
          this.logger.error('Overpass API failed — Google Places results are still returned', error)
        }
      }
    }

    // 5. Google Places (source primaire) — indépendant du sort d'Overpass. Le garder dans le
    // `try` ci-dessus signifiait qu'un échec Overpass annulait aussi la source primaire.
    if (wantsGoogle) {
      await this.prefetchGooglePoisOncePerBbox(bbox, segmentId, redis)
    }

    // 6. Lecture unique, filtrée sur les sources demandées
    const pois = await this.poisRepository.findCachedPois(segmentId, activeCategories, fromKm, toKm, excludeSources)

    // 7. Redis seulement après un fetch Overpass frais — ne jamais cacher un fallback périmé.
    // Option A: strip segment-specific distances — geo-scoped key is cross-user, distances are not
    if (overpassSucceeded) {
      const rawPois: RawCacheablePoi[] = pois.map(({ externalId, source, name, lat, lng, category, rawData }) => ({
        externalId, source, name, lat, lng, category, rawData,
      }))
      await redis.setex(cacheKey, POI_BBOX_CACHE_TTL, JSON.stringify(rawPois))
    }

    return pois
  }

  async getPoiGoogleDetails(externalId: string, segmentId: string): Promise<GooglePlaceDetails | null> {
    if (!this.googlePlacesProvider.isConfigured()) return null

    const redis = this.redisProvider.getClient()

    // 1. Look up google_place_id for this POI (may have been pre-cached by story 4.3)
    const placeIdKey = `google_place_id:${externalId}`
    let placeId = await redis.get(placeIdKey)

    if (!placeId) {
      // 2a. If externalId is already a Google place_id (source=google POIs), use it directly
      if (externalId.startsWith('ChIJ') || externalId.startsWith('Eh')) {
        placeId = externalId
      } else {
        // 2b. OSM/Overpass POIs — do targeted Text Search (IDs Only) by name + location
        const poi = await this.poisRepository.findByExternalId(externalId, segmentId)
        if (!poi) return null

        placeId = await this.googlePlacesProvider.findPlaceId(poi.name, poi.lat, poi.lng)
        this.logger.debug(`[getPoiGoogleDetails] findPlaceId("${poi.name}", ${poi.lat}, ${poi.lng}) → ${placeId}`)
        if (!placeId) return null
      }

      await redis.setex(placeIdKey, GOOGLE_PLACES_CACHE_TTL, placeId)
    }

    // 3. Check if Place Details already cached
    const detailsKey = `google_place_details:${placeId}`
    const cachedDetails = await redis.get(detailsKey)
    if (cachedDetails) {
      return JSON.parse(cachedDetails) as GooglePlaceDetails
    }

    // 4. Fetch Place Details Essentials (10k/month free)
    let details: GooglePlaceDetails
    try {
      details = await this.googlePlacesProvider.getPlaceDetails(placeId)
    } catch (err) {
      this.logger.warn(`[getPoiGoogleDetails] getPlaceDetails failed for ${placeId}: ${String(err)}`)
      return null
    }

    this.logger.debug(`[getPoiGoogleDetails] details for ${placeId}: formattedAddress=${details.formattedAddress}, displayName=${details.displayName}`)

    // 5. Cache for 7 days
    await redis.setex(detailsKey, GOOGLE_PLACES_CACHE_TTL, JSON.stringify(details))

    return details
  }

  private async findLiveModePois(dto: FindPoisDto, userId: string, overpassEnabled: boolean): Promise<Poi[]> {
    const { segmentId, targetKm, radiusKm, categories } = dto
    const radiusM = (radiusKm ?? 3) * 1000
    const activeCategories = categories ?? Object.keys(CATEGORY_TO_OVERPASS_TAGS)
    const sortedCategories = [...activeCategories].sort().join(',')

    // 1. Get target point (interpolated from waypoints — no GPS sent, also verifies ownership)
    const targetPoint = await this.poisRepository.getWaypointAtKm(segmentId, targetKm!, userId)
    if (!targetPoint) return []

    // 2. Compute bbox around target point
    const radDeg = (radiusKm ?? 3) / 111.0
    const bbox = {
      minLat: targetPoint.lat - radDeg, maxLat: targetPoint.lat + radDeg,
      minLng: targetPoint.lng - radDeg, maxLng: targetPoint.lng + radDeg,
    }
    const redis = this.redisProvider.getClient()

    const { wantsGoogle, wantsOverpass, excludeSources } = resolveSourcePlan({ source: dto.source, overpassEnabled })

    // 3. Geographic cache key — cross-user sharing via bbox (rounded to 3 decimal places ≈ 111m)
    const cacheKey = `pois:live:bbox:${round3(bbox.minLat)}:${round3(bbox.minLng)}:${round3(bbox.maxLat)}:${round3(bbox.maxLng)}:${sortedCategories}`

    let overpassSucceeded = false
    if (wantsOverpass) {
      const cached = await redis.get(cacheKey)
      if (cached) {
        this.logger.debug(`Live cache HIT: ${cacheKey}`)
        // Option A: re-insert raw POIs for this segment + recompute PostGIS distances
        const rawPois = JSON.parse(cached) as RawCacheablePoi[]
        const expiresAt = new Date(Date.now() + POI_BBOX_CACHE_TTL * 1000)
        await this.poisRepository.insertRawPoisForSegment(segmentId, rawPois, expiresAt)
        await this.poisRepository.updatePoiDistances(segmentId)
      } else {
        this.logger.debug(`Live cache MISS: ${cacheKey}`)
        try {
          const nodes = await this.overpassProvider.queryPois(bbox, activeCategories)
          const categoryMap: Record<number, string> = {}
          for (const node of nodes) categoryMap[node.id] = resolveCategory(node.tags)
          const expiresAt = new Date(Date.now() + POI_BBOX_CACHE_TTL * 1000)
          await this.poisRepository.insertOverpassPois(segmentId, nodes, categoryMap, expiresAt)
          await this.poisRepository.updatePoiDistances(segmentId)
          overpassSucceeded = true
        } catch (err) {
          this.logger.warn(`Overpass failed in live mode: ${String(err)}`)
          // Fall through — Google Places below still runs, and a previous fetch may be cached
        }
      }
    }

    // Google Places (primary source) — independent from Overpass's fate
    if (wantsGoogle) {
      await this.prefetchGooglePoisOncePerBbox(bbox, segmentId, redis)
    }

    const pois = await this.poisRepository.findPoisNearPoint(
      segmentId, targetPoint.lat, targetPoint.lng, radiusM, activeCategories, excludeSources,
    )

    // Only cache after a fresh Overpass fetch — never cache stale fallback data
    // Option A: strip segment-specific distances before caching cross-user geo key
    if (overpassSucceeded) {
      const rawPois: RawCacheablePoi[] = pois.map(({ externalId, source, name, lat, lng, category, rawData }) => ({
        externalId, source, name, lat, lng, category, rawData,
      }))
      await redis.setex(cacheKey, POI_BBOX_CACHE_TTL, JSON.stringify(rawPois))
    }
    return pois
  }

  /**
   * Google Places prefetch, run at most once per (segment, bbox) — coverage-based gate.
   *
   * Replaces the old `if (dbCached.length > 0) return dbCached` short-circuit, which asked
   * "do I have at least one POI to show?" instead of "did I already search this area?".
   * Consequence in prod: a first search on [86,89] km inserted POIs projecting at 89-93 km
   * (the bbox is a rectangle, the trace curves back into it), and every later search whose
   * window contained one of those rows — [80,95], [83,93]… — returned that partial set for
   * 7 days without ever calling Google again. Same GPX, different results per environment,
   * decided by whichever window happened to be searched first.
   *
   * The marker is scoped per segment: POI rows are inserted per segment_id, so a cross-user
   * bbox-only key would let user B's segment inherit "already fetched" and stay empty.
   * It is NOT written when a layer query failed, so a partial fetch retries instead of
   * locking the area for the whole TTL.
   */
  private async prefetchGooglePoisOncePerBbox(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    segmentId: string,
    redis: Redis,
  ): Promise<void> {
    if (!this.googlePlacesProvider.isConfigured()) return

    const key = `pois:google:seg:${segmentId}:bbox:${round3(bbox.minLat)}:${round3(bbox.minLng)}:${round3(bbox.maxLat)}:${round3(bbox.maxLng)}`
    if (await redis.get(key)) {
      this.logger.debug(`[Google prefetch] bbox already fetched for this segment — skip (${key})`)
      return
    }

    try {
      const { complete } = await this.prefetchAndInsertGooglePois(bbox, segmentId, redis)
      if (complete) {
        await redis.setex(key, GOOGLE_PLACES_CACHE_TTL, '1')
      } else {
        this.logger.warn('[Google prefetch] incomplete (a layer query failed) — bbox left unmarked for retry')
      }
    } catch (err) {
      this.logger.warn(`[Google prefetch] failed, bbox left unmarked for retry: ${String(err)}`)
    }
  }

  private async prefetchAndInsertGooglePois(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    segmentId: string,
    redis: Redis,
  ): Promise<{ complete: boolean; inserted: number }> {
    if (!this.googlePlacesProvider.isConfigured()) return { complete: false, inserted: 0 }

    const LAYERS = ['accommodations', 'restaurants', 'supplies', 'bike'] as const
    const expiresAt = new Date(Date.now() + GOOGLE_PLACES_CACHE_TTL * 1000)
    let newPoiCount = 0

    this.logger.log(`[Google prefetch] bbox: ${JSON.stringify(bbox)}, segment: ${segmentId}`)

    const layerResults = await Promise.allSettled(
      LAYERS.map(async (layer) => {
        const placeIds = await this.googlePlacesProvider.searchLayerPlaceIds(bbox, layer)
        this.logger.log(`[Google prefetch] layer=${layer} → ${placeIds.length} place_ids: ${placeIds.join(', ')}`)

        // Place Details are resolved with bounded concurrency: sequentially, a cold bbox meant
        // 50-90 chained HTTP round-trips (10-25s) — the real reason the first search of an area
        // felt slow, Overpass toggle or not. Order no longer matters for correctness since dedup
        // is cross-source only.
        const candidates = await mapWithConcurrency(placeIds, GOOGLE_DETAILS_CONCURRENCY, async (placeId) => {
          // Skip if already inserted in DB for this segment
          const alreadyInDb = await this.poisRepository.googlePoiExistsInSegment(placeId, segmentId)
          if (alreadyInDb) {
            this.logger.debug(`[Google prefetch] ${placeId} already in DB for segment — skip`)
            return null
          }

          // Le prefetch ne pose qu'un pin : nom, position, types suffisent → SKU Essentials.
          // Clé Redis distincte : écrire une charge Essentials sous `google_place_details:` (lue
          // par la fiche POI) priverait la fiche de note/horaires/téléphone.
          const basicKey = `google_place_basic:${placeId}`
          const proKey = `google_place_details:${placeId}`
          let details: GooglePlaceDetails
          // Une charge Pro déjà en cache fait l'affaire — elle contient les champs Essentials.
          const cachedDetails = (await redis.get(proKey)) ?? (await redis.get(basicKey))
          if (cachedDetails) {
            details = JSON.parse(cachedDetails) as GooglePlaceDetails
            this.logger.debug(`[Google prefetch] ${placeId} details from Redis cache`)
          } else {
            try {
              details = await this.googlePlacesProvider.getPlaceDetails(placeId, 'essentials')
              this.logger.debug(`[Google prefetch] ${placeId} details fetched: ${details.displayName} at ${details.lat},${details.lng}`)
            } catch (err) {
              this.logger.warn(`[Google prefetch] Place Details failed for ${placeId}: ${String(err)}`)
              return null
            }
          }

          if (details.lat === null || details.lng === null) {
            this.logger.warn(`[Google prefetch] ${placeId} has no location — skip`)
            return null
          }

          // Dedup: skip only if an OSM POI with a MATCHING NAME already describes this place.
          // Proximity alone used to suppress distinct establishments — and, because the 4 layers
          // run concurrently, it also deduped Google POIs against each other (order-dependent).
          const neighbours = await this.poisRepository.findNearbyPoisFromOtherSources(
            details.lat, details.lng, POI_DEDUP_RADIUS_M, segmentId, 'google',
          )
          const duplicate = neighbours.find((n) => isLikelySamePlace(n.name, details.displayName ?? ''))

          // Cache Essentials sous sa propre clé — la fiche POI ira chercher le Pro à l'ouverture
          await redis.setex(basicKey, GOOGLE_PLACES_CACHE_TTL, JSON.stringify(details))
          await redis.setex(`google_place_id:${placeId}`, GOOGLE_PLACES_CACHE_TTL, placeId)

          if (duplicate) {
            this.logger.log(`[Google prefetch] ${placeId} (${details.displayName}) deduped — ${duplicate.source} POI "${duplicate.name}" within ${POI_DEDUP_RADIUS_M}m`)
            return null
          }

          return {
            placeId,
            name: details.displayName ?? 'Unknown',
            lat: details.lat,
            lng: details.lng,
            category: mapGoogleTypesToCategory(details.types, layer),
            rawData: { types: details.types } as Record<string, unknown>,
          }
        })

        // Single batched insert per layer instead of one INSERT per POI
        const toInsert = candidates.filter((c): c is NonNullable<typeof c> => c !== null)
        if (toInsert.length > 0) {
          await this.poisRepository.insertGooglePois(segmentId, toInsert, expiresAt)
          this.logger.log(`[Google prefetch] layer=${layer} → inserted ${toInsert.length} POIs: ${toInsert.map((p) => p.name).join(', ')}`)
          newPoiCount += toInsert.length
        }
      }),
    )

    if (newPoiCount > 0) {
      // Update PostGIS distances for newly inserted Google POIs
      await this.poisRepository.updatePoiDistances(segmentId)
      this.logger.debug(`Inserted ${newPoiCount} Google POIs for segment ${segmentId}`)
    }

    const failedLayers = layerResults.filter((r) => r.status === 'rejected').length
    if (failedLayers > 0) {
      this.logger.warn(`[Google prefetch] ${failedLayers}/${LAYERS.length} layer(s) failed for segment ${segmentId}`)
    }
    return { complete: failedLayers === 0, inserted: newPoiCount }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveCategory(tags: Record<string, string>): string {
  // amenity tags
  if (tags.amenity === 'hotel')                    return 'hotel'
  if (tags.amenity === 'hostel')                   return 'hostel'
  if (tags.amenity === 'restaurant')               return 'restaurant'
  if (tags.amenity === 'bicycle_repair_station')   return 'bike_repair'
  // tourism tags — hotel variants
  if (tags.tourism === 'hotel')                    return 'hotel'
  if (tags.tourism === 'motel')                    return 'hotel'
  if (tags.tourism === 'chalet')                   return 'hotel'
  // tourism tags — hostel/gîte variants
  if (tags.tourism === 'hostel')                   return 'hostel'
  if (tags.tourism === 'guest_house')              return 'guesthouse'
  // tourism tags — camping variants
  if (tags.tourism === 'camp_site')                return 'camp_site'
  if (tags.tourism === 'caravan_site')             return 'camp_site'
  // shelter variants — `amenity=shelter` seul ne suffit PAS : il couvre surtout les abribus
  // (voir SLEEPABLE_SHELTER_TYPES). Doit rester aligné sur CATEGORY_FILTERS.shelter.
  if (tags.tourism === 'alpine_hut')               return 'shelter'
  if (tags.tourism === 'wilderness_hut')           return 'shelter'
  if (tags.amenity === 'shelter' && SLEEPABLE_SHELTER_TYPES.includes(tags['shelter_type'] ?? '')) return 'shelter'
  // shop tags
  if (tags.shop === 'supermarket')                 return 'supermarket'
  if (tags.shop === 'convenience')                 return 'convenience'
  if (tags.shop === 'bicycle')                     return 'bike_shop'
  return 'hotel'  // Fallback — shouldn't happen with strict filter
}
