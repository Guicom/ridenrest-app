import { Controller, Get, Query } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { GeoService } from './geo.service.js'
import { ReverseCityDto } from './dto/reverse-city.dto.js'

@ApiTags('geo')
@Controller('geo')
export class GeoController {
  constructor(private readonly geoService: GeoService) {}

  @Get('reverse-city')
  @ApiOperation({ summary: 'Reverse geocode lat/lng to city name' })
  async reverseCity(@Query() dto: ReverseCityDto): Promise<{ city: string | null; postcode: string | null }> {
    return this.geoService.reverseCity(dto.lat, dto.lng)
  }
}
