import { Injectable } from '@nestjs/common'
import { db, pushTokens, adventures } from '@ridenrest/database'
import { and, eq } from 'drizzle-orm'

// Toutes les requêtes Drizzle du feature push vivent ici (règle project-context :
// JAMAIS de query dans le service). Story MOB-6.2 / T2.
@Injectable()
export class PushRepository {
  /**
   * Upsert d'un token (dédupe sur `token` unique). Un device qui se ré-enregistre
   * (nouveau login, réinstall) écrase l'ancien propriétaire/plateforme du même token.
   */
  async upsertToken(userId: string, token: string, platform: 'ios' | 'android') {
    const [row] = await db
      .insert(pushTokens)
      .values({ userId, token, platform })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, platform, updatedAt: new Date() },
      })
      .returning({
        token: pushTokens.token,
        platform: pushTokens.platform,
        createdAt: pushTokens.createdAt,
      })
    return row
  }

  /** Supprime le token d'un device — scopé à l'utilisateur (AC4, désinscription au logout). */
  async deleteByUserAndToken(userId: string, token: string): Promise<void> {
    await db
      .delete(pushTokens)
      .where(and(eq(pushTokens.userId, userId), eq(pushTokens.token, token)))
  }

  /**
   * Purge un token invalide (Expo `DeviceNotRegistered`) — sans contrainte d'utilisateur :
   * le token est mort, quel que soit son propriétaire (AC2, best-effort côté envoi).
   */
  async deleteByToken(token: string): Promise<void> {
    await db.delete(pushTokens).where(eq(pushTokens.token, token))
  }

  /** Tokens d'un utilisateur (destinataires de la notification). */
  async findTokensByUserId(userId: string): Promise<string[]> {
    const rows = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId))
    return rows.map((r) => r.token)
  }

  /**
   * Résout le propriétaire d'une aventure (le payload du job densité ne contient PAS
   * de `userId` — cf. Dev Notes « piège userId »). Aucune PII exposée : on ne retourne
   * que l'`user_id` (identifiant opaque).
   */
  async findAdventureOwnerId(adventureId: string): Promise<string | null> {
    const [row] = await db
      .select({ userId: adventures.userId })
      .from(adventures)
      .where(eq(adventures.id, adventureId))
    return row?.userId ?? null
  }
}
