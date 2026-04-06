import { IsString, IsOptional, IsNumber, Min, Matches, MinLength, MaxLength, IsISO8601, ValidateIf } from 'class-validator'

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

  @IsNumber()
  @IsOptional()
  @Min(0)
  endKm?: number

  @IsOptional()
  @ValidateIf((o) => o.departureTime !== null)
  @IsISO8601()
  departureTime?: string | null
}
