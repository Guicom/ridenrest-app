import { Controller, Get, Query, Res, BadRequestException } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { Public } from '../common/decorators/public.decorator.js'

@ApiTags('go')
@Controller('go')
export class GoController {
  @Get('booking')
  @Public()
  @ApiOperation({ summary: 'Redirect to Booking.com — bypasses mobile Universal Links / App Links' })
  redirectBooking(@Query('url') url: string, @Res() res: Response) {
    if (!url || !url.startsWith('https://www.booking.com/')) {
      throw new BadRequestException('Invalid booking URL')
    }
    res.set('Cache-Control', 'no-store')
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Redirecting…</title></head><body><script>window.location.replace(${JSON.stringify(url)})</script><noscript><a href="${url.replace(/"/g, '&quot;')}">Continue to Booking.com</a></noscript></body></html>`)
  }
}
