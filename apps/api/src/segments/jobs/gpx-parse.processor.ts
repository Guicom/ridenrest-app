import { Processor, WorkerHost } from '@nestjs/bullmq'
import type { Job } from 'bullmq'
import * as fs from 'node:fs/promises'
import { parseGpx, computeCumulativeDistances, computeElevationGain, computeBoundingBox } from '@ridenrest/gpx'
import { SegmentsRepository } from '../segments.repository.js'
import { SegmentsService } from '../segments.service.js'
import { db, adventureSegments } from '@ridenrest/database'
import { eq } from 'drizzle-orm'

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
    let adventureId: string | null = null

    try {
      // 1. Get adventure ID for recompute (needed even on error)
      const [segRow] = await db
        .select({ adventureId: adventureSegments.adventureId })
        .from(adventureSegments)
        .where(eq(adventureSegments.id, segmentId))

      if (!segRow) {
        // Segment deleted before job ran — silently complete
        return
      }
      adventureId = segRow.adventureId

      // 2. Read GPX file
      const gpxBuffer = await fs.readFile(storageUrl)
      const gpxXml = gpxBuffer.toString('utf-8')

      // 3. Parse track points
      const rawPoints = parseGpx(gpxXml)
      if (rawPoints.length === 0) {
        throw new Error('GPX file contains no track points')
      }

      // 4. Compute waypoints with cumulative distances
      const kmWaypoints = computeCumulativeDistances(rawPoints)
      const distanceKm = kmWaypoints[kmWaypoints.length - 1]?.km ?? 0

      // Map to DB storage format: { dist_km, lat, lng, ele? }
      const waypoints = kmWaypoints.map((wp) => ({
        dist_km: wp.km,
        lat: wp.lat,
        lng: wp.lng,
        ...(wp.elevM !== undefined ? { ele: wp.elevM } : {}),
      }))

      // 5. Compute elevation gain
      const elevationGainM = computeElevationGain(rawPoints)

      // 6. Compute bounding box
      const boundingBox = computeBoundingBox(rawPoints)

      // 7. Build WKT LINESTRING for PostGIS (longitude first, then latitude — EPSG:4326)
      const linestring = `LINESTRING(${rawPoints.map((p) => `${p.lng} ${p.lat}`).join(', ')})`

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
      // Do NOT re-throw — job marked as failed by BullMQ after maxAttempts
    }
  }
}
