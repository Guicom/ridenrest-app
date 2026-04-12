import { Injectable, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common'
import { StagesRepository } from './stages.repository.js'
import { AdventuresService } from '../adventures/adventures.service.js'
import { WeatherService } from '../weather/weather.service.js'
import type { CreateStageDto } from './dto/create-stage.dto.js'
import type { UpdateStageDto } from './dto/update-stage.dto.js'
import type { GetStageWeatherDto } from './dto/get-stage-weather.dto.js'
import type { AdventureStageResponse, MapWaypoint, StageWeatherPoint } from '@ridenrest/shared'
import type { AdventureStage } from '@ridenrest/database'

/** Compute D+ (elevation gain) and D- (elevation loss) for waypoints in the [startKm, endKm] range.
 *  Returns null if no waypoints in range have elevation data. */
export function computeElevationGainForRange(
  waypoints: MapWaypoint[],
  startKm: number,
  endKm: number,
): { gain: number; loss: number } | null {
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
  let loss = 0
  for (let i = 1; i < rangeWps.length; i++) {
    const delta = rangeWps[i].ele - rangeWps[i - 1].ele
    if (delta > 0) gain += delta
    else loss += Math.abs(delta)
  }
  return { gain: Math.round(gain), loss: Math.round(loss) }
}

/** Compute ETA in minutes based on distance and speed only.
 *  Elevation gain is intentionally ignored — the user controls D+ impact via the per-stage speed. */
export function computeEtaMinutes(distanceKm: number, elevationGainM: number | null, speedKmh = 15): number {
  const flatMinutes = (distanceKm / speedKmh) * 60
  return Math.round(flatMinutes)
}

@Injectable()
export class StagesService {
  constructor(
    private readonly stagesRepo: StagesRepository,
    @Inject(forwardRef(() => AdventuresService)) private readonly adventuresService: AdventuresService,
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
    const adventure = await this.adventuresService.getAdventure(adventureId, userId)
    const speedKmh = adventure.avgSpeedKmh

    const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)

    const stageSpeedKmh = dto.speedKmh ?? null
    const stagePauseHours = dto.pauseHours ?? null
    const effectiveSpeed = dto.speedKmh ?? speedKmh
    const pauseMinutes = Math.round((stagePauseHours ?? 0) * 60)

    // Split detection: check if dto.endKm falls inside an existing stage
    const splitTarget = await this.stagesRepo.findContaining(adventureId, dto.endKm)
    if (splitTarget) {
      const newDistKm = dto.endKm - splitTarget.startKm
      const newElev = computeElevationGainForRange(waypoints, splitTarget.startKm, dto.endKm)
      const newRidingEta = computeEtaMinutes(newDistKm, newElev?.gain ?? null, effectiveSpeed)

      const remDistKm = splitTarget.endKm - dto.endKm
      const remElev = computeElevationGainForRange(waypoints, dto.endKm, splitTarget.endKm)
      const remSpeed = splitTarget.speedKmh ?? speedKmh
      const remPause = Math.round((splitTarget.pauseHours ?? 0) * 60)
      const remRidingEta = computeEtaMinutes(remDistKm, remElev?.gain ?? null, remSpeed)

      const newStage = await this.stagesRepo.createWithSplit({
        adventureId,
        splitTargetId: splitTarget.id,
        splitTargetOrderIndex: splitTarget.orderIndex,
        newStageData: {
          adventureId,
          name: dto.name,
          color: dto.color,
          orderIndex: splitTarget.orderIndex,
          startKm: splitTarget.startKm,
          endKm: dto.endKm,
          distanceKm: newDistKm,
          elevationGainM: newElev?.gain ?? null,
          elevationLossM: newElev?.loss ?? null,
          etaMinutes: newRidingEta + pauseMinutes,
          speedKmh: stageSpeedKmh,
          pauseHours: stagePauseHours,
          ...(dto.departureTime ? { departureTime: new Date(dto.departureTime) } : {}),
        },
        remainderUpdate: {
          orderIndex: splitTarget.orderIndex + 1,
          startKm: dto.endKm,
          distanceKm: remDistKm,
          elevationGainM: remElev?.gain ?? null,
          elevationLossM: remElev?.loss ?? null,
          etaMinutes: remRidingEta + remPause,
        },
      })

      return this.toResponse(newStage)
    }

    // Normal case: append after last stage
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

    const elev = computeElevationGainForRange(waypoints, startKm, dto.endKm)
    const ridingEta = computeEtaMinutes(distanceKm, elev?.gain ?? null, effectiveSpeed)
    const etaMinutes = ridingEta + pauseMinutes

    const stage = await this.stagesRepo.create({
      adventureId,
      name: dto.name,
      color: dto.color,
      orderIndex,
      startKm,
      endKm: dto.endKm,
      distanceKm,
      elevationGainM: elev?.gain ?? null,
      elevationLossM: elev?.loss ?? null,
      etaMinutes,
      speedKmh: stageSpeedKmh,
      pauseHours: stagePauseHours,
      ...(dto.departureTime ? { departureTime: new Date(dto.departureTime) } : {}),
    })

    return this.toResponse(stage)
  }

  async updateStage(
    adventureId: string,
    stageId: string,
    userId: string,
    dto: UpdateStageDto,
  ): Promise<AdventureStageResponse> {
    const adventure = await this.adventuresService.getAdventure(adventureId, userId)
    const speedKmh = adventure.avgSpeedKmh

    const stage = await this.stagesRepo.findByIdAndAdventureId(stageId, adventureId)
    if (!stage) throw new NotFoundException('Stage not found')

    // Handle departureTime update (can be set independently of endKm)
    const departureTimeUpdate = dto.departureTime !== undefined
      ? { departureTime: dto.departureTime ? new Date(dto.departureTime) : null }
      : {}
    const speedUpdate = dto.speedKmh !== undefined ? { speedKmh: dto.speedKmh ?? null } : {}
    const pauseUpdate = dto.pauseHours !== undefined ? { pauseHours: dto.pauseHours ?? null } : {}

    // Determine if ETA needs recalculation (speed or pause changed)
    const needsEtaRecompute = dto.speedKmh !== undefined || dto.pauseHours !== undefined

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
      const elev = computeElevationGainForRange(waypoints, stage.startKm, dto.endKm)
      const effectiveSpeed = (dto.speedKmh !== undefined ? dto.speedKmh : stage.speedKmh) ?? speedKmh
      const effectivePause = (dto.pauseHours !== undefined ? dto.pauseHours : stage.pauseHours) ?? 0
      const ridingEta = computeEtaMinutes(newDistanceKm, elev?.gain ?? null, effectiveSpeed)
      const etaMinutes = ridingEta + Math.round(effectivePause * 60)

      const updated = await this.stagesRepo.update(stageId, {
        endKm: dto.endKm,
        distanceKm: newDistanceKm,
        elevationGainM: elev?.gain ?? null,
        elevationLossM: elev?.loss ?? null,
        etaMinutes,
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...departureTimeUpdate,
        ...speedUpdate,
        ...pauseUpdate,
      })

      // Cascade: update subsequent stages' startKm (endKm stays unchanged)
      if (subsequentStages.length > 0) {
        let prevEndKm = dto.endKm
        const updates = subsequentStages.map((s) => {
          const newStartKm = prevEndKm
          const cascadeDistKm = s.endKm - newStartKm
          const cascadeElev = computeElevationGainForRange(waypoints, newStartKm, s.endKm)
          const cascadeSpeed = s.speedKmh ?? speedKmh
          const cascadePause = Math.round((s.pauseHours ?? 0) * 60)
          const cascadeEta = computeEtaMinutes(cascadeDistKm, cascadeElev?.gain ?? null, cascadeSpeed) + cascadePause
          prevEndKm = s.endKm
          return {
            id: s.id,
            startKm: newStartKm,
            distanceKm: cascadeDistKm,
            orderIndex: s.orderIndex,
            elevationGainM: cascadeElev?.gain ?? null,
            elevationLossM: cascadeElev?.loss ?? null,
            etaMinutes: cascadeEta,
          }
        })
        await this.stagesRepo.updateMany(updates)
      }

      return this.toResponse(updated)
    }

    // No endKm change — but may need ETA recompute if speed/pause changed
    if (needsEtaRecompute) {
      const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
      const elev = computeElevationGainForRange(waypoints, stage.startKm, stage.endKm)
      const effectiveSpeed = (dto.speedKmh !== undefined ? dto.speedKmh : stage.speedKmh) ?? speedKmh
      const effectivePause = (dto.pauseHours !== undefined ? dto.pauseHours : stage.pauseHours) ?? 0
      const ridingEta = computeEtaMinutes(stage.distanceKm, elev?.gain ?? null, effectiveSpeed)
      const etaMinutes = ridingEta + Math.round(effectivePause * 60)

      const updated = await this.stagesRepo.update(stageId, {
        etaMinutes,
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.color !== undefined ? { color: dto.color } : {}),
        ...departureTimeUpdate,
        ...speedUpdate,
        ...pauseUpdate,
      })
      return this.toResponse(updated)
    }

    const updated = await this.stagesRepo.update(stageId, {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
      ...departureTimeUpdate,
      ...speedUpdate,
      ...pauseUpdate,
    })
    return this.toResponse(updated)
  }

  async deleteStage(
    adventureId: string,
    stageId: string,
    userId: string,
  ): Promise<{ deleted: boolean }> {
    const adventure = await this.adventuresService.getAdventure(adventureId, userId)
    const speedKmh = adventure.avgSpeedKmh

    const stage = await this.stagesRepo.findByIdAndAdventureId(stageId, adventureId)
    if (!stage) throw new NotFoundException('Stage not found')

    await this.stagesRepo.delete(stageId)

    // Recalculate start_km, distanceKm, D+, ETA and normalize orderIndex for remaining stages (cascade)
    const remaining = await this.stagesRepo.findByAdventureId(adventureId)
    const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
    const updates: Array<{ id: string; startKm: number; distanceKm: number; orderIndex: number; elevationGainM: number | null; elevationLossM: number | null; etaMinutes: number }> = []
    let prevEndKm = 0
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]
      const newStartKm = prevEndKm
      const newDistKm = s.endKm - newStartKm
      const elev = computeElevationGainForRange(waypoints, newStartKm, s.endKm)
      const stageSpeed = s.speedKmh ?? speedKmh
      const stagePause = Math.round((s.pauseHours ?? 0) * 60)
      const eta = computeEtaMinutes(newDistKm, elev?.gain ?? null, stageSpeed) + stagePause
      updates.push({ id: s.id, startKm: newStartKm, distanceKm: newDistKm, orderIndex: i, elevationGainM: elev?.gain ?? null, elevationLossM: elev?.loss ?? null, etaMinutes: eta })
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

    // Priority: stage.departureTime (per-stage) > dto.departureTime (global from query param)
    const effectiveDepartureTime = stage.departureTime?.toISOString() ?? dto.departureTime
    // Priority: stage.speedKmh (per-stage) > dto.speedKmh (global from query param) > 15 km/h default
    const effectiveSpeedKmh = stage.speedKmh ?? dto.speedKmh ?? 15
    // Compute an "effective slower speed" that integrates pause time into the ETA
    // so the weather forecast reflects the real arrival time (riding + pauses)
    const pauseHours = stage.pauseHours ?? 0
    let weatherSpeedKmh = effectiveSpeedKmh
    if (pauseHours > 0 && stage.distanceKm > 0) {
      const ridingHours = stage.distanceKm / effectiveSpeedKmh
      weatherSpeedKmh = stage.distanceKm / (ridingHours + pauseHours)
    }

    if (stage.departureTime) {
      // When stage has its own departure time, compute ETA from stage start (not km 0)
      // ETA = stage.departureTime + (stage.distanceKm / weatherSpeedKmh) * 3600000ms
      return this.weatherService.getWeatherAtKmWithEta(
        stage.adventureId,
        stage.endKm,
        effectiveDepartureTime!,
        stage.distanceKm,
        weatherSpeedKmh,
      )
    }

    // Fallback: use global departure time with original km-0-based calculation
    return this.weatherService.getWeatherAtKm(
      stage.adventureId,
      stage.endKm,
      effectiveDepartureTime,
      weatherSpeedKmh,
    )
  }

  async recomputeAllEtasForAdventure(adventureId: string, speedKmh: number): Promise<void> {
    const stages = await this.stagesRepo.findByAdventureId(adventureId)
    if (stages.length === 0) return
    const updates = stages.map((s) => {
      const stageSpeed = s.speedKmh ?? speedKmh
      const stagePause = Math.round((s.pauseHours ?? 0) * 60)
      return {
        id: s.id,
        startKm: s.startKm,
        distanceKm: s.distanceKm,
        orderIndex: s.orderIndex,
        elevationGainM: s.elevationGainM ?? null,
        etaMinutes: computeEtaMinutes(s.distanceKm, s.elevationGainM ?? null, stageSpeed) + stagePause,
      }
    })
    await this.stagesRepo.updateMany(updates)
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
      elevationLossM: s.elevationLossM ?? null,
      etaMinutes: s.etaMinutes ?? null,
      departureTime: s.departureTime?.toISOString() ?? null,
      speedKmh: s.speedKmh ?? null,
      pauseHours: s.pauseHours ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }
  }
}
