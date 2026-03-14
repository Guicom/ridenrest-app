import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { authDb } from '@ridenrest/database'

// Placeholder — Google + Strava OAuth configured in story 2.x
export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    // Email verification configured in story 2.1
  },
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3011',
  // Social providers added in stories 2.2 (Google) and 2.3 (Strava)
})
