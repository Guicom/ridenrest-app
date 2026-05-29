import { NotFoundException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import accessConfig from '../../config/access.config.js'
import { RoutingService } from '../../routing/routing.service.js'
import { BrouterUnavailableException } from '../../routing/brouter-unavailable.exception.js'
import { RedisProvider } from '../../common/providers/redis.provider.js'
import { AccessCalculatorModule } from './access-calculator.module.js'
import { AccessCalculatorService } from './access-calculator.service.js'
import { resolveOrigin } from './strategies/resolve-origin.js'
import { computeDivergentSegment } from './strategies/compute-divergent-segment.js'
import { getLiveAccessConsent } from './profile-lookup.js'

// Mock du lookup consent (fonction pure testée séparément dans profile-lookup.spec.ts).
jest.mock('./profile-lookup.js', () => ({ getLiveAccessConsent: jest.fn() }))
const mockGetConsent = getLiveAccessConsent as jest.Mock

// Mock @ridenrest/database — var (pas const) pour survivre au hoisting de jest.mock.
// eslint-disable-next-line no-var
var mockDb: { execute: jest.Mock }
jest.mock('@ridenrest/database', () => {
  mockDb = { execute: jest.fn() }
  return { db: mockDb }
})

// Mock des stratégies (fonctions pures testées séparément).
jest.mock('./strategies/resolve-origin.js', () => ({ resolveOrigin: jest.fn() }))
jest.mock('./strategies/compute-divergent-segment.js', () => ({ computeDivergentSegment: jest.fn() }))

const mockResolveOrigin = resolveOrigin as jest.Mock
const mockComputeDivergent = computeDivergentSegment as jest.Mock

const mockConfig = {
  brouterBaseUrl: 'http://localhost:17777',
  brouterTimeoutMs: 5000,
  brouterDefaultProfile: 'trekking',
  eagerThresholdM: 1500,
  traceBufferM: 10,
  cacheTtlLiveSeconds: 900,
  engineVersion: 'brouter-1.7.9+trekking',
}

const ROUTE = {
  geometry: { type: 'LineString' as const, coordinates: [[2, 48, 100]] },
  distanceM: 1000,
  elevationGainM: 50,
  elevationLossM: 40,
}
const METRICS = {
  distanceM: 850,
  elevationGainM: 45,
  elevationLossM: 30,
  geometry: { type: 'LineString' as const, coordinates: [[2, 48], [2.01, 48.01]] },
}

/** Ligne accommodations_cache (snake_case) sans cache d'accès (cache miss). */
function poiRowFresh(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'poi-1',
    lat: 48.5,
    lng: 2.5,
    dist_from_trace_m: 320,
    access_origin_stage_id: null,
    access_distance_m: null,
    access_elevation_gain_m: null,
    access_elevation_loss_m: null,
    access_geometry: null,
    access_engine_version: null,
    access_computed_at: null,
    adventure_id: 'adv-1',
    routing_profile: 'gravel',
    ...overrides,
  }
}

describe('AccessCalculatorService', () => {
  let service: AccessCalculatorService
  let warnSpy: jest.SpyInstance
  const computeRoute = jest.fn()
  const redisGet = jest.fn()
  const redisSetex = jest.fn()
  const mockRedisProvider = { getClient: () => ({ get: redisGet, setex: redisSetex }) }

  beforeEach(async () => {
    jest.clearAllMocks()
    mockDb.execute.mockReset()
    redisGet.mockReset()
    redisSetex.mockReset()
    mockGetConsent.mockReset()

    const module = await Test.createTestingModule({
      providers: [
        AccessCalculatorService,
        { provide: accessConfig.KEY, useValue: mockConfig },
        { provide: RoutingService, useValue: { computeRoute } },
        { provide: RedisProvider, useValue: mockRedisProvider },
      ],
    }).compile()

    service = module.get(AccessCalculatorService)
    warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined as never)
    jest.spyOn(service['logger'], 'debug').mockImplementation(() => undefined as never)
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined as never)
  })

  it('happy path planning : cache miss → BRouter → UPDATE DB → status ok (computed-fresh)', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      .mockResolvedValueOnce({ rows: [] }) // updateCache
    mockResolveOrigin.mockResolvedValue([2.4, 48.4])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'gps', lat: 48.4, lng: 2.4 },
      mode: 'planning',
    })

    expect(result).toMatchObject({
      status: 'ok',
      distanceM: 850,
      elevationGainM: 45,
      elevationLossM: 30,
      engineVersion: 'brouter-1.7.9+trekking',
      source: 'computed-fresh',
    })
    // profil 'gravel' → 'trekking' ; destination = [poi.lng, poi.lat]
    expect(computeRoute).toHaveBeenCalledWith({ from: [2.4, 48.4], to: [2.5, 48.5], profile: 'trekking' })
    // 2 requêtes DB : loadPoi + updateCache
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
  })

  it("cache hit DB → pas d'appel BRouter, source db-cache", async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        poiRowFresh({
          access_distance_m: 1500,
          access_elevation_gain_m: 80,
          access_elevation_loss_m: 60,
          access_geometry: JSON.stringify({ type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] }),
          access_engine_version: 'brouter-1.7.9+trekking',
          access_computed_at: '2026-05-01T10:00:00.000Z',
          access_origin_stage_id: null,
        }),
      ],
    })

    // GPS exclu du cache → utiliser adventure-start pour valider le cache hit
    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'adventure-start' },
      mode: 'planning',
    })

    expect(result).toMatchObject({ status: 'ok', source: 'db-cache', distanceM: 1500 })
    expect(computeRoute).not.toHaveBeenCalled()
    expect(mockDb.execute).toHaveBeenCalledTimes(1) // loadPoi seul, pas d'UPDATE
  })

  it("BRouter indisponible → status fallback, pas d'UPDATE cache", async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
    mockResolveOrigin.mockResolvedValue([2.4, 48.4])
    computeRoute.mockRejectedValue(new BrouterUnavailableException('timeout'))

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'gps', lat: 48.4, lng: 2.4 },
      mode: 'planning',
    })

    expect(result).toEqual({
      status: 'fallback',
      fallbackReason: 'routing_failed',
      fallbackDistanceM: 320, // dist_from_trace_m existant
      source: 'computed-fresh',
    })
    expect(mockDb.execute).toHaveBeenCalledTimes(1) // loadPoi uniquement, PAS d'UPDATE
  })

  it('POI inexistant → NotFoundException (cas dégénéré, throw autorisé)', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [] })

    await expect(
      service.compute({ poiId: 'ghost', origin: { type: 'adventure-start' }, mode: 'planning' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(computeRoute).not.toHaveBeenCalled()
  })

  it('cache présent mais engineVersion obsolète → recalcul (pas de db-cache)', async () => {
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          poiRowFresh({
            access_distance_m: 1500,
            access_geometry: JSON.stringify({ type: 'LineString', coordinates: [[2, 48]] }),
            access_engine_version: 'brouter-OLD',
            access_computed_at: '2026-05-01T10:00:00.000Z',
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
    mockResolveOrigin.mockResolvedValue([2.4, 48.4])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'gps', lat: 48.4, lng: 2.4 },
      mode: 'planning',
    })

    expect(result).toMatchObject({ source: 'computed-fresh' })
    expect(computeRoute).toHaveBeenCalled()
  })

  it('erreur non-BRouter (étape inexistante) → propagée (cas dégénéré)', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
    mockResolveOrigin.mockRejectedValue(new NotFoundException('Stage not found'))

    await expect(
      service.compute({ poiId: 'poi-1', origin: { type: 'stage', stageId: 'ghost' }, mode: 'planning' }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(computeRoute).not.toHaveBeenCalled()
  })

  it('origin stage + géométrie volumineuse → UPDATE avec stageId + WARN taille (AC #8)', async () => {
    const bigCoords = Array.from({ length: 3000 }, (_, i) => [2 + i * 1e-6, 48 + i * 1e-6])
    mockDb.execute
      .mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      .mockResolvedValueOnce({ rows: [] }) // updateCache
    mockResolveOrigin.mockResolvedValue([2.4, 48.4])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue({ ...METRICS, geometry: { type: 'LineString', coordinates: bigCoords } })

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'stage', stageId: 'stage-9' },
      mode: 'planning',
    })

    expect(result.status).toBe('ok')
    expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: 'access_geometry_large' }))
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
  })

  it('cache hit avec géométrie MultiLineString → type natif préservé, sans aplatissement', async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        poiRowFresh({
          access_distance_m: 1500,
          access_elevation_gain_m: 10,
          access_elevation_loss_m: 5,
          access_geometry: JSON.stringify({
            type: 'MultiLineString',
            coordinates: [[[2, 48], [2.01, 48.01]], [[2.02, 48.02]]],
          }),
          access_engine_version: 'brouter-1.7.9+trekking',
          access_computed_at: '2026-05-01T10:00:00.000Z',
        }),
      ],
    })

    // GPS exclu du cache → adventure-start pour valider le cache hit
    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'adventure-start' },
      mode: 'planning',
    })

    expect(result).toMatchObject({ status: 'ok', source: 'db-cache' })
    if (result.status === 'ok') {
      expect(result.geometry).toEqual({
        type: 'MultiLineString',
        coordinates: [[[2, 48], [2.01, 48.01]], [[2.02, 48.02]]],
      })
    }
  })

  it('le module se compile et fournit AccessCalculatorService (wiring DI)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [accessConfig] }), AccessCalculatorModule],
    })
      // RedisProvider est @Global (RedisModule) en prod ; on l'override ici pour éviter
      // une connexion Redis réelle dans ce test de wiring isolé.
      .overrideProvider(RedisProvider)
      .useValue(mockRedisProvider)
      .compile()

    expect(moduleRef.get(AccessCalculatorService)).toBeInstanceOf(AccessCalculatorService)
    await moduleRef.close()
  })

  // ── Mode Live (Story 3.1) ────────────────────────────────────────────────────
  describe('mode live', () => {
    const GPS = { type: 'gps' as const, lat: 48.85, lng: 2.35 }

    it('consent=true + cache miss Redis → BRouter → SET Redis → ok (computed-fresh)', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      mockGetConsent.mockResolvedValue(true)
      redisGet.mockResolvedValue(null) // cache miss
      mockResolveOrigin.mockResolvedValue([2.35, 48.85])
      computeRoute.mockResolvedValue(ROUTE)
      mockComputeDivergent.mockResolvedValue(METRICS)

      const result = await service.compute({
        poiId: 'poi-1',
        origin: GPS,
        mode: 'live',
        userId: 'user-1',
      })

      expect(result).toMatchObject({ status: 'ok', source: 'computed-fresh', distanceM: 850 })
      // clé Redis anonyme : profil 'gravel' → 'trekking', pas d'userId
      const [key, ttl] = redisSetex.mock.calls[0] as [string, number, string]
      expect(key).toBe('access:live:poi-1:trekking:48.85:2.35')
      expect(key).not.toContain('user-1')
      expect(ttl).toBe(900)
      // PAS d'UPDATE DB en mode live (loadPoi uniquement)
      expect(mockDb.execute).toHaveBeenCalledTimes(1)
    })

    it('consent=true + cache hit Redis → ok (redis-cache), pas de BRouter', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      mockGetConsent.mockResolvedValue(true)
      redisGet.mockResolvedValue(
        JSON.stringify({
          distanceM: 1200,
          elevationGainM: 70,
          elevationLossM: 55,
          geometry: { type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] },
          engineVersion: 'brouter-1.7.9+trekking',
          computedAt: '2026-05-29T18:00:00.000Z',
        }),
      )

      const result = await service.compute({ poiId: 'poi-1', origin: GPS, mode: 'live', userId: 'user-1' })

      expect(result).toMatchObject({ status: 'ok', source: 'redis-cache', distanceM: 1200 })
      expect(computeRoute).not.toHaveBeenCalled()
      expect(redisSetex).not.toHaveBeenCalled()
    })

    it('cache hit Redis mais engineVersion obsolète → traité comme miss → recalcul frais (review P1)', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      mockGetConsent.mockResolvedValue(true)
      redisGet.mockResolvedValue(
        JSON.stringify({
          distanceM: 1200,
          elevationGainM: 70,
          elevationLossM: 55,
          geometry: { type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] },
          engineVersion: 'brouter-1.6.0+OLD', // ≠ config.engineVersion → entrée périmée
          computedAt: '2026-05-29T18:00:00.000Z',
        }),
      )
      mockResolveOrigin.mockResolvedValue([2.35, 48.85])
      computeRoute.mockResolvedValue(ROUTE)
      mockComputeDivergent.mockResolvedValue(METRICS)

      const result = await service.compute({ poiId: 'poi-1', origin: GPS, mode: 'live', userId: 'user-1' })

      // L'entrée obsolète est ignorée : recalcul BRouter + ré-écriture cache.
      expect(result).toMatchObject({ status: 'ok', source: 'computed-fresh', distanceM: 850 })
      expect(computeRoute).toHaveBeenCalledTimes(1)
      expect(redisSetex).toHaveBeenCalledTimes(1)
    })

    it('consent=false → fallback no_consent, sans BRouter ni Redis', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      mockGetConsent.mockResolvedValue(false)

      const result = await service.compute({ poiId: 'poi-1', origin: GPS, mode: 'live', userId: 'user-1' })

      expect(result).toEqual({
        status: 'fallback',
        fallbackReason: 'no_consent',
        fallbackDistanceM: 320, // dist_from_trace_m
        source: 'computed-fresh',
      })
      expect(computeRoute).not.toHaveBeenCalled()
      expect(redisGet).not.toHaveBeenCalled()
    })

    it('consent=null (jamais demandé) → fallback no_consent', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] })
      mockGetConsent.mockResolvedValue(null)

      const result = await service.compute({ poiId: 'poi-1', origin: GPS, mode: 'live', userId: 'user-1' })

      expect(result).toMatchObject({ status: 'fallback', fallbackReason: 'no_consent' })
      expect(computeRoute).not.toHaveBeenCalled()
    })

    it('consent=true mais BRouter down → fallback routing_failed, pas de SET Redis', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] })
      mockGetConsent.mockResolvedValue(true)
      redisGet.mockResolvedValue(null)
      mockResolveOrigin.mockResolvedValue([2.35, 48.85])
      computeRoute.mockRejectedValue(new BrouterUnavailableException('timeout'))

      const result = await service.compute({ poiId: 'poi-1', origin: GPS, mode: 'live', userId: 'user-1' })

      expect(result).toMatchObject({ status: 'fallback', fallbackReason: 'routing_failed', fallbackDistanceM: 320 })
      expect(redisSetex).not.toHaveBeenCalled()
    })

    it("clé Redis n'inclut jamais userId (anonymisation NFR-PA-006)", async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] })
      mockGetConsent.mockResolvedValue(true)
      redisGet.mockResolvedValue(null)
      mockResolveOrigin.mockResolvedValue([2.35, 48.85])
      computeRoute.mockResolvedValue(ROUTE)
      mockComputeDivergent.mockResolvedValue(METRICS)

      await service.compute({ poiId: 'poi-1', origin: GPS, mode: 'live', userId: 'super-secret-user' })

      const getKey = (redisGet.mock.calls[0] as [string])[0]
      const setKey = (redisSetex.mock.calls[0] as [string, number, string])[0]
      expect(getKey).not.toContain('super-secret-user')
      expect(setKey).not.toContain('super-secret-user')
    })

    it('erreur de lecture Redis → dégrade en calcul frais (best-effort)', async () => {
      mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] })
      mockGetConsent.mockResolvedValue(true)
      redisGet.mockRejectedValue(new Error('redis down'))
      mockResolveOrigin.mockResolvedValue([2.35, 48.85])
      computeRoute.mockResolvedValue(ROUTE)
      mockComputeDivergent.mockResolvedValue(METRICS)

      const result = await service.compute({ poiId: 'poi-1', origin: GPS, mode: 'live', userId: 'user-1' })

      expect(result).toMatchObject({ status: 'ok', source: 'computed-fresh' })
      expect(warnSpy).toHaveBeenCalledWith(expect.objectContaining({ msg: 'access_redis_read_failed' }))
    })
  })
})
