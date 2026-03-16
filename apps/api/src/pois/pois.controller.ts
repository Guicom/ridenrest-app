import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PoisService } from './pois.service.js'
import { FindPoisDto } from './dto/find-pois.dto.js'
import { GetGooglePlaceIdsDto } from './dto/get-google-place-ids.dto.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('pois')
@Controller('pois')
export class PoisController {
  constructor(private readonly poisService: PoisService) {}

  @Get()
  @ApiOperation({ summary: 'Get POIs for a segment corridor' })
  async findPois(@Query() dto: FindPoisDto, @CurrentUser() user: CurrentUserPayload) {
    return this.poisService.findPois(dto, user.id)
  }

  @Get('google-ids')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get cached Google place_ids for a corridor' })
  async getGooglePlaceIds(@Query() dto: GetGooglePlaceIdsDto) {
    return this.poisService.getGooglePlaceIds(dto.segmentId, dto.fromKm, dto.toKm, dto.layer)
  }
}
