import { Module } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq'
import { bullmqConfig } from '../config/bullmq.config.js'

@Module({
  imports: [
    BullModule.forRoot({
      connection: bullmqConfig.connection,
      defaultJobOptions: bullmqConfig.defaultJobOptions,
    }),
    BullModule.registerQueue(
      { name: 'gpx-processing' },
      { name: 'density-analysis' },
      // Story 4.1 — pré-calcul eager des accès POI + sa dead-letter queue
      { name: 'poi-access-calculation' },
      { name: 'poi-access-failures' },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
