import { Module } from '@nestjs/common'
import { QueuesModule } from '../queues/queues.module.js'
import { PoisModule } from '../pois/pois.module.js'
import { DensityController } from './density.controller.js'
import { DensityService } from './density.service.js'
import { DensityRepository } from './density.repository.js'
import { DensityAnalyzeProcessor } from './jobs/density-analyze.processor.js'

@Module({
  imports: [QueuesModule, PoisModule],
  controllers: [DensityController],
  providers: [DensityService, DensityRepository, DensityAnalyzeProcessor],
})
export class DensityModule {}
