import { Module } from '@nestjs/common'
import { AdventuresController } from './adventures.controller.js'
import { AdventuresService } from './adventures.service.js'
import { AdventuresRepository } from './adventures.repository.js'

@Module({
  controllers: [AdventuresController],
  providers: [AdventuresService, AdventuresRepository],
  exports: [AdventuresService],
})
export class AdventuresModule {}
