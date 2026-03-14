import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { authDb, profiles } from '@ridenrest/database'
import { eq } from 'drizzle-orm'
import { StravaConnectionCard } from './_components/strava-connection-card'

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
    <div className="container max-w-2xl py-8">
      <h1 className="text-2xl font-bold mb-6">Paramètres</h1>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Intégrations</h2>
        <StravaConnectionCard isConnected={isStravaConnected} />
      </section>
    </div>
  )
}
