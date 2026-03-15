import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class ReorderSegmentsDto {
  @ApiProperty({ type: [String], example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderedIds!: string[]
}
