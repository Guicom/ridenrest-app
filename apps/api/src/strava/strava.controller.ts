import { Controller, Get, Post, Param, Body, Query, ParseIntPipe } from '@nestjs/common'
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
  async listRoutes(
    @CurrentUser() user: CurrentUserPayload,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
  ) {
    return this.stravaService.listRoutes(user.id, Math.max(1, page))
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
