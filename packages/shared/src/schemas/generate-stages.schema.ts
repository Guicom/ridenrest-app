import { z } from 'zod'
import { LAYER_CATEGORIES } from '../types/poi.types'
import { MAX_SEARCH_RADIUS_KM } from '../constants/gpx.constants'
import { MIN_TARGET_KM_PER_DAY, MAX_TARGET_KM_PER_DAY } from '../constants/stages.constants'

/**
 * Catégories d'hébergement — dérivées de `LAYER_CATEGORIES.accommodations`, jamais recopiées.
 * Deux tables de catégories ont déjà coexisté et divergé en silence (cf. `GOOGLE_PLACE_TYPES`,
 * story 17.17) ; un test verrouille l'égalité.
 */
export const ACCOMMODATION_CATEGORIES = LAYER_CATEGORIES.accommodations

export const generateStagesSchema = z.object({
  targetKmPerDay: z.number().min(MIN_TARGET_KM_PER_DAY).max(MAX_TARGET_KM_PER_DAY),
  maxElevationGainM: z.number().min(0).max(20000).optional().nullable(),
  accommodationTypes: z.array(z.enum(ACCOMMODATION_CATEGORIES as [string, ...string[]])).min(1),
  radiusKm: z.number().min(0.5).max(MAX_SEARCH_RADIUS_KM).optional(),
  mode: z.enum(['replace', 'fill']),
  overpassEnabled: z.boolean().optional(),
  /** Départ de la PREMIÈRE étape générée. Absent → aucune étape ne reçoit de departureTime. */
  firstDepartureAt: z.string().datetime().optional().nullable(),
  /** IANA, ex. 'Europe/Paris'. Vient du client donc non fiable → validé côté serveur, repli UTC. */
  timeZone: z.string().max(64).optional(),
})

export type GenerateStagesInput = z.infer<typeof generateStagesSchema>
