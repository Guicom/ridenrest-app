import { IsString, IsNotEmpty, MaxLength, IsOptional, ValidateIf, Matches, IsISO8601, IsNumber, Min, Max } from 'class-validator'
import { Transform } from 'class-transformer'

export class UpdateAdventureDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be in YYYY-MM-DD format' })
  @IsISO8601({ strict: true }, { message: 'startDate must be a valid calendar date' })
  startDate?: string | null

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be in YYYY-MM-DD format' })
  @IsISO8601({ strict: true }, { message: 'endDate must be a valid calendar date' })
  endDate?: string | null

  @IsOptional()
  @IsNumber()
  @Min(5, { message: 'avgSpeedKmh must be at least 5 km/h' })
  @Max(50, { message: 'avgSpeedKmh must be at most 50 km/h' })
  avgSpeedKmh?: number
}
