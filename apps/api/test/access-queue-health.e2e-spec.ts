/**
 * E2E Story 4.3 — endpoint `GET /api/health/access-queue` + `HealthTokenGuard`.
 *
 * Scope (Doc Sync vs project-context §Testing) : pas d'infra Redis/Postgres de test câblée.
 * On monte un module minimal (controller + guard réels + queue mockée) et on vérifie :
 *   - la protection par token (`x-health-token` vs `HEALTH_ENDPOINT_TOKEN`, fail-closed) ;
 *   - la forme du payload `{ depth, failed24h, oldestPendingAgeS }` (wrappée `{ data }` par
 *     `ResponseInterceptor`, comme en prod).
 * La vérification du calcul fin (waiting+delayed, filtre 24h) est couverte par le test unit
 * `access-queue-health.controller.test.ts`.
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import type { App } from 'supertest/types'
import { getQueueToken } from '@nestjs/bullmq'
import { AccessQueueHealthController } from '../src/health/access-queue-health.controller'
import { HealthTokenGuard } from '../src/common/guards/health-token.guard'
import { ACCESS_QUEUE } from '../src/pois/access-worker/access-worker.constants'
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor'

const TOKEN = 'test-health-token'

interface AccessQueueHealthBody {
  data: { depth: number; failed24h: number; oldestPendingAgeS: number }
}

describe('Access Queue Health (e2e) — GET /api/health/access-queue', () => {
  let app: INestApplication<App>
  const queue = {
    getWaitingCount: jest.fn().mockResolvedValue(5),
    getDelayedCount: jest.fn().mockResolvedValue(2),
    getWaiting: jest.fn().mockResolvedValue([{ timestamp: 1 }]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
  }
  const ORIGINAL = process.env['HEALTH_ENDPOINT_TOKEN']

  beforeAll(async () => {
    process.env['HEALTH_ENDPOINT_TOKEN'] = TOKEN
    const moduleRef = await Test.createTestingModule({
      controllers: [AccessQueueHealthController],
      providers: [HealthTokenGuard, { provide: getQueueToken(ACCESS_QUEUE), useValue: queue }],
    }).compile()

    app = moduleRef.createNestApplication()
    app.setGlobalPrefix('api')
    app.useGlobalInterceptors(new ResponseInterceptor())
    await app.init()
  })

  afterAll(async () => {
    await app.close()
    if (ORIGINAL === undefined) delete process.env['HEALTH_ENDPOINT_TOKEN']
    else process.env['HEALTH_ENDPOINT_TOKEN'] = ORIGINAL
  })

  it('401 sans header token', () => {
    return request(app.getHttpServer()).get('/api/health/access-queue').expect(401)
  })

  it('401 avec un token incorrect', () => {
    return request(app.getHttpServer())
      .get('/api/health/access-queue')
      .set('x-health-token', 'wrong')
      .expect(401)
  })

  it('200 + payload { depth, failed24h, oldestPendingAgeS } avec un token valide', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health/access-queue')
      .set('x-health-token', TOKEN)
      .expect(200)

    const data = (res.body as AccessQueueHealthBody).data
    expect(data.depth).toBe(7) // waiting 5 + delayed 2
    expect(data.failed24h).toBe(0)
    expect(typeof data.oldestPendingAgeS).toBe('number')
    expect(data.oldestPendingAgeS).toBeGreaterThanOrEqual(0)
  })
})
