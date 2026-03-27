import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { GooglePlacesProvider, mapGoogleTypesToCategory } from './providers/google-places.provider.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { Poi, GooglePlaceDetails } from '@ridenrest/shared'
import { MAX_SEARCH_RANGE_KM, CORRIDOR_WIDTH_M, OVERPASS_CACHE_TTL, GOOGLE_PLACES_CACHE_TTL } from '@ridenrest/shared'
import type { FindPoisDto } from './dto/find-pois.dto.js'
import type { Redis } from 'ioredis'

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

// Stripped POI format stored in Redis — no segment-specific distances (Option A)
type RawCacheablePoi = {
  externalId: string
  source: 'overpass' | 'amadeus' | 'google'
  name: string
  lat: number
  lng: number
  category: string
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
      return this.findLiveModePois(dto, userId)
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

    // 4. Geographic cache key — cross-user sharing via bbox (rounded to 3 decimal places ≈ 111m)
    const cacheKey = `pois:bbox:${round3(minLat)}:${round3(minLng)}:${round3(maxLat)}:${round3(maxLng)}:${sortedCategories}`

    // 5. Redis cache check
    const redis = this.redisProvider.getClient()
    const cached = await redis.get(cacheKey)
    if (cached) {
      this.logger.debug(`Cache HIT: ${cacheKey}`)
      // Option A: re-insert raw POIs for this segment + recompute PostGIS distances
      const rawPois = JSON.parse(cached) as RawCacheablePoi[]
      const expiresAt = new Date(Date.now() + OVERPASS_CACHE_TTL * 1000)
      await this.poisRepository.insertRawPoisForSegment(segmentId, rawPois, expiresAt)
      await this.poisRepository.updatePoiDistances(segmentId)
      return this.poisRepository.findCachedPois(segmentId, activeCategories, fromKm, toKm)
    }

    this.logger.debug(`Cache MISS: ${cacheKey}`)

    // 6. Query Overpass API
    let pois: Poi[] = []
    let overpassSucceeded = false
    try {
      const nodes = await this.overpassProvider.queryPois(
        { minLat, maxLat, minLng, maxLng },
        activeCategories,
      )

      // Build node→category lookup
      const categoryMap: Record<number, string> = {}
      for (const node of nodes) {
        categoryMap[node.id] = resolveCategory(node.tags)
      }

      // 6b. Insert into accommodations_cache
      const expiresAt = new Date(Date.now() + OVERPASS_CACHE_TTL * 1000)
      await this.poisRepository.insertOverpassPois(segmentId, nodes, categoryMap, expiresAt)

      // 7. Update Overpass POI distances with PostGIS
      await this.poisRepository.updatePoiDistances(segmentId)

      // 8. Google Places: awaited so Google POIs are included in the first response
      await this.prefetchAndInsertGooglePois(
        { minLat, maxLat, minLng, maxLng },
        segmentId,
        redis,
      ).catch((err) => this.logger.warn('Google Places prefetch failed silently', err))

      // 9. Read back from DB — includes both Overpass + Google POIs with PostGIS distances
      pois = await this.poisRepository.findCachedPois(segmentId, activeCategories, fromKm, toKm)
      overpassSucceeded = true
    } catch (error) {
      this.logger.error('Overpass API failed, falling back to DB cache', error)
      // Fallback: return DB cache filtered by requested categories (may be stale)
      pois = await this.poisRepository.findCachedPois(segmentId, activeCategories, fromKm, toKm)
    }

    // 10. Store in Redis only after a fresh Overpass fetch — never cache stale fallback data
    // Option A: strip segment-specific distances — geo-scoped key is cross-user, distances are not
    if (overpassSucceeded) {
      const rawPois: RawCacheablePoi[] = pois.map(({ externalId, source, name, lat, lng, category }) => ({
        externalId, source, name, lat, lng, category,
      }))
      await redis.setex(cacheKey, OVERPASS_CACHE_TTL, JSON.stringify(rawPois))
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
      // 2. Not pre-cached — do targeted Text Search (IDs Only) by name + location
      const poi = await this.poisRepository.findByExternalId(externalId, segmentId)
      if (!poi) return null

      placeId = await this.googlePlacesProvider.findPlaceId(poi.name, poi.lat, poi.lng)
      if (!placeId) return null

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

    // 5. Cache for 7 days
    await redis.setex(detailsKey, GOOGLE_PLACES_CACHE_TTL, JSON.stringify(details))

    return details
  }

  private async findLiveModePois(dto: FindPoisDto, userId: string): Promise<Poi[]> {
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

    // 3. Geographic cache key — cross-user sharing via bbox (rounded to 3 decimal places ≈ 111m)
    const cacheKey = `pois:live:bbox:${round3(bbox.minLat)}:${round3(bbox.minLng)}:${round3(bbox.maxLat)}:${round3(bbox.maxLng)}:${sortedCategories}`

    const redis = this.redisProvider.getClient()
    const cached = await redis.get(cacheKey)
    if (cached) {
      this.logger.debug(`Live cache HIT: ${cacheKey}`)
      // Option A: re-insert raw POIs for this segment + recompute PostGIS distances
      const rawPois = JSON.parse(cached) as RawCacheablePoi[]
      const expiresAt = new Date(Date.now() + OVERPASS_CACHE_TTL * 1000)
      await this.poisRepository.insertRawPoisForSegment(segmentId, rawPois, expiresAt)
      await this.poisRepository.updatePoiDistances(segmentId)
      return this.poisRepository.findPoisNearPoint(segmentId, targetPoint.lat, targetPoint.lng, radiusM, activeCategories)
    }

    this.logger.debug(`Live cache MISS: ${cacheKey}`)

    let overpassSucceeded = false
    try {
      const nodes = await this.overpassProvider.queryPois(bbox, activeCategories)
      const categoryMap: Record<number, string> = {}
      for (const node of nodes) categoryMap[node.id] = resolveCategory(node.tags)
      const expiresAt = new Date(Date.now() + OVERPASS_CACHE_TTL * 1000)
      await this.poisRepository.insertOverpassPois(segmentId, nodes, categoryMap, expiresAt)
      await this.poisRepository.updatePoiDistances(segmentId)
      overpassSucceeded = true
      // Google Places: enrich with additional POIs — only when Overpass succeeds (consistent with corridor mode)
      await this.prefetchAndInsertGooglePois(bbox, segmentId, redis)
        .catch((err) => this.logger.warn('Google Places prefetch failed in live mode', err))
    } catch (err) {
      this.logger.warn(`Overpass failed in live mode: ${String(err)}`)
      // Fall through — may still have cached POIs from a previous fetch
    }

    const pois = await this.poisRepository.findPoisNearPoint(
      segmentId, targetPoint.lat, targetPoint.lng, radiusM, activeCategories,
    )

    // Only cache after a fresh Overpass fetch — never cache stale fallback data
    // Option A: strip segment-specific distances before caching cross-user geo key
    if (overpassSucceeded) {
      const rawPois: RawCacheablePoi[] = pois.map(({ externalId, source, name, lat, lng, category }) => ({
        externalId, source, name, lat, lng, category,
      }))
      await redis.setex(cacheKey, OVERPASS_CACHE_TTL, JSON.stringify(rawPois))
    }
    return pois
  }

  private async prefetchAndInsertGooglePois(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    segmentId: string,
    redis: Redis,
  ): Promise<void> {
    if (!this.googlePlacesProvider.isConfigured()) return

    const LAYERS = ['accommodations', 'restaurants', 'supplies', 'bike'] as const
    const expiresAt = new Date(Date.now() + GOOGLE_PLACES_CACHE_TTL * 1000)
    let newPoiCount = 0

    this.logger.log(`[Google prefetch] bbox: ${JSON.stringify(bbox)}, segment: ${segmentId}`)

    await Promise.allSettled(
      LAYERS.map(async (layer) => {
        const placeIds = await this.googlePlacesProvider.searchLayerPlaceIds(bbox, layer)
        this.logger.log(`[Google prefetch] layer=${layer} → ${placeIds.length} place_ids: ${placeIds.join(', ')}`)

        for (const placeId of placeIds) {
          // Skip if already inserted in DB for this segment
          const alreadyInDb = await this.poisRepository.googlePoiExistsInSegment(placeId, segmentId)
          if (alreadyInDb) {
            this.logger.debug(`[Google prefetch] ${placeId} already in DB for segment — skip`)
            continue
          }

          // Fetch Place Details — use Redis cache to avoid redundant API calls
          const detailsKey = `google_place_details:${placeId}`
          let details: GooglePlaceDetails
          const cachedDetails = await redis.get(detailsKey)
          if (cachedDetails) {
            details = JSON.parse(cachedDetails) as GooglePlaceDetails
            this.logger.debug(`[Google prefetch] ${placeId} details from Redis cache`)
          } else {
            // Fetch from Google API (uses 10k/month free quota)
            try {
              details = await this.googlePlacesProvider.getPlaceDetails(placeId)
              this.logger.debug(`[Google prefetch] ${placeId} details fetched: ${details.displayName} at ${details.lat},${details.lng}`)
            } catch (err) {
              this.logger.warn(`[Google prefetch] Place Details failed for ${placeId}: ${String(err)}`)
              continue
            }
          }

          if (details.lat === null || details.lng === null) {
            this.logger.warn(`[Google prefetch] ${placeId} has no location — skip`)
            continue
          }

          // Dedup: skip if an OSM POI already exists within 100m
          const hasDuplicate = await this.poisRepository.hasNearbyPoi(
            details.lat, details.lng, 100, segmentId,
          )

          // Always cache Place Details in Redis (enrichment for any matching pin, OSM or Google)
          await redis.setex(detailsKey, GOOGLE_PLACES_CACHE_TTL, JSON.stringify(details))
          await redis.setex(`google_place_id:${placeId}`, GOOGLE_PLACES_CACHE_TTL, placeId)

          if (hasDuplicate) {
            this.logger.log(`[Google prefetch] ${placeId} (${details.displayName}) deduped — OSM POI within 100m`)
            continue
          }

          // Insert new Google-sourced POI into DB
          const category = mapGoogleTypesToCategory(details.types, layer)
          await this.poisRepository.insertGooglePois(segmentId, [{
            placeId,
            name: details.displayName ?? 'Unknown',
            lat: details.lat,
            lng: details.lng,
            category,
            rawData: { types: details.types },
          }], expiresAt)

          this.logger.log(`[Google prefetch] inserted ${details.displayName} (${placeId}) as ${category}`)
          newPoiCount++
        }
      }),
    )

    if (newPoiCount > 0) {
      // Update PostGIS distances for newly inserted Google POIs
      await this.poisRepository.updatePoiDistances(segmentId)
      this.logger.debug(`Inserted ${newPoiCount} Google POIs for segment ${segmentId}`)
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveCategory(tags: Record<string, string>): string {
  // amenity tags
  if (tags.amenity === 'hotel')                    return 'hotel'
  if (tags.amenity === 'hostel')                   return 'hostel'
  if (tags.amenity === 'shelter')                  return 'shelter'
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
  // tourism tags — shelter variants
  if (tags.tourism === 'alpine_hut')               return 'shelter'
  if (tags.tourism === 'wilderness_hut')           return 'shelter'
  // shop tags
  if (tags.shop === 'supermarket')                 return 'supermarket'
  if (tags.shop === 'convenience')                 return 'convenience'
  if (tags.shop === 'bicycle')                     return 'bike_shop'
  return 'hotel'  // Fallback — shouldn't happen with strict filter
}
