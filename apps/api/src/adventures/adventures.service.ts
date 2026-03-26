import { Injectable, NotFoundException } from '@nestjs/common'
import * as fs from 'node:fs/promises'
import { AdventuresRepository } from './adventures.repository.js'
import type { AdventureResponse, AdventureMapResponse } from '@ridenrest/shared'
import type { Adventure } from '@ridenrest/database'

@Injectable()
export class AdventuresService {
  constructor(private readonly adventuresRepo: AdventuresRepository) {}

  async createAdventure(userId: string, name: string): Promise<AdventureResponse> {
    const adventure = await this.adventuresRepo.create({ userId, name })
    return this.toResponse(adventure)
  }

  async listAdventures(userId: string): Promise<AdventureResponse[]> {
    const rows = await this.adventuresRepo.findAllByUserId(userId)
    return rows.map((a) => this.toResponse(a))
  }

  async getAdventure(id: string, userId: string): Promise<AdventureResponse> {
    const adventure = await this.adventuresRepo.findByIdAndUserId(id, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')
    return this.toResponse(adventure)
  }

  async verifyOwnership(id: string, userId: string): Promise<void> {
    const adventure = await this.adventuresRepo.findByIdAndUserId(id, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')
  }

  async updateTotals(id: string, totalDistanceKm: number, totalElevationGainM: number | null): Promise<void> {
    await this.adventuresRepo.updateTotals(id, totalDistanceKm, totalElevationGainM)
  }

  async renameAdventure(id: string, userId: string, name: string): Promise<AdventureResponse> {
    await this.verifyOwnership(id, userId)
    return this.toResponse(await this.adventuresRepo.updateName(id, name))
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

  private toResponse(a: Adventure): AdventureResponse {
    return {
      id: a.id,
      userId: a.userId,
      name: a.name,
      totalDistanceKm: a.totalDistanceKm,
      totalElevationGainM: a.totalElevationGainM ?? null,
      status: a.status,
      densityStatus: a.densityStatus,
      densityProgress: a.densityProgress,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }
  }
}
