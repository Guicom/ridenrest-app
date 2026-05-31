import { NotFoundException } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { Test } from '@nestjs/testing'
import accessConfig from '../../config/access.config.js'
import { RoutingService } from '../../routing/routing.service.js'
import { BrouterUnavailableException } from '../../routing/brouter-unavailable.exception.js'
import { AccessCalculatorModule } from './access-calculator.module.js'
import { AccessCalculatorService } from './access-calculator.service.js'
import { resolveOriginCandidates } from './strategies/resolve-origin.js'
import { computeDivergentSegment } from './strategies/compute-divergent-segment.js'

// Mock @ridenrest/database — var (pas const) pour survivre au hoisting de jest.mock.
// eslint-disable-next-line no-var
var mockDb: { execute: jest.Mock }
jest.mock('@ridenrest/database', () => {
  mockDb = { execute: jest.fn() }
  return { db: mockDb }
})

// Mock des stratégies (fonctions pures testées séparément).
jest.mock('./strategies/resolve-origin.js', () => ({ resolveOriginCandidates: jest.fn() }))
jest.mock('./strategies/compute-divergent-segment.js', () => ({ computeDivergentSegment: jest.fn() }))

const mockResolveCandidates = resolveOriginCandidates as jest.Mock
const mockComputeDivergent = computeDivergentSegment as jest.Mock

const mockConfig = {
  brouterBaseUrl: 'http://localhost:17777',
  brouterTimeoutMs: 5000,
  brouterDefaultProfile: 'trekking',
  eagerThresholdM: 1500,
  traceBufferM: 10,
  candidateRadiusM: 10000,
  maxCandidates: 4,
  engineVersion: 'brouter-1.7.9+trekking',
}

const ROUTE = {
  geometry: { type: 'LineString' as const, coordinates: [[2, 48, 100]] },
  distanceM: 1000,
  elevationGainM: 50,
  elevationLossM: 40,
  timeS: 600,
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
    access_variants: null,
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
  let errorSpy: jest.SpyInstance
  const computeRoute = jest.fn()

  beforeEach(async () => {
    jest.clearAllMocks()
    mockDb.execute.mockReset()

    const module = await Test.createTestingModule({
      providers: [
        AccessCalculatorService,
        { provide: accessConfig.KEY, useValue: mockConfig },
        { provide: RoutingService, useValue: { computeRoute } },
      ],
    }).compile()

    service = module.get(AccessCalculatorService)
    warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined as never)
    errorSpy = jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined as never)
    jest.spyOn(service['logger'], 'debug').mockImplementation(() => undefined as never)
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined as never)
  })

  it('happy path : cache miss → BRouter → UPDATE DB → status ok (computed-fresh)', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      .mockResolvedValueOnce({ rows: [] }) // updateCache
    mockResolveCandidates.mockResolvedValue([[2.4, 48.4]])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'nearest-trace' },
    })

    expect(result).toMatchObject({
      status: 'ok',
      distanceM: 850,
      elevationGainM: 45,
      elevationLossM: 30,
      engineVersion: 'brouter-1.7.9+trekking',
      source: 'computed-fresh',
    })
    // profil projet 'gravel' → BRouter 'gravel' ; destination = [poi.lng, poi.lat]
    expect(computeRoute).toHaveBeenCalledWith({ from: [2.4, 48.4], to: [2.5, 48.5], profile: 'gravel' })
    // 2 requêtes DB : loadPoi + updateCache
    expect(mockDb.execute).toHaveBeenCalledTimes(2)
  })

  it('plusieurs candidats → retient le meilleur temps réel (profil-aware), pas le plus proche à vol d\'oiseau', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [poiRowFresh({ routing_profile: 'road' })] }) // loadPoi
      .mockResolvedValueOnce({ rows: [] }) // updateCache
    // Candidat A = le plus proche géométriquement mais lent (pistes) ; candidat B = plus loin
    // mais sur nationale → temps BRouter plus court en fastbike.
    mockResolveCandidates.mockResolvedValue([
      [2.41, 48.41], // A
      [2.42, 48.42], // B
    ])
    const routeSlow = { ...ROUTE, distanceM: 4000, timeS: 4200 } // A : raccourci lent
    const routeFast = { ...ROUTE, distanceM: 9000, timeS: 1800 } // B : nationale rapide
    computeRoute
      .mockImplementationOnce(() => Promise.resolve(routeSlow))
      .mockImplementationOnce(() => Promise.resolve(routeFast))
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({ poiId: 'poi-1', origin: { type: 'nearest-trace' } })

    expect(result).toMatchObject({ status: 'ok', source: 'computed-fresh' })
    // Les deux candidats sont routés (road → fastbike)…
    expect(computeRoute).toHaveBeenCalledTimes(2)
    expect(computeRoute).toHaveBeenNthCalledWith(1, { from: [2.41, 48.41], to: [2.5, 48.5], profile: 'fastbike' })
    expect(computeRoute).toHaveBeenNthCalledWith(2, { from: [2.42, 48.42], to: [2.5, 48.5], profile: 'fastbike' })
    // … et c'est la géométrie du candidat rapide (B) qui part au calcul du segment divergent.
    expect(mockComputeDivergent).toHaveBeenCalledWith(
      expect.anything(),
      routeFast.geometry,
      'adv-1',
      10,
    )
    // Les 2 variantes sont exposées, triées meilleur-d'abord : B (etaS 1800) avant A (4200).
    if (result.status === 'ok') {
      expect(result.variants).toHaveLength(2)
      expect(result.variants[0]).toMatchObject({ entryPoint: [2.42, 48.42], etaS: 1800 })
      expect(result.variants[1]).toMatchObject({ entryPoint: [2.41, 48.41], etaS: 4200 })
      // top-level = variants[0].
      expect(result.distanceM).toBe(result.variants[0].distanceM)
    }
  })

  it('un candidat échoue, un autre réussit → on garde le succès (résilience BRouter)', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      .mockResolvedValueOnce({ rows: [] }) // updateCache
    mockResolveCandidates.mockResolvedValue([[2.41, 48.41], [2.42, 48.42]])
    computeRoute
      .mockRejectedValueOnce(new BrouterUnavailableException('http_error'))
      .mockResolvedValueOnce(ROUTE)
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({ poiId: 'poi-1', origin: { type: 'nearest-trace' } })

    expect(result).toMatchObject({ status: 'ok', source: 'computed-fresh' })
    expect(computeRoute).toHaveBeenCalledTimes(2)
  })

  it('échec d\'écriture cache → réponse ok quand même servie + log ERROR visible (régression 0017)', async () => {
    mockDb.execute
      .mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      .mockRejectedValueOnce(new Error('Geometry type (MultiLineString) does not match column type (LineString)')) // updateCache throw
    mockResolveCandidates.mockResolvedValue([[2.4, 48.4]])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({ poiId: 'poi-1', origin: { type: 'nearest-trace' } })

    // La réponse reste servie (best-effort cache) …
    expect(result).toMatchObject({ status: 'ok', source: 'computed-fresh' })
    // … mais l'échec d'écriture est loggé en ERROR (plus de warn muet) avec le contexte.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ msg: 'access_cache_write_failed', poiId: 'poi-1', geometryType: 'LineString' }),
    )
  })

  it('POI sur la trace (nearest-trace, dist ≤ buffer) → accès ~0 sans appel BRouter (guard review 3.3)', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh({ dist_from_trace_m: 6 })] }) // loadPoi seul

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'nearest-trace' },
    })

    expect(result).toMatchObject({
      status: 'ok',
      distanceM: 6,
      elevationGainM: 0,
      elevationLossM: 0,
      source: 'computed-fresh',
    })
    // Court-circuit : ni résolution d'origine, ni BRouter, ni UPDATE cache.
    expect(mockResolveCandidates).not.toHaveBeenCalled()
    expect(computeRoute).not.toHaveBeenCalled()
    expect(mockDb.execute).toHaveBeenCalledTimes(1) // loadPoi uniquement
  })

  it("cache hit DB → pas d'appel BRouter, source db-cache", async () => {
    mockDb.execute.mockResolvedValueOnce({
      rows: [
        poiRowFresh({
          access_distance_m: 1500,
          access_elevation_gain_m: 80,
          access_elevation_loss_m: 60,
          access_geometry: JSON.stringify({ type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] }),
          access_variants: [
            {
              entryPoint: [2.4, 48.4],
              distanceM: 1500,
              elevationGainM: 80,
              elevationLossM: 60,
              etaS: 900,
              geometry: { type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] },
            },
          ],
          access_engine_version: 'brouter-1.7.9+trekking',
          access_computed_at: '2026-05-01T10:00:00.000Z',
          access_origin_stage_id: null,
        }),
      ],
    })

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'nearest-trace' },
    })

    expect(result).toMatchObject({ status: 'ok', source: 'db-cache', distanceM: 1500 })
    // Les variantes en cache sont restituées telles quelles.
    if (result.status === 'ok') expect(result.variants).toHaveLength(1)
    expect(computeRoute).not.toHaveBeenCalled()
    expect(mockDb.execute).toHaveBeenCalledTimes(1) // loadPoi seul, pas d'UPDATE
  })

  it('cache présent mais access_variants null (ligne pré-multicand) → recalcul forcé', async () => {
    mockDb.execute
      .mockResolvedValueOnce({
        rows: [
          poiRowFresh({
            access_distance_m: 1500,
            access_elevation_gain_m: 80,
            access_elevation_loss_m: 60,
            access_geometry: JSON.stringify({ type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] }),
            access_variants: null, // colonne pas encore peuplée
            access_engine_version: 'brouter-1.7.9+trekking',
            access_computed_at: '2026-05-01T10:00:00.000Z',
          }),
        ],
      })
      .mockResolvedValueOnce({ rows: [] }) // updateCache
    mockResolveCandidates.mockResolvedValue([[2.4, 48.4]])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({ poiId: 'poi-1', origin: { type: 'nearest-trace' } })

    expect(result).toMatchObject({ source: 'computed-fresh' }) // pas db-cache
    expect(computeRoute).toHaveBeenCalled()
  })

  it("BRouter indisponible → status fallback, pas d'UPDATE cache", async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
    mockResolveCandidates.mockResolvedValue([[2.4, 48.4]])
    computeRoute.mockRejectedValue(new BrouterUnavailableException('timeout'))

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'nearest-trace' },
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
      service.compute({ poiId: 'ghost', origin: { type: 'nearest-trace' } }),
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
    mockResolveCandidates.mockResolvedValue([[2.4, 48.4]])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue(METRICS)

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'nearest-trace' },
    })

    expect(result).toMatchObject({ source: 'computed-fresh' })
    expect(computeRoute).toHaveBeenCalled()
  })

  it('erreur non-BRouter (étape inexistante) → propagée (cas dégénéré)', async () => {
    mockDb.execute.mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
    mockResolveCandidates.mockRejectedValue(new NotFoundException('Stage not found'))

    await expect(
      service.compute({ poiId: 'poi-1', origin: { type: 'stage', stageId: 'ghost' } }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(computeRoute).not.toHaveBeenCalled()
  })

  it('origin stage + géométrie volumineuse → UPDATE avec stageId + WARN taille (AC #8)', async () => {
    const bigCoords = Array.from({ length: 3000 }, (_, i) => [2 + i * 1e-6, 48 + i * 1e-6])
    mockDb.execute
      .mockResolvedValueOnce({ rows: [poiRowFresh()] }) // loadPoi
      .mockResolvedValueOnce({ rows: [] }) // updateCache
    mockResolveCandidates.mockResolvedValue([[2.4, 48.4]])
    computeRoute.mockResolvedValue(ROUTE)
    mockComputeDivergent.mockResolvedValue({ ...METRICS, geometry: { type: 'LineString', coordinates: bigCoords } })

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'stage', stageId: 'stage-9' },
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
          access_variants: [
            {
              entryPoint: [2.4, 48.4],
              distanceM: 1500,
              elevationGainM: 10,
              elevationLossM: 5,
              etaS: 700,
              geometry: { type: 'MultiLineString', coordinates: [[[2, 48], [2.01, 48.01]], [[2.02, 48.02]]] },
            },
          ],
          access_engine_version: 'brouter-1.7.9+trekking',
          access_computed_at: '2026-05-01T10:00:00.000Z',
        }),
      ],
    })

    const result = await service.compute({
      poiId: 'poi-1',
      origin: { type: 'nearest-trace' },
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
    }).compile()

    expect(moduleRef.get(AccessCalculatorService)).toBeInstanceOf(AccessCalculatorService)
    await moduleRef.close()
  })
})
