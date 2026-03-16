import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { PoisService } from './pois.service.js'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { GooglePlacesProvider } from './providers/google-places.provider.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { Poi } from '@ridenrest/shared'

const mockRedisClient = {
  get: jest.fn(),
  setex: jest.fn(),
  exists: jest.fn(),
}

const mockRedisProvider = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
}

const mockPoisRepository = {
  getSegmentWaypoints: jest.fn(),
  insertOverpassPois: jest.fn(),
  findCachedPois: jest.fn(),
  updatePoiDistances: jest.fn(),
}

const mockOverpassProvider = {
  queryPois: jest.fn(),
}

const mockGooglePlacesProvider = {
  isConfigured: jest.fn(),
  searchLayerPlaceIds: jest.fn(),
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

const overpassNode = {
  type: 'node' as const,
  id: 123,
  lat: 43.1,
  lon: 1.1,
  tags: { name: 'Hôtel du Lac', amenity: 'hotel' },
}

describe('PoisService', () => {
  let service: PoisService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        PoisService,
        { provide: PoisRepository, useValue: mockPoisRepository },
        { provide: OverpassProvider, useValue: mockOverpassProvider },
        { provide: GooglePlacesProvider, useValue: mockGooglePlacesProvider },
        { provide: RedisProvider, useValue: mockRedisProvider },
      ],
    }).compile()

    service = module.get<PoisService>(PoisService)

    // Reset all mocks
    mockRedisClient.get.mockReset()
    mockRedisClient.setex.mockReset()
    mockRedisClient.exists.mockReset()
    mockPoisRepository.getSegmentWaypoints.mockReset()
    mockPoisRepository.insertOverpassPois.mockReset()
    mockPoisRepository.findCachedPois.mockReset()
    mockPoisRepository.updatePoiDistances.mockReset()
    mockOverpassProvider.queryPois.mockReset()
    mockGooglePlacesProvider.isConfigured.mockReset()
    mockGooglePlacesProvider.searchLayerPlaceIds.mockReset()

    // Default: Google Places not configured
    mockGooglePlacesProvider.isConfigured.mockReturnValue(false)
    // Default: no Redis cache
    mockRedisClient.get.mockResolvedValue(null)
    mockRedisClient.exists.mockResolvedValue(0)
    // Default: successful DB operations
    mockPoisRepository.insertOverpassPois.mockResolvedValue(undefined)
    mockPoisRepository.updatePoiDistances.mockResolvedValue(undefined)
    mockPoisRepository.findCachedPois.mockResolvedValue([])
    mockRedisClient.setex.mockResolvedValue('OK')
  })

  describe('findPois - validation', () => {
    it('throws BadRequestException when toKm <= fromKm', async () => {
      await expect(service.findPois({ ...baseDto, fromKm: 30, toKm: 10 }, userId))
        .rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when toKm === fromKm', async () => {
      await expect(service.findPois({ ...baseDto, fromKm: 10, toKm: 10 }, userId))
        .rejects.toThrow(BadRequestException)
    })

    it('throws BadRequestException when range > 30km', async () => {
      await expect(service.findPois({ ...baseDto, fromKm: 0, toKm: 31 }, userId))
        .rejects.toThrow(BadRequestException)
    })
  })

  describe('findPois - cache HIT', () => {
    it('returns cached result and does not call Overpass when Redis HIT', async () => {
      const cachedPois = [mockPoi]
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(cachedPois))

      const result = await service.findPois(baseDto, userId)

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

      const result = await service.findPois(baseDto, userId)

      expect(result).toEqual([])
      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
    })

    it('passes userId to getSegmentWaypoints for ownership verification', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(null)

      await service.findPois(baseDto, userId)

      expect(mockPoisRepository.getSegmentWaypoints).toHaveBeenCalledWith(baseDto.segmentId, userId)
    })

    it('calls Overpass, stores in Redis, and returns results on cache MISS', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      // After Overpass + PostGIS update, service reads back from DB
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      const result = await service.findPois(baseDto, userId)

      expect(mockOverpassProvider.queryPois).toHaveBeenCalledTimes(1)
      expect(mockRedisClient.setex).toHaveBeenCalledTimes(1)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Hôtel du Lac')
      expect(result[0].category).toBe('hotel')
      expect(result[0].source).toBe('overpass')
    })

    it('calls updatePoiDistances after insertOverpassPois', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])

      await service.findPois(baseDto, userId)

      expect(mockPoisRepository.insertOverpassPois).toHaveBeenCalledTimes(1)
      expect(mockPoisRepository.updatePoiDistances).toHaveBeenCalledWith(baseDto.segmentId)
    })

    it('prefetchGooglePlaceIds is called when isConfigured() returns true', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])

      await service.findPois(baseDto, userId)

      // Allow fire-and-forget to resolve
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockGooglePlacesProvider.isConfigured).toHaveBeenCalled()
    })

    it('prefetchGooglePlaceIds failure does NOT reject findPois (fire-and-forget)', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockRejectedValue(new Error('Network error'))

      // findPois must NOT throw even if prefetch fails
      await expect(service.findPois(baseDto, userId)).resolves.not.toThrow()
    })

    it('falls back to DB cache when Overpass throws, does NOT cache in Redis', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockRejectedValueOnce(new Error('Overpass timeout'))
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      const result = await service.findPois(baseDto, userId)

      expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(baseDto.segmentId, baseDto.categories, baseDto.fromKm, baseDto.toKm)
      expect(mockRedisClient.setex).not.toHaveBeenCalled()
      expect(result).toEqual([mockPoi])
    })
  })

  describe('getGooglePlaceIds', () => {
    it('returns parsed array from Redis when key exists', async () => {
      const placeIds = ['ChIJN1t', 'ChIJP2t']
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(placeIds))

      const result = await service.getGooglePlaceIds('seg-1', 0, 30, 'accommodations')

      expect(result).toEqual(placeIds)
    })

    it('returns [] when key missing (no throw)', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null)

      const result = await service.getGooglePlaceIds('seg-1', 0, 30, 'accommodations')

      expect(result).toEqual([])
    })
  })
})
