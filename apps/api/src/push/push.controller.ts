import {
  Controller,
  Post,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PushService } from './push.service.js'
import { RegisterPushTokenDto } from './dto/register-push-token.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

// `@Controller('push-tokens')` — protégé par le `JwtAuthGuard` global (app.module).
// Story MOB-6.2 / T2. Retourne des données brutes (ResponseInterceptor enveloppe).
@ApiTags('push-tokens')
@Controller('push-tokens')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Post()
  @ApiOperation({ summary: 'Register (upsert) an Expo push token for the current user' })
  async register(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: RegisterPushTokenDto,
  ) {
    return this.pushService.registerToken(user.id, dto.token, dto.platform)
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unregister a push token on logout (AC4)' })
  async unregister(
    @CurrentUser() user: CurrentUserPayload,
    @Param('token') token: string,
  ): Promise<void> {
    await this.pushService.removeToken(user.id, token)
  }
}
