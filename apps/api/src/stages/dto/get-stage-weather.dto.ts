import { IsOptional, IsISO8601, IsNumber, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'

export class GetStageWeatherDto {
  @IsOptional()
  @IsISO8601()
  departureTime?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  speedKmh?: number
}
