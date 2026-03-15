import { Controller, Get, Post, Param, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { AdventuresService } from './adventures.service.js'
import { CreateAdventureDto } from './dto/create-adventure.dto.js'
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

  @Get(':id')
  @ApiOperation({ summary: 'Get a single adventure by id' })
  async findOne(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return this.adventuresService.getAdventure(id, user.id)
  }
}
