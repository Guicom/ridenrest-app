import { IsUUID, IsOptional, IsISO8601, IsNumber, Min, Max, IsString } from 'class-validator'
import { Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export interface StageDeparture {
  startKm: number
  endKm: number
  departureTime: string  // ISO 8601
}

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

  @ApiPropertyOptional({ description: 'Adventure km — only sample waypoints ahead of this position', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fromKm?: number

  @ApiPropertyOptional({ description: 'JSON-encoded array of stage departures [{startKm, endKm, departureTime}]' })
  @IsOptional()
  @IsString()
  stageDepartures?: string
}
