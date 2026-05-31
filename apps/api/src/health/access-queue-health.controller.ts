import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { SkipThrottle } from '@nestjs/throttler'
import { InjectQueue } from '@nestjs/bullmq'
import type { Queue } from 'bullmq'
import { Public } from '../common/decorators/public.decorator.js'
import { HealthTokenGuard } from '../common/guards/health-token.guard.js'
import { ACCESS_QUEUE } from '../pois/access-worker/access-worker.constants.js'

const DAY_MS = 24 * 60 * 60 * 1000

/** Forme exposée à Uptime Kuma (monitor `POI Access Queue Health`). */
export interface AccessQueueHealth {
  /** Jobs en attente d'être traités (`waiting` + `delayed`). Alerte Kuma si > 200. */
  depth: number
  /** Jobs en échec définitif terminés dans les dernières 24h (set `failed` retenu par BullMQ). */
  failed24h: number
  /** Âge (secondes) du plus ancien job en attente ; 0 si la queue est vide. */
  oldestPendingAgeS: number
}

/**
 * AccessQueueHealthController (Story 4.3) — endpoint d'observabilité de la queue de pré-calcul
 * d'accès POI (`poi-access-calculation`), consommé par Uptime Kuma via un monitor HTTP JSON Query.
 *
 * Protégé par `HealthTokenGuard` (header `x-health-token` vs `HEALTH_ENDPOINT_TOKEN`, fail-closed)
 * — `@Public()` bypasse le `JwtAuthGuard` global (Kuma n'a pas de session JWT).
 */
@ApiTags('health')
@ApiSecurity('x-health-token')
@Controller('health')
@SkipThrottle()
export class AccessQueueHealthController {
  constructor(@InjectQueue(ACCESS_QUEUE) private readonly queue: Queue) {}

  @Get('access-queue')
  @Public()
  @UseGuards(HealthTokenGuard)
  @ApiOperation({ summary: 'POI access queue health — consommé par Uptime Kuma (header x-health-token)' })
  async getAccessQueueHealth(): Promise<AccessQueueHealth> {
    const [waiting, delayed, oldestPendingAgeS, failed24h] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getDelayedCount(),
      this.computeOldestPendingAgeS(),
      this.computeFailed24h(),
    ])
    return { depth: waiting + delayed, failed24h, oldestPendingAgeS }
  }

  /**
   * Âge (s) du plus ancien job « en attente » ; 0 si rien n'attend.
   *
   * On considère `waiting` ET `delayed` : pendant une panne soutenue (BRouter/DB), les jobs
   * partent en backoff exponentiel et résident dans le set `delayed` — sans eux, un backlog
   * bloqué resterait invisible sur cet axe alors que `depth` (= waiting+delayed) gonfle.
   * `job.timestamp` est l'instant d'enqueue (stable à travers les retries) → l'âge le plus
   * grand correspond au plus petit `timestamp`. `getWaiting(0,0)`/`getDelayed(0,0)` renvoient
   * la tête de chaque set : approximation suffisante pour un indicateur de santé.
   */
  private async computeOldestPendingAgeS(): Promise<number> {
    const [[oldestWaiting], [oldestDelayed]] = await Promise.all([
      this.queue.getWaiting(0, 0),
      this.queue.getDelayed(0, 0),
    ])
    const timestamps = [oldestWaiting?.timestamp, oldestDelayed?.timestamp].filter(
      (t): t is number => typeof t === 'number' && t > 0,
    )
    if (timestamps.length === 0) return 0
    return Math.max(0, Math.round((Date.now() - Math.min(...timestamps)) / 1000))
  }

  /**
   * Compte les jobs en échec terminés dans les 24h. BullMQ ne retient que les `removeOnFail`
   * derniers (50, cf. bullmq.config) — on filtre ce set sur `finishedOn`. Suffisant pour un
   * indicateur de santé : un volume d'échecs anormal sur 24h dépassera rarement 50 sans alerte.
   */
  private async computeFailed24h(): Promise<number> {
    const cutoff = Date.now() - DAY_MS
    const failed = await this.queue.getFailed(0, 199)
    return failed.filter((j) => (j.finishedOn ?? j.timestamp ?? 0) >= cutoff).length
  }
}
