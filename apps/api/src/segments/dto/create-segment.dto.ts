import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator'

export class CreateSegmentDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string
}
