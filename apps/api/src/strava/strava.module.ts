import { Module } from '@nestjs/common'
import { StravaController } from './strava.controller.js'
import { StravaService } from './strava.service.js'
import { SegmentsModule } from '../segments/segments.module.js'
import { AdventuresModule } from '../adventures/adventures.module.js'

@Module({
  imports: [SegmentsModule, AdventuresModule],
  controllers: [StravaController],
  providers: [StravaService],
})
export class StravaModule {}
