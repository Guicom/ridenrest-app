import { Controller, Get, Query, Logger } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { WeatherService } from './weather.service.js'
import { GetWeatherDto } from './dto/get-weather.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('weather')
@Controller('weather')
export class WeatherController {
  private readonly logger = new Logger(WeatherController.name)

  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  @ApiOperation({ summary: 'Get pace-adjusted weather forecast for a segment' })
  async getWeatherForecast(
    @CurrentUser() user: CurrentUserPayload,
    @Query() dto: GetWeatherDto,
  ) {
    this.logger.log(`getWeatherForecast — segmentId=${dto.segmentId} userId=${user.id}`)
    return this.weatherService.getWeatherForecast(dto, user.id)
  }
}
