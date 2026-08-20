import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import {
  DEFAULT_SEARCH_RADIUS_KM,
  GOOGLE_PLACES_CACHE_TTL,
  MAX_GENERATED_STAGES_PER_CALL,
  STAGE_COLORS,
  STAGE_GEN_MAX_OFFSET_KM,
  STAGE_GEN_MIN_ACCOMMODATIONS,
  STAGE_GEN_STEP_KM,
  addDaysPreservingWallClock,
  resolveTimeZone,
} from '@ridenrest/shared'
import type {
  AdventureStageResponse,
  GenerateStagesResponse,
  MapWaypoint,
  StageGenerationWarning,
  StageGenerationWarningCode,
} from '@ridenrest/shared'
import type { NewAdventureStage } from '@ridenrest/database'
import { StagesRepository } from './stages.repository.js'
import { StagesService, computeElevationGainForRange, computeEtaMinutes } from './stages.service.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import { PoisRepository } from '../pois/pois.repository.js'
import { GooglePlacesProvider, googleTypesForCategories } from '../pois/providers/google-places.provider.js'
import { GoogleBillingCounter } from '../pois/providers/google-billing-counter.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { GenerateStagesDto } from './dto/generate-stages.dto.js'

/** Requêtes de comptage en vol. Gratuit ne veut pas dire exempt de quota de débit. */
const GOOGLE_COUNT_CONCURRENCY = 6

/**
 * Plafond dur d'appels de comptage par génération. Défense en profondeur : borne le rayon
 * d'action d'une régression, et protège le quota de débit Google.
 */
const MAX_COUNT_REQUESTS_PER_GENERATION = 600

/** Sources masquées à la lecture quand l'option Overpass est inactive (règle 7). */
const OVERPASS_SOURCES = ['overpass']

interface CountResult {
  count: number
  /**
   * `false` quand **aucun** type n'a répondu. Un échec fournisseur n'est pas un zéro : confondre
   * les deux est ce qui a masqué cinq mois de panne Overpass (story 17.13).
   */
  determinate: boolean
  googleCount: number
  dbCount: number
}

@Injectable()
export class StageGeneratorService {
  private readonly logger = new Logger(StageGeneratorService.name)

  constructor(
    private readonly stagesRepo: StagesRepository,
    private readonly stagesService: StagesService,
    private readonly adventuresService: AdventuresService,
    private readonly poisRepository: PoisRepository,
    private readonly googlePlacesProvider: GooglePlacesProvider,
    private readonly billing: GoogleBillingCounter,
    private readonly redisProvider: RedisProvider,
  ) {}

  async generate(
    adventureId: string,
    userId: string,
    dto: GenerateStagesDto,
  ): Promise<GenerateStagesResponse> {
    const adventure = await this.adventuresService.getAdventure(adventureId, userId)
    const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
    if (waypoints.length < 2) {
      throw new BadRequestException('No parsed segment available for stage generation')
    }

    const totalKm = waypoints[waypoints.length - 1].distKm
    const radiusKm = dto.radiusKm ?? DEFAULT_SEARCH_RADIUS_KM
    const googleTypes = googleTypesForCategories(dto.accommodationTypes)
    const excludeSources = dto.overpassEnabled ? [] : OVERPASS_SOURCES
    const timeZone = resolveTimeZone(dto.timeZone)

    // Garde d'invariant : la génération doit émettre ZÉRO appel facturable.
    const billingBefore = this.billing.snapshot()

    if (dto.mode === 'replace') {
      const removed = await this.stagesRepo.deleteAllByAdventureId(adventureId)
      this.logger.log(`[Stage gen] mode=replace — ${removed} étape(s) supprimée(s)`)
    }

    const existing = await this.stagesRepo.findByAdventureId(adventureId)
    const startOrderIndex = existing.length
    let prevEndKm = existing.length > 0 ? existing[existing.length - 1].endKm : 0

    const warnings: StageGenerationWarning[] = []
    const warnedOnce = new Set<StageGenerationWarningCode>()
    const warnOnce = (code: StageGenerationWarningCode): void => {
      if (warnedOnce.has(code)) return
      warnedOnce.add(code)
      warnings.push({ code, fromKm: null, toKm: null })
    }

    const rows: NewAdventureStage[] = []
    let countRequests = 0
    let stoppedAtKm: number | null = null

    const departureFor = (index: number): Date | null => {
      if (!dto.firstDepartureAt) return null
      const iso = addDaysPreservingWallClock(dto.firstDepartureAt, index, timeZone)
      return iso ? new Date(iso) : null
    }

    const makeRow = (index: number, startKm: number, endKm: number): NewAdventureStage => {
      const elev = computeElevationGainForRange(waypoints, startKm, endKm)
      const distanceKm = endKm - startKm
      const departureTime = departureFor(index)
      return {
        adventureId,
        name: `Étape ${startOrderIndex + index + 1}`,
        color: STAGE_COLORS[(startOrderIndex + index) % STAGE_COLORS.length],
        orderIndex: startOrderIndex + index,
        startKm,
        endKm,
        distanceKm,
        elevationGainM: elev?.gain ?? null,
        elevationLossM: elev?.loss ?? null,
        etaMinutes: computeEtaMinutes(distanceKm, elev?.gain ?? null, adventure.avgSpeedKmh),
        speedKmh: null,
        pauseHours: null,
        ...(departureTime ? { departureTime } : {}),
      }
    }

    while (rows.length < MAX_GENERATED_STAGES_PER_CALL) {
      const remaining = totalKm - prevEndKm
      if (remaining <= 0.01) break

      // Dernière étape : la destination finale n'est pas déplaçable, donc pas de vérification.
      if (remaining <= dto.targetKmPerDay) {
        rows.push(makeRow(rows.length, prevEndKm, totalKm))
        if (countRequests < MAX_COUNT_REQUESTS_PER_GENERATION) {
          const final = await this.countAt(
            adventureId, waypoints, totalKm, radiusKm, dto.accommodationTypes,
            googleTypes, excludeSources,
          )
          countRequests += final.requests
          if (final.determinate && final.count < STAGE_GEN_MIN_ACCOMMODATIONS) {
            warnings.push({ code: 'sparse_final_stage', fromKm: prevEndKm, toKm: totalKm })
          }
        }
        prevEndKm = totalKm
        break
      }

      const target = prevEndKm + dto.targetKmPerDay
      let chosen: number | null = null
      let anyDeterminate = false
      let budgetHit = false

      for (const offset of candidateOffsets()) {
        const endKm = round1(target + offset)
        if (endKm <= prevEndKm || endKm >= totalKm) continue

        // Contrainte D+ : dure dans les DEUX sens. Sans cela le réglage perdrait tout effet dès
        // qu'un recul échoue — l'algorithme irait chercher plus loin un point qui le viole.
        if (dto.maxElevationGainM != null) {
          const elev = computeElevationGainForRange(waypoints, prevEndKm, endKm)
          if (elev === null) warnOnce('no_elevation_data')
          else if (elev.gain > dto.maxElevationGainM) continue
        }

        if (countRequests >= MAX_COUNT_REQUESTS_PER_GENERATION) {
          budgetHit = true
          break
        }

        const result = await this.countAt(
          adventureId, waypoints, endKm, radiusKm, dto.accommodationTypes,
          googleTypes, excludeSources,
        )
        countRequests += result.requests

        if (!result.determinate) {
          this.logger.warn(
            `[Stage gen] target=${target}km offset=${signed(offset)} INDÉTERMINÉ ` +
            `(0/${googleTypes.length} types ont répondu)`,
          )
          continue
        }

        anyDeterminate = true
        if (result.count >= STAGE_GEN_MIN_ACCOMMODATIONS) {
          this.logger.log(
            `[Stage gen] target=${target}km offset=${signed(offset)} ` +
            `count=${result.count}/${STAGE_GEN_MIN_ACCOMMODATIONS} ` +
            `(google=${result.googleCount} db=${result.dbCount}) → retenu`,
          )
          chosen = endKm
          break
        }
        this.logger.log(
          `[Stage gen] target=${target}km offset=${signed(offset)} ` +
          `count=${result.count}/${STAGE_GEN_MIN_ACCOMMODATIONS} ` +
          `(google=${result.googleCount} db=${result.dbCount}) → rejet`,
        )
      }

      if (chosen === null) {
        stoppedAtKm = prevEndKm
        if (budgetHit) {
          warnings.push({ code: 'request_budget_reached', fromKm: prevEndKm, toKm: totalKm })
        } else {
          // Distinction critique : « rien ici » vs « je n'ai pas pu vérifier ».
          warnings.push({
            code: anyDeterminate ? 'no_accommodation' : 'provider_unavailable',
            fromKm: Math.max(prevEndKm, round1(target - STAGE_GEN_MAX_OFFSET_KM)),
            toKm: Math.min(totalKm, round1(target + STAGE_GEN_MAX_OFFSET_KM)),
          })
        }
        break
      }

      rows.push(makeRow(rows.length, prevEndKm, chosen))
      prevEndKm = chosen
    }

    if (rows.length === MAX_GENERATED_STAGES_PER_CALL && prevEndKm < totalKm - 0.01) {
      stoppedAtKm = prevEndKm
      warnings.push({ code: 'truncated', fromKm: prevEndKm, toKm: totalKm })
    }

    await this.stagesRepo.createMany(rows)

    const spent = this.billing.since(billingBefore)
    if (spent.billable > 0) {
      // Ne doit jamais arriver : le comptage passe par le masque IDs Only. Si ça arrive, un
      // chemin facturable a fui dans la génération — cf. section « Invariant » de la story 17.18.
      this.logger.error(
        `[Stage gen] FACTURATION INATTENDUE : ${spent.billable} appel(s) Pro émis ` +
        `pendant la génération de l'aventure ${adventureId}`,
      )
      warnings.push({ code: 'unexpected_billing', fromKm: null, toKm: null })
      if (process.env['NODE_ENV'] !== 'production') {
        throw new Error(
          `[Stage gen] invariant violé : ${spent.billable} appel Google facturable émis. ` +
          'Le comptage doit rester en masque IDs Only (story 17.18).',
        )
      }
    }

    this.logger.log(
      `[Stage gen] terminé — ${rows.length} étape(s), ${spent.free} appel(s) gratuit(s), ` +
      `${spent.billable} facturé(s)`,
    )

    const stages: AdventureStageResponse[] = await this.stagesService.listStages(adventureId, userId)
    return { stages, created: rows.length, warnings, stoppedAtKm }
  }

  /**
   * Compte les hébergements autour du point situé à `km`.
   *
   * Google en masque **IDs Only** (gratuit) — donc sans coordonnées, donc la zone testée est la
   * **bbox** du rayon et non un disque : un coin est à `r·√2`. C'est assumé (on détecte une
   * présence), mais impose de dire « autour du point » et jamais « dans un rayon de » côté UI.
   *
   * Complété par les lignes déjà en base, qui elles sont filtrées au vrai rayon (`ST_DWithin`).
   * On retient le **max** et non la somme : les deux ensembles se recoupent (même hôtel des deux
   * côtés), donc le max est un minorant — même choix que `density-analyze.processor.ts`.
   */
  private async countAt(
    adventureId: string,
    waypoints: MapWaypoint[],
    km: number,
    radiusKm: number,
    categories: string[],
    googleTypes: string[],
    excludeSources: string[],
  ): Promise<CountResult & { requests: number }> {
    const point = interpolateAtKm(waypoints, km)
    const bbox = bboxAround(point.lat, point.lng, radiusKm)
    const redis = this.redisProvider.getClient()
    const cacheKey =
      `stagegen:count:${round3(bbox.minLat)}:${round3(bbox.minLng)}:` +
      `${round3(bbox.maxLat)}:${round3(bbox.maxLng)}:${[...googleTypes].sort().join(',')}`

    const dbCount = await this.poisRepository.countAccommodationsNearPoint(
      adventureId, point.lat, point.lng, radiusKm * 1000, categories, excludeSources,
    )

    // Aucun type Google (ex. `shelter` seul) : la base fait foi, et le résultat est déterminé.
    if (googleTypes.length === 0) {
      return { count: dbCount, determinate: true, googleCount: 0, dbCount, requests: 0 }
    }

    const cached = await redis.get(cacheKey)
    if (cached !== null) {
      const googleCount = Number(cached)
      return {
        count: Math.max(googleCount, dbCount),
        determinate: true,
        googleCount,
        dbCount,
        requests: 0,
      }
    }

    const { ids, anySucceeded, requests } = await this.googlePlacesProvider.countPlaceIdsForTypes(
      bbox, googleTypes, GOOGLE_COUNT_CONCURRENCY,
    )

    if (!anySucceeded) {
      // On ne met JAMAIS en cache un comptage indéterminé : ce serait figer une panne en donnée.
      return { count: dbCount, determinate: false, googleCount: 0, dbCount, requests }
    }

    await redis.setex(cacheKey, GOOGLE_PLACES_CACHE_TTL, String(ids.size))
    return {
      count: Math.max(ids.size, dbCount),
      determinate: true,
      googleCount: ids.size,
      dbCount,
      requests,
    }
  }
}

/** Ordre d'exploration : cible, puis recul et avance alternés. */
export function candidateOffsets(
  step = STAGE_GEN_STEP_KM,
  maxOffset = STAGE_GEN_MAX_OFFSET_KM,
): number[] {
  const offsets = [0]
  for (let delta = step; delta <= maxOffset; delta += step) {
    offsets.push(-delta, delta)
  }
  return offsets
}

/**
 * Bbox autour d'un point, à `radiusKm` sur chaque axe.
 *
 * La longitude est divisée par `111 · cos(lat)` et non par 111 : à 48° de latitude, un degré de
 * longitude ne fait que ~74 km, donc diviser par 111 sous-tamponnerait l'axe est-ouest (3 km
 * demandés → 2,0 km réels). Le chemin d'affichage (`pois.service.ts`) a ce défaut ; on ne le
 * reproduit pas ici.
 */
export function bboxAround(
  lat: number,
  lng: number,
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDeg = radiusKm / 111
  const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.01) // évite la division par ~0 aux pôles
  const lngDeg = radiusKm / (111 * cosLat)
  return {
    minLat: lat - latDeg,
    maxLat: lat + latDeg,
    minLng: lng - lngDeg,
    maxLng: lng + lngDeg,
  }
}

/** Point interpolé à `km` le long des waypoints (km cumulés, multi-segments). */
export function interpolateAtKm(waypoints: MapWaypoint[], km: number): { lat: number; lng: number } {
  const first = waypoints[0]
  if (km <= first.distKm) return { lat: first.lat, lng: first.lng }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    if (a.distKm <= km && km <= b.distKm) {
      const span = b.distKm - a.distKm
      const t = span === 0 ? 0 : (km - a.distKm) / span
      return { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng) }
    }
  }

  const last = waypoints[waypoints.length - 1]
  return { lat: last.lat, lng: last.lng }
}

const round1 = (v: number): number => Math.round(v * 10) / 10
const round3 = (v: number): number => Math.round(v * 1000) / 1000
const signed = (v: number): string => (v >= 0 ? `+${v}` : String(v))
