import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { GooglePlacesProvider } from './providers/google-places.provider.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { Poi } from '@ridenrest/shared'
import { MAX_SEARCH_RANGE_KM, CORRIDOR_WIDTH_M } from '@ridenrest/shared'
import type { FindPoisDto } from './dto/find-pois.dto.js'
import type { Redis } from 'ioredis'

// Layer → PoiCategory mapping (mirrors frontend LAYER_CATEGORIES constant)
const CATEGORY_TO_OVERPASS_TAGS: Record<string, string[]> = {
  hotel:        ['hotel'],
  hostel:       ['hostel'],
  camp_site:    ['camp_site'],
  shelter:      ['shelter'],
  restaurant:   ['restaurant'],
  supermarket:  ['supermarket'],
  convenience:  ['convenience'],
  bike_shop:    ['bike_shop'],
  bike_repair:  ['bike_repair'],
}

const CACHE_TTL_SECONDS = 60 * 60 * 24  // 24h
const GOOGLE_CACHE_TTL = 60 * 60 * 24 * 7  // 7 days — place_ids are stable

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
    const { segmentId, fromKm, toKm, categories } = dto

    // Validate range
    if (toKm <= fromKm) {
      throw new BadRequestException('toKm must be greater than fromKm')
    }
    if (toKm - fromKm > MAX_SEARCH_RANGE_KM) {
      throw new BadRequestException(`Search range cannot exceed ${MAX_SEARCH_RANGE_KM} km`)
    }

    const activeCategories = categories ?? Object.keys(CATEGORY_TO_OVERPASS_TAGS)
    const cacheKey = `pois:${segmentId}:${fromKm}:${toKm}:${activeCategories.sort().join(',')}`

    // 1. Redis cache check
    const redis = this.redisProvider.getClient()
    const cached = await redis.get(cacheKey)
    if (cached) {
      this.logger.debug(`Cache HIT: ${cacheKey}`)
      return JSON.parse(cached) as Poi[]
    }

    this.logger.debug(`Cache MISS: ${cacheKey}`)

    // 2. Get segment waypoints for bbox computation (also verifies ownership)
    const waypoints = await this.poisRepository.getSegmentWaypoints(segmentId, userId)
    if (!waypoints || waypoints.length < 2) {
      return []  // Segment not parsed yet
    }

    // 3. Extract waypoints in [fromKm, toKm] range
    const rangeWaypoints = waypoints.filter(
      (wp) => wp.distKm >= fromKm && wp.distKm <= toKm,
    )
    if (rangeWaypoints.length < 2) return []

    // 4. Compute bbox with buffer (CORRIDOR_WIDTH_M / 111_000 degrees ≈ 0.0045°)
    const bufferDeg = CORRIDOR_WIDTH_M / 111_000
    const minLat = Math.min(...rangeWaypoints.map((wp) => wp.lat)) - bufferDeg
    const maxLat = Math.max(...rangeWaypoints.map((wp) => wp.lat)) + bufferDeg
    const minLng = Math.min(...rangeWaypoints.map((wp) => wp.lng)) - bufferDeg
    const maxLng = Math.max(...rangeWaypoints.map((wp) => wp.lng)) + bufferDeg

    // 5. Query Overpass API
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

      // 6. Insert into accommodations_cache
      const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000)
      await this.poisRepository.insertOverpassPois(segmentId, nodes, categoryMap, expiresAt)

      // 7. Update distances with PostGIS after insert
      await this.poisRepository.updatePoiDistances(segmentId)

      // 8. Google Places: fire-and-forget background job — never awaited for main response
      void this.prefetchGooglePlaceIds(
        { minLat, maxLat, minLng, maxLng },
        segmentId, fromKm, toKm,
        redis,
      ).catch((err) => this.logger.warn('Google Places prefetch failed silently', err))

      // 9. Read back from DB with actual PostGIS-computed distances
      // (mapping directly from Overpass nodes would return distFromTraceM/distAlongRouteKm=0)
      pois = await this.poisRepository.findCachedPois(segmentId, activeCategories, fromKm, toKm)
      overpassSucceeded = true
    } catch (error) {
      this.logger.error('Overpass API failed, falling back to DB cache', error)
      // Fallback: return DB cache filtered by requested categories (may be stale)
      pois = await this.poisRepository.findCachedPois(segmentId, activeCategories, fromKm, toKm)
    }

    // 10. Store in Redis only after a fresh Overpass fetch — never cache stale fallback data
    if (overpassSucceeded) {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(pois))
    }

    return pois
  }

  async getGooglePlaceIds(
    segmentId: string,
    fromKm: number,
    toKm: number,
    layer: string,
  ): Promise<string[]> {
    const redis = this.redisProvider.getClient()
    const cacheKey = `google_place_ids:${segmentId}:${fromKm}:${toKm}:${layer}`
    const cached = await redis.get(cacheKey)
    return cached ? (JSON.parse(cached) as string[]) : []
  }

  private async prefetchGooglePlaceIds(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    segmentId: string,
    fromKm: number,
    toKm: number,
    redis: Redis,
  ): Promise<void> {
    if (!this.googlePlacesProvider.isConfigured()) return

    const LAYERS = ['accommodations', 'restaurants', 'supplies', 'bike'] as const

    await Promise.allSettled(
      LAYERS.map(async (layer) => {
        const cacheKey = `google_place_ids:${segmentId}:${fromKm}:${toKm}:${layer}`

        // Skip if already cached
        const existing = await redis.exists(cacheKey)
        if (existing) return

        const placeIds = await this.googlePlacesProvider.searchLayerPlaceIds(bbox, layer)
        if (placeIds.length > 0) {
          await redis.setex(cacheKey, GOOGLE_CACHE_TTL, JSON.stringify(placeIds))
          this.logger.debug(`Cached ${placeIds.length} Google place_ids for ${layer} in corridor`)
        }
      }),
    )
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveCategory(tags: Record<string, string>): string {
  if (tags.amenity === 'hotel')     return 'hotel'
  if (tags.amenity === 'hostel')    return 'hostel'
  if (tags.amenity === 'shelter')   return 'shelter'
  if (tags.amenity === 'restaurant') return 'restaurant'
  if (tags.amenity === 'bicycle_repair_station') return 'bike_repair'
  if (tags.tourism === 'camp_site') return 'camp_site'
  if (tags.shop === 'supermarket')  return 'supermarket'
  if (tags.shop === 'convenience')  return 'convenience'
  if (tags.shop === 'bicycle')      return 'bike_shop'
  return 'hotel'  // Fallback — shouldn't happen with strict filter
}
