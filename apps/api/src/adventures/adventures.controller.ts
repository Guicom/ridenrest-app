import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AdventuresService } from './adventures.service.js'
import { CreateAdventureDto } from './dto/create-adventure.dto.js'
import { UpdateAdventureDto } from './dto/update-adventure.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('adventures')
@Controller('adventures')
export class AdventuresController {
  constructor(private readonly adventuresService: AdventuresService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new adventure' })
  async create(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateAdventureDto,
  ) {
    return this.adventuresService.createAdventure(user.id, dto.name)
  }

  @Get()
  @ApiOperation({ summary: 'List all adventures for current user' })
  async findAll(@CurrentUser() user: CurrentUserPayload) {
    return this.adventuresService.listAdventures(user.id)
  }

  @Get(':id/map')
  @ApiOperation({ summary: 'Get map data (segments with waypoints) for an adventure' })
  async getMapData(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.adventuresService.getMapData(id, user.id)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single adventure by id' })
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.adventuresService.getAdventure(id, user.id)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an adventure (name and/or start date)' })
  async update(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() dto: UpdateAdventureDto,
  ) {
    return this.adventuresService.updateAdventure(id, user.id, dto)
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an adventure and all its segments' })
  async remove(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.adventuresService.deleteAdventure(id, user.id)
  }
}
