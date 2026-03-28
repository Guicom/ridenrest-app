import { Module } from '@nestjs/common'
import { StagesController } from './stages.controller.js'
import { StagesService } from './stages.service.js'
import { StagesRepository } from './stages.repository.js'
import { AdventuresModule } from '../adventures/adventures.module.js'

@Module({
  imports: [AdventuresModule],
  controllers: [StagesController],
  providers: [StagesService, StagesRepository],
  exports: [StagesService],
})
export class StagesModule {}
