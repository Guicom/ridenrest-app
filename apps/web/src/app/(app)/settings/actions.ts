'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { authDb, profiles, account } from '@ridenrest/database'
import { eq, and } from 'drizzle-orm'

export async function deleteAccount(confirmedEmail: string): Promise<{ error?: string } | void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  // Server-side confirmation: verify the typed email matches the actual account email
  if (confirmedEmail !== session.user.email) {
    return { error: 'Email de confirmation incorrect.' }
  }

  try {
    await auth.api.deleteUser({
      headers: await headers(),
      body: {},
    })
  } catch (err) {
    console.error('[settings] deleteAccount failed:', err)
    return { error: 'Une erreur est survenue. Contactez le support.' }
  }

  redirect('/')
}

export async function disconnectStrava(): Promise<{ success: boolean; error?: string }> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const userId = session.user.id

  try {
    await authDb.transaction(async (tx) => {
      // Delete Better Auth account record for Strava
      await tx
        .delete(account)
        .where(and(eq(account.userId, userId), eq(account.providerId, 'strava')))

      // Clear stravaAthleteId in profiles
      await tx
        .update(profiles)
        .set({ stravaAthleteId: null })
        .where(eq(profiles.id, userId))
    })
  } catch (err) {
    console.error('[disconnectStrava] Transaction failed for user', userId, err)
    return { success: false, error: 'Impossible de déconnecter Strava. Réessaie dans quelques instants.' }
  }

  revalidatePath('/settings')
  return { success: true }
}
