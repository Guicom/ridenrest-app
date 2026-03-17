import { Controller, Post, Get, Param, Body, HttpCode, HttpStatus, Logger } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { DensityService } from './density.service.js'
import { TriggerDensityDto } from './dto/trigger-density.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('density')
@Controller('density')
export class DensityController {
  private readonly logger = new Logger(DensityController.name)

  constructor(private readonly densityService: DensityService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger density analysis for an adventure' })
  async triggerAnalysis(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: TriggerDensityDto,
  ) {
    this.logger.log(`triggerAnalysis called — adventureId=${dto.adventureId} userId=${user.id}`)
    return this.densityService.triggerAnalysis(dto.adventureId, user.id)
  }

  @Get(':adventureId/status')
  @ApiOperation({ summary: 'Get density analysis status and coverage gaps' })
  async getStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
  ) {
    return this.densityService.getStatus(adventureId, user.id)
  }
}
