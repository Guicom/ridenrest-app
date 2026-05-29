import { Module } from '@nestjs/common'
import { MeController } from './me.controller.js'
import { MeService } from './me.service.js'
import { MeRepository } from './me.repository.js'

// EventEmitter2 est fourni globalement par EventEmitterModule.forRoot() (app.module).
@Module({
  controllers: [MeController],
  providers: [MeService, MeRepository],
})
export class MeModule {}
