import { IsUUID, IsNumber, IsOptional, IsArray, IsIn, IsBoolean, Min, Max, ValidateIf } from 'class-validator'
import { Type, Transform } from 'class-transformer'
import { MAX_SEARCH_RANGE_KM } from '@ridenrest/shared'
import type { PoiCategory } from '@ridenrest/shared'

export const POI_CATEGORIES = ['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse', 'restaurant', 'supermarket', 'convenience', 'bike_shop', 'bike_repair'] as const

export class FindPoisDto {
  @IsUUID()
  segmentId!: string

  // Corridor mode — only required when NOT in live mode
  @ValidateIf((o: FindPoisDto) => !o.targetKm)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fromKm?: number

  @ValidateIf((o: FindPoisDto) => !o.targetKm)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  toKm?: number

  // Live mode — mutually exclusive with fromKm/toKm
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  targetKm?: number

  @ValidateIf((o: FindPoisDto) => o.targetKm !== undefined)
  @IsNumber()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  radiusKm?: number

  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown[] => (Array.isArray(value) ? (value as unknown[]) : [value]))
  @IsArray()
  @IsIn(POI_CATEGORIES, { each: true })
  categories?: PoiCategory[]

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  overpassEnabled?: boolean
}

// Export the constant for use in service validation
export { MAX_SEARCH_RANGE_KM }
