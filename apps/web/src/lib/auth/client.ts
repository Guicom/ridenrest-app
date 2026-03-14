import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011',
})

// Named exports for convenience
export const { signIn, signOut, signUp, useSession } = authClient
