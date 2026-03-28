import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { StagesService } from './stages.service.js'
import { CreateStageDto } from './dto/create-stage.dto.js'
import { UpdateStageDto } from './dto/update-stage.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('stages')
@Controller('adventures/:adventureId/stages')
export class StagesController {
  constructor(private readonly stagesService: StagesService) {}

  @Get()
  @ApiOperation({ summary: 'List stages for an adventure' })
  async findAll(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
  ) {
    return this.stagesService.listStages(adventureId, user.id)
  }

  @Post()
  @ApiOperation({ summary: 'Create a stage for an adventure' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @Body() dto: CreateStageDto,
  ) {
    return this.stagesService.createStage(adventureId, user.id, dto)
  }

  @Patch(':stageId')
  @ApiOperation({ summary: 'Update stage name and/or color' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpdateStageDto,
  ) {
    return this.stagesService.updateStage(adventureId, stageId, user.id, dto)
  }

  @Delete(':stageId')
  @ApiOperation({ summary: 'Delete a stage and recalculate subsequent start_km' })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('adventureId') adventureId: string,
    @Param('stageId') stageId: string,
  ) {
    return this.stagesService.deleteStage(adventureId, stageId, user.id)
  }
}
