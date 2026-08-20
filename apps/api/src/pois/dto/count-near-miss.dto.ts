import { IsUUID, IsNumber, IsOptional, IsArray, IsIn, IsBoolean, Min } from 'class-validator'
import { Type, Transform } from 'class-transformer'
import type { PoiCategory } from '@ridenrest/shared'
import { POI_CATEGORIES } from './find-pois.dto.js'

/**
 * Compte les POI qui satisfont la recherche mais tombent juste au-delà du corridor d'affichage.
 *
 * Mode planning uniquement : le mode live raisonne en **rayon** autour d'un point, pas en
 * couloir le long d'une trace — la notion de « quasi-manqué corridor » n'y a pas de sens.
 */
export class CountNearMissDto {
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

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
  @IsBoolean()
  overpassEnabled?: boolean
}
