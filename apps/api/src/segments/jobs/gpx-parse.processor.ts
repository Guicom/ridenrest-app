import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import * as fs from 'node:fs/promises'
import {
  parseGpx,
  computeCumulativeDistances,
  computeElevationGain,
  computeBoundingBox,
  rdpSimplify,
} from '@ridenrest/gpx'
import { MAX_GPX_POINTS, RDP_EPSILON } from '@ridenrest/shared'
import { SegmentsRepository } from '../segments.repository.js'
import { SegmentsService } from '../segments.service.js'

interface ParseSegmentJob {
  segmentId: string
  storageUrl: string
}

@Processor('gpx-processing')
export class GpxParseProcessor extends WorkerHost {
  constructor(
    private readonly segmentsRepo: SegmentsRepository,
    private readonly segmentsService: SegmentsService,
  ) {
    super()
  }

  async process(job: Job<ParseSegmentJob>): Promise<void> {
    const { segmentId, storageUrl } = job.data

    // 1. Verify segment still exists and get its adventureId
    const adventureId = await this.segmentsRepo.findAdventureIdBySegmentId(segmentId)
    if (!adventureId) {
      // Segment deleted before job ran — silently complete
      return
    }

    try {
      // 2. Mark as processing so UI shows "Analyse en cours..."
      await this.segmentsRepo.setProcessingStatus(segmentId)

      // 3. Read GPX file
      const gpxBuffer = await fs.readFile(storageUrl)
      const gpxXml = gpxBuffer.toString('utf-8')

      // 4. Parse track points
      const rawPoints = parseGpx(gpxXml)
      if (rawPoints.length === 0) {
        throw new Error('GPX file contains no track points')
      }

      // 5. Compute waypoints (full resolution for distance/elevation accuracy)
      const kmWaypoints = computeCumulativeDistances(rawPoints)
      const distanceKm = kmWaypoints[kmWaypoints.length - 1]?.km ?? 0

      // Map to DB storage format: { dist_km, lat, lng, ele? }
      const waypoints = kmWaypoints.map((wp) => ({
        dist_km: wp.km,
        lat: wp.lat,
        lng: wp.lng,
        ...(wp.elevM !== undefined ? { ele: wp.elevM } : {}),
      }))

      // 6. Compute elevation gain and bounding box
      const elevationGainM = computeElevationGain(rawPoints)
      const boundingBox = computeBoundingBox(rawPoints)

      // 7. Build WKT LINESTRING — apply RDP simplification if needed to keep geometry lean
      const geometryPoints =
        rawPoints.length > MAX_GPX_POINTS ? rdpSimplify(rawPoints, RDP_EPSILON) : rawPoints
      const linestring = `LINESTRING(${geometryPoints.map((p) => `${p.lng} ${p.lat}`).join(', ')})`

      // 8. Update segment in DB
      await this.segmentsRepo.updateAfterParse(segmentId, {
        geomWkt: linestring,
        waypoints,
        distanceKm,
        elevationGainM: elevationGainM > 0 ? elevationGainM : null,
        boundingBox,
        parseStatus: 'done',
      })

      // 9. Recompute cumulative distances now that we have real distanceKm
      await this.segmentsService.recomputeCumulativeDistances(adventureId)
    } catch (err) {
      console.error(`[GpxParseProcessor] Failed to parse segment ${segmentId}:`, err)
      await this.segmentsRepo.updateParseError(segmentId)
      // Re-throw so BullMQ can retry the job (auto-retry up to max attempts)
      throw err
    }
  }
}
