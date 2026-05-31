import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { EventEmitter2 } from '@nestjs/event-emitter'
import type { Queue } from 'bullmq'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { SegmentsRepository } from './segments.repository.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import type { AdventureSegmentResponse } from '@ridenrest/shared'
import { MAX_GPX_FILE_SIZE_BYTES } from '@ridenrest/shared'
import type { AdventureSegment } from '@ridenrest/database'

const GPX_STORAGE_PATH = process.env.GPX_STORAGE_PATH ?? '/data/gpx'

/**
 * Event émis quand la trace d'une aventure change (segment supprimé ici, segment ajouté/parsé
 * dans `GpxParseProcessor`). Consommé par Story 4.2 (`AccessWorkerService`) pour invalider le
 * cache d'accès POI.
 *
 * ⚠️ Scope AVENTURE (pas segment) : l'origine `nearest-trace` est calculée sur la trace FUSIONNÉE
 *   de tous les segments (`resolve-origin.ts` → `ST_Collect`). Ajouter/supprimer n'importe quel
 *   segment peut donc déplacer le point d'accès des POI des AUTRES segments → invalidation globale.
 */
export const ADVENTURE_TRACE_UPDATED_EVENT = 'adventure.trace-updated' as const

export interface AdventureTraceUpdatedPayload {
  adventureId: string
  /** Segment à l'origine du changement (observabilité). */
  segmentId: string
  changeType: 'segment-added' | 'segment-removed'
}

@Injectable()
export class SegmentsService {
  constructor(
    private readonly segmentsRepo: SegmentsRepository,
    private readonly adventuresService: AdventuresService,
    @InjectQueue('gpx-processing') private readonly gpxQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createSegment(
    adventureId: string,
    userId: string,
    file: Express.Multer.File,
    name?: string,
    source?: string,
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

    // Create DB record — clean up file on failure to avoid orphaned files on disk
    let segment!: AdventureSegment
    try {
      segment = await this.segmentsRepo.create({
        id: segmentId,
        adventureId,
        name: segmentName,
        orderIndex,
        cumulativeStartKm: 0,
        parseStatus: 'pending',
        storageUrl,
        source: source ?? null,
      })
    } catch {
      await fs.unlink(storageUrl).catch(() => undefined)
      throw new InternalServerErrorException('Failed to create segment record')
    }

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

  async reorderSegments(
    adventureId: string,
    userId: string,
    orderedIds: string[],
  ): Promise<AdventureSegmentResponse[]> {
    await this.adventuresService.verifyOwnership(adventureId, userId)

    const existing = await this.segmentsRepo.findAllByAdventureId(adventureId)
    const existingIds = new Set(existing.map((s) => s.id))

    if (
      orderedIds.length !== existing.length ||
      new Set(orderedIds).size !== orderedIds.length ||
      orderedIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException('orderedIds must match exactly all segment IDs for this adventure')
    }

    const updates = orderedIds.map((id, index) => ({ id, orderIndex: index }))
    await this.segmentsRepo.updateOrderIndexes(updates)
    await this.recomputeCumulativeDistances(adventureId)

    return this.listSegments(adventureId, userId)
  }

  async deleteSegment(
    adventureId: string,
    segmentId: string,
    userId: string,
  ): Promise<{ deleted: boolean }> {
    const segment = await this.segmentsRepo.findByIdAndUserId(segmentId, userId)
    if (!segment || segment.adventureId !== adventureId) throw new NotFoundException('Segment not found')

    await this.segmentsRepo.delete(segmentId)
    if (segment.storageUrl) {
      await fs.unlink(segment.storageUrl).catch(() => undefined)
    }
    await this.recomputeCumulativeDistances(adventureId)

    // La trace fusionnée de l'aventure a changé → les accès POI des segments restants peuvent
    // être périmés (origine `nearest-trace` recalculée sur ST_Collect de tous les segments).
    // Story 4.2 : invalidation event-driven au scope aventure (les POI du segment supprimé sont
    // déjà retirés par CASCADE). Best-effort — un listener ne doit pas faire échouer le DELETE.
    const payload: AdventureTraceUpdatedPayload = { adventureId, segmentId, changeType: 'segment-removed' }
    this.eventEmitter.emit(ADVENTURE_TRACE_UPDATED_EVENT, payload)

    return { deleted: true }
  }

  async renameSegment(
    adventureId: string,
    segmentId: string,
    userId: string,
    name: string,
  ): Promise<AdventureSegmentResponse> {
    const segment = await this.segmentsRepo.findByIdAndUserId(segmentId, userId)
    if (!segment) throw new NotFoundException('Segment not found')
    if (segment.adventureId !== adventureId) throw new BadRequestException('Segment does not belong to this adventure')
    return this.toResponse(await this.segmentsRepo.updateName(segmentId, name))
  }

  async recomputeCumulativeDistances(adventureId: string): Promise<void> {
    const segments = await this.segmentsRepo.findAllByAdventureId(adventureId)
    let cumulative = 0
    const updates = segments.map((seg) => {
      const result = { id: seg.id, cumulativeStartKm: cumulative }
      cumulative += seg.distanceKm ?? 0
      return result
    })
    await this.segmentsRepo.updateCumulativeDistances(updates)

    // C0.bis: compute total D+ (null if no segment has elevation data)
    const hasElevationData = segments.some((s) => s.elevationGainM !== null)
    const totalElevationGainM = hasElevationData
      ? segments.reduce((sum, s) => sum + (s.elevationGainM ?? 0), 0)
      : null

    // Compute total D- (null if no segment has loss data)
    const hasLossData = segments.some((s) => s.elevationLossM !== null)
    const totalElevationLossM = hasLossData
      ? segments.reduce((sum, s) => sum + (s.elevationLossM ?? 0), 0)
      : null

    await this.adventuresService.updateTotals(adventureId, cumulative, totalElevationGainM, totalElevationLossM)
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
      elevationLossM: s.elevationLossM ?? null,
      parseStatus: s.parseStatus,
      source: s.source ?? null,
      boundingBox: (s.boundingBox as AdventureSegmentResponse['boundingBox']) ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  }
}
