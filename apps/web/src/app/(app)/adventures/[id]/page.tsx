import { AdventureDetail } from './_components/adventure-detail'
import { getServerSession } from '@/lib/auth/server'
import { authDb, account } from '@ridenrest/database'
import { and, eq } from 'drizzle-orm'

interface Props {
  params: Promise<{ id: string }>
}

export default async function AdventureDetailPage({ params }: Props) {
  const { id } = await params
  const session = await getServerSession()
  let stravaConnected = false

  if (session?.user?.id) {
    const [stravaAccount] = await authDb
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, session.user.id), eq(account.providerId, 'strava')))
    stravaConnected = !!stravaAccount
  }

  return <AdventureDetail adventureId={id} stravaConnected={stravaConnected} />
}
