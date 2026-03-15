// Focus: recomputeCumulativeDistances logic
import { SegmentsService } from './segments.service.js'

const mockSegmentsRepo = {
  create: jest.fn(),
  findAllByAdventureId: jest.fn(),
  findByIdAndUserId: jest.fn(),
  countByAdventureId: jest.fn(),
  updateAfterParse: jest.fn(),
  updateParseError: jest.fn(),
  updateCumulativeDistances: jest.fn(),
}

const mockAdventuresService = {
  verifyOwnership: jest.fn(),
  updateTotalDistance: jest.fn(),
}

const mockGpxQueue = { add: jest.fn() }

const service = new SegmentsService(
  mockSegmentsRepo as any,
  mockAdventuresService as any,
  mockGpxQueue as any,
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
