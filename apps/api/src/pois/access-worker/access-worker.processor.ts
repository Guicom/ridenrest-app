/**
 * AccessWorkerProcessor (Story 4.1) — traite les jobs `compute-access` de la queue
 * `poi-access-calculation`.
 *
 * Pattern : calqué sur `DensityAnalyzeProcessor`/`GpxParseProcessor` (`WorkerHost` +
 * `@Processor` + `process()`), cf. ⚠️Discovery #1.
 *
 * ── Concurrency (⚠️Discovery #3) ───────────────────────────────────────────────────────
 *  `concurrency: 5` max simultanés : BRouter est single-threaded, le pool PG est à 10, RAM VPS
 *  partagée. NE PAS augmenter sans benchmark.
 *
 * ── Contrat `compute()` & fallback ─────────────────────────────────────────────────────
 *  `AccessCalculatorService.compute()` ne THROW que sur cas dégénéré (POI/étape inexistant) ou
 *  erreur DB ; une indisponibilité BRouter est convertie en `{ status: 'fallback' }` SANS throw
 *  et SANS persistance. On NE relance donc PAS le job sur `fallback` : le POI reste éligible
 *  (`access_computed_at` toujours NULL) pour un re-pré-calcul / calcul lazy ultérieur — éviter
 *  de marquer `access_failed` en masse pendant une coupure BRouter transitoire.
 *  Seules les vraies exceptions propagées déclenchent le retry BullMQ.
 *
 * ── Échec définitif → DLQ (AC #3, ⚠️Discovery #4) ──────────────────────────────────────
 *  Après épuisement des retries (`@OnWorkerEvent('failed')` quand `attemptsMade >= attempts`) :
 *  `access_failed = true` (stop recalcul perpétuel) + dépôt dans la DLQ `poi-access-failures`.
 *  Le projet n'avait pas de DLQ jusqu'ici → à généraliser aux autres queues (à noter dans l'audit
 *  Story 4.3).
 */
import { Processor, WorkerHost, OnWorkerEvent, InjectQueue } from '@nestjs/bullmq'
import { Logger } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import { AccessCalculatorService } from '../access-calculator/access-calculator.service.js'
import { ACCESS_QUEUE, ACCESS_DLQ, FAILED_ACCESS_JOB } from './access-worker.constants.js'
import { AccessWorkerRepository } from './access-worker.repository.js'
import type { AccessJobPayload, AccessFailurePayload } from './types/access-job-payload.js'

@Processor(ACCESS_QUEUE, { concurrency: 5 })
export class AccessWorkerProcessor extends WorkerHost {
  private readonly logger = new Logger(AccessWorkerProcessor.name)

  constructor(
    private readonly accessCalculator: AccessCalculatorService,
    private readonly repo: AccessWorkerRepository,
    @InjectQueue(ACCESS_DLQ) private readonly dlq: Queue<AccessFailurePayload>,
  ) {
    super()
  }

  async process(job: Job<AccessJobPayload>): Promise<void> {
    const { poiId, adventureId } = job.data
    const startTime = Date.now()
    this.logger.log({ msg: 'access_job_start', jobId: job.id, poiId, adventureId })

    // Origine `nearest-trace` imposée (MAJ 2026-05-30). Pas de `profileOverride` : le profil
    // BRouter est dérivé du `routing_profile` de l'aventure côté `compute()` → cache identique
    // au calcul lazy. La géométrie est persistée par AccessCalculator (cache DB).
    const result = await this.accessCalculator.compute({
      poiId,
      origin: { type: 'nearest-trace' },
    })
    const durationMs = Date.now() - startTime

    if (result.status === 'fallback') {
      // BRouter indispo : pas de throw → job en succès, POI non persisté (retry lazy/eager ultérieur).
      this.logger.warn({
        msg: 'access_job_fallback',
        jobId: job.id,
        poiId,
        reason: result.fallbackReason,
        durationMs,
      })
      return
    }

    if (result.status === 'error') {
      // Contrat `compute()` : le statut `error` n'est jamais retourné aujourd'hui (cas dégénéré
      // → throw). Branche défensive pour exhaustivité du type : si le contrat changeait un jour,
      // on PROPAGE l'erreur (retry BullMQ → échec définitif → `access_failed` + DLQ) plutôt que
      // de marquer le job en succès silencieux (qui laisserait `access_computed_at` NULL à jamais).
      this.logger.error({ msg: 'access_job_error_result', jobId: job.id, poiId, message: result.message, durationMs })
      throw new Error(`access compute returned error status for poi ${poiId}: ${result.message}`)
    }

    this.logger.log({
      msg: 'access_job_success',
      jobId: job.id,
      poiId,
      durationMs,
      source: result.source,
    })
  }

  /**
   * Déclenché à CHAQUE tentative échouée. On agit uniquement à l'échec DÉFINITIF
   * (`attemptsMade >= attempts`) : marque le POI `access_failed` + route vers la DLQ.
   */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<AccessJobPayload>, err: Error): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1

    if (job.attemptsMade < maxAttempts) {
      this.logger.warn({
        msg: 'access_job_retry',
        jobId: job.id,
        poiId: job.data.poiId,
        attempt: job.attemptsMade,
        maxAttempts,
        err: err.message,
      })
      return
    }

    this.logger.error({
      msg: 'access_job_failed_final',
      jobId: job.id,
      poiId: job.data.poiId,
      attempts: job.attemptsMade,
      err: err.message,
    })

    // Les 2 effets de bord sont INDÉPENDANTS : un échec de l'un ne doit ni casser la queue ni
    // empêcher l'autre. La DLQ d'abord (enregistrement durable de l'échec, surface de triage ops),
    // puis le marquage DB — chacun dans son propre try/catch. `jobId` déterministe sur la DLQ
    // (`${poiId}:${engineVersion}:failed`) → idempotence si l'event `'failed'` re-fire (stalled-job
    // recovery), évite les doublons d'enregistrement d'échec.
    try {
      await this.dlq.add(
        FAILED_ACCESS_JOB,
        {
          payload: job.data,
          error: err.message,
          failedAt: new Date().toISOString(),
        },
        { jobId: `${job.data.poiId}:${job.data.engineVersion}:failed` },
      )
    } catch (dlqErr) {
      this.logger.error({
        msg: 'access_job_failed_dlq_error',
        jobId: job.id,
        poiId: job.data.poiId,
        err: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
      })
    }

    try {
      await this.repo.markAccessFailed(job.data.poiId)
    } catch (markErr) {
      this.logger.error({
        msg: 'access_job_failed_mark_error',
        jobId: job.id,
        poiId: job.data.poiId,
        err: markErr instanceof Error ? markErr.message : String(markErr),
      })
    }
  }
}
