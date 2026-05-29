import { Injectable } from '@nestjs/common'
import { db, profiles } from '@ridenrest/database'
import { eq } from 'drizzle-orm'

/**
 * Accès Drizzle aux settings du profil courant (Story 3.2).
 * Seul ce repository touche la table `profiles` pour le module `me`
 * (cf. project-context §NestJS Architecture Rules — "ALL Drizzle queries go here").
 */
@Injectable()
export class MeRepository {
  /**
   * Lit les settings exposés via `/me/settings`.
   * `liveAccessConsent` est tri-state (NULL = jamais demandé). Renvoie `null` si le
   * profil n'existe pas encore (le service applique alors les valeurs par défaut).
   */
  async getSettings(userId: string) {
    const [row] = await db
      .select({
        liveAccessConsent: profiles.liveAccessConsent,
        overpassEnabled: profiles.overpassEnabled,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
    return row ?? null
  }

  /**
   * Persiste le consentement Live (AC #2). Écrit toujours, même si valeur identique
   * (idempotence AC #6).
   *
   * Upsert (INSERT … ON CONFLICT) plutôt qu'UPDATE seul : la ligne `profiles` n'est PAS
   * garantie pour un user authentifié (création au signup best-effort, erreur avalée côté
   * Better Auth). Un `UPDATE … WHERE id = userId` matcherait alors 0 ligne en silence et
   * renverrait un faux succès — inacceptable pour un flag de consentement RGPD. L'upsert
   * garantit l'écriture (la FK `id → user.id` est satisfaite par le JWT authentifié, et
   * toutes les colonnes NOT NULL ont un défaut). `updatedAt` est bumpé manuellement car
   * `$onUpdateFn` ne s'applique pas à la branche `onConflictDoUpdate`.
   */
  async setLiveAccessConsent(userId: string, value: boolean): Promise<void> {
    await db
      .insert(profiles)
      .values({ id: userId, liveAccessConsent: value })
      .onConflictDoUpdate({
        target: profiles.id,
        set: { liveAccessConsent: value, updatedAt: new Date() },
      })
  }
}
