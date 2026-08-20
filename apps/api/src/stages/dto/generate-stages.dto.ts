import {
  IsArray,
  ArrayNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsISO8601,
  IsString,
  MaxLength,
  Min,
  Max,
  ValidateIf,
} from 'class-validator'
import { Type } from 'class-transformer'
import {
  ACCOMMODATION_CATEGORIES,
  MAX_SEARCH_RADIUS_KM,
  MIN_TARGET_KM_PER_DAY,
  MAX_TARGET_KM_PER_DAY,
} from '@ridenrest/shared'
import type { PoiCategory } from '@ridenrest/shared'

export const GENERATE_STAGES_MODES = ['replace', 'fill'] as const
export type GenerateStagesMode = (typeof GENERATE_STAGES_MODES)[number]

export class GenerateStagesDto {
  /** Cible en km par jour. Cible et non plafond : l'exploration peut aller jusqu'à +40 km. */
  @IsNumber()
  @Min(MIN_TARGET_KM_PER_DAY)
  @Max(MAX_TARGET_KM_PER_DAY)
  @Type(() => Number)
  targetKmPerDay!: number

  /** D+ maximum par étape. Absent → aucune contrainte d'élévation. */
  @IsOptional()
  @ValidateIf((o: GenerateStagesDto) => o.maxElevationGainM !== null)
  @IsNumber()
  @Min(0)
  @Max(20000)
  @Type(() => Number)
  maxElevationGainM?: number | null

  /** Types d'hébergement recherchés — sous-ensemble des catégories du calque hébergements. */
  @IsArray()
  @ArrayNotEmpty()
  @IsIn(ACCOMMODATION_CATEGORIES, { each: true })
  accommodationTypes!: PoiCategory[]

  /**
   * Rayon de recherche autour du point candidat. Absent → `DEFAULT_SEARCH_RADIUS_KM`.
   * C'est le réglage que l'utilisateur possède déjà en planning (`searchRadiusKm`) : la
   * génération le consomme au lieu de figer une valeur (règle 12 du contexte projet).
   */
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(MAX_SEARCH_RADIUS_KM)
  @Type(() => Number)
  radiusKm?: number

  @IsIn(GENERATE_STAGES_MODES)
  mode!: GenerateStagesMode

  /** Autorise la lecture des lignes `source='overpass'` déjà en cache (règle 7). */
  @IsOptional()
  @IsBoolean()
  overpassEnabled?: boolean

  /**
   * Départ de la PREMIÈRE étape générée. Absent → aucune étape ne reçoit de `departureTime`
   * (comportement conservateur : on ne fabrique pas de dates que l'utilisateur n'a pas données).
   */
  @IsOptional()
  @ValidateIf((o: GenerateStagesDto) => o.firstDepartureAt !== null)
  @IsISO8601()
  firstDepartureAt?: string | null

  /**
   * Fuseau IANA du client, ex. `Europe/Paris`. Nécessaire pour incrémenter la date **en gardant
   * l'heure murale** : un instant seul ne dit pas que `2026-10-24T06:00Z` vaut « 08:00 à Paris ».
   *
   * Pas de validation par décorateur — la liste IANA n'est pas énumérable, et un identifiant
   * invalide *lève* un `RangeError` à l'usage. La validité est donc vérifiée dans le service,
   * avec repli sur `UTC`.
   */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timeZone?: string
}
