import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import type { Request } from 'express'
import { timingSafeEqual } from 'node:crypto'

/**
 * HealthTokenGuard (Story 4.3) — protège les endpoints de santé opérationnels exposés à
 * un monitor externe (Uptime Kuma) sans session JWT.
 *
 * Le client (Kuma) envoie le header `x-health-token` ; il est comparé en temps constant à
 * la variable d'env `HEALTH_ENDPOINT_TOKEN`.
 *
 * **Fail-closed** : si `HEALTH_ENDPOINT_TOKEN` n'est pas configuré, l'accès est REFUSÉ.
 * On préfère un endpoint inaccessible à un endpoint exposant des infos opérationnelles
 * (profondeur de queue, échecs) publiquement par défaut.
 *
 * À utiliser avec `@Public()` (pour bypasser le `JwtAuthGuard` global) + `@SkipThrottle()`.
 */
@Injectable()
export class HealthTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env['HEALTH_ENDPOINT_TOKEN']
    if (!expected) {
      throw new UnauthorizedException('Health endpoint token not configured')
    }

    const req = context.switchToHttp().getRequest<Request>()
    const provided = req.headers['x-health-token']
    const token = Array.isArray(provided) ? provided[0] : provided

    if (!token || !this.safeEqual(token, expected)) {
      throw new UnauthorizedException('Invalid health endpoint token')
    }
    return true
  }

  /** Comparaison en temps constant (évite les timing attacks sur le token). */
  private safeEqual(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  }
}
