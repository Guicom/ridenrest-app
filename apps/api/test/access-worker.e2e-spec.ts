/**
 * E2E Story 4.1 + 4.2 — vérifie le câblage end-to-end des events vers l'enqueue des jobs
 * `compute-access`, via le VRAI `EventEmitter2` + le VRAI décorateur `@OnEvent` (découverte au
 * bootstrap NestJS).
 *   - 4.1 : `adventure.corridor-ready` → pré-calcul eager.
 *   - 4.2 : `adventure.trace-updated` (AC #1) et `adventure.profile-changed` (AC #2)
 *           → reset cache + re-enqueue à `jobId` enrichi. Couvre aussi AC #6 (handlers EN PLACE,
 *           découverts au bootstrap) pour le handler trace-updated encore sans source.
 *
 * ── Choix de scope (Doc Sync vs AC #7) ─────────────────────────────────────────────────
 *  Le projet diffère les E2E « infra réelle » pour le MVP (project-context §Testing) et n'a pas
 *  de Redis/Postgres de test câblé en CI. Plutôt que de booter `AppModule` (qui exige Redis pour
 *  les Workers BullMQ + Postgres pour `db`), ce test monte un module minimal :
 *    EventEmitterModule.forRoot() + AccessWorkerService réel + repo & queue mockés.
 *  Il valide donc la chaîne event → handler → enqueue (jobIds idempotents) sans infra,
 *  ce qui couvre l'intention d'AC #7 (« émettre event → vérifier jobs enqueued » + idempotence).
 *  La vérification du dédoublonnage RÉEL par BullMQ (même jobId = no-op) relève d'un test
 *  d'intégration Redis, hors scope MVP — on vérifie ici que les jobIds émis sont identiques.
 */
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter'
import { getQueueToken } from '@nestjs/bullmq'
import accessConfig from '../src/config/access.config'
import { AccessWorkerService } from '../src/pois/access-worker/access-worker.service'
import { AccessWorkerRepository } from '../src/pois/access-worker/access-worker.repository'
import { ACCESS_QUEUE } from '../src/pois/access-worker/access-worker.constants'

const ENGINE_VERSION = 'brouter-1.7.9+profiles-v2'
const THRESHOLD_M = 1500

describe('Access Worker (e2e) — adventure.corridor-ready → enqueue', () => {
  let app: INestApplication
  let emitter: EventEmitter2
  const queueAdd = jest.fn().mockResolvedValue(undefined)
  const findEagerPois = jest.fn()
  const resetAccessForAdventure = jest.fn().mockResolvedValue(undefined)

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EventEmitterModule.forRoot()],
      providers: [
        AccessWorkerService,
        {
          provide: AccessWorkerRepository,
          useValue: {
            findEagerPois,
            markAccessFailed: jest.fn(),
            resetAccessForAdventure,
          },
        },
        { provide: getQueueToken(ACCESS_QUEUE), useValue: { add: queueAdd } },
        { provide: accessConfig.KEY, useValue: { eagerThresholdM: THRESHOLD_M, engineVersion: ENGINE_VERSION } },
      ],
    }).compile()

    app = moduleRef.createNestApplication()
    await app.init() // déclenche onApplicationBootstrap → enregistrement des @OnEvent
    emitter = app.get(EventEmitter2)
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(() => {
    queueAdd.mockClear()
    findEagerPois.mockReset()
    resetAccessForAdventure.mockClear()
  })

  it('enqueues one compute-access job per eligible POI when the event fires', async () => {
    findEagerPois.mockResolvedValue([
      { id: 'poi-1', routingProfile: 'gravel' },
      { id: 'poi-2', routingProfile: 'road' },
    ])

    await emitter.emitAsync('adventure.corridor-ready', { adventureId: 'adv-1' })

    expect(findEagerPois).toHaveBeenCalledWith('adv-1', THRESHOLD_M)
    expect(queueAdd).toHaveBeenCalledTimes(2)
    expect(queueAdd).toHaveBeenCalledWith(
      'compute-access',
      { poiId: 'poi-1', adventureId: 'adv-1', routingProfile: 'gravel', engineVersion: ENGINE_VERSION },
      { jobId: `poi-1:${ENGINE_VERSION}:null` },
    )
  })

  it('is a silent no-op when no POI is eligible', async () => {
    findEagerPois.mockResolvedValue([])

    await emitter.emitAsync('adventure.corridor-ready', { adventureId: 'adv-empty' })

    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('re-emitting the event produces identical jobIds (idempotence contract)', async () => {
    findEagerPois.mockResolvedValue([{ id: 'poi-1', routingProfile: 'gravel' }])

    await emitter.emitAsync('adventure.corridor-ready', { adventureId: 'adv-1' })
    await emitter.emitAsync('adventure.corridor-ready', { adventureId: 'adv-1' })

    const jobIds = queueAdd.mock.calls.map((c: unknown[]) => (c[2] as { jobId: string }).jobId)
    expect(jobIds).toEqual([`poi-1:${ENGINE_VERSION}:null`, `poi-1:${ENGINE_VERSION}:null`])
  })

  // ── Story 4.2 — invalidation event-driven ──────────────────────────────────────────────
  it('AC #2 — adventure.profile-changed resets the adventure then re-enqueues with a reset jobId', async () => {
    findEagerPois.mockResolvedValue([{ id: 'poi-1', routingProfile: 'bikepacking' }])

    await emitter.emitAsync('adventure.profile-changed', {
      adventureId: 'adv-1',
      newProfile: 'bikepacking',
      previousProfile: 'gravel',
    })

    expect(resetAccessForAdventure).toHaveBeenCalledWith('adv-1')
    expect(findEagerPois).toHaveBeenCalledWith('adv-1', THRESHOLD_M)
    expect(queueAdd).toHaveBeenCalledTimes(1)
    const jobId = (queueAdd.mock.calls[0] as unknown[])[2] as { jobId: string }
    expect(jobId.jobId).toMatch(/^poi-1:.*:reset:\d+$/)
  })

  it('AC #2 — adventure.profile-changed is a no-op when the profile is unchanged', async () => {
    await emitter.emitAsync('adventure.profile-changed', {
      adventureId: 'adv-1',
      newProfile: 'gravel',
      previousProfile: 'gravel',
    })

    expect(resetAccessForAdventure).not.toHaveBeenCalled()
    expect(queueAdd).not.toHaveBeenCalled()
  })

  it('AC #1 — adventure.trace-updated (segment-added) resets the whole adventure + re-enqueues', async () => {
    findEagerPois.mockResolvedValue([{ id: 'poi-9', routingProfile: 'gravel' }])

    await emitter.emitAsync('adventure.trace-updated', {
      adventureId: 'adv-1',
      segmentId: 'seg-1',
      changeType: 'segment-added',
    })

    expect(resetAccessForAdventure).toHaveBeenCalledWith('adv-1')
    expect(findEagerPois).toHaveBeenCalledWith('adv-1', THRESHOLD_M)
    expect(queueAdd).toHaveBeenCalledTimes(1)
  })

  it('AC #1 — adventure.trace-updated (segment-removed) also resets the whole adventure', async () => {
    findEagerPois.mockResolvedValue([])

    await emitter.emitAsync('adventure.trace-updated', {
      adventureId: 'adv-1',
      segmentId: 'seg-9',
      changeType: 'segment-removed',
    })

    expect(resetAccessForAdventure).toHaveBeenCalledWith('adv-1')
    expect(queueAdd).not.toHaveBeenCalled()
  })
})
