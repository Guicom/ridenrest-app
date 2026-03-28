import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { StagesRepository } from './stages.repository.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import type { CreateStageDto } from './dto/create-stage.dto.js'
import type { UpdateStageDto } from './dto/update-stage.dto.js'
import type { AdventureStageResponse } from '@ridenrest/shared'
import type { AdventureStage } from '@ridenrest/database'

@Injectable()
export class StagesService {
  constructor(
    private readonly stagesRepo: StagesRepository,
    private readonly adventuresService: AdventuresService,
  ) {}

  async listStages(adventureId: string, userId: string): Promise<AdventureStageResponse[]> {
    await this.adventuresService.verifyOwnership(adventureId, userId)
    const stages = await this.stagesRepo.findByAdventureId(adventureId)
    return stages.map((s) => this.toResponse(s))
  }

  async createStage(
    adventureId: string,
    userId: string,
    dto: CreateStageDto,
  ): Promise<AdventureStageResponse> {
    await this.adventuresService.verifyOwnership(adventureId, userId)

    const last = await this.stagesRepo.findLastByAdventureId(adventureId)
    const startKm = last?.endKm ?? 0
    const count = await this.stagesRepo.countByAdventureId(adventureId)
    const orderIndex = count // 0-based, append at end
    const distanceKm = dto.endKm - startKm
    if (distanceKm <= 0) {
      throw new BadRequestException(
        `endKm (${dto.endKm}) must be greater than the previous stage end position (${startKm})`,
      )
    }

    const stage = await this.stagesRepo.create({
      adventureId,
      name: dto.name,
      color: dto.color,
      orderIndex,
      startKm,
      endKm: dto.endKm,
      distanceKm,
    })

    return this.toResponse(stage)
  }

  async updateStage(
    adventureId: string,
    stageId: string,
    userId: string,
    dto: UpdateStageDto,
  ): Promise<AdventureStageResponse> {
    await this.adventuresService.verifyOwnership(adventureId, userId)

    const stage = await this.stagesRepo.findByIdAndAdventureId(stageId, adventureId)
    if (!stage) throw new NotFoundException('Stage not found')

    if (dto.endKm !== undefined) {
      if (dto.endKm <= stage.startKm) {
        throw new BadRequestException('endKm must be > startKm')
      }

      // Fetch subsequent stages before update to validate and cascade
      const subsequentStages = await this.stagesRepo.findSubsequent(adventureId, stage.orderIndex)
      if (subsequentStages.length > 0 && dto.endKm >= subsequentStages[0].endKm) {
        throw new BadRequestException('endKm must be less than the next stage endKm')
      }

      await this.stagesRepo.update(stageId, {
        endKm: dto.endKm,
        distanceKm: dto.endKm - stage.startKm,
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      })

      // Cascade: update subsequent stages' startKm (endKm stays unchanged)
      if (subsequentStages.length > 0) {
        let prevEndKm = dto.endKm
        const updates = subsequentStages.map((s) => {
          const newStartKm = prevEndKm
          const updated = { id: s.id, startKm: newStartKm, distanceKm: s.endKm - newStartKm, orderIndex: s.orderIndex }
          prevEndKm = s.endKm
          return updated
        })
        await this.stagesRepo.updateMany(updates)
      }

      const updated = await this.stagesRepo.findByIdAndAdventureId(stageId, adventureId)
      return this.toResponse(updated!)
    }

    const updated = await this.stagesRepo.update(stageId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
    })
    return this.toResponse(updated)
  }

  async deleteStage(
    adventureId: string,
    stageId: string,
    userId: string,
  ): Promise<{ deleted: boolean }> {
    await this.adventuresService.verifyOwnership(adventureId, userId)

    const stage = await this.stagesRepo.findByIdAndAdventureId(stageId, adventureId)
    if (!stage) throw new NotFoundException('Stage not found')

    await this.stagesRepo.delete(stageId)

    // Recalculate start_km and normalize orderIndex for remaining stages (cascade)
    const remaining = await this.stagesRepo.findByAdventureId(adventureId)
    const updates: Array<{ id: string; startKm: number; distanceKm: number; orderIndex: number }> = []
    let prevEndKm = 0
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]
      updates.push({ id: s.id, startKm: prevEndKm, distanceKm: s.endKm - prevEndKm, orderIndex: i })
      prevEndKm = s.endKm
    }
    await this.stagesRepo.updateMany(updates)

    return { deleted: true }
  }

  private toResponse(s: AdventureStage): AdventureStageResponse {
    return {
      id: s.id,
      adventureId: s.adventureId,
      name: s.name,
      color: s.color,
      orderIndex: s.orderIndex,
      startKm: s.startKm,
      endKm: s.endKm,
      distanceKm: s.distanceKm,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  }
}
