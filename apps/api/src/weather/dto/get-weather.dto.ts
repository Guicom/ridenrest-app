import { IsUUID, IsOptional, IsISO8601, IsNumber, Min, Max } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class GetWeatherDto {
  @ApiProperty({ description: 'Segment UUID' })
  @IsUUID()
  segmentId!: string

  @ApiPropertyOptional({ description: 'Departure time (ISO 8601)' })
  @IsOptional()
  @IsISO8601()
  departureTime?: string

  @ApiPropertyOptional({ description: 'Cycling speed in km/h (1–100)', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  speedKmh?: number
}
