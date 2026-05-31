/**
 * AccessBullBoardModule (Story 4.3) — monte le dashboard Bull Board pour inspecter/triager
 * visuellement les queues BullMQ (notamment la DLQ `poi-access-failures`).
 *
 * ── Sécurité (AC #1, ⚠️Discovery — pas d'auth admin dans le projet) ──────────────────────
 *  Le projet n'a pas de rôle/guard admin (le `JwtAuthGuard` est par-utilisateur). Bull Board
 *  se monte comme middleware Express HORS du pipeline de guards Nest → non protégé par défaut.
 *  Double protection :
 *   1. **Gate** : le module n'est importé (cf. `app.module.ts`) QUE si `BULL_BOARD_ENABLED=true`
 *      (défaut désactivé). En prod, on l'active ponctuellement + accès via tunnel SSH, jamais
 *      exposé publiquement par Caddy.
 *   2. **Basic Auth (fail-closed)** : le middleware `bullBoardBasicAuth` exige une auth HTTP
 *      Basic (comparaison en temps constant). Comme le module n'est monté QUE si
 *      `BULL_BOARD_ENABLED=true`, atteindre ce middleware sans `BULL_BOARD_USER`/
 *      `BULL_BOARD_PASSWORD` configurés = mauvaise config → l'accès est REFUSÉ (503), jamais
 *      ouvert (cohérent avec la posture fail-closed du `HealthTokenGuard`).
 *
 * ── URL effective ──────────────────────────────────────────────────────────────────────
 *  Le global prefix `api` (main.ts) s'applique → dashboard à **`/api/admin/queues`**.
 */
import { Module } from '@nestjs/common'
import type { Request, Response, NextFunction } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { BullBoardModule } from '@bull-board/nestjs'
import { ExpressAdapter } from '@bull-board/express'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { QueuesModule } from '../queues/queues.module.js'
import { ACCESS_QUEUE, ACCESS_DLQ } from '../pois/access-worker/access-worker.constants.js'

/** Comparaison en temps constant (longueurs différentes → false sans throw). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Middleware Basic Auth pour la route Bull Board. **Fail-closed** : si les credentials ne sont
 * pas configurées alors que le board est monté (`BULL_BOARD_ENABLED=true`), l'accès est refusé
 * (503) — on n'expose jamais un dashboard mutateur (purge/replay de queues) sans auth.
 * Exporté pour test unitaire.
 */
export function bullBoardBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const user = process.env['BULL_BOARD_USER']
  const pass = process.env['BULL_BOARD_PASSWORD']
  if (!user || !pass) {
    res.status(503).send('Bull Board enabled but credentials are not configured')
    return
  }

  const header = req.headers['authorization']
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
    const idx = decoded.indexOf(':')
    if (idx !== -1) {
      const u = decoded.slice(0, idx)
      const p = decoded.slice(idx + 1)
      if (safeEqual(u, user) && safeEqual(p, pass)) {
        next()
        return
      }
    }
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"')
  res.status(401).send('Authentication required')
}

@Module({
  imports: [
    QueuesModule,
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
      middleware: bullBoardBasicAuth,
    }),
    // Toutes les queues du projet (pas seulement l'accès) — triage centralisé.
    BullBoardModule.forFeature(
      { name: ACCESS_QUEUE, adapter: BullMQAdapter },
      { name: ACCESS_DLQ, adapter: BullMQAdapter },
      { name: 'gpx-processing', adapter: BullMQAdapter },
      { name: 'density-analysis', adapter: BullMQAdapter },
    ),
  ],
})
export class AccessBullBoardModule {}
