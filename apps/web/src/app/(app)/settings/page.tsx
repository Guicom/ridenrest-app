import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { authDb, profiles } from '@ridenrest/database'
import { eq } from 'drizzle-orm'
import { StravaConnectionCard } from './_components/strava-connection-card'
import { SignOutButton } from './_components/sign-out-button'
import { DeleteAccountDialog } from './_components/delete-account-dialog'

export const metadata = {
  title: "Paramètres — Ride'n'Rest",
}

export default async function SettingsPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const profile = await authDb
    .select({ stravaAthleteId: profiles.stravaAthleteId })
    .from(profiles)
    .where(eq(profiles.id, session.user.id))
    .then((rows) => rows[0] ?? null)

  const isStravaConnected = Boolean(profile?.stravaAthleteId)

  return (
    <div className="container max-w-2xl pt-10 pb-8">
      <h1 className="text-2xl font-bold mb-6">Paramètres</h1>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Intégrations</h2>
        <StravaConnectionCard isConnected={isStravaConnected} />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Session</h2>
        <div className="flex items-center justify-between rounded-lg border p-4">
          <div>
            <p className="font-medium">Compte</p>
            <p className="text-sm text-muted-foreground">{session.user.email}</p>
          </div>
          <SignOutButton />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-destructive">Zone dangereuse</h2>
        <div className="rounded-lg border border-destructive p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Supprimer mon compte</p>
              <p className="text-sm text-muted-foreground">
                Cette action est irréversible. Toutes vos données seront effacées.
              </p>
            </div>
            <DeleteAccountDialog userEmail={session.user.email} />
          </div>
        </div>
      </section>
    </div>
  )
}
