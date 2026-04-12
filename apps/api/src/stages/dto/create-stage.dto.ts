import { IsString, IsNumber, IsOptional, Matches, MinLength, MaxLength, Min, Max, IsISO8601, ValidateIf } from 'class-validator'

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

  @IsOptional()
  @ValidateIf((o: CreateStageDto) => o.departureTime !== null)
  @IsISO8601()
  departureTime?: string | null

  @IsOptional()
  @ValidateIf((o: CreateStageDto) => o.speedKmh !== null)
  @IsNumber()
  @Min(5)
  @Max(50)
  speedKmh?: number | null

  @IsOptional()
  @ValidateIf((o: CreateStageDto) => o.pauseHours !== null)
  @IsNumber()
  @Min(0)
  @Max(12)
  pauseHours?: number | null
}
