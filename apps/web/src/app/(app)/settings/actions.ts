'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { authDb, profiles, account } from '@ridenrest/database'
import { eq, and } from 'drizzle-orm'

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
