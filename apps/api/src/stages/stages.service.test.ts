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
  speedKmh: number | null = null,
  pauseHours: number | null = null,
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
  elevationLossM: null,
  etaMinutes,
  departureTime,
  speedKmh,
  pauseHours,
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
  speedKmh: null as number | null,
  pauseHours: null as number | null,
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

  it('falls back to no departure time and default 15km/h when neither stage nor global is set', async () => {
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(SAMPLE_STAGE_FOR_WEATHER)
    mockWeatherService.getWeatherAtKm.mockResolvedValue(SAMPLE_WEATHER_POINT)

    const result = await service.getStageWeather('stage-1', 'user-1', {})

    expect(mockWeatherService.getWeatherAtKm).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      undefined,  // no departure time at all
      15,         // default speed fallback
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

  it('uses stage.speedKmh when defined (priority over dto.speedKmh)', async () => {
    const stageWithSpeed = {
      ...SAMPLE_STAGE_FOR_WEATHER,
      speedKmh: 20,
    }
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(stageWithSpeed)
    mockWeatherService.getWeatherAtKm.mockResolvedValue(SAMPLE_WEATHER_POINT)

    await service.getStageWeather('stage-1', 'user-1', {
      departureTime: '2026-03-22T08:00:00.000Z',
      speedKmh: 15, // global — should be overridden by stage.speedKmh
    })

    // Should use stage.speedKmh (20) not dto.speedKmh (15)
    expect(mockWeatherService.getWeatherAtKm).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      '2026-03-22T08:00:00.000Z',
      20,
    )
  })

  it('adds pauseHours to ETA via effective slower speed (no departureTime branch)', async () => {
    // distanceKm=45.4, speedKmh=20, pauseHours=2
    // ridingHours = 45.4/20 = 2.27h, totalHours = 2.27+2 = 4.27h
    // effectiveSpeed = 45.4/4.27 ≈ 10.632...
    const stageWithPause = {
      ...SAMPLE_STAGE_FOR_WEATHER,
      speedKmh: 20,
      pauseHours: 2,
    }
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(stageWithPause)
    mockWeatherService.getWeatherAtKm.mockResolvedValue(SAMPLE_WEATHER_POINT)

    await service.getStageWeather('stage-1', 'user-1', {
      departureTime: '2026-03-22T08:00:00.000Z',
      speedKmh: 15,
    })

    // effectiveSpeed = 45.4 / (45.4/20 + 2) = 45.4 / 4.27 ≈ 10.632
    expect(mockWeatherService.getWeatherAtKm).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      '2026-03-22T08:00:00.000Z',
      expect.closeTo(10.632, 2),
    )
  })

  it('adds pauseHours to ETA via effective slower speed (with departureTime branch)', async () => {
    const stageDepartureTime = new Date('2026-04-08T07:00:00.000Z')
    const stageWithDepartureAndPause = {
      ...SAMPLE_STAGE_FOR_WEATHER,
      departureTime: stageDepartureTime,
      speedKmh: 18,
      pauseHours: 1.5,
    }
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(stageWithDepartureAndPause)
    mockWeatherService.getWeatherAtKmWithEta.mockResolvedValue(SAMPLE_WEATHER_POINT)

    await service.getStageWeather('stage-1', 'user-1', {
      speedKmh: 15,
    })

    // effectiveSpeed = 45.4 / (45.4/18 + 1.5) = 45.4 / (2.5222 + 1.5) = 45.4 / 4.0222 ≈ 11.286
    expect(mockWeatherService.getWeatherAtKmWithEta).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      stageDepartureTime.toISOString(),
      45.4,
      expect.closeTo(11.286, 2),
    )
  })

  it('does not adjust speed when pauseHours is 0', async () => {
    const stageWithZeroPause = {
      ...SAMPLE_STAGE_FOR_WEATHER,
      speedKmh: 20,
      pauseHours: 0,
    }
    mockStagesRepo.findByIdWithAdventureUserId.mockResolvedValue(stageWithZeroPause)
    mockWeatherService.getWeatherAtKm.mockResolvedValue(SAMPLE_WEATHER_POINT)

    await service.getStageWeather('stage-1', 'user-1', {
      departureTime: '2026-03-22T08:00:00.000Z',
      speedKmh: 15,
    })

    // Should use stage.speedKmh (20) directly, no slowdown
    expect(mockWeatherService.getWeatherAtKm).toHaveBeenCalledWith(
      'adv-1',
      95.4,
      '2026-03-22T08:00:00.000Z',
      20,
    )
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

  it('returns gain and loss for range with mixed deltas', () => {
    // +150 at km5, -50 at km10 → gain = 150, loss = 50
    expect(computeElevationGainForRange(defaultWaypoints, 0, 10)).toEqual({ gain: 150, loss: 50 })
  })

  it('counts two positive deltas across full range', () => {
    // +150 at km5, -50 at km10, +150 at km15 → gain = 300, loss = 50
    expect(computeElevationGainForRange(defaultWaypoints, 0, 15)).toEqual({ gain: 300, loss: 50 })
  })

  it('filters by distKm range boundaries (inclusive)', () => {
    // km5→350, km10→300 in [5, 10]: delta = -50 → gain = 0, loss = 50
    expect(computeElevationGainForRange(defaultWaypoints, 5, 10)).toEqual({ gain: 0, loss: 50 })
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

  it('ignores elevationGainM — D+ is managed by the user via per-stage speed', () => {
    // 10km at 15km/h = 40 min — D+ ignored
    expect(computeEtaMinutes(10, 150)).toBe(40)
  })

  it('uses speedKmh param when provided — differs from default', () => {
    // 10km at 20km/h = 30 min flat (vs 40 min at 15km/h)
    expect(computeEtaMinutes(10, null, 20)).not.toBe(computeEtaMinutes(10, null, 15))
    expect(computeEtaMinutes(10, null, 20)).toBe(30)
  })

  it('uses speedKmh param in eta calculation — D+ ignored', () => {
    // 10km at 20km/h = 30 min — D+ ignored
    expect(computeEtaMinutes(10, 150, 20)).toBe(30)
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
    // etaMinutes = round((10/15)*60) = round(40) = 40 — D+ ignored
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 10, 150, 40)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', { name: 'S1', endKm: 10, color: '#f97316' })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ elevationGainM: 150, elevationLossM: 50, etaMinutes: 40 }),
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
      expect.objectContaining({ elevationGainM: null, elevationLossM: null, etaMinutes: 20 }),
    )
  })

  it('uses adventure avgSpeedKmh when computing etaMinutes', async () => {
    mockAdventuresService.getAdventure.mockResolvedValue({ ...mockAdventure, avgSpeedKmh: 20 })
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 10)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', { name: 'S1', endKm: 10, color: '#f97316' })

    // 10km at 20km/h = 30 min — D+ ignored
    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ etaMinutes: 30 }),
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
    // etaMinutes new: round((40/15)*60) = round(160) = 160 — D+ ignored
    // etaMinutes remainder: round((60/15)*60) = 240
    const splitTarget = makeStage('s1', 0, 0, 100)
    mockStagesRepo.findContaining.mockResolvedValue(splitTarget)
    const newStage = makeStage('new', 0, 0, 40, 300, 160)
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
          elevationLossM: 50,
          etaMinutes: 160,
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        remainderUpdate: expect.objectContaining({
          orderIndex: 1,
          startKm: 40,
          distanceKm: 60,
          elevationGainM: null,
          elevationLossM: null,
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
    // etaMinutes = round((10/15)*60) = 40 — D+ ignored
    const stage = makeStage('s1', 0, 0, 50)
    const updated = makeStage('s1', 0, 0, 10, 150, 40)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValueOnce(stage)
    mockStagesRepo.findSubsequent.mockResolvedValue([])
    mockStagesRepo.update.mockResolvedValue(updated)

    const result = await service.updateStage('adv-1', 's1', 'user-1', { endKm: 10 })

    expect(mockStagesRepo.update).toHaveBeenCalledWith('s1', expect.objectContaining({
      endKm: 10,
      distanceKm: 10,
      elevationGainM: 150,
      elevationLossM: 50,
      etaMinutes: 40,
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
      expect.objectContaining({ id: 's2', startKm: 10, distanceKm: 90, elevationGainM: 150, elevationLossM: 0 }),
      expect.objectContaining({ id: 's3', startKm: 100, distanceKm: 50, elevationGainM: null, elevationLossM: null }),
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
      expect.objectContaining({ id: 's2', startKm: 0, distanceKm: 100, orderIndex: 0, elevationGainM: 300, elevationLossM: 50 }),
      expect.objectContaining({ id: 's3', startKm: 100, distanceKm: 50, orderIndex: 1, elevationGainM: null, elevationLossM: null }),
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
  it('recomputes etaMinutes for all stages using new speedKmh — D+ ignored', async () => {
    // stage1 [0,15] at 20km/h = round((15/20)*60) = round(45) = 45 — D+ ignored
    // stage2 [15,50] at 20km/h = round((35/20)*60) = round(105) = 105
    const stage1 = makeStage('s1', 0, 0, 15, 300)
    const stage2 = makeStage('s2', 1, 15, 50, null)
    mockStagesRepo.findByAdventureId.mockResolvedValue([stage1, stage2])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.recomputeAllEtasForAdventure('adv-1', 20)

    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's1', etaMinutes: 45 }),
      expect.objectContaining({ id: 's2', etaMinutes: 105 }),
    ])
  })

  it('returns early without calling updateMany when no stages exist', async () => {
    mockStagesRepo.findByAdventureId.mockResolvedValue([])

    await service.recomputeAllEtasForAdventure('adv-1', 20)

    expect(mockStagesRepo.updateMany).not.toHaveBeenCalled()
    expect(mockAdventuresService.getAdventureWaypoints).not.toHaveBeenCalled()
  })

  it('uses per-stage speedKmh and pauseHours when set', async () => {
    // stage1: speedKmh=10, pauseHours=2 → round((15/10)*60) + round(2*60) = 90 + 120 = 210
    // stage2: speedKmh=null (fallback to global 20), pauseHours=0.5 → round((35/20)*60) + round(0.5*60)
    //   = 105 + 30 = 135
    const stage1 = makeStage('s1', 0, 0, 15, 300, null, null, 10, 2)
    const stage2 = makeStage('s2', 1, 15, 50, null, null, null, null, 0.5)
    mockStagesRepo.findByAdventureId.mockResolvedValue([stage1, stage2])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.recomputeAllEtasForAdventure('adv-1', 20)

    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's1', etaMinutes: 210 }),
      expect.objectContaining({ id: 's2', etaMinutes: 135 }),
    ])
  })
})

// ─── createStage with speedKmh/pauseHours ────────────────────────────────────

describe('createStage — with speedKmh and pauseHours', () => {
  it('uses dto.speedKmh for ETA and stores it in DB', async () => {
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 10, 150, null, null, 20, null)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', {
      name: 'S1', endKm: 10, color: '#f97316', speedKmh: 20,
    })

    // 10km at 20km/h = 30 min — D+ ignored
    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ speedKmh: 20, pauseHours: null, etaMinutes: 30 }),
    )
  })

  it('adds pauseHours to ETA', async () => {
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 10)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', {
      name: 'S1', endKm: 10, color: '#f97316', pauseHours: 1.5,
    })

    // 10km at 15km/h = 40 min riding + 90 min pause = 130 — D+ ignored
    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ speedKmh: null, pauseHours: 1.5, etaMinutes: 130 }),
    )
  })

  it('passes departureTime to create', async () => {
    mockStagesRepo.findLastByAdventureId.mockResolvedValue(undefined)
    mockStagesRepo.countByAdventureId.mockResolvedValue(0)
    const created = makeStage('s1', 0, 0, 10)
    mockStagesRepo.create.mockResolvedValue(created)

    await service.createStage('adv-1', 'user-1', {
      name: 'S1', endKm: 10, color: '#f97316',
      departureTime: '2026-04-15T07:00:00.000Z',
    })

    expect(mockStagesRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ departureTime: new Date('2026-04-15T07:00:00.000Z') }),
    )
  })
})

// ─── updateStage with speedKmh/pauseHours ────────────────────────────────────

describe('updateStage — with speedKmh and pauseHours', () => {
  it('recomputes ETA when speedKmh changes (no endKm change)', async () => {
    const stage = makeStage('s1', 0, 0, 10, 150, 40)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage)
    mockStagesRepo.update.mockResolvedValue({ ...stage, speedKmh: 20, etaMinutes: 30 })

    await service.updateStage('adv-1', 's1', 'user-1', { speedKmh: 20 })

    // 10km at 20km/h = 30 min — D+ ignored
    expect(mockStagesRepo.update).toHaveBeenCalledWith('s1', expect.objectContaining({
      etaMinutes: 30, speedKmh: 20,
    }))
  })

  it('recomputes ETA when pauseHours changes (no endKm change)', async () => {
    const stage = makeStage('s1', 0, 0, 10, 150, 40)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage)
    mockStagesRepo.update.mockResolvedValue({ ...stage, pauseHours: 2, etaMinutes: 160 })

    await service.updateStage('adv-1', 's1', 'user-1', { pauseHours: 2 })

    // 10km at 15km/h = 40 min riding + 120 min pause = 160 — D+ ignored
    expect(mockStagesRepo.update).toHaveBeenCalledWith('s1', expect.objectContaining({
      etaMinutes: 160, pauseHours: 2,
    }))
  })

  it('uses per-stage speedKmh in cascade when endKm changes', async () => {
    const stage1 = makeStage('s1', 0, 0, 50)
    const stage2 = makeStage('s2', 1, 50, 100, null, null, null, 20, 1)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValueOnce(stage1)
    mockStagesRepo.findSubsequent.mockResolvedValue([stage2])
    mockStagesRepo.update.mockResolvedValue(makeStage('s1', 0, 0, 10))
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.updateStage('adv-1', 's1', 'user-1', { endKm: 10 })

    // stage2 cascaded: startKm=10, distKm=90, speed=20 (per-stage), pause=1h=60min
    // riding = round((90/20)*60) = round(270) = 270 — D+ ignored
    // total = 270 + 60 = 330
    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's2', etaMinutes: 330 }),
    ])
  })
})

// ─── deleteStage with per-stage speed/pause ────────���─────────────────────────

describe('deleteStage — with per-stage speed/pause', () => {
  it('uses per-stage speedKmh and pauseHours when recalculating cascade', async () => {
    const stage1 = makeStage('s1', 0, 0, 50)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage1)
    mockStagesRepo.delete.mockResolvedValue(undefined)
    // After deleting s1, remaining: s2 (has per-stage speed/pause)
    const stage2 = makeStage('s2', 1, 50, 100, null, null, null, 10, 0.5)
    mockStagesRepo.findByAdventureId.mockResolvedValue([stage2])
    mockStagesRepo.updateMany.mockResolvedValue(undefined)

    await service.deleteStage('adv-1', 's1', 'user-1')

    // stage2 cascaded: startKm=0, endKm=100, distKm=100, speed=10 (per-stage), pause=0.5h=30min
    // riding = round((100/10)*60) = round(600) = 600 — D+ ignored
    // total = 600 + 30 = 630
    expect(mockStagesRepo.updateMany).toHaveBeenCalledWith([
      expect.objectContaining({ id: 's2', etaMinutes: 630 }),
    ])
  })
})
