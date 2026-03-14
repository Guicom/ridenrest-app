import { createAuthClient } from 'better-auth/react'
import { jwtClient, genericOAuthClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011',
  plugins: [
    jwtClient(), // Registers JWT server plugin inference; token fetched via /api/auth/token
    genericOAuthClient(), // Enables authClient.linkSocial() for custom providers (Strava)
  ],
})

// Named exports for convenience
export const { signIn, signOut, signUp, useSession } = authClient
