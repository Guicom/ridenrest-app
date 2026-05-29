/**
 * Lookup du consentement Live (Story 3.1, AC #2).
 *
 * Lit `profiles.live_access_consent` (tri-state RGPD) pour un user :
 *  - `true`  → consentement explicite → calcul Live autorisé.
 *  - `false` → refus explicite        → fallback `no_consent`.
 *  - `null`  → jamais demandé         → fallback `no_consent` (traité comme non-consenti).
 *
 * Fonction pure : `db` passé en paramètre (cohérent avec resolve-origin, testable
 * sans DI NestJS). Lookup sur `id` (PK) → indexé nativement, ~5 ms (Discovery #2/#5).
 * `userId` n'est jamais propagé au cache Redis (anonymisation, cf. redis-cache.ts).
 */
import { sql } from 'drizzle-orm'
import type { SqlExecutor } from './types/access-result.types.js'

/**
 * @returns `true` / `false` selon le consentement, `null` si jamais demandé OU si le
 *          profil n'existe pas encore (les deux → non-consenti côté appelant).
 */
export async function getLiveAccessConsent(db: SqlExecutor, userId: string): Promise<boolean | null> {
  const { rows } = await db.execute(sql`
    SELECT live_access_consent
    FROM profiles
    WHERE id = ${userId}
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const consent = row.live_access_consent
  return consent === null || consent === undefined ? null : Boolean(consent)
}
