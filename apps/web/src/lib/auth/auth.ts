import { betterAuth } from 'better-auth'
import { jwt, genericOAuth } from 'better-auth/plugins'
import { expo } from '@better-auth/expo'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Resend } from 'resend'
import { authDb, profiles, account } from '@ridenrest/database'
import { eq, and } from 'drizzle-orm'

// Lazy singleton — Resend throws if API key is missing, so don't instantiate at module load
// (sendOnSignUp: false for MVP, so this function is never called until domain is verified)
let _resend: Resend | undefined
function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is required')
  return (_resend ??= new Resend(process.env.RESEND_API_KEY))
}

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
  }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3011',

  // Mobile (MOB-2.1): allow Better Auth to redirect OAuth callbacks back to the
  // native app via its custom URL scheme `ridenrest://`. Additive — the web client
  // keeps using same-site session cookies; this only widens the redirect allow-list.
  trustedOrigins: ['ridenrest://', 'ridenrest://*'],

  // Strava doesn't provide an email — allow different email when linking
  account: {
    accountLinking: {
      allowDifferentEmails: true,
    },
  },

  user: {
    deleteUser: {
      enabled: true,
    },
  },

  plugins: [
    jwt({
      jwt: { expirationTime: '15m' },
      refreshToken: { expiresIn: 60 * 60 * 24 * 30 }, // 30 days
    }),
    // Mobile (MOB-2.1): enables the `@better-auth/expo` native client — handles the
    // OAuth deep-link return (`ridenrest://`) and exposes session/cookie helpers to
    // the Expo app. Pinned to the server's better-auth line (1.5.5). Additive.
    expo(),
    genericOAuth({
      config: [
        {
          providerId: 'strava',
          clientId: process.env.STRAVA_CLIENT_ID!,
          clientSecret: process.env.STRAVA_CLIENT_SECRET!,
          authorizationUrl: 'https://www.strava.com/oauth/authorize',
          tokenUrl: 'https://www.strava.com/oauth/token',
          scopes: ['read,read_all'],  // Strava requires comma-separated scopes (not space)
          // Custom getUserInfo — Strava /athlete returns no email
          getUserInfo: async (tokens) => {
            const res = await fetch('https://www.strava.com/api/v3/athlete', {
              headers: { Authorization: `Bearer ${tokens.accessToken}` },
            })
            if (!res.ok) throw new Error('Failed to fetch Strava athlete profile')
            const athlete = (await res.json()) as {
              id: number
              firstname: string
              lastname: string
              profile_medium?: string
              profile?: string
            }
            return {
              id: String(athlete.id),
              name: `${athlete.firstname} ${athlete.lastname}`.trim(),
              // Strava has no email — placeholder needed by Better Auth interface
              // This email is NEVER stored (linkSocial doesn't create a new user)
              email: `strava_${athlete.id}@strava.local`,
              emailVerified: false,
              image: athlete.profile_medium ?? athlete.profile ?? undefined,
            }
          },
        },
      ],
    }),
  ],

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
    // Strava OAuth added in story 2.3 (custom provider)
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    sendResetPassword: async ({ user, url }) => {
      await getResend().emails.send({
        from: 'onboarding@resend.dev', // TODO: changer en "Ride'n'Rest <noreply@ridenrest.app>" après vérification domaine
        to: user.email,
        subject: "Réinitialisation de votre mot de passe — Ride'n'Rest",
        html: `<p>Bonjour,</p><p><a href="${url}">Réinitialiser mon mot de passe</a></p><p>Ce lien expire dans 1 heure.</p>`,
      })
    },
  },

  // Email verification — MVP: sendOnSignUp: false (no Resend domain configured yet)
  // Change to true when custom domain 'noreply@ridenrest.app' is verified in Resend
  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) => {
      await getResend().emails.send({
        from: "Ride'n'Rest <noreply@ridenrest.app>",
        to: user.email,
        subject: "Vérifiez votre adresse email — Ride'n'Rest",
        html: `<p>Bonjour,</p><p><a href="${url}">Vérifier mon email</a></p>`,
      })
    },
  },

  // Auto-create profiles record on user registration
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await authDb.insert(profiles).values({ id: user.id }).onConflictDoNothing()
          } catch (err) {
            // Log but don't rethrow — profile creation failure must not block sign-in
            console.error('[auth] Failed to create profile for user', user.id, err)
          }
        },
      },
      delete: {
        before: async (user) => {
          // Best-effort: revoke Strava token before account cascade-delete
          try {
            const [stravaAccount] = await authDb
              .select({ accessToken: account.accessToken })
              .from(account)
              .where(and(eq(account.userId, user.id), eq(account.providerId, 'strava')))
            if (stravaAccount?.accessToken) {
              await fetch('https://www.strava.com/oauth/deauthorize', {
                method: 'POST',
                headers: { Authorization: `Bearer ${stravaAccount.accessToken}` },
                // Best-effort: cap the call so a slow/unreachable Strava can't block
                // the user-delete cascade on the socket-level OS timeout.
                signal: AbortSignal.timeout(5000),
              })
            }
          } catch (err) {
            console.warn('[auth] Strava deauthorize on account delete failed (best-effort):', err)
          }
        },
      },
    },
    // Sync profiles.stravaAthleteId when Strava account is linked
    account: {
      create: {
        after: async (acct) => {
          if (acct.providerId !== 'strava') return
          try {
            const result = await authDb
              .update(profiles)
              .set({ stravaAthleteId: acct.accountId })
              .where(eq(profiles.id, acct.userId))
            if (result.rowCount === 0) {
              console.warn('[auth] stravaAthleteId update matched 0 rows — profile missing for user', acct.userId)
            }
          } catch (err) {
            console.error('[auth] Failed to update stravaAthleteId for user', acct.userId, err)
          }
        },
      },
      // MOB-2.4: centralized Strava-unlink side effects. Fires whenever a `strava`
      // account row is deleted — including the **mobile** client's `unlinkAccount()`
      // (which by itself only removes the row). Mirrors the web Server Action
      // `disconnectStrava` so web + mobile reach the SAME end state: token revoked +
      // profiles.stravaAthleteId cleared. Best-effort & idempotent (a re-run after a
      // user cascade-delete simply no-ops on an already-revoked token / missing profile).
      delete: {
        before: async (acct) => {
          if (acct.providerId !== 'strava') return
          // Best-effort deauthorize — revoke the access token with Strava.
          try {
            if (acct.accessToken) {
              await fetch('https://www.strava.com/oauth/deauthorize', {
                method: 'POST',
                headers: { Authorization: `Bearer ${acct.accessToken}` },
                // Best-effort: cap the call so a slow/unreachable Strava can't make the
                // interactive mobile `unlinkAccount` request hang on the OS socket timeout.
                signal: AbortSignal.timeout(5000),
              })
            }
          } catch (err) {
            console.warn('[auth] Strava deauthorize on unlink failed (best-effort):', err)
          }
          // Reset the denormalized athlete id so the web settings page (which reads
          // profiles.stravaAthleteId) reflects the disconnect performed from mobile.
          try {
            await authDb
              .update(profiles)
              .set({ stravaAthleteId: null })
              .where(eq(profiles.id, acct.userId))
          } catch (err) {
            console.error('[auth] Failed to clear stravaAthleteId on Strava unlink for user', acct.userId, err)
          }
        },
      },
    },
  },

})
