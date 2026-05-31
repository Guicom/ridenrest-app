/**
 * AccessWorkerService (Story 4.1, étendu Story 4.2) — enqueue du pré-calcul eager + invalidation
 * event-driven des accès POI en cache.
 *
 * Story 4.1 : écoute `adventure.corridor-ready` et enfile un job `compute-access` par POI éligible
 *   sur la queue `poi-access-calculation`, avec un `jobId` idempotent.
 * Story 4.2 : écoute `adventure.trace-updated` (AC #1) et `adventure.profile-changed` (AC #2) ;
 *   reset les champs `access_*` concernés puis ré-enfile un recalcul à `jobId` enrichi.
 *   Scope réduit post-pivot `nearest-trace` : handlers stage (AC #3/#4) et purge Redis consent
 *   (AC #5) SUPERSEDED — non implémentés.
 *
 * ⚠️⚠️ SOURCE D'ÉVENT NON ENCORE IMPLÉMENTÉE (⚠️Discovery #2, AC #5) ⚠️⚠️
 *   AUCUN code n'émet actuellement `adventure.corridor-ready`. Le handler ci-dessous est EN PLACE
 *   mais reste un silent no-op pour le MVP. La source devra être ajoutée dans une story future
 *   (probablement `adventures.service.ts`/worker gpx-processing APRÈS le corridor search, une fois
 *   `dist_from_trace_m` calculé pour chaque POI). Voir `poi-access-X-Y-emit-corridor-ready-event`.
 *   Alternative MVP : endpoint admin `POST /admin/access/recompute-adventure/:id` (hors scope ici).
 */
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { OnEvent } from '@nestjs/event-emitter'
import type { ConfigType } from '@nestjs/config'
import type { Queue } from 'bullmq'
import accessConfig from '../../config/access.config.js'
import { ACCESS_QUEUE, COMPUTE_ACCESS_JOB } from './access-worker.constants.js'
import { AccessWorkerRepository } from './access-worker.repository.js'
import type { AccessJobPayload } from './types/access-job-payload.js'

/** Payload de l'event de déclenchement (émis APRÈS corridor search — source à implémenter). */
export interface CorridorReadyEvent {
  adventureId: string
}

/**
 * Payload de `adventure.trace-updated` (AC #1, Story 4.2) : la trace de l'aventure a changé
 * (segment ajouté/parsé ou supprimé — émis par `SegmentsService`/`GpxParseProcessor`).
 * Invalidation au scope AVENTURE : l'origine `nearest-trace` est calculée sur la trace fusionnée
 * de tous les segments, donc tout changement de trace peut périmer les accès de n'importe quel POI.
 */
export interface TraceUpdatedEvent {
  adventureId: string
  /** Segment à l'origine du changement (observabilité uniquement — le reset est global). */
  segmentId?: string
  changeType?: 'segment-added' | 'segment-removed'
}

/**
 * Payload de `adventure.profile-changed` (AC #2, Story 4.2) — émis par Story 2.6
 * (`AdventuresService.updateAdventure`). Forme alignée sur `AdventureProfileChangedPayload`.
 * Typé localement (string) pour éviter un import de valeur cross-module (pois → adventures).
 */
export interface ProfileChangedEvent {
  adventureId: string
  newProfile: string
  previousProfile: string
}

@Injectable()
export class AccessWorkerService {
  private readonly logger = new Logger(AccessWorkerService.name)

  constructor(
    private readonly repo: AccessWorkerRepository,
    @InjectQueue(ACCESS_QUEUE) private readonly queue: Queue<AccessJobPayload>,
    @Inject(accessConfig.KEY) private readonly config: ConfigType<typeof accessConfig>,
  ) {}

  /**
   * Handler de pré-calcul eager (AC #4). Lookup des POI proches de la trace jamais calculés,
   * puis enqueue un job par POI. Ne bloque pas la réponse HTTP de l'upload (background).
   */
  @OnEvent('adventure.corridor-ready')
  async handleCorridorReady(event: CorridorReadyEvent): Promise<void> {
    const { adventureId } = event
    const pois = await this.repo.findEagerPois(adventureId, this.config.eagerThresholdM)

    this.logger.log({
      msg: 'access_precompute_enqueue_start',
      adventureId,
      eligibleCount: pois.length,
      thresholdM: this.config.eagerThresholdM,
      engineVersion: this.config.engineVersion,
    })

    // Best-effort : un `queue.add` qui jette (hoquet Redis, back-pressure) ne doit PAS interrompre
    // la boucle et laisser les POI restants sans pré-calcul. On isole chaque enqueue, on logge,
    // et on continue. Les `jobId` idempotents rendent une ré-émission ultérieure de l'event sûre
    // (les POI déjà enfilés ne sont pas re-traités).
    let enqueued = 0
    let failed = 0
    for (const poi of pois) {
      try {
        await this.enqueue({
          poiId: poi.id,
          adventureId,
          routingProfile: poi.routingProfile,
          engineVersion: this.config.engineVersion,
        })
        enqueued++
      } catch (enqueueErr) {
        failed++
        this.logger.error({
          msg: 'access_precompute_enqueue_error',
          adventureId,
          poiId: poi.id,
          err: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
        })
      }
    }

    this.logger.log({ msg: 'access_precompute_enqueue_done', adventureId, enqueued, failed })
  }

  /**
   * AC #1 (Story 4.2) — `adventure.trace-updated`. La trace de l'aventure a changé (segment
   * ajouté/parsé ou supprimé). Comme l'origine `nearest-trace` est calculée sur la trace FUSIONNÉE
   * de tous les segments (`resolve-origin.ts` → `ST_Collect`), un changement de trace peut déplacer
   * le point d'accès des POI de N'IMPORTE QUEL segment → invalidation au scope AVENTURE.
   *
   * Sources (Story 4.2) : `SegmentsService.deleteSegment` (segment-removed) et
   * `GpxParseProcessor` après écriture de la géométrie (segment-added).
   */
  @OnEvent('adventure.trace-updated')
  async handleTraceUpdated(event: TraceUpdatedEvent): Promise<void> {
    const { adventureId, segmentId, changeType } = event
    this.logger.log({ msg: 'access_invalidation_trace_updated', adventureId, segmentId, changeType })
    await this.invalidateAdventure(adventureId, `trace-updated:${changeType ?? 'unknown'}`)
  }

  /**
   * AC #2 (Story 4.2) — `adventure.profile-changed` (émis par Story 2.6). Le profil de routage
   * pilote chaque itinéraire d'accès : un changement invalide TOUTE l'aventure.
   */
  @OnEvent('adventure.profile-changed')
  async handleProfileChanged(event: ProfileChangedEvent): Promise<void> {
    const { adventureId, newProfile, previousProfile } = event

    // Idempotence (AC #2) : skip si le profil n'a pas réellement changé. Défensif — la 2.6 garde
    // déjà l'émission derrière `previousProfile !== newProfile` — mais protège d'une ré-émission.
    if (newProfile === previousProfile) {
      this.logger.debug({ msg: 'access_invalidation_profile_unchanged_skip', adventureId, newProfile })
      return
    }

    this.logger.log({ msg: 'access_invalidation_profile_changed', adventureId, previousProfile, newProfile })
    await this.invalidateAdventure(adventureId, 'profile-changed')
  }

  /**
   * Cœur d'invalidation partagé (AC #1/#2) : reset des `access_*` de TOUTE l'aventure puis
   * ré-enfilage d'un recalcul pour les POI redevenus éligibles. Le scope aventure est correct
   * pour les deux déclencheurs (trace fusionnée + profil pilotent tous deux l'ensemble des accès).
   */
  private async invalidateAdventure(adventureId: string, reason: string): Promise<void> {
    await this.repo.resetAccessForAdventure(adventureId)
    const pois = await this.repo.findEagerPois(adventureId, this.config.eagerThresholdM)
    this.logger.log({ msg: 'access_invalidation_reset_done', adventureId, reason, eligibleCount: pois.length })
    await this.reenqueue(pois, adventureId, reason)
  }

  /**
   * Ré-enfile un recalcul après un reset de cache (AC #1/#2). À la différence du pré-calcul eager,
   * le `jobId` porte un discriminant `reset:<ts>` : le `jobId` du pré-calcul (`${poiId}:${ev}:null`)
   * peut encore vivre dans le set `completed` de BullMQ (`removeOnComplete` garde les 100 derniers).
   * Le ré-enfiler à l'identique serait dé-dupliqué en no-op → le POI fraîchement reset resterait à
   * NULL indéfiniment (⚠️Discovery #3). Un suffixe unique force un vrai recalcul.
   *
   * Best-effort (⚠️Discovery #4) : un `queue.add` qui jette (hoquet Redis) logge et n'interrompt pas
   * la boucle ; le calcul lazy au prochain accès compense un POI laissé sans recompute. Tous les POI
   * d'une même invalidation partagent le même `<ts>` (poiId distinct ⇒ jobId unique).
   */
  private async reenqueue(pois: { id: string; routingProfile: string }[], adventureId: string, reason: string): Promise<void> {
    const discriminator = Date.now()
    let enqueued = 0
    let failed = 0
    for (const poi of pois) {
      try {
        await this.queue.add(
          COMPUTE_ACCESS_JOB,
          {
            poiId: poi.id,
            adventureId,
            routingProfile: poi.routingProfile,
            engineVersion: this.config.engineVersion,
          },
          { jobId: `${poi.id}:${this.config.engineVersion}:reset:${discriminator}` },
        )
        enqueued++
      } catch (enqueueErr) {
        failed++
        this.logger.error({
          msg: 'access_invalidation_reenqueue_error',
          adventureId,
          poiId: poi.id,
          reason,
          err: enqueueErr instanceof Error ? enqueueErr.message : String(enqueueErr),
        })
      }
    }
    this.logger.log({ msg: 'access_invalidation_reenqueue_done', adventureId, reason, enqueued, failed })
  }

  /**
   * Enfile un job `compute-access` avec un `jobId` idempotent : `${poiId}:${engineVersion}:null`.
   * Re-émettre l'event ⇒ mêmes jobIds ⇒ BullMQ ignore les doublons (pas de double traitement).
   * Le segment `null` final = `stageId` (toujours null post-pivot `nearest-trace`).
   *
   * Retry/backoff : hérités des `defaultJobOptions` globaux (`bullmq.config.ts` — attempts 3,
   * backoff exponentiel base 1s). On ne surcharge PAS par job pour rester cohérent avec
   * `gpx-processing`/`density-analysis` (⚠️Discovery #1). Doc Sync vs AC #2 (« 1s/5s/25s »).
   */
  private async enqueue(payload: AccessJobPayload): Promise<void> {
    await this.queue.add(COMPUTE_ACCESS_JOB, payload, {
      jobId: `${payload.poiId}:${payload.engineVersion}:null`,
    })
  }
}
