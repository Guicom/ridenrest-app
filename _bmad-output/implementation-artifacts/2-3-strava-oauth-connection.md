# Story 2.3: Strava OAuth Connection

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to connect my Strava account,
So that I can import my Strava activities as GPX segments in my adventures.

## Acceptance Criteria

1. **Given** a logged-in user visits Settings and clicks "Connecter Strava",
   **When** they complete the Strava OAuth flow,
   **Then** their Strava access token is stored securely in the DB (Better Auth `account` table) and the Settings page shows "Strava connecté".

2. **Given** a user has Strava connected,
   **When** they click "Déconnecter Strava" in Settings,
   **Then** the stored Strava tokens are deleted and the UI shows "Strava non connecté".

3. **Given** a user without Strava connected attempts to access the Strava import feature,
   **When** they reach the import flow,
   **Then** they are prompted to connect Strava first with a direct link to the OAuth flow.

4. **Given** the Strava OAuth callback is received,
   **When** it is processed,
   **Then** the `profiles.strava_athlete_id` is updated with the athlete's Strava ID.

## Tasks / Subtasks

- [ ] Task 1 — Strava API app setup (AC: all) **[MANUAL — Guillaume]**
  - [ ] 1.1 Create/update Strava API app at https://www.strava.com/settings/api
  - [ ] 1.2 Set "Authorization Callback Domain" to `localhost` (dev) and `<ridenrest-domain>` (prod)
    - Better Auth callback URL: `http://localhost:3011/api/auth/callback/strava`
  - [ ] 1.3 Copy `Client ID` and `Client Secret` to `apps/web/.env.local` (see Task 5)

- [x] Task 2 — Install `genericOAuth` plugin + update auth.ts (AC: #1, #4)
  - [x] 2.1 Update `apps/web/src/lib/auth/auth.ts` — add `genericOAuth` to plugins array with Strava config (see Dev Notes)
  - [x] 2.2 Update `apps/web/src/lib/auth/auth.ts` — add `databaseHooks.account.create.after` to update `profiles.stravaAthleteId` when Strava account is linked (see Dev Notes)

- [x] Task 3 — Update auth client with `genericOAuthClient` plugin (AC: #1, #2)
  - [x] 3.1 Update `apps/web/src/lib/auth/client.ts` — add `genericOAuthClient()` plugin so `authClient.linkSocial()` supports the Strava provider

- [x] Task 4 — Create Settings page (AC: #1, #2, #3)
  - [x] 4.1 Create `apps/web/src/app/(app)/settings/page.tsx` — Server Component; reads session + profile; renders `<StravaConnectionCard />`
  - [x] 4.2 Create `apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx` — `'use client'`; shows connect/disconnect state; calls `authClient.linkSocial()` or disconnect action (see Dev Notes)
  - [x] 4.3 Create `apps/web/src/app/(app)/settings/actions.ts` — Server Action `disconnectStrava()`: deletes Better Auth account record + clears `profiles.stravaAthleteId` (see Dev Notes)

- [ ] Task 5 — Update environment variables (AC: all) **[MANUAL — Guillaume]**
  - [ ] 5.1 Add to `apps/web/.env.local`:
    ```
    STRAVA_CLIENT_ID=<from strava.com/settings/api>
    STRAVA_CLIENT_SECRET=<from strava.com/settings/api>
    ```
  - [ ] 5.2 Add to `apps/web/.env.example` (placeholders): `STRAVA_CLIENT_ID=` and `STRAVA_CLIENT_SECRET=`

- [ ] Task 6 — Code Review Follow-ups (AI) [LOW — action items]
  - [ ] [AI-Review][LOW] Replace `fireEvent.click` with `userEvent.click` in `strava-connection-card.test.tsx` for realistic interaction simulation [strava-connection-card.test.tsx:44,57,85]
  - [ ] [AI-Review][LOW] Add `STRAVA_CLIENT_ID=` and `STRAVA_CLIENT_SECRET=` placeholders to `apps/web/.env.example` (task 5.2 still unchecked)
  - [ ] [AI-Review][LOW] Add "Paramètres" nav link to `(app)/layout.tsx` when navigation is implemented — Settings page currently unreachable from UI

- [ ] Task 7 — Final validation (AC: #1–#4)
  - [ ] 6.1 Click "Connecter Strava" → Strava OAuth flow → Settings shows "Strava connecté" ✅
  - [ ] 6.2 `account` table: Strava row with `provider_id = 'strava'`, accessToken, refreshToken ✅
  - [ ] 6.3 `profiles` table: `strava_athlete_id` populated ✅
  - [ ] 6.4 Click "Déconnecter Strava" → `account` row deleted, `strava_athlete_id = null` ✅
  - [ ] 6.5 Visit Settings without Strava connected → shows "Strava non connecté" ✅

## Dev Notes

### CRITICAL: What's Already Done — Do NOT Redo

From stories 2.1–2.2 (already implemented):
- ✅ `apps/web/src/lib/auth/auth.ts` — Better Auth with JWT plugin, `socialProviders.google`, `databaseHooks.user.create.after` (try/catch added in 2.2 code review)
- ✅ `apps/web/src/lib/auth/client.ts` — `authClient` with `jwtClient()` + Google client
- ✅ `apps/web/src/middleware.ts` — session check for `(app)/` routes (auth-gated)
- ✅ `apps/web/src/app/(app)/adventures/page.tsx` — existing (app)/ route example
- ✅ `packages/database/src/schema/profiles.ts` — has `stravaAthleteId: text('strava_athlete_id').unique()`
- ✅ `packages/database/src/schema/auth.ts` — `account` table with `accessToken`, `refreshToken`, `accountId`, `providerId` fully defined and exported from `@ridenrest/database`
- ✅ `components/shared/google-sign-in-button.tsx`, `error-message.tsx`, `ui/button.tsx`

**This story adds:** `genericOAuth` Strava provider + Settings page + connect/disconnect flow.

### CRITICAL Architecture Distinction: Strava ≠ Google OAuth

| | Google (story 2.2) | Strava (story 2.3) |
|---|---|---|
| Purpose | **Sign-in / Registration** | **Account linking** (import only) |
| User state | Anonymous → authenticated | Already authenticated |
| Better Auth method | `signIn.social()` | `linkSocial()` |
| Better Auth plugin | Built-in `socialProviders` | `genericOAuth` (custom provider) |
| Create user? | Yes (if new) | NO — links to existing user |
| Email required? | Yes (Google provides it) | NO — Strava doesn't provide email |

**Strava OAuth is NOT used for authentication.** Users sign in with email or Google. Strava is connected as an integration to enable route import (story 3.5).

### Strava API Constraints (CRITICAL — affects story 3.5)

- **Strava ToS**: Routes only, NOT activities. Use `GET /api/v3/athletes/{id}/routes` → `GET /api/v3/routes/{id}/export_gpx`
- **Rate limits**: 100 req/15min, 1000/day — enforce in NestJS `strava.service.ts` (story 3.5)
- **Token expiry**: Access token valid 6h (`expires_in: 21600`). Refresh token stored in `account.refreshToken` — NestJS will handle refresh in story 3.5
- **No email in API**: `GET /api/v3/athlete` does NOT return email. Use placeholder in `getUserInfo`

### Task 2: auth.ts Update — Full File After Changes

```typescript
import { betterAuth } from 'better-auth'
import { jwt, genericOAuth } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Resend } from 'resend'
import { authDb, profiles, account } from '@ridenrest/database'
import { eq, and } from 'drizzle-orm'

function getResend(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY environment variable is required')
  return new Resend(process.env.RESEND_API_KEY)
}

export const auth = betterAuth({
  database: drizzleAdapter(authDb, {
    provider: 'pg',
  }),
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3011',

  plugins: [
    jwt({
      jwt: { expirationTime: '15m' },
      refreshToken: { expiresIn: 60 * 60 * 24 * 30 }, // 30 days
    }),
    // ← ADD: Strava custom OAuth2 provider
    genericOAuth({
      config: [
        {
          providerId: 'strava',
          clientId: process.env.STRAVA_CLIENT_ID!,
          clientSecret: process.env.STRAVA_CLIENT_SECRET!,
          authorizationUrl: 'https://www.strava.com/oauth/authorize',
          tokenUrl: 'https://www.strava.com/oauth/token',
          scopes: ['read,activity:read_all,read_all'],

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
              image: athlete.profile_medium ?? athlete.profile ?? null,
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
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },

  emailVerification: {
    sendOnSignUp: false,
    sendVerificationEmail: async ({ user, url }) => {
      await getResend().emails.send({
        from: "Ride'n'Rest <noreply@ridenrest.com>",
        to: user.email,
        subject: "Vérifiez votre adresse email — Ride'n'Rest",
        html: `<p>Bonjour,</p><p><a href="${url}">Vérifier mon email</a></p>`,
      })
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            await authDb.insert(profiles).values({ id: user.id }).onConflictDoNothing()
          } catch (err) {
            console.error('[auth] Failed to create profile for user', user.id, err)
          }
        },
      },
    },
    // ← ADD: Sync profiles.stravaAthleteId when Strava account is linked
    account: {
      create: {
        after: async (acct) => {
          if (acct.providerId !== 'strava') return
          try {
            await authDb
              .update(profiles)
              .set({ stravaAthleteId: acct.accountId })
              .where(eq(profiles.id, acct.userId))
          } catch (err) {
            console.error('[auth] Failed to update stravaAthleteId for user', acct.userId, err)
          }
        },
      },
    },
  },
})
```

> **`account.create.after` hook**: `acct.accountId` is the Strava athlete ID (returned as `id` from `getUserInfo`). It's stored as a string. The hook fires for ALL providers — the `if (acct.providerId !== 'strava') return` guard prevents it from running on Google account creation.
>
> **Import note**: `account` and `eq`/`and` imports are needed for the disconnect Server Action. Add them to the auth.ts import if also used there. In disconnect action, import `account` from `@ridenrest/database` directly.

### Task 3: client.ts Update

```typescript
import { createAuthClient } from 'better-auth/react'
import { jwtClient, genericOAuthClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011',
  plugins: [
    jwtClient(),        // JWT token via /api/auth/token
    genericOAuthClient(), // Enables authClient.linkSocial() for custom providers (Strava)
  ],
})

export const { signIn, signOut, signUp, useSession } = authClient
```

> **`genericOAuthClient()`**: Extends the client with `authClient.linkSocial({ provider: 'strava', callbackURL: '/settings' })`. Required for custom providers defined with `genericOAuth` plugin on the server. The existing `signIn.social()` (from standard socialProviders) does NOT work for genericOAuth providers.

### Task 4.1: Settings Page

#### `apps/web/src/app/(app)/settings/page.tsx` (NEW)

```typescript
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
```

> **Pattern**: Server Component fetches profile, passes `isConnected` boolean to Client Component. Same `(app)/` layout as `adventures/page.tsx`.

### Task 4.2: StravaConnectionCard Component

#### `apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx` (NEW)

```typescript
'use client'

import { useState, useTransition } from 'react'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { disconnectStrava } from '../actions'

interface StravaConnectionCardProps {
  isConnected: boolean
}

export function StravaConnectionCard({ isConnected }: StravaConnectionCardProps) {
  const [isPending, setIsPending] = useState(false)
  const [isDisconnecting, startDisconnect] = useTransition()

  const handleConnect = async () => {
    setIsPending(true)
    try {
      await authClient.linkSocial({
        provider: 'strava',
        callbackURL: '/settings',
      })
    } catch {
      setIsPending(false)
    }
  }

  const handleDisconnect = () => {
    startDisconnect(async () => {
      await disconnectStrava()
      // Page revalidates automatically (Server Action + revalidatePath)
    })
  }

  return (
    <div className="flex items-center justify-between rounded-lg border p-4">
      <div className="flex items-center gap-3">
        {/* Strava logo mark */}
        <svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0 4 13.828h4.17"
            fill="#FC4C02"
          />
        </svg>
        <div>
          <p className="font-medium">Strava</p>
          <p className="text-sm text-muted-foreground">
            {isConnected ? 'Compte connecté' : 'Non connecté'}
          </p>
        </div>
      </div>

      {isConnected ? (
        <Button
          variant="outline"
          size="sm"
          onClick={handleDisconnect}
          disabled={isDisconnecting}
        >
          {isDisconnecting ? 'Déconnexion...' : 'Déconnecter'}
        </Button>
      ) : (
        <Button
          variant="default"
          size="sm"
          onClick={handleConnect}
          disabled={isPending}
        >
          {isPending ? 'Redirection...' : 'Connecter Strava'}
        </Button>
      )}
    </div>
  )
}
```

### Task 4.3: Disconnect Server Action

#### `apps/web/src/app/(app)/settings/actions.ts` (NEW)

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { auth } from '@/lib/auth/auth'
import { authDb, profiles, account } from '@ridenrest/database'
import { eq, and } from 'drizzle-orm'

export async function disconnectStrava() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  const userId = session.user.id

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

  revalidatePath('/settings')
}
```

> **Transaction**: Delete account record and clear `stravaAthleteId` atomically. If either fails, both roll back — prevents inconsistent state (tokens deleted but ID still set, or vice versa).
>
> **`auth.api.getSession`**: Server-side session retrieval via Better Auth's API (used in Server Actions where `getServerSession()` from `lib/auth/server.ts` may not have access to headers). Pass `await headers()` from `next/headers`.
>
> **`revalidatePath('/settings')`**: Forces the Settings Server Component to re-fetch the profile and re-render with updated `isConnected = false`.

### Strava OAuth Callback URL

Better Auth auto-generates the Strava callback at:
```
{BETTER_AUTH_URL}/api/auth/callback/strava
```

Dev: `http://localhost:3011/api/auth/callback/strava`

Register in Strava API settings → **Authorization Callback Domain**: `localhost` (Strava only accepts a domain, not full URL, for dev).

For production: domain must match `BETTER_AUTH_URL` (e.g., `ridenrest.com`).

### Required .env Variables

#### `apps/web/.env.local` — ADD:
```
STRAVA_CLIENT_ID=your_strava_client_id_here
STRAVA_CLIENT_SECRET=your_strava_client_secret_here
```

Get from: https://www.strava.com/settings/api

#### `apps/web/.env.example` — ADD (placeholders):
```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
```

### No DB Migration Needed

`profiles.stravaAthleteId` column already exists in `packages/database/src/schema/profiles.ts` (from story 1.2). The `account` table already has `accessToken`, `refreshToken`, `accountId`, `providerId` columns — used by Better Auth for token storage.

### No NestJS Changes in This Story

The NestJS `strava` module (story 3.5) will read Strava tokens from the `account` table:
```typescript
// Future story 3.5 — NOT implemented here
const stravaAccount = await db.select()
  .from(account)
  .where(and(eq(account.userId, userId), eq(account.providerId, 'strava')))
  .then(rows => rows[0])
// stravaAccount.accessToken → use to call Strava API
// stravaAccount.refreshToken → use to refresh when expired (6h TTL)
```

### Settings Page Navigation

Add "Paramètres" link to the `(app)/layout.tsx` navigation if it exists (or document that it's needed). The Settings page is self-contained — no nav update required for this story if the layout has no nav yet.

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO NestJS strava module (story 3.5)
- ❌ NO Strava route/activity import (story 3.5)
- ❌ NO Strava token refresh logic (story 3.5 — handled in NestJS before each API call)
- ❌ NO password reset (story 2.4)
- ❌ NO sign out (story 2.4)
- ❌ NO account deletion (story 2.4)
- ❌ NO "Strava non connecté" prompt inside import flow (gated check is story 3.5)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.3 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — Strava custom OAuth, account table, strava.service.ts pattern]
- [Source: _bmad-output/project-context.md — nodenext rules, port config, NestJS pattern]
- [Source: packages/database/src/schema/profiles.ts — stravaAthleteId field]
- [Source: packages/database/src/schema/auth.ts — account table with accessToken/refreshToken]
- [Source: _bmad-output/implementation-artifacts/2-2-google-oauth-sign-in.md — auth.ts current state (socialProviders.google added)]
- [Source: better-auth.com/docs/plugins/generic-oauth — genericOAuth plugin, getUserInfo, linkSocial]
- [Source: developers.strava.com/docs/authentication — OAuth2 endpoints, scopes, token format]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ Task 2: `genericOAuth` plugin added to `auth.ts` with full Strava config (authorizationUrl, tokenUrl, custom getUserInfo with no-email placeholder). `account.create.after` hook syncs `profiles.stravaAthleteId` on Strava link.
- ✅ Task 3: `genericOAuthClient()` added to `client.ts` — enables `authClient.linkSocial()` for Strava.
- ✅ Task 4: Settings page created (Server Component reads profile + passes `isConnected` boolean), `StravaConnectionCard` client component, `disconnectStrava` server action with DB transaction.
- ✅ Added `drizzle-orm` as direct dependency to `apps/web` (was missing — only available via `@ridenrest/database`).
- ✅ Fixed TypeScript: `image` type changed to `string | undefined` (not `null`) to match `OAuth2UserInfo` interface.
- ✅ 36 tests pass (6 new tests for `StravaConnectionCard` covering connect/disconnect UI states, authClient.linkSocial call, error recovery).
- ✅ **[Code Review Fix H1]** Fixed Strava OAuth scopes: removed `activity:read_all` (violates architecture/ToS), fixed comma-embedded single-string format → `['read', 'read_all']`.
- ✅ **[Code Review Fix H2/M1]** `disconnectStrava` now returns `{ success, error? }` with try/catch; component shows error message on failure; `handleConnect` uses `finally` to reset `isPending`.
- ✅ **[Code Review Fix M2]** `account.create.after` now logs a warning when UPDATE affects 0 rows (missing profile).
- ✅ **[Code Review Fix M3]** Created `actions.test.ts` with 3 tests covering unauthenticated redirect, happy path, and transaction failure.
- ⚠️ Tasks 1, 5, 7 are MANUAL (Guillaume): Strava API app setup, `.env.local` credentials, `.env.example` placeholders, and E2E validation.

### File List

#### New Files
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx`
- `apps/web/src/app/(app)/settings/_components/strava-connection-card.test.tsx`
- `apps/web/src/app/(app)/settings/actions.ts`
- `apps/web/src/app/(app)/settings/actions.test.ts`

#### Modified Files
- `apps/web/src/lib/auth/auth.ts` — added `genericOAuth` Strava plugin + `account.create.after` hook + `eq` import from drizzle-orm
- `apps/web/src/lib/auth/client.ts` — added `genericOAuthClient()` plugin
- `apps/web/package.json` — added `drizzle-orm` direct dependency
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status updated to `review`

#### Manual Tasks Remaining (Guillaume)
- `apps/web/.env.example` — add `STRAVA_CLIENT_ID=` and `STRAVA_CLIENT_SECRET=` placeholders
- `apps/web/.env.local` — add actual Strava API credentials (from strava.com/settings/api)

---

## Change Log

- 2026-03-14: Story 2.3 created — Strava OAuth connection via Better Auth genericOAuth plugin, Settings page with connect/disconnect, server action for disconnect
- 2026-03-14: Story 2.3 implemented — Tasks 2-4 complete (Tasks 1, 5, 7 are manual). Added drizzle-orm direct dep to apps/web, fixed OAuth2UserInfo type (null→undefined). 36 tests pass.
- 2026-03-14: Code review complete — Fixed scopes (removed activity:read_all, proper array format), added error handling to disconnectStrava action + component, 0-row UPDATE warning, new actions.test.ts. Status → done.
