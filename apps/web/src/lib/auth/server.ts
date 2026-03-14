import { auth } from './auth'
import { headers } from 'next/headers'
import { cache } from 'react'

// Cached per-request session fetch for Server Components
export const getServerSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  return session
})
