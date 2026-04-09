import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common'
import * as fs from 'node:fs/promises'
import { AdventuresRepository } from './adventures.repository.js'
import { StagesService } from '../stages/stages.service.js'
import type { AdventureResponse, AdventureMapResponse, MapWaypoint } from '@ridenrest/shared'
import type { Adventure } from '@ridenrest/database'
import type { UpdateAdventureDto } from './dto/update-adventure.dto.js'

@Injectable()
export class AdventuresService {
  constructor(
    private readonly adventuresRepo: AdventuresRepository,
    @Inject(forwardRef(() => StagesService)) private readonly stagesService: StagesService,
  ) {}

  async createAdventure(userId: string, name: string): Promise<AdventureResponse> {
    const adventure = await this.adventuresRepo.create({ userId, name })
    return this.toResponse(adventure, false)
  }

  async listAdventures(userId: string): Promise<AdventureResponse[]> {
    const rows = await this.adventuresRepo.findAllByUserId(userId)
    const stravaIds = await this.adventuresRepo.findAdventureIdsWithStravaSegments(rows.map((a) => a.id))
    return rows.map((a) => this.toResponse(a, stravaIds.has(a.id)))
  }

  async getAdventure(id: string, userId: string): Promise<AdventureResponse> {
    const adventure = await this.adventuresRepo.findByIdAndUserId(id, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')
    const stravaIds = await this.adventuresRepo.findAdventureIdsWithStravaSegments([id])
    return this.toResponse(adventure, stravaIds.has(id))
  }

  async verifyOwnership(id: string, userId: string): Promise<void> {
    const adventure = await this.adventuresRepo.findByIdAndUserId(id, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')
  }

  async getAdventureWaypoints(adventureId: string): Promise<MapWaypoint[]> {
    return this.adventuresRepo.getAdventureWaypoints(adventureId)
  }

  async updateTotals(id: string, totalDistanceKm: number, totalElevationGainM: number | null, totalElevationLossM: number | null): Promise<void> {
    await this.adventuresRepo.updateTotals(id, totalDistanceKm, totalElevationGainM, totalElevationLossM)
  }

  async updateAdventure(id: string, userId: string, dto: UpdateAdventureDto): Promise<AdventureResponse> {
    await this.verifyOwnership(id, userId)
    let adventure: Adventure | undefined

    if (dto.name !== undefined) {
      adventure = await this.adventuresRepo.updateName(id, dto.name)
    }
    if (dto.startDate !== undefined) {
      adventure = await this.adventuresRepo.updateStartDate(id, dto.startDate)
    }
    if (dto.endDate !== undefined) {
      adventure = await this.adventuresRepo.updateEndDate(id, dto.endDate)
    }

    if (dto.avgSpeedKmh !== undefined) {
      adventure = await this.adventuresRepo.updateAvgSpeedKmh(id, dto.avgSpeedKmh)
      await this.stagesService.recomputeAllEtasForAdventure(id, dto.avgSpeedKmh)
    }

    if (!adventure) {
      adventure = (await this.adventuresRepo.findByIdAndUserId(id, userId))!
    }

    const stravaIds = await this.adventuresRepo.findAdventureIdsWithStravaSegments([id])
    return this.toResponse(adventure, stravaIds.has(id))
  }

  async getMapData(adventureId: string, userId: string): Promise<AdventureMapResponse> {
    const data = await this.adventuresRepo.getAdventureMapData(adventureId, userId)
    if (!data) throw new NotFoundException('Adventure not found')
    return data
  }

  async deleteAdventure(id: string, userId: string): Promise<{ deleted: boolean }> {
    await this.verifyOwnership(id, userId)
    const storageUrls = await this.adventuresRepo.findSegmentStorageUrlsByAdventureId(id)
    await this.adventuresRepo.deleteById(id)
    await Promise.allSettled(storageUrls.map((url) => fs.unlink(url).catch(() => undefined)))
    return { deleted: true }
  }

  private toResponse(a: Adventure, hasStravaSegment: boolean): AdventureResponse {
    return {
      id: a.id,
      userId: a.userId,
      name: a.name,
      totalDistanceKm: a.totalDistanceKm,
      totalElevationGainM: a.totalElevationGainM ?? null,
      totalElevationLossM: a.totalElevationLossM ?? null,
      startDate: a.startDate ?? null,
      endDate: a.endDate ?? null,
      status: a.status,
      densityStatus: a.densityStatus,
      densityProgress: a.densityProgress,
      avgSpeedKmh: a.avgSpeedKmh,
      hasStravaSegment,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }
  }
}
