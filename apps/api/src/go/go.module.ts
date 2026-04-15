import { Module } from '@nestjs/common'
import { GoController } from './go.controller.js'

@Module({
  controllers: [GoController],
})
export class GoModule {}
