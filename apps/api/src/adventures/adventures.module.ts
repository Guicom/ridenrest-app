import { Module, forwardRef } from '@nestjs/common'
import { AdventuresController } from './adventures.controller.js'
import { AdventuresService } from './adventures.service.js'
import { AdventuresRepository } from './adventures.repository.js'
import { StagesModule } from '../stages/stages.module.js'

@Module({
  imports: [forwardRef(() => StagesModule)],
  controllers: [AdventuresController],
  providers: [AdventuresService, AdventuresRepository],
  exports: [AdventuresService],
})
export class AdventuresModule {}
