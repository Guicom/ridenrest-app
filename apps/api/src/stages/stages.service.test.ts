import { NotFoundException, BadRequestException } from '@nestjs/common'
import { StagesService, computeElevationGainForRange, computeEtaMinutes } from './stages.service.js'
import type { StagesRepository } from './stages.repository.js'
import type { AdventuresService } from '../adventures/adventures.service.js'
import type { AdventureStage } from '@ridenrest/database'
import type { MapWaypoint } from '@ridenrest/shared'

const makeStage = (
  id: string,
  orderIndex: number,
  startKm: number,
  endKm: number,
  elevationGainM: number | null = null,
  etaMinutes: number | null = null,
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

const mockStagesRepo = {
  findByAdventureId: jest.fn(),
  findByIdAndAdventureId: jest.fn(),
  findLastByAdventureId: jest.fn(),
  countByAdventureId: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  updateMany: jest.fn(),
  findSubsequent: jest.fn(),
}

const mockAdventuresService = {
  verifyOwnership: jest.fn(),
  getAdventureWaypoints: jest.fn().mockResolvedValue(defaultWaypoints),
}

const service = new StagesService(
  mockStagesRepo as unknown as StagesRepository,
  mockAdventuresService as unknown as AdventuresService,
)

beforeEach(() => {
  jest.clearAllMocks()
  mockAdventuresService.getAdventureWaypoints.mockResolvedValue(defaultWaypoints)
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
})

// ─── createStage ─────────────────────────────────────────────────────────────

describe('createStage', () => {
  it('sets startKm=0 when no previous stages', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
})

// ─── updateStage ─────────────────────────────────────────────────────────────

describe('updateStage', () => {
  it('only updates name and color, not start/end km', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    // Stage 1 [0, 50] → endKm=10 (shrinks)
    // Stage 2 [50, 100] → cascade: [10, 100], distanceKm=90, elevGain for [10,100]
    //   waypoints in [10,100]: km10→300, km15→450 (+150) → gain=150
    //   etaMinutes = round((90/15)*60 + (150/100)*6) = round(360 + 9) = 369
    // Stage 3 [100, 150] → cascade: [100, 150], distanceKm=50, no waypoints with ele in range → gain=null
    //   etaMinutes = round((50/15)*60 + 0) = round(200) = 200
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    const stage = makeStage('s1', 0, 20, 50)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(stage)
    mockStagesRepo.findSubsequent.mockResolvedValue([])

    await expect(
      service.updateStage('adv-1', 's1', 'user-1', { endKm: 10 }),
    ).rejects.toThrow(BadRequestException)
    expect(mockStagesRepo.update).not.toHaveBeenCalled()
  })

  it('updateStage throws BadRequestException if endKm >= next stage endKm', async () => {
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    // Delete stage 1 [0, 50]. Remaining: s2[50→100], s3[100→150]
    // After cascade: s2→[0,100] distKm=100, s3→[100,150] distKm=50
    // Waypoints defaultWaypoints: ele at km0,5,10,15
    // s2 [0, 100]: km0→200, km5→350(+150), km10→300(-50), km15→450(+150) → gain=300
    //   etaMinutes = round((100/15)*60 + (300/100)*6) = round(400 + 18) = 418
    // s3 [100, 150]: no waypoints → gain=null
    //   etaMinutes = round((50/15)*60 + 0) = round(200) = 200
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
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
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    mockStagesRepo.findByIdAndAdventureId.mockResolvedValue(undefined)

    await expect(
      service.deleteStage('adv-1', 's-unknown', 'user-1'),
    ).rejects.toThrow(NotFoundException)
    expect(mockStagesRepo.delete).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when adventure not owned by user', async () => {
    mockAdventuresService.verifyOwnership.mockRejectedValue(new NotFoundException('Adventure not found'))

    await expect(
      service.deleteStage('adv-1', 's1', 'other-user'),
    ).rejects.toThrow(NotFoundException)
  })
})
