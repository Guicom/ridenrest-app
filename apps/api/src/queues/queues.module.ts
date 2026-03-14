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
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
