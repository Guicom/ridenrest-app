import { Controller, Get, Patch, NotImplementedException } from '@nestjs/common'

@Controller('me/settings')
export class MeController {
  @Get()
  getSettings(): never {
    throw new NotImplementedException({
      message: 'Not implemented yet — implemented in poi-access-3.2',
      plannedStory: 'poi-access-3-2-me-settings-impl',
    })
  }

  @Patch()
  updateSettings(): never {
    throw new NotImplementedException({
      message: 'Not implemented yet — implemented in poi-access-3.2',
      plannedStory: 'poi-access-3-2-me-settings-impl',
    })
  }
}
