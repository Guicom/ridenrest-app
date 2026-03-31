import { AdventuresService } from './adventures.service.js'
import type { AdventuresRepository } from './adventures.repository.js'
import { NotFoundException } from '@nestjs/common'
import * as fsPromises from 'node:fs/promises'
import type { AdventureMapResponse } from '@ridenrest/shared'
import type { UpdateAdventureDto } from './dto/update-adventure.dto.js'

jest.mock('node:fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
}))

const mockRepo = {
  create: jest.fn(),
  findAllByUserId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  updateTotalDistance: jest.fn(),
  updateName: jest.fn(),
  updateStartDate: jest.fn(),
  updateEndDate: jest.fn(),
  deleteById: jest.fn(),
  findSegmentStorageUrlsByAdventureId: jest.fn(),
  getAdventureMapData: jest.fn(),
}

const service = new AdventuresService(mockRepo as unknown as AdventuresRepository)

const makeAdventure = (overrides = {}) => ({
  id: 'adv-1',
  userId: 'user-1',
  name: 'Test',
  totalDistanceKm: 0,
  startDate: null as string | null,
  endDate: null as string | null,
  status: 'planning' as const,
  createdAt: new Date('2026-03-15T00:00:00Z'),
  updatedAt: new Date('2026-03-15T00:00:00Z'),
  ...overrides,
})

beforeEach(() => jest.clearAllMocks())

describe('createAdventure', () => {
  it('creates and returns an adventure response', async () => {
    mockRepo.create.mockResolvedValue(makeAdventure())
    const result = await service.createAdventure('user-1', 'Test')
    expect(result.id).toBe('adv-1')
    expect(result.createdAt).toBe('2026-03-15T00:00:00.000Z')
    expect(mockRepo.create).toHaveBeenCalledWith({ userId: 'user-1', name: 'Test' })
  })
})

describe('getAdventure', () => {
  it('throws NotFoundException when adventure not found', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(null)
    await expect(service.getAdventure('not-found', 'user-1')).rejects.toThrow(NotFoundException)
  })

  it('returns adventure when found', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    const result = await service.getAdventure('adv-1', 'user-1')
    expect(result.id).toBe('adv-1')
  })
})

describe('verifyOwnership', () => {
  it('throws NotFoundException when adventure does not belong to user', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(null)
    await expect(service.verifyOwnership('adv-1', 'other-user')).rejects.toThrow(NotFoundException)
  })

  it('resolves when adventure belongs to user', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    await expect(service.verifyOwnership('adv-1', 'user-1')).resolves.toBeUndefined()
  })
})

describe('listAdventures', () => {
  it('returns mapped adventure responses', async () => {
    mockRepo.findAllByUserId.mockResolvedValue([makeAdventure(), makeAdventure({ id: 'adv-2', name: 'Test 2' })])
    const result = await service.listAdventures('user-1')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('adv-1')
    expect(result[1].id).toBe('adv-2')
  })
})

describe('updateAdventure', () => {
  it('throws NotFoundException when ownership fails', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(null)
    const dto: UpdateAdventureDto = { startDate: '2026-06-01' }
    await expect(service.updateAdventure('adv-1', 'user-1', dto)).rejects.toThrow(NotFoundException)
  })

  it('updates startDate and returns response with startDate', async () => {
    const adventure = makeAdventure({ startDate: '2026-06-01' })
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.updateStartDate.mockResolvedValue(adventure)

    const dto: UpdateAdventureDto = { startDate: '2026-06-01' }
    const result = await service.updateAdventure('adv-1', 'user-1', dto)

    expect(mockRepo.updateStartDate).toHaveBeenCalledWith('adv-1', '2026-06-01')
    expect(result.startDate).toBe('2026-06-01')
  })

  it('clears startDate when null is passed', async () => {
    const adventure = makeAdventure({ startDate: null })
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure({ startDate: '2026-06-01' }))
    mockRepo.updateStartDate.mockResolvedValue(adventure)

    const dto: UpdateAdventureDto = { startDate: null }
    const result = await service.updateAdventure('adv-1', 'user-1', dto)

    expect(mockRepo.updateStartDate).toHaveBeenCalledWith('adv-1', null)
    expect(result.startDate).toBeNull()
  })

  it('updates name without touching startDate when only name provided', async () => {
    const adventure = makeAdventure({ name: 'Renamed' })
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.updateName.mockResolvedValue(adventure)

    const dto: UpdateAdventureDto = { name: 'Renamed' }
    const result = await service.updateAdventure('adv-1', 'user-1', dto)

    expect(mockRepo.updateName).toHaveBeenCalledWith('adv-1', 'Renamed')
    expect(mockRepo.updateStartDate).not.toHaveBeenCalled()
    expect(result.name).toBe('Renamed')
  })

  it('updates endDate and returns response with endDate', async () => {
    const adventure = makeAdventure({ endDate: '2026-06-10' })
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.updateEndDate.mockResolvedValue(adventure)

    const dto: UpdateAdventureDto = { endDate: '2026-06-10' }
    const result = await service.updateAdventure('adv-1', 'user-1', dto)

    expect(mockRepo.updateEndDate).toHaveBeenCalledWith('adv-1', '2026-06-10')
    expect(result.endDate).toBe('2026-06-10')
  })

  it('toResponse includes startDate and endDate fields', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure({ startDate: '2026-07-01', endDate: '2026-07-14' }))
    const result = await service.getAdventure('adv-1', 'user-1')
    expect(result.startDate).toBe('2026-07-01')
    expect(result.endDate).toBe('2026-07-14')
  })
})

describe('deleteAdventure', () => {
  it('calls findSegmentStorageUrlsByAdventureId + deleteById + fs.unlink for each URL', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.findSegmentStorageUrlsByAdventureId.mockResolvedValue(['/data/gpx/s1.gpx', '/data/gpx/s2.gpx'])
    mockRepo.deleteById.mockResolvedValue(undefined)

    const result = await service.deleteAdventure('adv-1', 'user-1')

    expect(mockRepo.findSegmentStorageUrlsByAdventureId).toHaveBeenCalledWith('adv-1')
    expect(mockRepo.deleteById).toHaveBeenCalledWith('adv-1')
    expect(fsPromises.unlink).toHaveBeenCalledTimes(2)
    expect(result).toEqual({ deleted: true })
  })

  it('still succeeds when storageUrls is empty (no segments)', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.findSegmentStorageUrlsByAdventureId.mockResolvedValue([])
    mockRepo.deleteById.mockResolvedValue(undefined)

    const result = await service.deleteAdventure('adv-1', 'user-1')

    expect(mockRepo.deleteById).toHaveBeenCalledWith('adv-1')
    expect(fsPromises.unlink).not.toHaveBeenCalled()
    expect(result).toEqual({ deleted: true })
  })

  it('returns { deleted: true } even when fs.unlink fails (Promise.allSettled)', async () => {
    mockRepo.findByIdAndUserId.mockResolvedValue(makeAdventure())
    mockRepo.findSegmentStorageUrlsByAdventureId.mockResolvedValue(['/data/gpx/s1.gpx'])
    mockRepo.deleteById.mockResolvedValue(undefined)
    ;(fsPromises.unlink as jest.Mock).mockRejectedValue(new Error('ENOENT'))

    const result = await service.deleteAdventure('adv-1', 'user-1')

    expect(result).toEqual({ deleted: true })
  })
})

const makeMapResponse = (overrides = {}): AdventureMapResponse => ({
  adventureId: 'adv-1',
  adventureName: 'Test Adventure',
  totalDistanceKm: 100,
  segments: [
    {
      id: 'seg-1',
      name: 'Segment 1',
      orderIndex: 0,
      cumulativeStartKm: 0,
      distanceKm: 50,
      parseStatus: 'done',
      waypoints: [
        { lat: 43.0, lng: 1.0, ele: 100, distKm: 0 },
        { lat: 43.5, lng: 1.5, ele: 200, distKm: 50 },
      ],
      boundingBox: { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 },
    },
    {
      id: 'seg-2',
      name: 'Segment 2',
      orderIndex: 1,
      cumulativeStartKm: 50,
      distanceKm: 50,
      parseStatus: 'pending',
      waypoints: null,
      boundingBox: null,
    },
  ],
  ...overrides,
})

describe('getMapData', () => {
  it('returns AdventureMapResponse with all segments when adventure exists and user owns it', async () => {
    const mapResponse = makeMapResponse()
    mockRepo.getAdventureMapData.mockResolvedValue(mapResponse)

    const result = await service.getMapData('adv-1', 'user-1')

    expect(result.adventureId).toBe('adv-1')
    expect(result.adventureName).toBe('Test Adventure')
    expect(result.segments).toHaveLength(2)
    expect(mockRepo.getAdventureMapData).toHaveBeenCalledWith('adv-1', 'user-1')
  })

  it('throws NotFoundException when adventure not found or user does not own it', async () => {
    mockRepo.getAdventureMapData.mockResolvedValue(null)

    await expect(service.getMapData('not-found', 'user-1')).rejects.toThrow(NotFoundException)
    // Error message should NOT expose internal IDs
    await expect(service.getMapData('not-found', 'user-1')).rejects.toThrow('Adventure not found')
  })

  it('correctly maps parseStatus, waypoints (null for pending), boundingBox', async () => {
    const mapResponse = makeMapResponse()
    mockRepo.getAdventureMapData.mockResolvedValue(mapResponse)

    const result = await service.getMapData('adv-1', 'user-1')

    const doneSeg = result.segments.find((s) => s.id === 'seg-1')!
    expect(doneSeg.parseStatus).toBe('done')
    expect(doneSeg.waypoints).toHaveLength(2)
    expect(doneSeg.boundingBox).toEqual({ minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 })

    const pendingSeg = result.segments.find((s) => s.id === 'seg-2')!
    expect(pendingSeg.parseStatus).toBe('pending')
    expect(pendingSeg.waypoints).toBeNull()
    expect(pendingSeg.boundingBox).toBeNull()
  })
})
