import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { RedisProvider } from './common/providers/redis.provider.js'
import { QueuesModule } from './queues/queues.module.js'
import { HealthModule } from './health/health.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    QueuesModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService, RedisProvider],
  exports: [RedisProvider],
})
export class AppModule {}
