import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'
import type { ThrottlerRequest } from '@nestjs/throttler'

/** Limite Live (origine GPS) — plus permissive que Planning (Story 3.1, AC #4). */
export const LIVE_ACCESS_RATE_LIMIT = 120

/**
 * `AccessThrottlerGuard` (Story 3.1, AC #4 — Discovery #1, option B retenue).
 *
 * `@Throttle` est résolu par endpoint, pas par body : impossible d'exprimer
 * « 60/min en Planning, 120/min en Live » avec le seul décorateur sur un endpoint
 * unique. Ce guard surcharge `handleRequest` pour relever dynamiquement la limite à
 * 120 lorsque le body porte `origin.type === 'gps'` (mode Live) ; sinon il conserve
 * la limite résolue par le décorateur (`@Throttle({ default: { limit: 60 } })`).
 *
 * Enregistré comme APP_GUARD global EN REMPLACEMENT du `ThrottlerGuard` standard :
 * pour toute autre route, le bump ne s'applique JAMAIS (cf. `isAccessRoute`) →
 * comportement strictement identique au guard standard (limite du décorateur ou défaut
 * du module). Cf. Doc Sync.
 *
 * Le bump est borné au seul handler `PoisController.computeAccess` (comparaison par nom,
 * sans import → pas de dépendance circulaire common→pois) : sans ce garde-fou, n'importe
 * quelle route recevant un body `{ origin: { type: 'gps' } }` verrait sa limite relevée.
 */
@Injectable()
export class AccessThrottlerGuard extends ThrottlerGuard {
  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    const { context } = requestProps
    const isAccessRoute =
      context.getClass().name === 'PoisController' && context.getHandler().name === 'computeAccess'
    if (isAccessRoute) {
      const { req } = this.getRequestResponse(context)
      const body = req?.body as { origin?: { type?: unknown } } | undefined
      if (body?.origin?.type === 'gps') {
        return super.handleRequest({ ...requestProps, limit: LIVE_ACCESS_RATE_LIMIT })
      }
    }
    return super.handleRequest(requestProps)
  }
}
