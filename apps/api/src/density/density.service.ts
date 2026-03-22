import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { DensityRepository } from './density.repository.js'
import type { DensityStatusResponse } from '@ridenrest/shared'

@Injectable()
export class DensityService {
  constructor(
    private readonly densityRepo: DensityRepository,
    @InjectQueue('density-analysis') private readonly queue: Queue,
  ) {}

  async triggerAnalysis(adventureId: string, userId: string, categories: string[]): Promise<{ message: string }> {
    const adventure = await this.densityRepo.findByAdventureId(adventureId, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')

    if (['pending', 'processing'].includes(adventure.densityStatus)) {
      throw new ConflictException('Density analysis already in progress')
    }

    // Delete old gaps if re-running after success or error
    if (['success', 'error'].includes(adventure.densityStatus)) {
      await this.densityRepo.deleteGapsByAdventureId(adventureId)
    }

    const segmentIds = await this.densityRepo.findParsedSegmentIds(adventureId)
    if (segmentIds.length === 0) {
      throw new BadRequestException('No parsed segments available for analysis')
    }

    await this.densityRepo.saveDensityCategories(adventureId, categories)
    await this.densityRepo.setDensityStatus(adventureId, 'pending')
    await this.densityRepo.setDensityProgress(adventureId, 0)
    await this.queue.add('analyze-density', { adventureId, segmentIds, categories })
    return { message: 'Density analysis started' }
  }

  async getStatus(adventureId: string, userId: string): Promise<DensityStatusResponse> {
    const adventure = await this.densityRepo.findByAdventureId(adventureId, userId)
    if (!adventure) throw new NotFoundException('Adventure not found')

    const segmentIds = await this.densityRepo.findParsedSegmentIds(adventureId)
    const coverageGaps = await this.densityRepo.findGapsBySegmentIds(segmentIds)

    return {
      densityStatus: adventure.densityStatus,
      densityProgress: adventure.densityProgress,
      coverageGaps,
      densityCategories: adventure.densityCategories,
    }
  }
}
