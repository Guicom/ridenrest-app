/**
 * Tests d'intégration HTTP de `/me/settings` (Story 3.2, AC #7).
 *
 * Stratégie (cf. Doc Sync, alignée sur Story 2.3/3.1) : le CI projet exécute `pnpm test`
 * (Jest unitaire, rootDir=src) SANS Postgres/Redis ni Better Auth. On reconstitue donc
 * ici la pile HTTP réelle (ValidationPipe global, ResponseInterceptor, HttpExceptionFilter,
 * JwtAuthGuard global) avec :
 *   - `@ridenrest/database` mocké (état `profiles` piloté en mémoire, transitions simulées),
 *   - `JwtAuthGuard` remplacé par un faux pilotable via le header `x-test-user-id`,
 *   - `EventEmitter2` mocké pour vérifier l'émission de `profile.live-consent-revoked`.
 * Couvre tous les cas de l'AC #7 au niveau du contrat HTTP. Tourne via `pnpm --filter api test:e2e`.
 */
import type { INestApplication, ExecutionContext } from '@nestjs/common'
import { UnauthorizedException, ValidationPipe } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import type { App } from 'supertest/types'

const USER_ID = '00000000-0000-0000-0000-000000000001'

// État `profiles` en mémoire, piloté par test. `select` lit la ligne courante,
// `update().set(vals).where()` la mute (simule la persistance DB).
// eslint-disable-next-line no-var
var mockDb: {
  select: jest.Mock
  insert: jest.Mock
}
// eslint-disable-next-line no-var
var currentRow: { liveAccessConsent: boolean | null; overpassEnabled: boolean } | null

jest.mock('@ridenrest/database', () => {
  mockDb = {
    select: jest.fn(() => ({
      from: jest.fn(() => ({
        where: jest.fn(() => Promise.resolve(currentRow ? [currentRow] : [])),
      })),
    })),
    // Simule l'upsert `INSERT … ON CONFLICT DO UPDATE` de MeRepository.setLiveAccessConsent.
    // Si la ligne existe → merge du `set` ; sinon → création (branche INSERT), prouvant qu'aucun
    // phantom-write ne se produit quand le profil n'existe pas encore (fix code review P1).
    insert: jest.fn(() => ({
      values: jest.fn((vals: { id: string; liveAccessConsent: boolean | null }) => ({
        onConflictDoUpdate: jest.fn(
          ({ set }: { set: Partial<NonNullable<typeof currentRow>> }) => {
            currentRow = currentRow
              ? { ...currentRow, ...set }
              : { liveAccessConsent: vals.liveAccessConsent ?? null, overpassEnabled: false }
            return Promise.resolve(undefined)
          },
        ),
      })),
    })),
  }
  return { db: mockDb, profiles: {} }
})

import { MeController } from '../src/me/me.controller.js'
import { MeService, PROFILE_LIVE_CONSENT_REVOKED_EVENT } from '../src/me/me.service.js'
import { MeRepository } from '../src/me/me.repository.js'
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor.js'
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js'

interface MeApiBody {
  data?: { liveAccessConsent?: boolean | null; overpassEnabled?: boolean }
  error?: { code?: string }
}

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

describe('/me/settings (integration)', () => {
  let app: INestApplication<App>
  let emit: jest.Mock

  beforeEach(async () => {
    currentRow = { liveAccessConsent: null, overpassEnabled: false }
    emit = jest.fn()

    const moduleRef = await Test.createTestingModule({
      controllers: [MeController],
      providers: [
        MeService,
        MeRepository,
        { provide: EventEmitter2, useValue: { emit } },
        // Reproduit le JwtAuthGuard global (APP_GUARD) du projet, ici remplacé par
        // un faux pilotable. Note : .overrideGuard() ne cible PAS un guard enregistré
        // via APP_GUARD (token = APP_GUARD, pas la classe) → on l'injecte directement.
        { provide: APP_GUARD, useValue: fakeJwtGuard },
      ],
    }).compile()

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

  it('GET sans JWT → 401', async () => {
    const res = await request(app.getHttpServer()).get('/me/settings')
    expect(res.status).toBe(401)
  })

  it('GET avec JWT → 200 + état actuel + Cache-Control: no-store', async () => {
    currentRow = { liveAccessConsent: true, overpassEnabled: true }
    const res = await request(app.getHttpServer()).get('/me/settings').set('x-test-user-id', USER_ID)
    expect(res.status).toBe(200)
    const body = res.body as MeApiBody
    expect(body.data?.liveAccessConsent).toBe(true)
    expect(body.data?.overpassEnabled).toBe(true)
    expect(res.headers['cache-control']).toBe('no-store')
  })

  it('GET avec consent null (jamais demandé) → 200 + liveAccessConsent: null', async () => {
    currentRow = { liveAccessConsent: null, overpassEnabled: false }
    const res = await request(app.getHttpServer()).get('/me/settings').set('x-test-user-id', USER_ID)
    expect(res.status).toBe(200)
    expect((res.body as MeApiBody).data?.liveAccessConsent).toBeNull()
  })

  it('PATCH { liveAccessConsent: true } quand actuel = null → 200, DB updated, PAS d\'event', async () => {
    currentRow = { liveAccessConsent: null, overpassEnabled: false }
    const res = await request(app.getHttpServer())
      .patch('/me/settings')
      .set('x-test-user-id', USER_ID)
      .send({ liveAccessConsent: true })
    expect(res.status).toBe(200)
    expect((res.body as MeApiBody).data?.liveAccessConsent).toBe(true)
    expect(currentRow?.liveAccessConsent).toBe(true)
    expect(emit).not.toHaveBeenCalled()
  })

  // Régression code review P1 : profil absent (la création au signup est best-effort).
  // L'upsert doit créer la ligne et persister réellement — pas de faux 200 (phantom write).
  it('PATCH quand AUCUN profil n\'existe → 200 + ligne créée et persistée (pas de phantom write)', async () => {
    currentRow = null
    const res = await request(app.getHttpServer())
      .patch('/me/settings')
      .set('x-test-user-id', USER_ID)
      .send({ liveAccessConsent: true })
    expect(res.status).toBe(200)
    expect((res.body as MeApiBody).data?.liveAccessConsent).toBe(true)
    expect(currentRow).not.toBeNull()
    expect(currentRow?.liveAccessConsent).toBe(true)
    expect(emit).not.toHaveBeenCalled()
  })

  it('PATCH { liveAccessConsent: false } quand actuel = true → 200 + event émis avec userId', async () => {
    currentRow = { liveAccessConsent: true, overpassEnabled: false }
    const res = await request(app.getHttpServer())
      .patch('/me/settings')
      .set('x-test-user-id', USER_ID)
      .send({ liveAccessConsent: false })
    expect(res.status).toBe(200)
    expect((res.body as MeApiBody).data?.liveAccessConsent).toBe(false)
    expect(emit).toHaveBeenCalledWith(PROFILE_LIVE_CONSENT_REVOKED_EVENT, { userId: USER_ID })
  })

  it('PATCH { liveAccessConsent: true } quand actuel = true → 200 + PAS d\'event (idempotent)', async () => {
    currentRow = { liveAccessConsent: true, overpassEnabled: false }
    const res = await request(app.getHttpServer())
      .patch('/me/settings')
      .set('x-test-user-id', USER_ID)
      .send({ liveAccessConsent: true })
    expect(res.status).toBe(200)
    expect(emit).not.toHaveBeenCalled()
  })

  it('PATCH { liveAccessConsent: "invalid" } → 400', async () => {
    const res = await request(app.getHttpServer())
      .patch('/me/settings')
      .set('x-test-user-id', USER_ID)
      .send({ liveAccessConsent: 'invalid' })
    expect(res.status).toBe(400)
    expect((res.body as MeApiBody).error?.code).toBe('BAD_REQUEST')
  })

  it('PATCH {} (body vide) → 400 (PATCH n\'est pas un GET déguisé)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/me/settings')
      .set('x-test-user-id', USER_ID)
      .send({})
    expect(res.status).toBe(400)
    expect(emit).not.toHaveBeenCalled()
  })

  it('PATCH { liveAccessConsent: null } → 400 (null rejeté, AC #5)', async () => {
    const res = await request(app.getHttpServer())
      .patch('/me/settings')
      .set('x-test-user-id', USER_ID)
      .send({ liveAccessConsent: null })
    expect(res.status).toBe(400)
  })
})
