import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { StagesRepository } from './stages.repository.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import { WeatherService } from '../weather/weather.service.js'
import type { CreateStageDto } from './dto/create-stage.dto.js'
import type { UpdateStageDto } from './dto/update-stage.dto.js'
import type { GetStageWeatherDto } from './dto/get-stage-weather.dto.js'
import type { AdventureStageResponse, MapWaypoint, StageWeatherPoint } from '@ridenrest/shared'
import type { AdventureStage } from '@ridenrest/database'

/** Compute D+ (elevation gain) for waypoints in the [startKm, endKm] range.
 *  Returns null if no waypoints in range have elevation data. */
export function computeElevationGainForRange(
  waypoints: MapWaypoint[],
  startKm: number,
  endKm: number,
): number | null {
  const rangeWps = waypoints
    .filter(
      (wp): wp is MapWaypoint & { ele: number } =>
        wp.ele !== null &&
        wp.ele !== undefined &&
        wp.distKm >= startKm &&
        wp.distKm <= endKm,
    )
    .sort((a, b) => a.distKm - b.distKm)

  if (rangeWps.length < 2) return null  // Need at least 2 points with ele

  let gain = 0
  for (let i = 1; i < rangeWps.length; i++) {
    const delta = rangeWps[i].ele - rangeWps[i - 1].ele
    if (delta > 0) gain += delta
  }
  return Math.round(gain)  // Round to whole meters
}

/** Compute ETA in minutes using Naismith's rule approximation.
 *  Default pace: 15 km/h flat. Elevation: +6 min per 100m D+. */
export function computeEtaMinutes(distanceKm: number, elevationGainM: number | null): number {
  const flatMinutes = (distanceKm / 15) * 60
  const climbMinutes = ((elevationGainM ?? 0) / 100) * 6
  return Math.round(flatMinutes + climbMinutes)
}

@Injectable()
export class StagesService {
  constructor(
    private readonly stagesRepo: StagesRepository,
    private readonly adventuresService: AdventuresService,
    private readonly weatherService: WeatherService,
  ) {}

  async listStages(adventureId: string, userId: string): Promise<AdventureStageResponse[]> {
    await this.adventuresService.verifyOwnership(adventureId, userId)
    const stages = await this.stagesRepo.findByAdventureId(adventureId)
    return stages.map((s) => this.toResponse(s))
  }

  async createStage(
    adventureId: string,
    userId: string,
    dto: CreateStageDto,
  ): Promise<AdventureStageResponse> {
    await this.adventuresService.verifyOwnership(adventureId, userId)

    const last = await this.stagesRepo.findLastByAdventureId(adventureId)
    const startKm = last?.endKm ?? 0
    const count = await this.stagesRepo.countByAdventureId(adventureId)
    const orderIndex = count // 0-based, append at end
    const distanceKm = dto.endKm - startKm
    if (distanceKm <= 0) {
      throw new BadRequestException(
        `endKm (${dto.endKm}) must be greater than the previous stage end position (${startKm})`,
      )
    }

    const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
    const elevationGainM = computeElevationGainForRange(waypoints, startKm, dto.endKm)
    const etaMinutes = computeEtaMinutes(distanceKm, elevationGainM)

    const stage = await this.stagesRepo.create({
      adventureId,
      name: dto.name,
      color: dto.color,
      orderIndex,
      startKm,
      endKm: dto.endKm,
      distanceKm,
      elevationGainM,
      etaMinutes,
    })

    return this.toResponse(stage)
  }

  async updateStage(
    adventureId: string,
    stageId: string,
    userId: string,
    dto: UpdateStageDto,
  ): Promise<AdventureStageResponse> {
    await this.adventuresService.verifyOwnership(adventureId, userId)

    const stage = await this.stagesRepo.findByIdAndAdventureId(stageId, adventureId)
    if (!stage) throw new NotFoundException('Stage not found')

    if (dto.endKm !== undefined) {
      if (dto.endKm <= stage.startKm) {
        throw new BadRequestException('endKm must be > startKm')
      }

      // Fetch subsequent stages before update to validate and cascade
      const subsequentStages = await this.stagesRepo.findSubsequent(adventureId, stage.orderIndex)
      if (subsequentStages.length > 0 && dto.endKm >= subsequentStages[0].endKm) {
        throw new BadRequestException('endKm must be less than the next stage endKm')
      }

      const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
      const newDistanceKm = dto.endKm - stage.startKm
      const elevationGainM = computeElevationGainForRange(waypoints, stage.startKm, dto.endKm)
      const etaMinutes = computeEtaMinutes(newDistanceKm, elevationGainM)

      const updated = await this.stagesRepo.update(stageId, {
        endKm: dto.endKm,
        distanceKm: newDistanceKm,
        elevationGainM,
        etaMinutes,
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
      })

      // Cascade: update subsequent stages' startKm (endKm stays unchanged)
      if (subsequentStages.length > 0) {
        let prevEndKm = dto.endKm
        const updates = subsequentStages.map((s) => {
          const newStartKm = prevEndKm
          const cascadeDistKm = s.endKm - newStartKm
          const cascadeElevGain = computeElevationGainForRange(waypoints, newStartKm, s.endKm)
          const cascadeEta = computeEtaMinutes(cascadeDistKm, cascadeElevGain)
          prevEndKm = s.endKm
          return {
            id: s.id,
            startKm: newStartKm,
            distanceKm: cascadeDistKm,
            orderIndex: s.orderIndex,
            elevationGainM: cascadeElevGain,
            etaMinutes: cascadeEta,
          }
        })
        await this.stagesRepo.updateMany(updates)
      }

      return this.toResponse(updated)
    }

    const updated = await this.stagesRepo.update(stageId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
    })
    return this.toResponse(updated)
  }

  async deleteStage(
    adventureId: string,
    stageId: string,
    userId: string,
  ): Promise<{ deleted: boolean }> {
    await this.adventuresService.verifyOwnership(adventureId, userId)

    const stage = await this.stagesRepo.findByIdAndAdventureId(stageId, adventureId)
    if (!stage) throw new NotFoundException('Stage not found')

    await this.stagesRepo.delete(stageId)

    // Recalculate start_km, distanceKm, D+, ETA and normalize orderIndex for remaining stages (cascade)
    const remaining = await this.stagesRepo.findByAdventureId(adventureId)
    const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
    const updates: Array<{ id: string; startKm: number; distanceKm: number; orderIndex: number; elevationGainM: number | null; etaMinutes: number }> = []
    let prevEndKm = 0
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]
      const newStartKm = prevEndKm
      const newDistKm = s.endKm - newStartKm
      const elevGain = computeElevationGainForRange(waypoints, newStartKm, s.endKm)
      const eta = computeEtaMinutes(newDistKm, elevGain)
      updates.push({ id: s.id, startKm: newStartKm, distanceKm: newDistKm, orderIndex: i, elevationGainM: elevGain, etaMinutes: eta })
      prevEndKm = s.endKm
    }
    await this.stagesRepo.updateMany(updates)

    return { deleted: true }
  }

  async getStageWeather(
    stageId: string,
    userId: string,
    dto: GetStageWeatherDto,
  ): Promise<StageWeatherPoint | null> {
    const stage = await this.stagesRepo.findByIdWithAdventureUserId(stageId, userId)
    if (!stage) throw new NotFoundException('Stage not found')
    return this.weatherService.getWeatherAtKm(
      stage.adventureId,
      stage.endKm,
      dto.departureTime,
      dto.speedKmh,
    )
  }

  private toResponse(s: AdventureStage): AdventureStageResponse {
    return {
      id: s.id,
      adventureId: s.adventureId,
      name: s.name,
      color: s.color,
      orderIndex: s.orderIndex,
      startKm: s.startKm,
      endKm: s.endKm,
      distanceKm: s.distanceKm,
      elevationGainM: s.elevationGainM ?? null,
      etaMinutes: s.etaMinutes ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  }
}
