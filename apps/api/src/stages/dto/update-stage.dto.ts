import { IsString, IsOptional, Matches, MinLength, MaxLength } from 'class-validator'

export class UpdateStageDto {
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  name?: string

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  color?: string

}
