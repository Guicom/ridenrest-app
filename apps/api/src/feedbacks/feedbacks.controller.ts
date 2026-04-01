import { Controller, Post, Body } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { FeedbacksService } from './feedbacks.service.js'
import { CreateFeedbackDto } from './dto/create-feedback.dto.js'
import { CurrentUser } from '../common/decorators/current-user.decorator.js'
import type { CurrentUserPayload } from '../common/decorators/current-user.decorator.js'

@ApiTags('feedbacks')
@Controller('feedbacks')
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Post()
  @ApiOperation({ summary: 'Submit user feedback' })
  create(@Body() dto: CreateFeedbackDto, @CurrentUser() user: CurrentUserPayload) {
    return this.feedbacksService.create(dto, user)
  }
}
