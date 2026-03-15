import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { StravaService } from './strava.service.js'
import { ImportRouteDto } from './dto/import-route.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('strava')
@Controller('strava')
export class StravaController {
  constructor(private readonly stravaService: StravaService) {}

  @Get('routes')
  @ApiOperation({ summary: 'List user Strava routes (cached 1h)' })
  async listRoutes(@CurrentUser() user: CurrentUserPayload) {
    return this.stravaService.listRoutes(user.id)
  }

  @Post('routes/:stravaRouteId/import')
  @ApiOperation({ summary: 'Import a Strava route as a GPX segment' })
  async importRoute(
    @CurrentUser() user: CurrentUserPayload,
    @Param('stravaRouteId') stravaRouteId: string,
    @Body() dto: ImportRouteDto,
  ) {
    return this.stravaService.importRoute(user.id, stravaRouteId, dto.adventureId)
  }
}
