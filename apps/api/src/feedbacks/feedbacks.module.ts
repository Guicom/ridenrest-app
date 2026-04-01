import { Module } from '@nestjs/common'
import { FeedbacksController } from './feedbacks.controller.js'
import { FeedbacksService } from './feedbacks.service.js'

@Module({
  controllers: [FeedbacksController],
  providers: [FeedbacksService],
})
export class FeedbacksModule {}
