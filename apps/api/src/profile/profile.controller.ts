import { Controller, Get, Patch, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { ProfileService } from './profile.service.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'
import { UpdateProfileDto } from './dto/update-profile.dto.js'

@ApiTags('profile')
@Controller('profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user profile settings' })
  async getProfile(@CurrentUser() user: CurrentUserPayload) {
    return this.profileService.getProfile(user.id)
  }

  @Patch()
  @ApiOperation({ summary: 'Update profile settings' })
  async updateProfile(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profileService.updateOverpassEnabled(user.id, dto.overpassEnabled)
  }
}
