import { Controller, Get, Patch, Body, Header } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { MeService } from './me.service.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'
import { UpdateSettingsDto } from './dto/update-settings.dto.js'

/**
 * Settings de confidentialité du user courant (Story 3.2).
 * Protégé par le `JwtAuthGuard` global (APP_GUARD) → 401 si pas de JWT (AC #4).
 * L'owner est implicite : pas de path param, on agit toujours sur `req.user.id` (AC #2).
 */
@ApiTags('me')
@Controller('me/settings')
export class MeController {
  constructor(private readonly meService: MeService) {}

  @Get()
  @Header('Cache-Control', 'no-store') // AC #1 : toujours frais, pas de cache HTTP
  @ApiOperation({ summary: 'Get current user privacy settings' })
  async getSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.meService.getSettings(user.id)
  }

  @Patch()
  @ApiOperation({ summary: 'Update current user privacy settings (live access consent)' })
  async updateSettings(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateSettingsDto,
  ) {
    return this.meService.updateSettings(user.id, dto)
  }
}
