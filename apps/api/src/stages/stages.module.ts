import { Module, forwardRef } from '@nestjs/common'
import { StagesController, StagesWeatherController } from './stages.controller.js'
import { StagesService } from './stages.service.js'
import { StagesRepository } from './stages.repository.js'
import { AdventuresModule } from '../adventures/adventures.module.js'
import { WeatherModule } from '../weather/weather.module.js'

@Module({
  imports: [forwardRef(() => AdventuresModule), WeatherModule],
  controllers: [StagesController, StagesWeatherController],
  providers: [StagesService, StagesRepository],
  exports: [StagesService],
})
export class StagesModule {}
