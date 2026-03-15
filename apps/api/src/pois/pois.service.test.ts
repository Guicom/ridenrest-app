import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { PoisService } from './pois.service.js'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { Poi } from '@ridenrest/shared'

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
}

const mockRedisProvider = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
}

const mockPoisRepository = {
  getSegmentWaypoints: jest.fn(),
  insertOverpassPois: jest.fn(),
  findCachedPois: jest.fn(),
}

const mockOverpassProvider = {
  queryPois: jest.fn(),
}

const baseDto = {
  segmentId: '00000000-0000-0000-0000-000000000001',
  fromKm: 0,
  toKm: 30,
  categories: ['hotel'],
}

const userId = 'user-001'

const mockWaypoints = [
  { lat: 43.0, lng: 1.0, distKm: 0 },
  { lat: 43.5, lng: 1.5, distKm: 30 },
]

const mockPoi: Poi = {
  id: 'overpass-123',
  externalId: '123',
  source: 'overpass',
  category: 'hotel',
  name: 'Hôtel du Lac',
  lat: 43.1,
  lng: 1.1,
  distFromTraceM: 0,
  distAlongRouteKm: 0,
}

// Helper: call findPois with required userId
const findPois = (dto = baseDto) => service.findPois(dto, userId)

describe('PoisService', () => {
  let service: PoisService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PoisService,
        { provide: PoisRepository, useValue: mockPoisRepository },
        { provide: OverpassProvider, useValue: mockOverpassProvider },
        { provide: RedisProvider, useValue: mockRedisProvider },
      ],
    }).compile()

    service = module.get<PoisService>(PoisService)

    // Reset all mocks
    mockRedisClient.get.mockReset()
    mockRedisClient.setex.mockReset()
    mockPoisRepository.getSegmentWaypoints.mockReset()
    mockPoisRepository.insertOverpassPois.mockReset()
    mockPoisRepository.findCachedPois.mockReset()
    mockOverpassProvider.queryPois.mockReset()
  })

  describe('findPois - validation', () => {
    it('throws BadRequestException when toKm <= fromKm', async () => {
      await expect(findPois({ ...baseDto, fromKm: 30, toKm: 10 }))
        .rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when toKm === fromKm', async () => {
      await expect(findPois({ ...baseDto, fromKm: 10, toKm: 10 }))
        .rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when range > 30km', async () => {
      await expect(findPois({ ...baseDto, fromKm: 0, toKm: 31 }))
        .rejects.toThrow(BadRequestException)
    })
  })

  describe('findPois - cache HIT', () => {
    it('returns cached result and does not call Overpass when Redis HIT', async () => {
      const cachedPois = [mockPoi]
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedPois))

      const result = await findPois()

      expect(result).toEqual(cachedPois)
      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
      expect(mockPoisRepository.getSegmentWaypoints).not.toHaveBeenCalled()
    })
  })

  describe('findPois - cache MISS', () => {
    beforeEach(() => {
      mockRedisClient.get.mockResolvedValue(null)
    })

    it('returns [] when segment has no waypoints (not yet parsed or wrong owner)', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(null)

      const result = await findPois()

      expect(result).toEqual([])
      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
    })

    it('passes userId to getSegmentWaypoints for ownership verification', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(null)

      await findPois()

      expect(mockPoisRepository.getSegmentWaypoints).toHaveBeenCalledWith(baseDto.segmentId, userId)
    })

    it('calls Overpass, stores in Redis, and returns results on cache MISS', async () => {
      const overpassNode = {
        type: 'node' as const,
        id: 123,
        lat: 43.1,
        lon: 1.1,
        tags: { name: 'Hôtel du Lac', amenity: 'hotel' },
      }

      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockPoisRepository.insertOverpassPois.mockResolvedValueOnce(undefined)
      mockRedisClient.setex.mockResolvedValueOnce('OK')

      const result = await findPois()

      expect(mockOverpassProvider.queryPois).toHaveBeenCalledTimes(1)
      expect(mockRedisClient.setex).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Hôtel du Lac')
      expect(result[0].category).toBe('hotel')
      expect(result[0].source).toBe('overpass')
    })

    it('falls back to DB cache when Overpass throws, does NOT cache in Redis', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockRejectedValueOnce(new Error('Overpass timeout'))
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      const result = await findPois()

      expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(baseDto.segmentId, baseDto.categories)
      expect(mockRedisClient.setex).not.toHaveBeenCalled()
      expect(result).toEqual([mockPoi])
    })
  })
})
