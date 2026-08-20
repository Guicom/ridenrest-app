import { Test } from '@nestjs/testing'
import { BadRequestException } from '@nestjs/common'
import { PoisService } from './pois.service.js'
import { PoisRepository } from './pois.repository.js'
import { OverpassProvider } from './providers/overpass.provider.js'
import { GooglePlacesProvider } from './providers/google-places.provider.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import type { Poi } from '@ridenrest/shared'
import { POI_BBOX_CACHE_TTL, GOOGLE_PLACES_CACHE_TTL } from '@ridenrest/shared'

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
  getWaypointAtKm: jest.fn(),
  findPoisNearPoint: jest.fn(),
  insertOverpassPois: jest.fn(),
  findCachedPois: jest.fn(),
  updatePoiDistances: jest.fn(),
  findByExternalId: jest.fn(),
  findNearbyPoisFromOtherSources: jest.fn(),
  insertGooglePois: jest.fn(),
  googlePoiExistsInSegment: jest.fn(),
  insertRawPoisForSegment: jest.fn(),
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
  overpassEnabled: true,
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
    mockPoisRepository.getWaypointAtKm.mockReset()
    mockPoisRepository.findPoisNearPoint.mockReset()
    mockPoisRepository.insertOverpassPois.mockReset()
    mockPoisRepository.findCachedPois.mockReset()
    mockPoisRepository.updatePoiDistances.mockReset()
    mockOverpassProvider.queryPois.mockReset()
    mockGooglePlacesProvider.isConfigured.mockReset()
    mockGooglePlacesProvider.searchLayerPlaceIds.mockReset()
    mockGooglePlacesProvider.findPlaceId.mockReset()
    mockGooglePlacesProvider.getPlaceDetails.mockReset()
    mockPoisRepository.findByExternalId.mockReset()
    mockPoisRepository.findNearbyPoisFromOtherSources.mockReset()
    mockPoisRepository.insertGooglePois.mockReset()
    mockPoisRepository.googlePoiExistsInSegment.mockReset()
    mockPoisRepository.insertRawPoisForSegment.mockReset()

    // Default: Google Places not configured
    mockGooglePlacesProvider.isConfigured.mockReturnValue(false)
    // Default: no Redis cache
    mockRedisClient.get.mockResolvedValue(null)
    mockRedisClient.exists.mockResolvedValue(0)
    // Default: successful DB operations
    mockPoisRepository.getWaypointAtKm.mockResolvedValue(null)
    mockPoisRepository.findPoisNearPoint.mockResolvedValue([])
    mockPoisRepository.insertOverpassPois.mockResolvedValue(undefined)
    mockPoisRepository.updatePoiDistances.mockResolvedValue(undefined)
    mockPoisRepository.findCachedPois.mockResolvedValue([])
    mockPoisRepository.findNearbyPoisFromOtherSources.mockResolvedValue([])
    mockPoisRepository.insertGooglePois.mockResolvedValue(undefined)
    mockPoisRepository.googlePoiExistsInSegment.mockResolvedValue(false)
    mockPoisRepository.insertRawPoisForSegment.mockResolvedValue(undefined)
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

    it('throws BadRequestException when range > 50km', async () => {
      await expect(service.findPois({ ...baseDto, fromKm: 0, toKm: 51 }, userId))
        .rejects.toThrow(BadRequestException)
    })
  })

  describe('findPois - cache HIT', () => {
    it('re-inserts raw POIs for the segment and returns with correct distances on HIT (Option A)', async () => {
      // Redis stores raw POIs (no distances) — Option A
      const rawCached = [{ externalId: '123', source: 'overpass' as const, name: 'Hôtel du Lac', lat: 43.1, lng: 1.1, category: 'hotel' }]
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(rawCached))
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      const result = await service.findPois(baseDto, userId)

      expect(result).toEqual([mockPoi])
      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
      expect(mockPoisRepository.getSegmentWaypoints).toHaveBeenCalledTimes(1)
      // Option A: re-insert + recompute + read back
      expect(mockPoisRepository.insertRawPoisForSegment).toHaveBeenCalledTimes(1)
      expect(mockPoisRepository.updatePoiDistances).toHaveBeenCalledWith(baseDto.segmentId)
      expect(mockPoisRepository.findCachedPois).toHaveBeenCalledTimes(1)
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

    it('uses bbox-based cache key (cross-user sharing)', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([])

      await service.findPois(baseDto, userId)

      const cacheKey = (mockRedisClient.get.mock.calls as string[][])[0][0]
      // New format: pois:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}:{categories}
      expect(cacheKey).toMatch(/^pois:bbox:/)
      expect(cacheKey).not.toContain(baseDto.segmentId)
    })

    it('two different segments with same corridor bbox produce the same cache key', async () => {
      // Same waypoints → same bbox → same cache key regardless of segmentId
      const segmentA = '00000000-0000-0000-0000-000000000001'
      const segmentB = '00000000-0000-0000-0000-000000000002'
      const dtoA = { ...baseDto, segmentId: segmentA }
      const dtoB = { ...baseDto, segmentId: segmentB }

      mockPoisRepository.getSegmentWaypoints.mockResolvedValue(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValue([])
      mockPoisRepository.findCachedPois.mockResolvedValue([])

      await service.findPois(dtoA, userId)
      await service.findPois(dtoB, userId)

      const keyA = (mockRedisClient.get.mock.calls as string[][])[0][0]
      const keyB = (mockRedisClient.get.mock.calls as string[][])[1][0]
      expect(keyA).toBe(keyB)
    })

    it('calls Overpass, stores raw POIs (no distances) in Redis, and returns results on cache MISS', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      const result = await service.findPois(baseDto, userId)

      expect(mockOverpassProvider.queryPois).toHaveBeenCalledTimes(1)
      expect(mockRedisClient.setex).toHaveBeenCalledTimes(1)
      // Corridor mode uses POI_BBOX_CACHE_TTL (30 days = 2592000s)
      const [, ttl, storedJson] = mockRedisClient.setex.mock.calls[0] as [string, number, string]
      expect(ttl).toBe(POI_BBOX_CACHE_TTL)
      // Option A: Redis must NOT contain segment-specific distances
      const stored = JSON.parse(storedJson) as Array<Record<string, unknown>>
      expect(stored[0]).not.toHaveProperty('distFromTraceM')
      expect(stored[0]).not.toHaveProperty('distAlongRouteKm')
      expect(stored[0]).toHaveProperty('externalId')
      expect(stored[0]).toHaveProperty('source', 'overpass')
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Hôtel du Lac')
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
      mockPoisRepository.findNearbyPoisFromOtherSources.mockResolvedValue([])

      await service.findPois(baseDto, userId)

      expect(mockPoisRepository.insertGooglePois).toHaveBeenCalled()
    })

    it('re-inserts Google POI when guard returns false for an expired DB row (cache self-heal)', async () => {
      // Expired POIs are treated as absent by googlePoiExistsInSegment → insertGooglePois
      // is called → onConflictDoUpdate refreshes expiresAt → cache self-heals.
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      mockPoisRepository.googlePoiExistsInSegment.mockResolvedValue(false)  // expired → treated as absent
      mockRedisClient.get.mockResolvedValue(null)
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJABC', displayName: 'Guest House Expiré',
        lat: 43.2, lng: 1.2, formattedAddress: null,
        rating: 3.8, isOpenNow: true, phone: null, website: null, types: ['guest_house'],
      })
      mockPoisRepository.findNearbyPoisFromOtherSources.mockResolvedValue([])

      await service.findPois(baseDto, userId)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockPoisRepository.googlePoiExistsInSegment).toHaveBeenCalled()
      expect(mockPoisRepository.insertGooglePois).toHaveBeenCalled()
      expect(mockPoisRepository.updatePoiDistances).toHaveBeenCalled()
    })

    it('le prefetch demande le SKU Essentials, pas Pro (le pin n’a besoin que du nom et de la position)', async () => {
      // Google facture au SKU le plus élevé des champs demandés : réclamer note/horaires/
      // téléphone/site pour CHAQUE POI inséré faisait payer du Place Details Pro (~17 $/1000
      // au-delà de 5 000/mois) pour des champs jamais lus tant que la fiche n'est pas ouverte.
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      mockRedisClient.get.mockResolvedValue(null)
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJABC', displayName: 'Hôtel Essentiel', lat: 43.2, lng: 1.2,
        formattedAddress: null, rating: null, isOpenNow: null, phone: null, website: null, types: ['lodging'],
      })

      await service.findPois(baseDto, userId)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockGooglePlacesProvider.getPlaceDetails).toHaveBeenCalledWith('ChIJABC', 'essentials')
    })

    it('le prefetch écrit sous google_place_basic, jamais sous google_place_details', async () => {
      // Écrire une charge Essentials sous la clé lue par la fiche POI la priverait de la note,
      // des horaires et du téléphone jusqu'à l'expiration du cache (7 jours).
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      mockRedisClient.get.mockResolvedValue(null)
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJABC', displayName: 'Hôtel Essentiel', lat: 43.2, lng: 1.2,
        formattedAddress: null, rating: null, isOpenNow: null, phone: null, website: null, types: ['lodging'],
      })

      await service.findPois(baseDto, userId)
      await new Promise((resolve) => setTimeout(resolve, 10))

      const writtenKeys = (mockRedisClient.setex.mock.calls as string[][]).map((c) => c[0])
      expect(writtenKeys).toContain('google_place_basic:ChIJABC')
      expect(writtenKeys).not.toContain('google_place_details:ChIJABC')
    })

    it('réutilise une charge Pro déjà en cache plutôt que de rappeler Google', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      // 1er get = clé Pro : renvoie une charge complète
      mockRedisClient.get.mockImplementation((key: string) =>
        Promise.resolve(key === 'google_place_details:ChIJABC'
          ? JSON.stringify({ placeId: 'ChIJABC', displayName: 'Déjà en cache', lat: 43.2, lng: 1.2, types: ['lodging'] })
          : null),
      )

      await service.findPois(baseDto, userId)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockGooglePlacesProvider.getPlaceDetails).not.toHaveBeenCalled()
    })

    it('skips Google POI when a nearby OSM POI has a matching name', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      mockPoisRepository.googlePoiExistsInSegment.mockResolvedValue(false)
      mockRedisClient.get.mockResolvedValue(null)
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJABC', displayName: 'Hôtel Bellevue',
        lat: 43.1, lng: 1.1, formattedAddress: null,
        rating: null, isOpenNow: null, phone: null, website: null, types: ['lodging'],
      })
      mockPoisRepository.findNearbyPoisFromOtherSources.mockResolvedValue([
        { name: 'Hotel Bellevue', source: 'overpass' },
      ])

      await service.findPois(baseDto, userId)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockPoisRepository.findNearbyPoisFromOtherSources).toHaveBeenCalledWith(
        43.1, 1.1, 100, baseDto.segmentId, 'google',
      )
      expect(mockPoisRepository.insertGooglePois).not.toHaveBeenCalled()
    })

    it('inserts Google POI when the nearby POI is a DIFFERENT establishment (name mismatch)', async () => {
      // Proximity alone must not suppress a distinct place — two hotels 80 m apart in a
      // village are two hotels (regression 2026-08-19: 8 of 10 accommodations dropped).
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue(['ChIJABC'])
      mockPoisRepository.googlePoiExistsInSegment.mockResolvedValue(false)
      mockRedisClient.get.mockResolvedValue(null)
      mockGooglePlacesProvider.getPlaceDetails.mockResolvedValue({
        placeId: 'ChIJABC', displayName: 'Haus zum Falken',
        lat: 43.1, lng: 1.1, formattedAddress: null,
        rating: null, isOpenNow: null, phone: null, website: null, types: ['lodging'],
      })
      mockPoisRepository.findNearbyPoisFromOtherSources.mockResolvedValue([
        { name: 'Villa Hallau', source: 'overpass' },
      ])

      await service.findPois(baseDto, userId)
      await new Promise((resolve) => setTimeout(resolve, 10))

      expect(mockPoisRepository.insertGooglePois).toHaveBeenCalled()
    })

    it('falls back to DB cache when Overpass throws, does NOT cache in Redis', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockRejectedValueOnce(new Error('Overpass timeout'))
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      const result = await service.findPois(baseDto, userId)

      expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(baseDto.segmentId, baseDto.categories, baseDto.fromKm, baseDto.toKm, [])
      expect(mockRedisClient.setex).not.toHaveBeenCalled()
      expect(result).toEqual([mockPoi])
    })

    it('maps sleepable shelters to the shelter category (huts + useful shelter_type)', async () => {
      const shelterNodes = [
        { type: 'node' as const, id: 1, lat: 43.1, lon: 1.1, tags: { name: 'Cabane', amenity: 'shelter', shelter_type: 'weather_shelter' } },
        { type: 'node' as const, id: 2, lat: 43.2, lon: 1.2, tags: { name: 'Refuge du Col', tourism: 'alpine_hut' } },
        { type: 'node' as const, id: 3, lat: 43.3, lon: 1.3, tags: { name: 'Abri forestier', tourism: 'wilderness_hut' } },
      ]
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce(shelterNodes)

      await service.findPois({ ...baseDto, categories: ['shelter'] }, userId)

      const [, , categoryMap] = mockPoisRepository.insertOverpassPois.mock.calls[0] as [string, unknown, Record<number, string>]
      expect(categoryMap).toEqual({ 1: 'shelter', 2: 'shelter', 3: 'shelter' })
    })

    it('does NOT map a bus-stop shelter to the shelter category', async () => {
      // Defence in depth: the Overpass filter already excludes shelter_type=public_transport,
      // but resolveCategory must not label one as a shelter if it ever comes back via another
      // matching tag. 241 of 294 elements on a real bbox were bus stops.
      const busStop = [
        { type: 'node' as const, id: 9, lat: 43.1, lon: 1.1, tags: { amenity: 'shelter', shelter_type: 'public_transport' } },
      ]
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce(busStop)

      await service.findPois({ ...baseDto, categories: ['shelter'] }, userId)

      const [, , categoryMap] = mockPoisRepository.insertOverpassPois.mock.calls[0] as [string, unknown, Record<number, string>]
      expect(categoryMap[9]).not.toBe('shelter')
    })

    it('still fetches Google Places when Overpass throws (Overpass only complements)', async () => {
      // Regression 2026-08-19: the prefetch used to live inside the Overpass try block, so an
      // Overpass failure also cancelled Google → "Overpass ON" returned 0 POI on a cold segment
      // while "Overpass OFF" returned results.
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockRejectedValueOnce(new Error('All Overpass instances unavailable'))

      await service.findPois(baseDto, userId)

      expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
    })

    describe('source= (flux découplés Google / Overpass)', () => {
      // Le client affiche les POI Google en ~200 ms pendant qu'Overpass, mesuré entre 1 et 31 s
      // sur les instances publiques, arrive quand il peut.
      it('source=google : aucun appel Overpass, lecture sans les POI overpass', async () => {
        mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
        mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
        mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)

        await service.findPois({ ...baseDto, source: 'google' }, userId)

        expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
        expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
        expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(
          baseDto.segmentId, baseDto.categories, baseDto.fromKm, baseDto.toKm, ['overpass'],
        )
      })

      it('source=overpass : aucun appel Google, lecture sans les POI google', async () => {
        mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
        mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
        mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
        mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])

        await service.findPois({ ...baseDto, source: 'overpass' }, userId)

        expect(mockOverpassProvider.queryPois).toHaveBeenCalledTimes(1)
        expect(mockGooglePlacesProvider.searchLayerPlaceIds).not.toHaveBeenCalled()
        expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(
          baseDto.segmentId, baseDto.categories, baseDto.fromKm, baseDto.toKm, ['google', 'amadeus'],
        )
      })

      it('source=overpass avec l’option coupée : rien n’est interrogé (le toggle reste maître)', async () => {
        mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
        mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)

        const result = await service.findPois({ ...baseDto, source: 'overpass', overpassEnabled: false }, userId)

        expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
        expect(mockGooglePlacesProvider.searchLayerPlaceIds).not.toHaveBeenCalled()
        expect(result).toEqual([])
      })

      it('sans source : comportement historique, les deux sources dans une réponse (mobile)', async () => {
        mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
        mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
        mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
        mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])

        await service.findPois(baseDto, userId)

        expect(mockOverpassProvider.queryPois).toHaveBeenCalledTimes(1)
        expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
        expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(
          baseDto.segmentId, baseDto.categories, baseDto.fromKm, baseDto.toKm, [],
        )
      })

      it('source=google n’écrit pas la clé Redis Overpass', async () => {
        mockGooglePlacesProvider.isConfigured.mockReturnValue(false)
        mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)

        await service.findPois({ ...baseDto, source: 'google' }, userId)

        expect(mockRedisClient.setex).not.toHaveBeenCalled()
      })
    })

    it('hides Overpass-sourced POIs on read when overpassEnabled=false', async () => {
      // The toggle used to gate COLLECTION only: cached Overpass POIs (30-day TTL) stayed
      // visible, so ON and OFF returned the exact same set once a zone had been searched with
      // the option on — the user could only conclude the option was ignored.
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)

      await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(
        baseDto.segmentId, baseDto.categories, baseDto.fromKm, baseDto.toKm, ['overpass'],
      )
    })

    it('hides nothing on read when overpassEnabled=true', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])

      await service.findPois({ ...baseDto, overpassEnabled: true }, userId)

      expect(mockPoisRepository.findCachedPois).toHaveBeenCalledWith(
        baseDto.segmentId, baseDto.categories, baseDto.fromKm, baseDto.toKm, [],
      )
    })

    it('skips Overpass entirely when overpassEnabled=false, returns DB cache directly', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      const result = await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
      expect(result).toEqual([mockPoi])
    })

    it('calls Google Places when overpassEnabled=false and DB cache is empty', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])

      const result = await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
      expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
      // Single read: the DB is read AFTER the prefetch, never before as a short-circuit
      expect(mockPoisRepository.findCachedPois).toHaveBeenCalledTimes(1)
      expect(result).toEqual([mockPoi])
    })

    it('calls Google Places even when the window ALREADY holds cached POIs (coverage gate)', async () => {
      // The gate is "did I already search this bbox?", NOT "do I have something to show?".
      // The old short-circuit froze a partial set for the whole 7-day TTL: a first search on
      // [86,89] km locked every wider window ([80,95]…) onto its 8 results.
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockPoisRepository.findCachedPois.mockResolvedValue([mockPoi])  // window is NOT empty

      await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
    })

    it('skips the Google prefetch when this segment+bbox was already fetched, and marks it otherwise', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
      mockPoisRepository.getSegmentWaypoints.mockResolvedValue(mockWaypoints)

      // 1st call: no marker → prefetch runs → marker written (segment-scoped, 7-day TTL)
      mockRedisClient.get.mockResolvedValueOnce(null)
      await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      const markerKey = (mockRedisClient.get.mock.calls as string[][])[0][0]
      expect(markerKey).toBe(`pois:google:seg:${baseDto.segmentId}:bbox:42.973:0.973:43.527:1.527`)
      expect(mockRedisClient.setex).toHaveBeenCalledWith(markerKey, GOOGLE_PLACES_CACHE_TTL, '1')
      expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalledTimes(4)  // 4 layers

      // 2nd call: marker present → no Google traffic at all
      mockGooglePlacesProvider.searchLayerPlaceIds.mockClear()
      mockRedisClient.get.mockResolvedValueOnce('1')
      await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      expect(mockGooglePlacesProvider.searchLayerPlaceIds).not.toHaveBeenCalled()
    })

    it('does NOT mark the bbox when a layer query failed (partial fetch must retry)', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockGooglePlacesProvider.searchLayerPlaceIds
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Google 429'))
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])

      await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      expect(mockRedisClient.setex).not.toHaveBeenCalled()
    })

    it('returns empty when overpassEnabled=false, DB cache empty, and Google Places not configured', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(false)
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([])

      const result = await service.findPois({ ...baseDto, overpassEnabled: false }, userId)

      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
      expect(mockGooglePlacesProvider.searchLayerPlaceIds).not.toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('calls Overpass when overpassEnabled=true', async () => {
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(mockWaypoints)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([mockPoi])

      await service.findPois({ ...baseDto, overpassEnabled: true }, userId)

      expect(mockOverpassProvider.queryPois).toHaveBeenCalledTimes(1)
    })
  })

  describe('findPois - live mode', () => {
    const liveDto = {
      segmentId: '00000000-0000-0000-0000-000000000001',
      targetKm: 42.3,
      radiusKm: 3,
      categories: ['hotel'] as string[],
      overpassEnabled: true,
    }

    const mockLivePoi: Poi = {
      id: 'live-poi-1',
      externalId: '456',
      source: 'overpass',
      category: 'hotel',
      name: 'Hôtel Live',
      lat: 43.3,
      lng: 1.3,
      distFromTraceM: 500,
      distAlongRouteKm: 42,
      distFromTargetM: 150,
    }

    it('routes to live mode when targetKm is provided', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([mockLivePoi])

      const result = await service.findPois(liveDto, userId)

      expect(mockPoisRepository.getWaypointAtKm).toHaveBeenCalledWith(
        liveDto.segmentId, liveDto.targetKm, userId,
      )
      expect(result).toEqual([mockLivePoi])
    })

    it('does NOT validate fromKm/toKm range in live mode', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])

      // Should not throw even though fromKm/toKm are absent
      await expect(service.findPois(liveDto, userId)).resolves.not.toThrow()
    })

    it('returns [] when getWaypointAtKm returns null', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce(null)

      const result = await service.findPois(liveDto, userId)

      expect(result).toEqual([])
      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
    })

    it('uses bbox-based live mode cache key (cross-user sharing)', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])

      await service.findPois(liveDto, userId)

      // New format: pois:live:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}:{categories}
      const cacheKey = (mockRedisClient.get.mock.calls as string[][])[0][0]
      expect(cacheKey).toMatch(/^pois:live:bbox:/)
      expect(cacheKey).not.toContain(liveDto.segmentId)
    })

    it('two different users at same GPS zone produce the same live mode cache key', async () => {
      const samePoint = { lat: 43.3, lng: 1.3 }
      mockPoisRepository.getWaypointAtKm.mockResolvedValue(samePoint)
      mockOverpassProvider.queryPois.mockResolvedValue([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValue([])

      await service.findPois({ ...liveDto, segmentId: '00000000-0000-0000-0000-aaaaaaaaaaaa' }, 'user-A')
      await service.findPois({ ...liveDto, segmentId: '00000000-0000-0000-0000-bbbbbbbbbbbb' }, 'user-B')

      const keyA = (mockRedisClient.get.mock.calls as string[][])[0][0]
      const keyB = (mockRedisClient.get.mock.calls as string[][])[1][0]
      expect(keyA).toBe(keyB)
    })

    it('re-inserts raw POIs and returns with correct distances on live cache HIT (Option A)', async () => {
      const rawCached = [{ externalId: '456', source: 'overpass' as const, name: 'Hôtel Live', lat: 43.3, lng: 1.3, category: 'hotel' }]
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(rawCached))
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([mockLivePoi])

      const result = await service.findPois(liveDto, userId)

      expect(result).toEqual([mockLivePoi])
      expect(mockPoisRepository.getWaypointAtKm).toHaveBeenCalledTimes(1)
      expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
      // Option A: re-insert + recompute + read back
      expect(mockPoisRepository.insertRawPoisForSegment).toHaveBeenCalledTimes(1)
      expect(mockPoisRepository.updatePoiDistances).toHaveBeenCalledWith(liveDto.segmentId)
      expect(mockPoisRepository.findPoisNearPoint).toHaveBeenCalledTimes(1)
    })

    it('calls findPoisNearPoint with correct radiusM', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])

      await service.findPois(liveDto, userId)

      expect(mockPoisRepository.findPoisNearPoint).toHaveBeenCalledWith(
        liveDto.segmentId, 43.3, 1.3, 3000, ['hotel'], [],
      )
    })

    it('falls through on Overpass failure and still queries DB', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockRejectedValueOnce(new Error('Overpass timeout'))
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([mockLivePoi])

      const result = await service.findPois(liveDto, userId)

      expect(result).toEqual([mockLivePoi])
    })

    it('still fetches Google Places when Overpass fails in live mode', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockRejectedValueOnce(new Error('All Overpass instances unavailable'))
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])

      await service.findPois(liveDto, userId)

      expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
    })

    it('stores raw POIs without segment-specific distances in Redis on live mode MISS (Option A)', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockResolvedValueOnce([overpassNode])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([mockLivePoi])

      await service.findPois(liveDto, userId)

      expect(mockRedisClient.setex).toHaveBeenCalledTimes(1)
      // Live mode uses POI_BBOX_CACHE_TTL (30 days = 2592000s)
      const [, ttl, storedJson] = mockRedisClient.setex.mock.calls[0] as [string, number, string]
      expect(ttl).toBe(POI_BBOX_CACHE_TTL)
      const stored = JSON.parse(storedJson) as Array<Record<string, unknown>>
      expect(stored[0]).not.toHaveProperty('distFromTraceM')
      expect(stored[0]).not.toHaveProperty('distAlongRouteKm')
      expect(stored[0]).not.toHaveProperty('distFromTargetM')
      expect(stored[0]).toHaveProperty('externalId')
      expect(stored[0]).toHaveProperty('source', 'overpass')
    })

    it('calls Google Places prefetch in live mode when configured', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])

      await service.findPois(liveDto, userId)

      expect(mockGooglePlacesProvider.isConfigured).toHaveBeenCalled()
      expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
    })

    it('Google Places failure does NOT reject live mode findPois', async () => {
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockGooglePlacesProvider.searchLayerPlaceIds.mockRejectedValue(new Error('Google API error'))

      await expect(service.findPois(liveDto, userId)).resolves.not.toThrow()
    })

    describe('live mode — overpassEnabled=false (Google Places primary source)', () => {
      const liveDtoNoOverpass = {
        segmentId: '00000000-0000-0000-0000-000000000001',
        targetKm: 42.3,
        radiusKm: 3,
        categories: ['hotel'] as string[],
        overpassEnabled: false,
      }

      it('hides Overpass-sourced POIs on read in live mode too', async () => {
        mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })

        await service.findPois(liveDtoNoOverpass, userId)

        expect(mockPoisRepository.findPoisNearPoint).toHaveBeenCalledWith(
          liveDtoNoOverpass.segmentId, 43.3, 1.3, 3000, ['hotel'], ['overpass'],
        )
      })

      it('skips Overpass and reads the DB after the prefetch (single read, no short-circuit)', async () => {
        mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
        mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([mockLivePoi])

        const result = await service.findPois(liveDtoNoOverpass, userId)

        expect(result).toEqual([mockLivePoi])
        expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
        expect(mockGooglePlacesProvider.searchLayerPlaceIds).not.toHaveBeenCalled()  // not configured
        expect(mockPoisRepository.findPoisNearPoint).toHaveBeenCalledTimes(1)
      })

      it('calls Google Places even when the radius ALREADY holds cached POIs (coverage gate)', async () => {
        mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
        mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
        mockGooglePlacesProvider.searchLayerPlaceIds.mockResolvedValue([])
        mockPoisRepository.findPoisNearPoint.mockResolvedValue([mockLivePoi])

        const result = await service.findPois(liveDtoNoOverpass, userId)

        expect(result).toEqual([mockLivePoi])
        expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
        expect(mockGooglePlacesProvider.searchLayerPlaceIds).toHaveBeenCalled()
        expect(mockPoisRepository.findPoisNearPoint).toHaveBeenCalledTimes(1)
      })

      it('does not throw when Google Places fails (catch path)', async () => {
        mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
        mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
        mockGooglePlacesProvider.searchLayerPlaceIds.mockRejectedValue(new Error('Google API error'))
        mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])

        const result = await service.findPois(liveDtoNoOverpass, userId)

        expect(result).toEqual([])
        expect(mockPoisRepository.findPoisNearPoint).toHaveBeenCalledTimes(1)
      })

      it('returns empty array when DB cache is empty and Google is NOT configured', async () => {
        mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce({ lat: 43.3, lng: 1.3 })
        mockGooglePlacesProvider.isConfigured.mockReturnValue(false)
        mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])

        const result = await service.findPois(liveDtoNoOverpass, userId)

        expect(result).toEqual([])
        expect(mockOverpassProvider.queryPois).not.toHaveBeenCalled()
        expect(mockGooglePlacesProvider.searchLayerPlaceIds).not.toHaveBeenCalled()
      })
    })
  })

  describe('bbox cache key — rounding precision', () => {
    it('rounds bbox coordinates to 3 decimal places in corridor mode key', async () => {
      // Waypoints that produce non-rounded bbox values
      const preciseWaypoints = [
        { lat: 43.00001, lng: 1.00001, distKm: 0 },
        { lat: 43.50009, lng: 1.50009, distKm: 30 },
      ]
      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(preciseWaypoints)
      mockRedisClient.get.mockResolvedValueOnce(null)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([])

      await service.findPois(baseDto, userId)

      const cacheKey = (mockRedisClient.get.mock.calls as string[][])[0][0]
      // Each coordinate segment must be a value with at most 3 decimal places
      const parts = cacheKey.replace('pois:bbox:', '').split(':')
      // parts: [minLat, minLng, maxLat, maxLng, categories]
      for (const coord of parts.slice(0, 4)) {
        const decimals = coord.includes('.') ? coord.split('.')[1].length : 0
        expect(decimals).toBeLessThanOrEqual(3)
      }
    })

    it('same bbox rounded to 3dp produces identical key regardless of floating-point drift', async () => {
      // Two slightly different waypoint sets that round to the same bbox
      const waypointsA = [{ lat: 43.0001, lng: 1.0001, distKm: 0 }, { lat: 43.5001, lng: 1.5001, distKm: 30 }]
      const waypointsB = [{ lat: 43.0004, lng: 1.0004, distKm: 0 }, { lat: 43.5004, lng: 1.5004, distKm: 30 }]

      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(waypointsA)
      mockRedisClient.get.mockResolvedValueOnce(null)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([])

      await service.findPois({ ...baseDto, segmentId: 'seg-A' }, userId)

      mockPoisRepository.getSegmentWaypoints.mockResolvedValueOnce(waypointsB)
      mockRedisClient.get.mockResolvedValueOnce(null)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findCachedPois.mockResolvedValueOnce([])

      await service.findPois({ ...baseDto, segmentId: 'seg-B' }, userId)

      const keyA = (mockRedisClient.get.mock.calls as string[][])[0][0]
      const keyB = (mockRedisClient.get.mock.calls as string[][])[1][0]
      expect(keyA).toBe(keyB)
    })
  })

  describe('bbox cache key — rounding precision (live mode)', () => {
    it('rounds bbox coordinates to 3 decimal places in live mode key', async () => {
      // targetPoint with precise float → bbox coords must be rounded to 3dp
      const precisePoint = { lat: 43.12345, lng: 1.98765 }
      mockPoisRepository.getWaypointAtKm.mockResolvedValueOnce(precisePoint)
      mockRedisClient.get.mockResolvedValueOnce(null)
      mockOverpassProvider.queryPois.mockResolvedValueOnce([])
      mockPoisRepository.findPoisNearPoint.mockResolvedValueOnce([])

      const liveDto = { segmentId: '00000000-0000-0000-0000-000000000001', targetKm: 10, radiusKm: 3, categories: ['hotel'] as string[], overpassEnabled: true }
      await service.findPois(liveDto, userId)

      const cacheKey = (mockRedisClient.get.mock.calls as string[][])[0][0]
      const parts = cacheKey.replace('pois:live:bbox:', '').split(':')
      for (const coord of parts.slice(0, 4)) {
        const decimals = coord.includes('.') ? coord.split('.')[1].length : 0
        expect(decimals).toBeLessThanOrEqual(3)
      }
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

    it('returns null when getPlaceDetails rejects (graceful degradation)', async () => {
      mockGooglePlacesProvider.isConfigured.mockReturnValue(true)
      mockRedisClient.get
        .mockResolvedValueOnce(placeId)   // placeId cached
        .mockResolvedValueOnce(null)      // details not cached
      mockGooglePlacesProvider.getPlaceDetails.mockRejectedValueOnce(new Error('Google API quota exceeded'))

      const result = await service.getPoiGoogleDetails(externalId, segmentId)

      expect(result).toBeNull()
      expect(mockRedisClient.setex).not.toHaveBeenCalled()
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
