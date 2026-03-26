import { IsUUID, IsNumber, IsIn, Min } from 'class-validator'
import { Type } from 'class-transformer'

export const MAP_LAYERS = ['accommodations', 'restaurants', 'supplies', 'bike'] as const

export class GetGooglePlaceIdsDto {
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

  @IsIn(MAP_LAYERS)
  layer!: string
}
