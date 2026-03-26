import { Controller, Get, Post, Body, Query, UseGuards, HttpCode, Logger } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PoisService } from './pois.service.js'
import { FindPoisDto } from './dto/find-pois.dto.js'
import { GetGoogleDetailsDto } from './dto/get-google-details.dto.js'
import { TrackBookingClickDto } from './dto/track-booking-click.dto.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('pois')
@Controller('pois')
export class PoisController {
  private readonly logger = new Logger(PoisController.name)

  constructor(private readonly poisService: PoisService) {}

  @Get()
  @ApiOperation({ summary: 'Get POIs for a segment corridor' })
  async findPois(@Query() dto: FindPoisDto, @CurrentUser() user: CurrentUserPayload) {
    return this.poisService.findPois(dto, user.id)
  }

  // IMPORTANT: Must be declared BEFORE @Get(':id') to avoid NestJS route conflicts
  @Get('google-details')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get Google Places enrichment for a specific POI' })
  async getPoiGoogleDetails(@Query() dto: GetGoogleDetailsDto) {
    return this.poisService.getPoiGoogleDetails(dto.externalId, dto.segmentId)
  }

  @Post('booking-click')
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Track a booking deep link click (analytics)' })
  trackBookingClick(@Body() dto: TrackBookingClickDto) {
    this.logger.log(`Booking click: ${dto.platform} for POI ${dto.externalId}`)
    // MVP: log only — extend with analytics service in future
  }
}
