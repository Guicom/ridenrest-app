import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { authDb, profiles } from '@ridenrest/database'
import { eq } from 'drizzle-orm'
import { StravaConnectionCard } from './_components/strava-connection-card'
import { SignOutButton } from './_components/sign-out-button'
import { DeleteAccountDialog } from './_components/delete-account-dialog'
import { OverpassToggle } from './_components/overpass-toggle'
import { AboutSection } from './_components/about-section'
import { Card, CardContent } from '@/components/ui/card'

export const metadata = {
  title: "Paramètres — Ride'n'Rest",
}

export default async function SettingsPage() {
  const session = await getServerSession()
  if (!session) redirect('/login')

  const profile = await authDb
    .select({ stravaAthleteId: profiles.stravaAthleteId, overpassEnabled: profiles.overpassEnabled })
    .from(profiles)
    .where(eq(profiles.id, session.user.id))
    .then((rows) => rows[0] ?? null)

  const isStravaConnected = Boolean(profile?.stravaAthleteId)
  const overpassEnabled = profile?.overpassEnabled ?? false

  return (
    <div className="max-w-2xl mx-auto px-4 pt-10 pb-8 space-y-8">
      <h1 className="text-2xl font-bold">Paramètres</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Intégrations</h2>
        <Card>
          <CardContent className="pt-4">
            <StravaConnectionCard isConnected={isStravaConnected} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Recherche de points d&apos;intérêt</h2>
        <Card>
          <CardContent className="pt-4">
            <OverpassToggle initialEnabled={overpassEnabled} />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Session</h2>
        <Card>
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="font-medium">Compte</p>
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            </div>
            <SignOutButton />
          </CardContent>
        </Card>
      </section>

      <AboutSection />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-destructive uppercase tracking-wide px-1">Zone dangereuse</h2>
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-center justify-between">
            <div>
              <p className="font-medium">Supprimer mon compte</p>
              <p className="text-sm text-muted-foreground">
                Cette action est irréversible. Toutes vos données seront effacées.
              </p>
            </div>
            <DeleteAccountDialog userEmail={session.user.email} />
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
