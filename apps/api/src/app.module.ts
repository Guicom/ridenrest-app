import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { AppController } from './app.controller.js'
import { AppService } from './app.service.js'
import { RedisModule } from './common/redis/redis.module.js'
import { QueuesModule } from './queues/queues.module.js'
import { HealthModule } from './health/health.module.js'
import { AdventuresModule } from './adventures/adventures.module.js'
import { SegmentsModule } from './segments/segments.module.js'
import { StravaModule } from './strava/strava.module.js'
import { PoisModule } from './pois/pois.module.js'
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js'
import { DensityModule } from './density/density.module.js'
import { WeatherModule } from './weather/weather.module.js'
import { StagesModule } from './stages/stages.module.js'
import { ProfileModule } from './profile/profile.module.js'
import { FeedbacksModule } from './feedbacks/feedbacks.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    QueuesModule,
    HealthModule,
    AdventuresModule,
    SegmentsModule,
    StravaModule,
    PoisModule,
    DensityModule,
    WeatherModule,
    StagesModule,
    ProfileModule,
    FeedbacksModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
