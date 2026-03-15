import { Injectable, NotFoundException } from '@nestjs/common'
import { AdventuresRepository } from './adventures.repository.js'
import type { AdventureResponse } from '@ridenrest/shared'
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

  async updateTotalDistance(id: string, totalDistanceKm: number): Promise<void> {
    await this.adventuresRepo.updateTotalDistance(id, totalDistanceKm)
  }

  private toResponse(a: Adventure): AdventureResponse {
    return {
      id: a.id,
      userId: a.userId,
      name: a.name,
      totalDistanceKm: a.totalDistanceKm,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      updatedAt: a.updatedAt.toISOString(),
    }
  }
}
