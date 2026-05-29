/**
 * Tests d'intégration du mode Live de `POST /pois/:id/access` (Story 3.1, AC #1/#2/#4/#7).
 *
 * Stratégie (cf. Doc Sync, carry-forward Story 2.3) : test d'intégration au niveau
 * controller plutôt qu'un E2E DB+Redis. Raison : le CI projet exécute `pnpm test`
 * (Jest unitaire, rootDir=src) SANS Postgres/Redis et ne câble pas `test:e2e`
 * (`ioredis-mock` n'est pas installé). On reconstitue ici la pile HTTP réelle
 * (ValidationPipe, ResponseInterceptor, HttpExceptionFilter, AccessThrottlerGuard,
 * OwnerOnlyGuard, pipe Zod) avec :
 *   - `AccessCalculatorService.compute` mocké (consent/Redis/BRouter unit-testés en 3.1),
 *   - `JwtAuthGuard` remplacé par un faux pilotable via `x-test-user-id`,
 *   - `db.execute` mocké pour piloter `checkPoiOwnership`.
 * Couvre la dérivation du mode (gps → live), le passage de `userId`, le rate limit Live
 * conditionnel (120/min) et la validation Zod des coordonnées arrondies.
 */
import type { INestApplication } from '@nestjs/common'
import { UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { Test } from '@nestjs/testing'
import type { ExecutionContext } from '@nestjs/common'
import request from 'supertest'
import type { Response as SupertestResponse } from 'supertest'
import type { App } from 'supertest/types'

interface AccessApiBody {
  data?: { status?: string; source?: string; fallbackReason?: string }
  error?: { code?: string; message?: unknown }
}
const bodyOf = (res: SupertestResponse): AccessApiBody => res.body as AccessApiBody

// eslint-disable-next-line no-var
var mockDb: { execute: jest.Mock }
jest.mock('@ridenrest/database', () => {
  mockDb = { execute: jest.fn() }
  return { db: mockDb }
})

// `jose` est ESM-only et n'est tiré que par le vrai JwtAuthGuard (ici remplacé).
jest.mock('jose', () => ({ jwtVerify: jest.fn(), createRemoteJWKSet: jest.fn() }))

import { PoisController } from './pois.controller.js'
import { PoisService } from './pois.service.js'
import { AccessCalculatorService } from './access-calculator/access-calculator.service.js'
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js'
import { AccessThrottlerGuard } from '../common/guards/access-throttler.guard.js'
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
const gpsBody = { origin: { type: 'gps', lat: 48.85, lng: 2.35 } }

const fakeJwtGuard = {
  canActivate: (ctx: ExecutionContext): boolean => {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string>; user?: unknown }>()
    const id = req.headers['x-test-user-id']
    if (!id) throw new UnauthorizedException('Missing or invalid Authorization header')
    req.user = { id, email: 'test@example.com' }
    return true
  },
}

describe('POST /pois/:id/access — mode Live (integration)', () => {
  let app: INestApplication<App>
  let compute: jest.Mock

  beforeEach(async () => {
    mockDb.execute.mockReset()
    compute = jest.fn()

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [PoisController],
      providers: [
        Reflector,
        { provide: PoisService, useValue: {} },
        { provide: AccessCalculatorService, useValue: { compute } },
        // Le VRAI guard Story 3.1 : limite Live conditionnelle selon origin.type.
        { provide: APP_GUARD, useClass: AccessThrottlerGuard },
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

  /** POI possédé par le user (ownership check renvoie une ligne). */
  const ownerRows = () => mockDb.execute.mockResolvedValue({ rows: [{ '?column?': 1 }] })

  it('origin gps arrondi → mode live + userId transmis (AC #1, #2)', async () => {
    ownerRows()
    compute.mockResolvedValue(OK_RESULT)

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(gpsBody)

    expect(res.status).toBe(200)
    expect(bodyOf(res).data?.status).toBe('ok')
    expect(compute).toHaveBeenCalledWith({
      poiId: POI_ID,
      origin: { type: 'gps', lat: 48.85, lng: 2.35 },
      profileOverride: undefined,
      mode: 'live',
      userId: USER_ID,
    })
  })

  it('origin stage → mode planning (AC #1)', async () => {
    ownerRows()
    compute.mockResolvedValue({ ...OK_RESULT, source: 'db-cache' })

    await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send({ origin: { type: 'stage', stageId: STAGE_ID } })

    expect(compute).toHaveBeenCalledWith(expect.objectContaining({ mode: 'planning' }))
  })

  it('gps + coordonnées à 5 décimales → 400 (validation Zod arrondi 4 déc., AC #1)', async () => {
    ownerRows()
    const bad = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send({ origin: { type: 'gps', lat: 48.85661, lng: 2.35221 } }) // 5 décimales → rejet

    expect(bad.status).toBe(400)
    expect(bodyOf(bad).error?.code).toBe('BAD_REQUEST')
    expect(compute).not.toHaveBeenCalled()
  })

  it('gps + 4 décimales correctes → accepté (AC #1)', async () => {
    ownerRows()
    compute.mockResolvedValue(OK_RESULT)
    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send({ origin: { type: 'gps', lat: 48.8566, lng: 2.3522 } })
    expect(res.status).toBe(200)
  })

  it('gps + consent=false (service renvoie fallback no_consent) → 200 fallback (AC #7)', async () => {
    ownerRows()
    compute.mockResolvedValue({
      status: 'fallback',
      fallbackReason: 'no_consent',
      fallbackDistanceM: 320,
      source: 'computed-fresh',
    })

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(gpsBody)

    expect(res.status).toBe(200)
    expect(bodyOf(res).data?.status).toBe('fallback')
    expect(bodyOf(res).data?.fallbackReason).toBe('no_consent')
  })

  it('gps + cache hit Redis (source redis-cache) → 200 ok (AC #7)', async () => {
    ownerRows()
    compute.mockResolvedValue({ ...OK_RESULT, source: 'redis-cache' })

    const res = await request(app.getHttpServer())
      .post(`/pois/${POI_ID}/access`)
      .set('x-test-user-id', USER_ID)
      .send(gpsBody)

    expect(res.status).toBe(200)
    expect(bodyOf(res).data?.source).toBe('redis-cache')
  })

  it('no JWT → 401', async () => {
    ownerRows()
    const res = await request(app.getHttpServer()).post(`/pois/${POI_ID}/access`).send(gpsBody)
    expect(res.status).toBe(401)
    expect(compute).not.toHaveBeenCalled()
  })
})

/**
 * Rate limit conditionnel (AC #4) — Live 120/min vs Planning 60/min.
 * Module dédié avec un `limit` de module élevé (1000) pour que seul le `@Throttle`
 * du route (60) et le bump du guard (120) bornent réellement.
 */
describe('POST /pois/:id/access — rate limit conditionnel (AC #4)', () => {
  let app: INestApplication<App>
  const compute = jest.fn()

  beforeEach(async () => {
    mockDb.execute.mockReset()
    mockDb.execute.mockResolvedValue({ rows: [{ '?column?': 1 }] }) // owner
    compute.mockReset()
    compute.mockResolvedValue(OK_RESULT)

    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [PoisController],
      providers: [
        Reflector,
        { provide: PoisService, useValue: {} },
        { provide: AccessCalculatorService, useValue: { compute } },
        { provide: APP_GUARD, useClass: AccessThrottlerGuard },
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

  it('Live (gps) : 121e requête → 429 avec Retry-After', async () => {
    const server = app.getHttpServer()
    for (let i = 0; i < 120; i++) {
      const ok = await request(server).post(`/pois/${POI_ID}/access`).set('x-test-user-id', USER_ID).send(gpsBody)
      expect(ok.status).toBe(200)
    }
    const res = await request(server).post(`/pois/${POI_ID}/access`).set('x-test-user-id', USER_ID).send(gpsBody)
    expect(res.status).toBe(429)
    expect(res.headers['retry-after']).toBeDefined()
  })

  it('Planning (stage) : 61e requête → 429 (limite 60 inchangée)', async () => {
    const server = app.getHttpServer()
    const planningBody = { origin: { type: 'stage', stageId: STAGE_ID } }
    for (let i = 0; i < 60; i++) {
      const ok = await request(server).post(`/pois/${POI_ID}/access`).set('x-test-user-id', USER_ID).send(planningBody)
      expect(ok.status).toBe(200)
    }
    const res = await request(server).post(`/pois/${POI_ID}/access`).set('x-test-user-id', USER_ID).send(planningBody)
    expect(res.status).toBe(429)
  })
})
