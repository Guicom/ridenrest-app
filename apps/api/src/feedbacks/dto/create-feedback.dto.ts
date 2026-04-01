import { IsIn, IsOptional, IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator'

export class CreateFeedbackDto {
  @IsIn(['bug', 'improvement', 'idea'])
  category!: string

  @IsOptional()
  @IsString()
  @MaxLength(200)
  screen?: string

  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  description!: string
}
