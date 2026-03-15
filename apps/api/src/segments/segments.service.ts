import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { SegmentsRepository } from './segments.repository.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import type { AdventureSegmentResponse } from '@ridenrest/shared'
import { MAX_GPX_FILE_SIZE_BYTES } from '@ridenrest/shared'
import type { AdventureSegment } from '@ridenrest/database'

const GPX_STORAGE_PATH = process.env.GPX_STORAGE_PATH ?? '/data/gpx'

@Injectable()
export class SegmentsService {
  constructor(
    private readonly segmentsRepo: SegmentsRepository,
    private readonly adventuresService: AdventuresService,
    @InjectQueue('gpx-processing') private readonly gpxQueue: Queue,
  ) {}

  async createSegment(
    adventureId: string,
    userId: string,
    file: Express.Multer.File,
    name?: string,
  ): Promise<AdventureSegmentResponse> {
    // Verify adventure ownership
    await this.adventuresService.verifyOwnership(adventureId, userId)

    // Validate file size (belt-and-suspenders — client also validates)
    if (file.size > MAX_GPX_FILE_SIZE_BYTES) {
      throw new BadRequestException('Fichier trop volumineux (max 10 MB)')
    }

    // Determine order index (append at end)
    const count = await this.segmentsRepo.countByAdventureId(adventureId)
    const orderIndex = count // 0-based

    // Generate segment ID before writing file (used as filename)
    const segmentId = crypto.randomUUID()
    const storageUrl = path.join(GPX_STORAGE_PATH, `${segmentId}.gpx`)

    // Derive name from filename if not provided
    const segmentName = name?.trim() || file.originalname.replace(/\.gpx$/i, '')

    // Write file to Fly.io volume
    try {
      await fs.mkdir(GPX_STORAGE_PATH, { recursive: true })
      await fs.writeFile(storageUrl, file.buffer)
    } catch {
      throw new InternalServerErrorException('Failed to save GPX file')
    }

    // Create DB record
    const segment = await this.segmentsRepo.create({
      id: segmentId,
      adventureId,
      name: segmentName,
      orderIndex,
      cumulativeStartKm: 0,
      parseStatus: 'pending',
      storageUrl,
    })

    // Recompute cumulative distances (all 0 until parse completes)
    await this.recomputeCumulativeDistances(adventureId)

    // Enqueue BullMQ parse job
    await this.gpxQueue.add('parse-segment', { segmentId, storageUrl })

    return this.toResponse(segment)
  }

  async listSegments(adventureId: string, userId: string): Promise<AdventureSegmentResponse[]> {
    await this.adventuresService.verifyOwnership(adventureId, userId)
    const rows = await this.segmentsRepo.findAllByAdventureId(adventureId)
    return rows.map((s) => this.toResponse(s))
  }

  async recomputeCumulativeDistances(adventureId: string): Promise<void> {
    const segments = await this.segmentsRepo.findAllByAdventureId(adventureId)
    let cumulative = 0
    const updates = segments.map((seg) => {
      const result = { id: seg.id, cumulativeStartKm: cumulative }
      cumulative += seg.distanceKm
      return result
    })
    await this.segmentsRepo.updateCumulativeDistances(updates)
    await this.adventuresService.updateTotalDistance(adventureId, cumulative)
  }

  private toResponse(s: AdventureSegment): AdventureSegmentResponse {
    return {
      id: s.id,
      adventureId: s.adventureId,
      name: s.name,
      orderIndex: s.orderIndex,
      cumulativeStartKm: s.cumulativeStartKm,
      distanceKm: s.distanceKm,
      elevationGainM: s.elevationGainM ?? null,
      parseStatus: s.parseStatus,
      boundingBox: (s.boundingBox as AdventureSegmentResponse['boundingBox']) ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  }
}
