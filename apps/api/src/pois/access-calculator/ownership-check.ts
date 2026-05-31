import { db } from '@ridenrest/database'
import { sql } from 'drizzle-orm'
import type { OwnerCheckFn } from '../../common/decorators/owned-resource.decorator.js'

/**
 * `OwnerCheckFn` pour l'endpoint `POST /pois/:id/access` (Story 2.3, AC #5).
 *
 * Un POI (`accommodations_cache`) appartient à un segment, lui-même rattaché à une
 * aventure appartenant à un user. La requête renvoie `true` ssi le POI existe ET
 * que la chaîne POI → segment → aventure remonte au `userId` authentifié.
 *
 * POI inexistant → aucune ligne → `false` (le 404 « POI introuvable » est levé
 * plus tard par `AccessCalculatorService.compute()`, après que le guard a tranché).
 *
 * SQL inline via `db.execute` (cohérent avec AccessCalculatorService, Story 2.2) :
 * trivialement mockable en test, et aucun repository existant n'expose ce lookup.
 */
export const checkPoiOwnership: OwnerCheckFn = async (poiId, userId) => {
  const { rows } = await db.execute(sql`
    SELECT 1
    FROM accommodations_cache ac
    JOIN adventure_segments seg ON seg.id = ac.segment_id
    JOIN adventures adv ON adv.id = seg.adventure_id
    WHERE ac.id = ${poiId} AND adv.user_id = ${userId}
    LIMIT 1
  `)
  return rows.length > 0
}
