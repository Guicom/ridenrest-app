import { Module } from '@nestjs/common'
import { SegmentsController } from './segments.controller.js'
import { SegmentsService } from './segments.service.js'
import { SegmentsRepository } from './segments.repository.js'
import { AdventuresModule } from '../adventures/adventures.module.js'
import { QueuesModule } from '../queues/queues.module.js'
import { GpxParseProcessor } from './jobs/gpx-parse.processor.js'

@Module({
  imports: [AdventuresModule, QueuesModule],
  controllers: [SegmentsController],
  providers: [SegmentsService, SegmentsRepository, GpxParseProcessor],
  exports: [SegmentsService],
})
export class SegmentsModule {}
