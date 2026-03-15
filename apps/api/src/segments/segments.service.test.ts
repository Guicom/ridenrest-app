// Focus: recomputeCumulativeDistances, reorderSegments, deleteSegment logic
import { SegmentsService } from './segments.service.js'
import type { SegmentsRepository } from './segments.repository.js'
import type { AdventuresService } from '../adventures/adventures.service.js'
import type { Queue } from 'bullmq'
import * as fsPromises from 'node:fs/promises'

jest.mock('node:fs/promises', () => ({
  unlink: jest.fn().mockResolvedValue(undefined),
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
}))

const mockSegmentsRepo = {
  create: jest.fn(),
  findAllByAdventureId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  countByAdventureId: jest.fn(),
  updateAfterParse: jest.fn(),
  updateParseError: jest.fn(),
  updateCumulativeDistances: jest.fn(),
  updateOrderIndexes: jest.fn(),
  delete: jest.fn(),
}

const mockAdventuresService = {
  verifyOwnership: jest.fn(),
  updateTotalDistance: jest.fn(),
}

const mockGpxQueue = { add: jest.fn() }

const service = new SegmentsService(
  mockSegmentsRepo as unknown as SegmentsRepository,
  mockAdventuresService as unknown as AdventuresService,
  mockGpxQueue as unknown as Queue,
)

beforeEach(() => jest.clearAllMocks())

const makeSegment = (id: string, distanceKm: number, orderIndex: number) => ({
  id,
  adventureId: 'adv-1',
  name: `Segment ${orderIndex}`,
  orderIndex,
  cumulativeStartKm: 0,
  distanceKm,
  elevationGainM: null,
  storageUrl: `/data/gpx/${id}.gpx`,
  parseStatus: 'done' as const,
  geom: null,
  waypoints: null,
  boundingBox: null,
  createdAt: new Date(),
  updatedAt: new Date(),
})

describe('reorderSegments', () => {
  it('throws BadRequestException when orderedIds count mismatches existing segments', async () => {
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([
      makeSegment('s1', 100, 0),
      makeSegment('s2', 150, 1),
    ])
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)

    await expect(
      service.reorderSegments('adv-1', 'user-1', ['s1']),
    ).rejects.toThrow('orderedIds must match exactly all segment IDs for this adventure')
  })

  it('throws BadRequestException when orderedIds contains unknown IDs', async () => {
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([
      makeSegment('s1', 100, 0),
      makeSegment('s2', 150, 1),
    ])
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)

    await expect(
      service.reorderSegments('adv-1', 'user-1', ['s1', 's-unknown']),
    ).rejects.toThrow('orderedIds must match exactly all segment IDs for this adventure')
  })

  it('throws BadRequestException when orderedIds contains duplicates', async () => {
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([
      makeSegment('s1', 100, 0),
      makeSegment('s2', 150, 1),
      makeSegment('s3', 50, 2),
    ])
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)

    await expect(
      service.reorderSegments('adv-1', 'user-1', ['s1', 's1', 's1']),
    ).rejects.toThrow('orderedIds must match exactly all segment IDs for this adventure')
  })

  it('assigns new orderIndex and calls recomputeCumulativeDistances', async () => {
    const seg1 = makeSegment('s1', 100, 0)
    const seg2 = makeSegment('s2', 150, 1)
    mockAdventuresService.verifyOwnership.mockResolvedValue(undefined)
    // findAllByAdventureId called twice: once in reorderSegments, once in recomputeCumulative via listSegments
    mockSegmentsRepo.findAllByAdventureId
      .mockResolvedValueOnce([seg1, seg2]) // for reorderSegments validation
      .mockResolvedValueOnce([seg2, seg1]) // for recomputeCumulativeDistances
      .mockResolvedValueOnce([seg2, seg1]) // for listSegments at the end
    mockSegmentsRepo.updateOrderIndexes.mockResolvedValue(undefined)
    mockSegmentsRepo.updateCumulativeDistances.mockResolvedValue(undefined)
    mockAdventuresService.updateTotalDistance.mockResolvedValue(undefined)

    await service.reorderSegments('adv-1', 'user-1', ['s2', 's1'])

    expect(mockSegmentsRepo.updateOrderIndexes).toHaveBeenCalledWith([
      { id: 's2', orderIndex: 0 },
      { id: 's1', orderIndex: 1 },
    ])
    expect(mockSegmentsRepo.updateCumulativeDistances).toHaveBeenCalled()
  })
})

describe('deleteSegment', () => {
  it('throws NotFoundException when segment not found', async () => {
    mockSegmentsRepo.findByIdAndUserId.mockResolvedValue(null)

    await expect(
      service.deleteSegment('adv-1', 'seg-1', 'user-1'),
    ).rejects.toThrow('Segment not found')
  })

  it('calls delete, unlink, and recomputeCumulativeDistances on success', async () => {
    const seg = makeSegment('seg-1', 100, 0)
    mockSegmentsRepo.findByIdAndUserId.mockResolvedValue(seg)
    mockSegmentsRepo.delete.mockResolvedValue(undefined)
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([])
    mockSegmentsRepo.updateCumulativeDistances.mockResolvedValue(undefined)
    mockAdventuresService.updateTotalDistance.mockResolvedValue(undefined)

    const result = await service.deleteSegment('adv-1', 'seg-1', 'user-1')

    expect(mockSegmentsRepo.delete).toHaveBeenCalledWith('seg-1')
    expect(fsPromises.unlink).toHaveBeenCalledWith(seg.storageUrl)
    expect(mockAdventuresService.updateTotalDistance).toHaveBeenCalledWith('adv-1', 0)
    expect(result).toEqual({ deleted: true })
  })

  it('throws NotFoundException when segment belongs to a different adventure', async () => {
    const seg = makeSegment('seg-1', 100, 0) // adventureId: 'adv-1'
    mockSegmentsRepo.findByIdAndUserId.mockResolvedValue(seg)

    await expect(
      service.deleteSegment('adv-OTHER', 'seg-1', 'user-1'),
    ).rejects.toThrow('Segment not found')
    expect(mockSegmentsRepo.delete).not.toHaveBeenCalled()
  })
})

describe('recomputeCumulativeDistances', () => {
  it('sets cumulative distances correctly for 3 segments', async () => {
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([
      makeSegment('s1', 100, 0),
      makeSegment('s2', 150, 1),
      makeSegment('s3', 50, 2),
    ])
    mockSegmentsRepo.updateCumulativeDistances.mockResolvedValue(undefined)
    mockAdventuresService.updateTotalDistance.mockResolvedValue(undefined)

    await service.recomputeCumulativeDistances('adv-1')

    expect(mockSegmentsRepo.updateCumulativeDistances).toHaveBeenCalledWith([
      { id: 's1', cumulativeStartKm: 0 },
      { id: 's2', cumulativeStartKm: 100 },
      { id: 's3', cumulativeStartKm: 250 },
    ])
    expect(mockAdventuresService.updateTotalDistance).toHaveBeenCalledWith('adv-1', 300)
  })

  it('sets total distance to 0 for pending segments (distanceKm = 0)', async () => {
    mockSegmentsRepo.findAllByAdventureId.mockResolvedValue([
      makeSegment('s1', 0, 0), // pending
    ])
    mockSegmentsRepo.updateCumulativeDistances.mockResolvedValue(undefined)
    mockAdventuresService.updateTotalDistance.mockResolvedValue(undefined)

    await service.recomputeCumulativeDistances('adv-1')

    expect(mockAdventuresService.updateTotalDistance).toHaveBeenCalledWith('adv-1', 0)
  })
})
