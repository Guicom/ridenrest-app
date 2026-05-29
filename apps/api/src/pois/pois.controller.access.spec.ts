/**
 * Tests d'intégration de l'endpoint `POST /pois/:id/access` (Story 2.3, AC #9).
 *
 * Stratégie (cf. Doc Sync) : test d'intégration au niveau controller plutôt qu'un
 * E2E DB-backed. Raison : le CI projet exécute `pnpm test` (Jest unitaire) SANS
 * Postgres/Redis et ne câble pas `test:e2e`. On reconstitue ici la pile HTTP réelle
 * (ValidationPipe global, ResponseInterceptor, HttpExceptionFilter, ThrottlerGuard
 * global, OwnerOnlyGuard, pipe Zod) avec :
 *   - `AccessCalculatorService` mocké (sa logique est unit-testée en Story 2.2),
 *   - `JwtAuthGuard` remplacé par un faux pilotable via le header `x-test-user-id`,
 *   - `db.execute` mocké pour piloter `checkPoiOwnership` (owner / non-owner).
 * Couvre tous les cas de l'AC #9 au niveau du contrat HTTP. Tourne en CI (`jest`).
 */
import type { INestApplication } from '@nestjs/common'
import { NotFoundException, UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { Test } from '@nestjs/testing'
import type { ExecutionContext } from '@nestjs/common'
import request from 'supertest'
import type { Response as SupertestResponse } from 'supertest'
import type { App } from 'supertest/types'

/** Forme typée du body de réponse (wrappé par ResponseInterceptor, ou erreur filtrée). */
interface AccessApiBody {
  data?: { status?: string; source?: string; fallbackReason?: string }
  error?: { code?: string; message?: unknown }
}
const bodyOf = (res: SupertestResponse): AccessApiBody => res.body as AccessApiBody

// Mock @ridenrest/database — var (pas const) pour survivre au hoisting de jest.mock.
// eslint-disable-next-line no-var
var mockDb: { execute: jest.Mock }
jest.mock('@ridenrest/database', () => {
  mockDb = { execute: jest.fn() }
  return { db: mockDb }
})

// `jose` est ESM-only (non transformé par ts-jest) et n'est tiré que par le vrai
// JwtAuthGuard, lui-même remplacé par un faux ici. On le neutralise donc.
jest.mock('jose', () => ({ jwtVerify: jest.fn(), createRemoteJWKSet: jest.fn() }))

import { PoisController } from './pois.controller.js'
import { PoisService } from './pois.service.js'
import { AccessCalculatorService } from './access-calculator/access-calculator.service.js'
import { RoutingService } from '../routing/routing.service.js'
import accessConfig from '../config/access.config.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { RedisProvider } from '../common/providers/redis.provider.js'
import { ResponseInterceptor } from '../common/interceptors/response.interceptor.js'
import { HttpExceptionFilter } from '../common/filters/http-exception.filter.js'

const POI_ID = '123e4567-e89b-12d3-a456-426614174000'
const STAGE_ID = '223e4567-e89b-12d3-a456-426614174000'
const USER_ID = '00000000-0000-0000-0000-000000000001'

const OK_RESULT = {
  status: 'ok' as const,
  distanceM: 1234,
  elevationGainM: 50,
  elevationLossM: 12,
  geometry: { type: 'LineString' as const, coordinates: [[2.35, 48.85], [2.36, 48.86]] },
  engineVersion: 'brouter-1.7.9+trekking',
  computedAt: new Date(0).toISOString(),
  source: 'computed-fresh' as const,
}

const validBody = { origin: { type: 'stage', stageId: STAGE_ID } }

/** Faux JwtAuthGuard : 401 si pas de header x-test-user-id, sinon peuple req.user. */
const fakeJwtGuard = {
  canActivate: (ctx: ExecutionContext): boolean => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>()
    const id = req.headers['x-test-user-id']
    if (!id) throw new UnauthorizedException('Missing or invalid Authorization header')
    req.user = { id, email: 'test@example.com' }
    return true
  },
}

describe('POST /pois/:id/access (integration)', () => {
  let app: INestApplication<App>
  let compute: jest.Mock

  beforeEach(async () => {
    mockDb.execute.mockReset()
    compute = jest.fn()

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [PoisController],
      providers: [
        Reflector,
        { provide: PoisService, useValue: {} },
        { provide: AccessCalculatorService, useValue: { compute } },
        // Auth est porté par le @UseGuards(JwtAuthGuard) au niveau méthode (overridé
        // par fakeJwtGuard) ; on n'enregistre PAS JwtAuthGuard en APP_GUARD ici (le
        // vrai guard global échapperait à overrideGuard et tirerait `jose`).
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwtGuard)
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new ResponseInterceptor())
    // Filtre global du projet : façonne le body d'erreur en { error: { code, message } }.
    const fakeLogger = { error: jest.fn() } as unknown as ConstructorParameters<typeof HttpExceptionFilter>[0]
    app.useGlobalFilters(new HttpExceptionFilter(fakeLogger))
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  /** Helper : POI possédé par le user (la requête d'ownership renvoie une ligne). */
  const ownerRows = () => mockDb.execute.mockResolvedValue({ rows: [{ '?column?': 1 }] })

  it('happy path planning (origin stage) → 200 ok', async () => {
    ownerRows()
    compute.mockResolvedValue(OK_RESULT)

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(bodyOf(res).data?.status).toBe('ok')
    expect(bodyOf(res).data?.source).toBe('computed-fresh')
    expect(compute).toHaveBeenCalledWith({
      poiId: POI_ID,
      origin: { type: 'stage', stageId: STAGE_ID },
      profileOverride: undefined,
      mode: 'planning',
      userId: USER_ID,
    })
  })

  it('invalid body → 400', async () => {
    ownerRows()
    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send({ origin: { type: 'stage', stageId: 'not-a-uuid' } })

    expect(res.status).toBe(400)
    expect(bodyOf(res).error?.code).toBe('BAD_REQUEST')
    expect(compute).not.toHaveBeenCalled()
  })

  it('no JWT → 401', async () => {
    ownerRows()
    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .send(validBody)

    expect(res.status).toBe(401)
    expect(compute).not.toHaveBeenCalled()
  })

  it("POI of another user → 403", async () => {
    mockDb.execute.mockResolvedValue({ rows: [] }) // ownership check fails
    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(validBody)

    expect(res.status).toBe(403)
    expect(compute).not.toHaveBeenCalled()
  })

  it('POI not found (compute throws NotFound) → 404', async () => {
    ownerRows() // guard passes (POI existed at check time)
    compute.mockRejectedValue(new NotFoundException(`POI not found: ${POI_ID}`))

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(validBody)

    expect(res.status).toBe(404)
  })

  it('BRouter down → 200 fallback', async () => {
    ownerRows()
    compute.mockResolvedValue({
      status: 'fallback',
      fallbackReason: 'routing_failed',
      fallbackDistanceM: 800,
      source: 'computed-fresh',
    })

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(bodyOf(res).data?.status).toBe('fallback')
    expect(bodyOf(res).data?.fallbackReason).toBe('routing_failed')
  })

  it('cache hit → 200 with source db-cache', async () => {
    ownerRows()
    compute.mockResolvedValue({ ...OK_RESULT, source: 'db-cache' })

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(validBody)

    expect(res.status).toBe(200)
    expect(bodyOf(res).data?.source).toBe('db-cache')
    // mode planning => le service décide du cache hit (BRouter non appelé : couvert en Story 2.2)
    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ mode: 'planning' }))
  })

  it('rate limit: 61st call → 429 with Retry-After header', async () => {
    ownerRows()
    compute.mockResolvedValue(OK_RESULT)
    const server = app.getHttpServer()

    // 60 calls under the limit
    for (let i = 0; i < 60; i++) {
      const ok = await request(server)
        .post(`/pois/${POI_ID}/access`)
        .set('x-test-user-id', USER_ID)
        .send(validBody)
      expect(ok.status).toBe(200)
    }

    const res = await request(server)
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(validBody)

    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
  })
})

/**
 * Renforcement AC #9 (review D2) — « cache hit → pas d'appel BRouter » À TRAVERS la pile HTTP.
 *
 * Le suite ci-dessus mocke entièrement `AccessCalculatorService.compute` : l'absence
 * d'appel BRouter sur un cache hit y est donc inobservable (assertion couverte au niveau
 * unitaire en Story 2.2). Ce bloc câble le VRAI `AccessCalculatorService` avec un
 * `RoutingService` espionné et une `db` mockée renvoyant une ligne de cache valide, puis
 * vérifie de bout en bout (controller → service → RoutingService) que `computeRoute`
 * n'est JAMAIS appelé quand le cache DB répond.
 */
describe('POST /pois/:id/access — cache hit ne touche pas BRouter (real service)', () => {
  let app: INestApplication<App>
  const computeRoute = jest.fn()

  const mockAccessConfig = {
    brouterBaseUrl: 'http://localhost:17777',
    brouterTimeoutMs: 5000,
    brouterDefaultProfile: 'trekking',
    eagerThresholdM: 1500,
    traceBufferM: 10,
    cacheTtlLiveSeconds: 900,
    engineVersion: 'brouter-1.7.9+trekking',
  }

  /** Ligne accommodations_cache (snake_case) avec un cache d'accès VALIDE → cache hit. */
  const cachedPoiRow = {
    id: POI_ID,
    lat: 48.5,
    lng: 2.5,
    dist_from_trace_m: 320,
    access_origin_stage_id: null,
    access_distance_m: 1500,
    access_elevation_gain_m: 80,
    access_elevation_loss_m: 60,
    access_geometry: JSON.stringify({ type: 'LineString', coordinates: [[2, 48], [2.01, 48.01]] }),
    access_engine_version: 'brouter-1.7.9+trekking', // === mockAccessConfig.engineVersion
    access_computed_at: '2026-05-01T10:00:00.000Z',
    adventure_id: 'adv-1',
    routing_profile: 'gravel',
  }

  beforeEach(async () => {
    mockDb.execute.mockReset()
    computeRoute.mockReset()

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
      controllers: [PoisController],
      providers: [
        Reflector,
        { provide: PoisService, useValue: {} },
        AccessCalculatorService, // ← le VRAI service (pas un mock)
        { provide: accessConfig.KEY, useValue: mockAccessConfig },
        { provide: RoutingService, useValue: { computeRoute } }, // espion BRouter
        // Cache hit DB (planning) → Redis non touché ; provider requis pour la DI.
        { provide: RedisProvider, useValue: { getClient: () => ({ get: jest.fn(), setex: jest.fn() }) } },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwtGuard)
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    app.useGlobalInterceptors(new ResponseInterceptor())
    const fakeLogger = { error: jest.fn() } as unknown as ConstructorParameters<typeof HttpExceptionFilter>[0]
    app.useGlobalFilters(new HttpExceptionFilter(fakeLogger))
    await app.init()
  })

  afterEach(async () => {
    await app.close()
  })

  it('cache hit (origin adventure-start) → 200 db-cache sans appel RoutingService', async () => {
    // Toute requête execute renvoie la ligne en cache : suffit à la fois pour la requête
    // d'ownership du guard (rows.length > 0 → owner) et pour `loadPoi` (rows[0] = cache).
    mockDb.execute.mockResolvedValue({ rows: [cachedPoiRow] })

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send({ origin: { type: 'adventure-start' } })

    expect(res.status).toBe(200)
    expect(bodyOf(res).data?.status).toBe('ok')
    expect(bodyOf(res).data?.source).toBe('db-cache')
    // Le cœur de l'assertion AC #9 : aucun appel BRouter sur un cache hit, vérifié à
    // travers la pile HTTP réelle (et non plus déduit d'un service mocké).
    expect(computeRoute).not.toHaveBeenCalled()
  })
})
