import { Module } from '@nestjs/common'
import { PushController } from './push.controller.js'
import { PushService } from './push.service.js'
import { PushRepository } from './push.repository.js'

// Feature push (story MOB-6.2). `PushService` porte le listener `@OnEvent('density.completed')`
// (EventEmitterModule est global, monté dans app.module) → l'envoi push se déclenche à la
// complétion densité sans coupler le processor au module push.
@Module({
  controllers: [PushController],
  providers: [PushService, PushRepository],
})
export class PushModule {}
