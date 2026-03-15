import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { Poi, PoiCategory } from '@ridenrest/shared'
import { MAX_SEARCH_RANGE_KM, CORRIDOR_WIDTH_M } from '@ridenrest/shared'
import type { FindPoisDto } from './dto/find-pois.dto.js'

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

@Injectable()
export class PoisService {
  private readonly logger = new Logger(PoisService.name)

  constructor(
    private readonly poisRepository: PoisRepository,
    private readonly overpassProvider: OverpassProvider,
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

      // 7. Map to Poi[] response
      pois = nodes
        .filter((n) => activeCategories.includes(categoryMap[n.id] ?? ''))
        .map((n) => ({
          id: `overpass-${n.id}`,
          externalId: String(n.id),
          source: 'overpass' as const,
          category: (categoryMap[n.id] ?? 'hotel') as PoiCategory,
          name: n.tags.name ?? n.tags['name:en'] ?? 'Unknown',
          lat: n.center?.lat ?? n.lat,
          lng: n.center?.lon ?? n.lon,
          distFromTraceM: 0,
          distAlongRouteKm: 0,
        }))
      overpassSucceeded = true
    } catch (error) {
      this.logger.error('Overpass API failed, falling back to DB cache', error)
      // Fallback: return DB cache filtered by requested categories (may be stale)
      pois = await this.poisRepository.findCachedPois(segmentId, activeCategories)
    }

    // 8. Store in Redis only after a fresh Overpass fetch — never cache stale fallback data
    if (overpassSucceeded) {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(pois))
    }

    return pois
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
