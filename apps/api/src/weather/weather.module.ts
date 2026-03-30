import { Module } from '@nestjs/common'
import { WeatherController } from './weather.controller.js'
import { WeatherService } from './weather.service.js'
import { WeatherRepository } from './weather.repository.js'
import { OpenMeteoProvider } from './providers/open-meteo.provider.js'

@Module({
  controllers: [WeatherController],
  providers: [WeatherService, WeatherRepository, OpenMeteoProvider],
  exports: [WeatherService],
})
export class WeatherModule {}
