import { Module } from '@nestjs/common'
import { QueuesModule } from '../queues/queues.module.js'
import { HealthController } from './health.controller.js'
import { AccessQueueHealthController } from './access-queue-health.controller.js'
import { HealthTokenGuard } from '../common/guards/health-token.guard.js'

@Module({
  imports: [QueuesModule],
  controllers: [HealthController, AccessQueueHealthController],
  providers: [HealthTokenGuard],
})
export class HealthModule {}
