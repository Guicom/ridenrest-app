import { NotFoundException, BadRequestException } from '@nestjs/common'
import { StagesService, computeElevationGainForRange, computeEtaMinutes } from './stages.service.js'
import type { StagesRepository } from './stages.repository.js'
import type { AdventuresService } from '../adventures/adventures.service.js'
import type { WeatherService } from '../weather/weather.service.js'
import type { AdventureStage } from '@ridenrest/database'
import type { MapWaypoint } from '@ridenrest/shared'

const makeStage = (
  id: string,
  orderIndex: number,
  startKm: number,
  endKm: number,
  elevationGainM: number | null = null,
  etaMinutes: number | null = null,
  departureTime: Date | null = null,
): AdventureStage => ({
  id,
  adventureId: 'adv-1',
  name: `Stage ${orderIndex + 1}`,
  color: '#f97316',
  orderIndex,
  startKm,
  endKm,
  distanceKm: endKm - startKm,
  elevationGainM,
  etaMinutes,
  departureTime,
  createdAt: new Date(),
  updatedAt: new Date(),
})

// Standard waypoints used across tests: 4 points with elevation
const defaultWaypoints: MapWaypoint[] = [
  { lat: 43.0, lng: -1.0, ele: 200, distKm: 0 },
  { lat: 43.1, lng: -1.1, ele: 350, distKm: 5 },   // +150m gain
  { lat: 43.2, lng: -1.2, ele: 300, distKm: 10 },  // -50m = ignored
  { lat: 43.3, lng: -1.3, ele: 450, distKm: 15 },  // +150m gain
]

const mockAdventure = { id: 'adv-1', avgSpeedKmh: 15 }

const mockStagesRepo = {
  findByAdventureId: jest.fn(),
  findByIdAndAdventureId: jest.fn(),
  findLastByAdventureId: jest.fn(),
  countByAdventureId: jest.fn(),
  findContaining: jest.fn(),
  incrementOrderIndexGt: jest.fn(),
  create: jest.fn(),
  createWithSplit: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  updateMany: jest.fn(),
  findSubsequent: jest.fn(),
  findByIdWithAdventureUserId: jest.fn(),
}

const mockAdventuresService = {
  verifyOwnership: jest.fn(),
  getAdventure: jest.fn().mockResolvedValue(mockAdventure),
  getAdventureWaypoints: jest.fn().mockResolvedValue(defaultWaypoints),
}

const mockWeatherService = {
  getWeatherAtKm: jest.fn(),
  getWeatherAtKmWithEta: jest.fn(),
}

const service = new StagesService(
  mockStagesRepo as unknown as StagesRepository,
  mockAdventuresService as unknown as AdventuresService,
  mockWeatherService as unknown as WeatherService,
)

beforeEach(() => {
  jest.clearAllMocks()
  mockAdventuresService.getAdventure.mockResolvedValue(mockAdventure)
  mockAdventuresService.getAdventureWaypoints.mockResolvedValue(defaultWaypoints)
  mockStagesRepo.findContaining.mockResolvedValue(undefined) // no split by default
  mockStagesRepo.createWithSplit.mockImplementation(({ newStageData }: { newStageData: AdventureStage }) => Promise.resolve(newStageData))
})

// ─── getStageWeather ─────────────────────────────────────────────────────────

const SAMPLE_STAGE_FOR_WEATHER = {
  id: 'stage-1',
  adventureId: 'adv-1',
  endKm: 95.4,
  distanceKm: 45.4,
  departureTime: null as Date | null,
}

const SAMPLE_WEATHER_POINT = {
  forecastAt: '2026-03-22T12:00:00.000Z',
  temperatureC: 14,
  precipitationMmH: 0,
  windSpeedKmh: 12,
  windDirectionDeg: 270,
  iconEmoji: '☁️',
}

describe('getStageWeather', () => {
  it('uses global departureTime (fallback) when stage has no departureTime', async () => {
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(SAMPLE_STAGE_FOR_WEATHER)
    mockWeatherService.getWeatherAtKm.mockResolvedValue(SAMPLE_WEATHER_POINT)

    const result = await service.getStageWeather('stage-1', 'user-1', {
      departureTime: '2026-03-22T08:00:00.000Z',
      speedKmh: 15,
    })

    expect(mockStagesRepo.findByIdWithAdventureUserId).toHaveBeenCalledWith('stage-1', 'user-1')
    expect(mockWeatherService.getWeatherAtKm).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      '2026-03-22T08:00:00.000Z',
      15,
    )
    expect(mockWeatherService.getWeatherAtKmWithEta).not.toHaveBeenCalled()
    expect(result).toEqual(SAMPLE_WEATHER_POINT)
  })

  it('uses stage.departureTime when defined (priority over global)', async () => {
    const stageDepartureTime = new Date('2026-04-08T07:00:00.000Z')
    const stageWithDeparture = {
      ...SAMPLE_STAGE_FOR_WEATHER,
      departureTime: stageDepartureTime,
    }
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(stageWithDeparture)
    mockWeatherService.getWeatherAtKmWithEta.mockResolvedValue(SAMPLE_WEATHER_POINT)

    const result = await service.getStageWeather('stage-1', 'user-1', {
      departureTime: '2026-03-22T08:00:00.000Z',  // global — should be ignored
      speedKmh: 15,
    })

    // Should call getWeatherAtKmWithEta with stage departure + stage distance
    expect(mockWeatherService.getWeatherAtKmWithEta).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      stageDepartureTime.toISOString(),
      45.4,  // stage.distanceKm
      15,
    )
    expect(mockWeatherService.getWeatherAtKm).not.toHaveBeenCalled()
    expect(result).toEqual(SAMPLE_WEATHER_POINT)
  })

  it('falls back to no departure time when neither stage nor global is set', async () => {
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(SAMPLE_STAGE_FOR_WEATHER)
    mockWeatherService.getWeatherAtKm.mockResolvedValue(SAMPLE_WEATHER_POINT)

    const result = await service.getStageWeather('stage-1', 'user-1', {})

    expect(mockWeatherService.getWeatherAtKm).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      undefined,  // no departure time at all
      undefined,
    )
    expect(result).toEqual(SAMPLE_WEATHER_POINT)
  })

  it('throws NotFoundException when stage not found', async () => {
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(null)

    await expect(
      service.getStageWeather('stage-unknown', 'user-1', {}),
    ).rejects.toThrow(NotFoundException)
    expect(mockWeatherService.getWeatherAtKm).not.toHaveBeenCalled()
  })

  it('returns null when weatherService returns null (no waypoints)', async () => {
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(SAMPLE_STAGE_FOR_WEATHER)
    mockWeatherService.getWeatherAtKm.mockResolvedValue(null)

    const result = await service.getStageWeather('stage-1', 'user-1', {})
    expect(result).toBeNull()
  })
})

// ─── computeElevationGainForRange unit tests ───────────────────────────────

describe('computeElevationGainForRange', () => {
  it('returns null when fewer than 2 waypoints with ele in range', () => {
    const wps: MapWaypoint[] = [{ lat: 0, lng: 0, ele: 100, distKm: 5 }]
    expect(computeElevationGainForRange(wps, 0, 10)).toBeNull()
  })

  it('returns null when no waypoints have ele', () => {
    const wps: MapWaypoint[] = [{ lat: 0, lng: 0, distKm: 0 }, { lat: 0, lng: 0, distKm: 5 }]
    expect(computeElevationGainForRange(wps, 0, 10)).toBeNull()
  })

  it('counts only positive deltas', () => {
    // +150 at km5, -50 at km10 → gain = 150
    expect(computeElevationGainForRange(defaultWaypoints, 0, 10)).toBe(150)
  })

  it('counts two positive deltas across full range', () => {
    // +150 at km5, -50 at km10, +150 at km15 → gain = 300
    expect(computeElevationGainForRange(defaultWaypoints, 0, 15)).toBe(300)
  })

  it('filters by distKm range boundaries (inclusive)', () => {
    // km5→350, km10→300 in [5, 10]: delta = -50 → no positive gain → 0
    expect(computeElevationGainForRange(defaultWaypoints, 5, 10)).toBe(0)
  })

  it('returns null when range contains no waypoints', () => {
    expect(computeElevationGainForRange(defaultWaypoints, 20, 30)).toBeNull()
  })
})

describe('computeEtaMinutes', () => {
  it('uses distance only when elevationGainM is null', () => {
    // 15km at 15km/h = 60 min flat
    expect(computeEtaMinutes(15, null)).toBe(60)
  })

  it('adds climb penalty', () => {
    // 10km/15*60 + 150/100*6 = 40 + 9 = 49
    expect(computeEtaMinutes(10, 150)).toBe(49)
  })

  it('uses speedKmh param when provided — differs from default', () => {
    // 10km at 20km/h = 30 min flat (vs 40 min at 15km/h)
    expect(computeEtaMinutes(10, null, 20)).not.toBe(computeEtaMinutes(10, null, 15))
    expect(computeEtaMinutes(10, null, 20)).toBe(30)
  })

  it('uses speedKmh param in eta calculation', () => {
    // 10km at 20km/h + 150m D+ → 30 + 9 = 39
    expect(computeEtaMinutes(10, 150, 20)).toBe(39)
  })
})

// ─── createStage (normal case) ────────────────────────────────────────────────

describe('createStage — normal case', () => {
  it('sets startKm=0 when no previous stages', async () => {
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 50)
    mockStagesRepo.create.mockResolvedValue(created)

    const result = await service.createStage('adv-1', 'user-1', {
      name: 'Stage 1',
      endKm: 50,
      color: '#f97316',
    })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ startKm: 0, endKm: 50, distanceKm: 50, orderIndex: 0 }),
    )
    expect(result.startKm).toBe(0)
  })

  it('sets startKm = last stage endKm', async () => {
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(makeStage('s1', 0, 0, 50))
    mockStagesRepo.countByAdventureId.mockResolvedValue(1)
    const created = makeStage('s2', 1, 50, 100)
    mockStagesRepo.create.mockResolvedValue(created)

    const result = await service.createStage('adv-1', 'user-1', {
      name: 'Stage 2',
      endKm: 100,
      color: '#3b82f6',
    })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ startKm: 50, endKm: 100, distanceKm: 50, orderIndex: 1 }),
    )
    expect(result.startKm).toBe(50)
  })

  it('throws BadRequestException when endKm <= previous stage endKm', async () => {
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(makeStage('s1', 0, 0, 100))
    mockStagesRepo.countByAdventureId.mockResolvedValue(1)

    await expect(
      service.createStage('adv-1', 'user-1', {
        name: 'Bad Stage',
        endKm: 80,
        color: '#f97316',
      }),
    ).rejects.toThrow(BadRequestException)
    expect(mockStagesRepo.create).not.toHaveBeenCalled()
  })

  it('computes elevationGainM and etaMinutes from waypoints (startKm=0, endKm=10)', async () => {
    // Waypoints: [0→200ele, 5→350ele(+150), 10→300ele(-50 ignored)]
    // elevationGainM = 150, distanceKm = 10
    // etaMinutes = round((10/15)*60 + (150/100)*6) = round(40 + 9) = 49
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 10, 150, 49)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', { name: 'S1', endKm: 10, color: '#f97316' })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ elevationGainM: 150, etaMinutes: 49 }),
    )
  })

  it('sets elevationGainM=null and etaMinutes from distance only when no ele data', async () => {
    const noEleWaypoints: MapWaypoint[] = [
      { lat: 0, lng: 0, distKm: 0 },
      { lat: 0, lng: 0, distKm: 5 },
    ]
    mockAdventuresService.getAdventureWaypoints.mockResolvedValue(noEleWaypoints)
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    // etaMinutes = round((5/15)*60 + 0) = round(20) = 20
    const created = makeStage('s1', 0, 0, 5, null, 20)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', { name: 'S1', endKm: 5, color: '#f97316' })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ elevationGainM: null, etaMinutes: 20 }),
    )
  })

  it('uses adventure avgSpeedKmh when computing etaMinutes', async () => {
    mockAdventuresService.getAdventure.mockResolvedValue({ ...mockAdventure, avgSpeedKmh: 20 })
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 10)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', { name: 'S1', endKm: 10, color: '#f97316' })

    // 10km at 20km/h + 150m D+ → 30 + 9 = 39
    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ etaMinutes: 39 }),
    )
  })
})

// ─── createStage (split case) ─────────────────────────────────────────────────

describe('createStage — split case', () => {
  it('splits existing stage when endKm falls inside it', async () => {
    // Existing stage: [0, 100] at orderIndex 0
    // New stage: endKm=40, splits into [0,40] at idx 0 and [40,100] at idx 1
    // defaultWaypoints go to km15 — all fall in [0,40], so elevationGainM for new stage = 300
    // remainder [40,100]: no waypoints → elevationGainM = null
    // etaMinutes new: round((40/15)*60 + (300/100)*6) = round(160+18) = 178
    // etaMinutes remainder: round((60/15)*60 + 0) = 240
    const splitTarget = makeStage('s1', 0, 0, 100)
    mockStagesRepo.findContaining.mockResolvedValue(splitTarget)
    const newStage = makeStage('new', 0, 0, 40, 300, 178)
    mockStagesRepo.createWithSplit.mockResolvedValue(newStage)

    const result = await service.createStage('adv-1', 'user-1', {
      name: 'Split Stage',
      endKm: 40,
      color: '#f97316',
    })

    expect(mockStagesRepo.createWithSplit).toHaveBeenCalledWith(
      expect.objectContaining({
        adventureId: 'adv-1',
        splitTargetId: 's1',
        splitTargetOrderIndex: 0,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        newStageData: expect.objectContaining({
          orderIndex: 0,
          startKm: 0,
          endKm: 40,
          distanceKm: 40,
          elevationGainM: 300,
          etaMinutes: 178,
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        remainderUpdate: expect.objectContaining({
          orderIndex: 1,
          startKm: 40,
          distanceKm: 60,
          elevationGainM: null,
          etaMinutes: 240,
        }),
      }),
    )
    expect(result.id).toBe('new')
  })

  it('does not call findLastByAdventureId or countByAdventureId in split case', async () => {
    const splitTarget = makeStage('s1', 0, 0, 100)
    mockStagesRepo.findContaining.mockResolvedValue(splitTarget)
    mockStagesRepo.createWithSplit.mockResolvedValue(makeStage('new', 0, 0, 40))

    await service.createStage('adv-1', 'user-1', { name: 'Split', endKm: 40, color: '#f97316' })

    expect(mockStagesRepo.findLastByAdventureId).not.toHaveBeenCalled()
    expect(mockStagesRepo.countByAdventureId).not.toHaveBeenCalled()
    expect(mockStagesRepo.incrementOrderIndexGt).not.toHaveBeenCalled()
    expect(mockStagesRepo.create).not.toHaveBeenCalled()
  })
})

// ─── updateStage ─────────────────────────────────────────────────────────────

describe('updateStage', () => {
  it('only updates name and color, not start/end km', async () => {
    const stage = makeStage('s1', 0, 0, 50)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage)
    mockStagesRepo.update.mockResolvedValue({ ...stage, name: 'New Name', color: '#22c55e' })

    const result = await service.updateStage('adv-1', 's1', 'user-1', {
      name: 'New Name',
      color: '#22c55e',
    })

    expect(mockStagesRepo.update).toHaveBeenCalledWith('s1', { name: 'New Name', color: '#22c55e' })
    expect(result.name).toBe('New Name')
    expect(result.startKm).toBe(0)
    expect(result.endKm).toBe(50)
  })

  it('throws NotFoundException when stage not found', async () => {
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(undefined)

    await expect(
      service.updateStage('adv-1', 's-unknown', 'user-1', { name: 'X' }),
    ).rejects.toThrow(NotFoundException)
    expect(mockStagesRepo.update).not.toHaveBeenCalled()
  })

  it('updateStage with endKm updates distanceKm and computes elevationGainM+etaMinutes', async () => {
    // Stage [0, 50] → endKm becomes 10
    // elevationGainM for [0, 10] = 150 (km5: +150, km10: -50 ignored)
    // etaMinutes = round((10/15)*60 + (150/100)*6) = 49
    const stage = makeStage('s1', 0, 0, 50)
    const updated = makeStage('s1', 0, 0, 10, 150, 49)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValueOnce(stage)
    mockStagesRepo.findSubsequent.mockResolvedValue([])
    mockStagesRepo.update.mockResolvedValue(updated)

    const result = await service.updateStage('adv-1', 's1', 'user-1', { endKm: 10 })

    expect(mockStagesRepo.update).toHaveBeenCalledWith('s1', expect.objectContaining({
      endKm: 10,
      distanceKm: 10,
      elevationGainM: 150,
      etaMinutes: 49,
    }))
    expect(result.endKm).toBe(10)
  })

  it('updateStage with endKm cascades elevationGainM and etaMinutes to subsequent stages', async () => {
    const stage1 = makeStage('s1', 0, 0, 50)
    const stage2 = makeStage('s2', 1, 50, 100)
    const stage3 = makeStage('s3', 2, 100, 150)
    const updatedStage1 = makeStage('s1', 0, 0, 10, 150, 49)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValueOnce(stage1)
    mockStagesRepo.update.mockResolvedValue(updatedStage1)
    mockStagesRepo.findSubsequent.mockResolvedValue([stage2, stage3])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.updateStage('adv-1', 's1', 'user-1', { endKm: 10 })

    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's2', startKm: 10, distanceKm: 90, elevationGainM: 150 }),
      expect.objectContaining({ id: 's3', startKm: 100, distanceKm: 50, elevationGainM: null }),
    ])
  })

  it('updateStage throws BadRequestException if endKm <= stage.startKm', async () => {
    const stage = makeStage('s1', 0, 20, 50)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage)
    mockStagesRepo.findSubsequent.mockResolvedValue([])

    await expect(
      service.updateStage('adv-1', 's1', 'user-1', { endKm: 10 }),
    ).rejects.toThrow(BadRequestException)
    expect(mockStagesRepo.update).not.toHaveBeenCalled()
  })

  it('updateStage throws BadRequestException if endKm >= next stage endKm', async () => {
    const stage1 = makeStage('s1', 0, 0, 50)
    const stage2 = makeStage('s2', 1, 50, 100)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage1)
    mockStagesRepo.findSubsequent.mockResolvedValue([stage2])

    await expect(
      service.updateStage('adv-1', 's1', 'user-1', { endKm: 100 }),
    ).rejects.toThrow(BadRequestException)
    expect(mockStagesRepo.update).not.toHaveBeenCalled()
  })
})

// ─── deleteStage ─────────────────────────────────────────────────────────────

describe('deleteStage', () => {
  it('recalculates startKm, distanceKm, elevationGainM and etaMinutes for remaining stages', async () => {
    const stage1 = makeStage('s1', 0, 0, 50)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage1)
    mockStagesRepo.delete.mockResolvedValue(undefined)
    const stage2 = makeStage('s2', 1, 50, 100)
    const stage3 = makeStage('s3', 2, 100, 150)
    mockStagesRepo.findByAdventureId.mockResolvedValue([stage2, stage3])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.deleteStage('adv-1', 's1', 'user-1')

    expect(mockStagesRepo.delete).toHaveBeenCalledWith('s1')
    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's2', startKm: 0, distanceKm: 100, orderIndex: 0, elevationGainM: 300 }),
      expect.objectContaining({ id: 's3', startKm: 100, distanceKm: 50, orderIndex: 1, elevationGainM: null }),
    ])
  })

  it('throws NotFoundException when stage not found', async () => {
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(undefined)

    await expect(
      service.deleteStage('adv-1', 's-unknown', 'user-1'),
    ).rejects.toThrow(NotFoundException)
    expect(mockStagesRepo.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when adventure not owned by user', async () => {
    mockAdventuresService.getAdventure.mockRejectedValue(new NotFoundException('Adventure not found'))

    await expect(
      service.deleteStage('adv-1', 's1', 'other-user'),
    ).rejects.toThrow(NotFoundException)
  })
})

// ─── recomputeAllEtasForAdventure ─────────────────────────────────────────────

describe('recomputeAllEtasForAdventure', () => {
  it('recomputes etaMinutes for all stages using stored elevationGainM and new speedKmh', async () => {
    // recomputeAllEtasForAdventure uses the stored elevationGainM (not re-derived from waypoints)
    // stage1 [0,15] elevationGainM=300: etaMinutes at 20km/h = round((15/20)*60 + (300/100)*6) = round(45+18) = 63
    // stage2 [15,50] elevationGainM=null: etaMinutes at 20km/h = round((35/20)*60) = round(105) = 105
    const stage1 = makeStage('s1', 0, 0, 15, 300)
    const stage2 = makeStage('s2', 1, 15, 50, null)
    mockStagesRepo.findByAdventureId.mockResolvedValue([stage1, stage2])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.recomputeAllEtasForAdventure('adv-1', 20)

    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's1', etaMinutes: 63 }),
      expect.objectContaining({ id: 's2', etaMinutes: 105 }),
    ])
  })

  it('returns early without calling updateMany when no stages exist', async () => {
    mockStagesRepo.findByAdventureId.mockResolvedValue([])

    await service.recomputeAllEtasForAdventure('adv-1', 20)

    expect(mockStagesRepo.updateMany).not.toHaveBeenCalled()
    expect(mockAdventuresService.getAdventureWaypoints).not.toHaveBeenCalled()
  })
})
