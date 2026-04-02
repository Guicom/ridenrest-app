import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { Public } from '../common/decorators/public.decorator.js'

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check — used by Uptime Kuma and uptime monitors' })
  check() {
    return {
      status: 'ok',
      version: process.env['npm_package_version'] ?? '0.0.1',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    }
  }
}
