import type { IncomingMessage, ServerResponse } from 'node:http'
import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { ConfigModule } from '@nestjs/config'
import { LoggerModule } from 'nestjs-pino'
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
import { GeoModule } from './geo/geo.module.js'
import { GoModule } from './go/go.module.js'
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js'
import { BackfillElevationLossService } from './common/backfill-elevation-loss.service.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['NODE_ENV'] === 'production' ? 'info' : 'debug',
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
            : undefined,
        genReqId: (req) =>
          (req.headers['x-request-id'] as string) ?? crypto.randomUUID(),
        autoLogging: {
          ignore: (req: IncomingMessage) => req.url?.startsWith('/api/health') ?? false,
        },
        serializers: {
          req: (req: IncomingMessage & { id?: string }) => ({
            method: req.method,
            url: req.url,
            reqId: req.id,
          }),
          res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
        },
      },
    }),
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
    GeoModule,
    GoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    BackfillElevationLossService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
