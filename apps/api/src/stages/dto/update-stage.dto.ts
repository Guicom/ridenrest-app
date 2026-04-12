import { IsString, IsOptional, IsNumber, Min, Max, Matches, MinLength, MaxLength, IsISO8601, ValidateIf } from 'class-validator'

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
  @ValidateIf((o: UpdateStageDto) => o.departureTime !== null)
  @IsISO8601()
  departureTime?: string | null

  @IsOptional()
  @ValidateIf((o: UpdateStageDto) => o.speedKmh !== null)
  @IsNumber()
  @Min(5)
  @Max(50)
  speedKmh?: number | null

  @IsOptional()
  @ValidateIf((o: UpdateStageDto) => o.pauseHours !== null)
  @IsNumber()
  @Min(0)
  @Max(12)
  pauseHours?: number | null
}
