import { IsUUID, IsNumber, IsOptional, IsArray, IsIn, Min } from 'class-validator'
import { Type, Transform } from 'class-transformer'
import { MAX_SEARCH_RANGE_KM } from '@ridenrest/shared'
import type { PoiCategory } from '@ridenrest/shared'

export const POI_CATEGORIES = ['hotel', 'hostel', 'camp_site', 'shelter', 'restaurant', 'supermarket', 'convenience', 'bike_shop', 'bike_repair'] as const

export class FindPoisDto {
  @IsUUID()
  segmentId!: string

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fromKm!: number

  @IsNumber()
  @Min(0)
  @Type(() => Number)
  toKm!: number

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [value]))
  @IsArray()
  @IsIn(POI_CATEGORIES, { each: true })
  categories?: PoiCategory[]
}

// Export the constant for use in service validation
export { MAX_SEARCH_RANGE_KM }
