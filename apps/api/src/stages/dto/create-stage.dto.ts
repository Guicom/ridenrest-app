import { IsString, IsNumber, Matches, MinLength, MaxLength } from 'class-validator'

export class CreateStageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string

  @IsNumber()
  endKm!: number

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color!: string
}
