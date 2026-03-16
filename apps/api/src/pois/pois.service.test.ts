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
  del: jest.fn(),
}

const mockRedisProvider = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
}

const mockPoisRepository = {
  getSegmentWaypoints: jest.fn(),
  insertOverpassPois: jest.fn(),
  findCachedPois: jest.fn(),
  updatePoiDistances: jest.fn(),
  findByExternalId: jest.fn(),
  hasNearbyPoi: jest.fn(),
  insertGooglePois: jest.fn(),
  googlePoiExistsInSegment: jest.fn(),
}

const mockOverpassProvider = {
  queryPois: jest.fn(),
}

const mockGooglePlacesProvider = {
  isConfigured: jest.fn(),
  searchLayerPlaceIds: jest.fn(),
  findPlaceId: jest.fn(),
  getPlaceDetails: jest.fn(),
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
    mockGooglePlacesProvider.findPlaceId.mockReset()
    mockGooglePlacesProvider.getPlaceDetails.mockReset()
    mockPoisRepository.findByExternalId.mockReset()
    mockPoisRepository.hasNearbyPoi.mockReset()
    mockPoisRepository.insertGooglePois.mockReset()
    mockPoisRepository.googlePoiExistsInSegment.mockReset()
    mockRedisClient.del.mockReset()

    // Default: Google Places not configured
    mockGooglePlacesProvider.isConfigured.mockReturnValue(false)
    // Default: no Redis cache
    mockRedisClient.get.mockResolvedValue(null)
    mockRedisClient.exists.mockResolvedValue(0)
    mockRedisClient.del.mockResolvedValue(1)
    // Default: successful DB operations
    mockPoisRepository.insertOverpassPois.mockResolvedValue(undefined)
    mockPoisRepository.updatePoiDistances.mockResolvedValue(undefined)
    mockPoisRepository.findCachedPois.mockResolvedValue([])
    mockPoisRepository.hasNearbyPoi.mockResolvedValue(false)
    mockPoisRepository.insertGooglePois.mockResolvedValue(undefined)
    mockPoisRepository.googlePoiExistsInSegment.mockResolvedValue(false)
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

    it('prefetchAndInsertGooglePois is called when isConfigured() returns true', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])

      await service.findPois(baseDto, userId)

      // Allow fire-and-forget to resolve
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(mockGooglePlacesProvider.isConfigured).toHaveBeenCalled()
    })

    it('prefetchAndInsertGooglePois failure does NOT reject findPois', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockRejectedValue(new Error('Network error'))

      // findPois must NOT throw even if prefetch fails (error is caught + logged)
      await expect(service.findPois(baseDto, userId)).resolves.not.toThrow()
    })

    it('inserts Google POIs when new places found', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      mockPoisRepository.googlePoiExistsInSegment.mockResolvedValue(false)  // not in DB yet
      mockRedisClient.get.mockResolvedValue(null)  // not in Redis cache
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJABC', displayName: 'Guest House Test',
        lat: 43.2, lng: 1.2, formattedAddress: null,
        rating: 4.0, isOpenNow: true, phone: null, website: null, types: ['guest_house'],
      })
      mockPoisRepository.hasNearbyPoi.mockResolvedValue(false)

      await service.findPois(baseDto, userId)

      expect(mockPoisRepository.insertGooglePois).toHaveBeenCalled()
    })

    it('skips Google POI when OSM duplicate exists within 100m', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      mockPoisRepository.googlePoiExistsInSegment.mockResolvedValue(false)
      mockRedisClient.get.mockResolvedValue(null)
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJABC', displayName: 'Hotel Test',
        lat: 43.1, lng: 1.1, formattedAddress: null,
        rating: null, isOpenNow: null, phone: null, website: null, types: ['lodging'],
      })
      mockPoisRepository.hasNearbyPoi.mockResolvedValue(true)  // duplicate found

      await service.findPois(baseDto, userId)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockPoisRepository.insertGooglePois).not.toHaveBeenCalled()
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

  describe('getPoiGoogleDetails', () => {
    const externalId = 'overpass-123'
    const segmentId = '00000000-0000-0000-0000-000000000001'
    const placeId = 'ChIJABC123'
    const mockDetails = {
      placeId,
      displayName: 'Hotel Test',
      formattedAddress: '1 Rue Test',
      lat: 43.1,
      lng: 1.1,
      rating: 4.2,
      isOpenNow: true,
      phone: null,
      website: null,
      types: ['lodging'],
    }

    it('returns null when isConfigured() is false', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(false)

      const result = await service.getPoiGoogleDetails(externalId, segmentId)

      expect(result).toBeNull()
      expect(mockRedisClient.get).not.toHaveBeenCalled()
    })

    it('returns cached details from Redis without calling Google', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      // placeId cache hit
      mockRedisClient.get
        .mockResolvedValueOnce(placeId)                          // google_place_id key
        .mockResolvedValueOnce(JSON.stringify(mockDetails))      // google_place_details key

      const result = await service.getPoiGoogleDetails(externalId, segmentId)

      expect(result).toEqual(mockDetails)
      expect(mockGooglePlacesProvider.findPlaceId).not.toHaveBeenCalled()
      expect(mockGooglePlacesProvider.getPlaceDetails).not.toHaveBeenCalled()
    })

    it('calls findPlaceId when placeIdKey not in Redis', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockPoisRepository.findByExternalId.mockResolvedValueOnce({ name: 'Hotel Test', lat: 43.1, lng: 1.1 })
      mockGooglePlacesProvider.findPlaceId.mockResolvedValueOnce(placeId)
      mockRedisClient.get
        .mockResolvedValueOnce(null)    // placeId not cached
        .mockResolvedValueOnce(null)    // details not cached
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValueOnce(mockDetails)

      await service.getPoiGoogleDetails(externalId, segmentId)

      expect(mockGooglePlacesProvider.findPlaceId).toHaveBeenCalledWith('Hotel Test', 43.1, 1.1)
    })

    it('returns null when findByExternalId returns nothing', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockRedisClient.get.mockResolvedValueOnce(null)  // placeId not cached
      mockPoisRepository.findByExternalId.mockResolvedValueOnce(null)

      const result = await service.getPoiGoogleDetails(externalId, segmentId)

      expect(result).toBeNull()
    })

    it('calls getPlaceDetails when placeId found but details not cached', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockRedisClient.get
        .mockResolvedValueOnce(placeId)   // placeId cached
        .mockResolvedValueOnce(null)      // details not cached
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValueOnce(mockDetails)

      const result = await service.getPoiGoogleDetails(externalId, segmentId)

      expect(mockGooglePlacesProvider.getPlaceDetails).toHaveBeenCalledWith(placeId)
      expect(result).toEqual(mockDetails)
    })

    it('caches details in Redis after fetching from Google', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockRedisClient.get
        .mockResolvedValueOnce(placeId)
        .mockResolvedValueOnce(null)
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValueOnce(mockDetails)

      await service.getPoiGoogleDetails(externalId, segmentId)

      expect(mockRedisClient.setex).toHaveBeenCalledWith(
        `google_place_details:${placeId}`,
        expect.any(Number),
        JSON.stringify(mockDetails),
      )
    })
  })

})
