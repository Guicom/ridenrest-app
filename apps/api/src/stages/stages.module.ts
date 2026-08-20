import { Module, forwardRef } from '@nestjs/common'
import { StagesController, StagesWeatherController } from './stages.controller.js'
import { StagesService } from './stages.service.js'
import { StageGeneratorService } from './stage-generator.service.js'
import { StagesRepository } from './stages.repository.js'
import { AdventuresModule } from '../adventures/adventures.module.js'
import { WeatherModule } from '../weather/weather.module.js'
import { PoisModule } from '../pois/pois.module.js'

@Module({
  imports: [forwardRef(() => AdventuresModule), WeatherModule, PoisModule],
  controllers: [StagesController, StagesWeatherController],
  providers: [StagesService, StageGeneratorService, StagesRepository],
  exports: [StagesService],
})
export class StagesModule {}
