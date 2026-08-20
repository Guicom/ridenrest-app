import { IsUUID, IsNumber, IsOptional, IsArray, IsIn, IsBoolean, Min, Max, ValidateIf } from 'class-validator'
import { Type, Transform } from 'class-transformer'
import { MAX_SEARCH_RANGE_KM, MAX_LIVE_RADIUS_KM } from '@ridenrest/shared'
import type { PoiCategory } from '@ridenrest/shared'

export const POI_SOURCES = ['google', 'overpass'] as const
export type PoiSource = (typeof POI_SOURCES)[number]

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
  @Max(MAX_LIVE_RADIUS_KM)
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

  /**
   * Restreint la recherche à UNE source, pour permettre au client d'afficher les résultats
   * Google (rapides) sans attendre Overpass (1 à 31 s mesurés sur les instances publiques).
   *
   * - `google`   : prefetch Google uniquement, aucune requête Overpass, lecture filtrée google.
   * - `overpass` : requête Overpass uniquement, aucun appel Google, lecture filtrée overpass.
   * - absent     : comportement historique (les deux sources dans une seule réponse) —
   *                conservé pour les binaires mobiles déjà distribués, qui parlent à l'API de
   *                prod sans ce paramètre. Le code mobile actuel, lui, est découplé
   *                (2026-08-20) et envoie toujours `source`.
   */
  @IsOptional()
  @IsIn(POI_SOURCES)
  source?: PoiSource
}

// Export the constant for use in service validation
export { MAX_SEARCH_RANGE_KM }
