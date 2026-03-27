import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { computeBoundingBox } from '@ridenrest/gpx'
import { DensityRepository } from '../density.repository.js'
import { OverpassProvider } from '../../pois/providers/overpass.provider.js'
import { GooglePlacesProvider } from '../../pois/providers/google-places.provider.js'
import { RedisProvider } from '../../common/providers/redis.provider.js'

interface AnalyzeDensityJob {
  adventureId: string
  segmentIds: string[]
  categories: string[]
}

interface DbWaypoint {
  dist_km: number
  lat: number
  lng: number
  ele?: number
}

interface Troncon {
  fromKm: number
  toKm: number
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number }
}

const TRONCON_SIZE_KM = 10
const OVERPASS_RATE_LIMIT_MS = 1100 // ~1 req/s — Overpass fair-use policy

function computeTroncons(waypoints: DbWaypoint[]): Troncon[] {
  if (waypoints.length === 0) return []
  const totalKm = waypoints[waypoints.length - 1]?.dist_km ?? 0
  const troncons: Troncon[] = []

  for (let fromKm = 0; fromKm < totalKm; fromKm += TRONCON_SIZE_KM) {
    const toKm = Math.min(fromKm + TRONCON_SIZE_KM, totalKm)
    const slice = waypoints.filter((wp) => wp.dist_km >= fromKm && wp.dist_km <= toKm)
    if (slice.length === 0) continue

    const bbox = computeBoundingBox(slice, 0) // No extra buffer — exact tronçon bbox
    troncons.push({ fromKm, toKm, bbox })
  }

  return troncons
}

@Processor('density-analysis')
export class DensityAnalyzeProcessor extends WorkerHost {
  private readonly logger = new Logger(DensityAnalyzeProcessor.name)

  constructor(
    private readonly densityRepo: DensityRepository,
    private readonly overpassProvider: OverpassProvider,
    private readonly googlePlacesProvider: GooglePlacesProvider,
    private readonly redisProvider: RedisProvider,
  ) {
    super()
    this.logger.log('DensityAnalyzeProcessor initialized')
  }

  async process(job: Job<AnalyzeDensityJob>): Promise<void> {
    this.logger.log(`process() called — job.id=${job.id} adventureId=${job.data.adventureId}`)
    const { adventureId, segmentIds, categories } = job.data

    try {
      await this.densityRepo.setDensityStatus(adventureId, 'processing')

      const segments = await this.densityRepo.findSegmentsForAnalysis(segmentIds)
      const gapsToInsert: Array<{ segmentId: string; fromKm: number; toKm: number; severity: 'medium' | 'critical' }> = []

      // Pre-compute all tronçons to know total count for progress tracking
      const allTroncons = segments.flatMap((seg) =>
        seg.waypoints && seg.waypoints.length > 0
          ? computeTroncons(seg.waypoints).map((t) => ({ ...t, segmentId: seg.id }))
          : [],
      )
      const totalTroncons = allTroncons.length
      let processed = 0

      for (const troncon of allTroncons) {
        const count = await this.getTronconAccommodationCount(troncon.segmentId, troncon, categories)

        if (count === 0) {
          gapsToInsert.push({ segmentId: troncon.segmentId, fromKm: troncon.fromKm, toKm: troncon.toKm, severity: 'critical' })
        } else if (count === 1) {
          gapsToInsert.push({ segmentId: troncon.segmentId, fromKm: troncon.fromKm, toKm: troncon.toKm, severity: 'medium' })
        }
        // count >= 2 → no gap (green zone)

        processed++
        const progress = totalTroncons > 0 ? Math.round((processed / totalTroncons) * 100) : 100
        await this.densityRepo.setDensityProgress(adventureId, progress)
      }

      await this.densityRepo.insertGaps(gapsToInsert)
      await this.densityRepo.setDensityStatus(adventureId, 'success')
      this.logger.log(`Analysis complete — adventureId=${adventureId} gaps=${gapsToInsert.length} troncons=${totalTroncons}`)
    } catch (err) {
      this.logger.error(`[DensityAnalyzeProcessor] Failed for adventure ${adventureId}:`, err)
      await this.densityRepo.setDensityStatus(adventureId, 'error')
      throw err // CRITICAL: re-throw so BullMQ can retry
    }
  }

  private async getTronconAccommodationCount(segmentId: string, troncon: Troncon, categories: string[]): Promise<number> {
    const sortedCategories = [...categories].sort().join(',')
    const cacheKey = `density:troncon:${segmentId}:${troncon.fromKm}:${troncon.toKm}:${sortedCategories}`
    const redis = this.redisProvider.getClient()

    const cached = await redis.get(cacheKey)
    if (cached !== null) return parseInt(cached, 10)

    // Rate-limit: wait before each Overpass call (fair-use ~1 req/s)
    await new Promise((resolve) => setTimeout(resolve, OVERPASS_RATE_LIMIT_MS))

    // Query both sources in parallel — take max count to avoid false gaps
    const [overpassNodes, googleIds] = await Promise.allSettled([
      this.overpassProvider.queryPois(troncon.bbox, categories),
      this.googlePlacesProvider.searchLayerPlaceIds(troncon.bbox, 'accommodations'),
    ])

    const overpassCount = overpassNodes.status === 'fulfilled' ? overpassNodes.value.length : 0
    const googleCount = googleIds.status === 'fulfilled' ? googleIds.value.length : 0
    const count = Math.max(overpassCount, googleCount)

    await redis.set(cacheKey, String(count))
    // permanent — OSM data is stable, admin cache invalidation (story 10.4) provides purge lever
    return count
  }
}
