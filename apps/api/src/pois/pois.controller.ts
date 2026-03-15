import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PoisService } from './pois.service.js'
import { FindPoisDto } from './dto/find-pois.dto.js'
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
}
