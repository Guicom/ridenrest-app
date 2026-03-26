# Story 2.2: Google OAuth Sign-In

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to sign in with my Google account in one click,
So that I can access the app without creating a separate password.

## Acceptance Criteria

1. **Given** a user clicks "Continuer avec Google" on the login or register page,
   **When** they complete the Google OAuth flow,
   **Then** they are redirected back to the app with a valid session and land on `/adventures`.

2. **Given** a user signs in with Google for the first time,
   **When** the OAuth callback completes,
   **Then** a `profiles` record is created with their Google display name and email (handled by the existing `databaseHooks.user.create.after` hook from story 2.1).

3. **Given** a user who previously registered with email signs in with Google using the same email,
   **When** the OAuth flow completes,
   **Then** their existing account is linked and they access the same data (no duplicate account).

4. **Given** a user cancels the Google OAuth popup/redirect,
   **When** they return to the app,
   **Then** they remain on the login page with no error state and no session is created.

## Tasks / Subtasks

- [ ] Task 1 — Google Cloud Console setup (AC: all) **[MANUAL — Guillaume]**
  - [ ] 1.1 Create OAuth 2.0 credentials at https://console.cloud.google.com → APIs & Services → Credentials
  - [ ] 1.2 Set Authorized redirect URIs:
    - Dev: `http://localhost:3011/api/auth/callback/google`
    - Prod: `https://<ridenrest-domain>/api/auth/callback/google`
  - [ ] 1.3 Copy `Client ID` and `Client Secret` to `apps/web/.env.local` (see Task 4)

- [x] Task 2 — Update Better Auth server instance with Google social provider (AC: #1, #2, #3)
  - [x] 2.1 Update `apps/web/src/lib/auth/auth.ts` — add `socialProviders.google` block (see Dev Notes)
  - [x] 2.2 Verify `baseURL` is correctly set — critical for redirect_uri_mismatch prevention

- [x] Task 3 — Add Google sign-in button to login page (AC: #1, #4)
  - [x] 3.1 Update `apps/web/src/app/(marketing)/login/_components/login-form.tsx` — add `<GoogleSignInButton />` above the email form (see Dev Notes)

- [x] Task 4 — Add Google sign-in button to register page (AC: #1, #2)
  - [x] 4.1 Update `apps/web/src/app/(marketing)/register/_components/register-form.tsx` — add `<GoogleSignInButton />` above the email form

- [x] Task 5 — Create shared GoogleSignInButton component (AC: #1, #4)
  - [x] 5.1 Create `apps/web/src/components/shared/google-sign-in-button.tsx` — reusable button used on both login and register pages (see Dev Notes)

- [ ] Task 6 — Update environment variables (AC: all) **[MANUAL — Guillaume]**
  - [ ] 6.1 Add to `apps/web/.env.local`:
    ```
    GOOGLE_CLIENT_ID=<from Google Cloud Console>
    GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
    ```
  - [x] 6.2 Add to `apps/web/.env.example` (non-sensitive placeholder): `GOOGLE_CLIENT_ID=` and `GOOGLE_CLIENT_SECRET=`

- [ ] Review Follow-ups (AI)
  - [ ] [AI-Review][LOW] Migrate `loginSchema` and `registerSchema` from inline components to `packages/shared/schemas/auth.ts` — violates project shared-schema rule [login-form.tsx:15, register-form.tsx:15]
  - [ ] [AI-Review][LOW] Remove redundant `cleanup()` in `afterEach` — verify `vitest.config.ts` has global teardown configured [google-sign-in-button.test.tsx:24]
  - [ ] [AI-Review][LOW] Add `aria-busy="true"` to Button when `isPending=true` for screen reader accessibility [google-sign-in-button.tsx:26]

- [ ] Task 7 — Final validation (AC: #1–#4)
  - [ ] 7.1 New Google user → profile created → redirected to `/adventures` ✅
  - [ ] 7.2 Existing email user signs in with Google → account linked, same data accessible ✅
  - [ ] 7.3 Cancel Google OAuth → remains on login page, no error, no session ✅
  - [ ] 7.4 `profiles` table: new row exists for Google-authenticated user ✅

## Dev Notes

### CRITICAL: What's Already Done — Do NOT Redo

From story 2.1 (already implemented):
- ✅ `apps/web/src/lib/auth/auth.ts` — Better Auth with JWT plugin, `databaseHooks.user.create.after` auto-creates `profiles` row (works for OAuth users too — Better Auth always creates a `user` record first)
- ✅ `apps/web/src/lib/auth/client.ts` — `authClient` with `jwtClient()` plugin
- ✅ `apps/web/src/middleware.ts` — session check for `(app)/` routes, redirects to `/login`
- ✅ Login page at `apps/web/src/app/(marketing)/login/page.tsx` + `login-form.tsx`
- ✅ Register page at `apps/web/src/app/(marketing)/register/page.tsx` + `register-form.tsx`
- ✅ `components/shared/error-message.tsx`, `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`

**This story adds:** `socialProviders.google` in auth.ts + Google button on login + register pages.

### Architecture Note — OAuth Callback URL

Better Auth auto-generates the Google callback route at:
```
{BETTER_AUTH_URL}/api/auth/callback/google
```

In dev: `http://localhost:3011/api/auth/callback/google`

This is the URL to register in Google Cloud Console → Authorized redirect URIs.
The Next.js catch-all handler at `app/api/auth/[...all]/route.ts` already handles it (no new route needed).

### Story 2.1 Learnings (CRITICAL)

- **Port:** Web on `:3011`, API on `:3010`
- **nodenext in `apps/api`** — ALL relative imports MUST use `.js` extension. NO changes to `apps/api` in this story.
- **`moduleResolution: "bundler"` in `apps/web`** — NO `.js` extensions in `apps/web/`
- **`baseURL` is MANDATORY** in `betterAuth()` — already set in story 2.1 as `process.env.BETTER_AUTH_URL ?? 'http://localhost:3011'`
- **`databaseHooks.user.create.after`** — fires for ALL user creation methods (email + OAuth). No changes needed for profile creation.
- **`router.refresh()`** — call after signIn to revalidate Server Components. Already done in email forms; needed in Google button too (via `callbackURL` redirect, the refresh happens automatically on page load).
- **better-auth v1.5.5**: `authClient.signIn.social({ provider: 'google', callbackURL: '/adventures' })` initiates a redirect (NOT a popup). User is redirected to Google, then back to the app at `/adventures`.

### Task 2: auth.ts Update

#### `apps/web/src/lib/auth/auth.ts` (ADD socialProviders block)

```typescript
import { betterAuth } from 'better-auth'
import { jwt } from 'better-auth/plugins'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Resend } from 'resend'
import { authDb, profiles } from '@ridenrest/database'

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
  ],

  // ← ADD THIS BLOCK
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
  },

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

  // Auto-create profiles record on user registration (works for email + OAuth)
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await authDb.insert(profiles).values({ id: user.id }).onConflictDoNothing()
        },
      },
    },
  },
})
```

> **Account linking (AC #3):** Better Auth automatically links accounts that share the same verified email across providers. No additional configuration needed — Google returns a verified email, so if a user previously registered with email `user@example.com` and now signs in with Google using the same address, Better Auth links them.

### Task 5: GoogleSignInButton Component

#### `apps/web/src/components/shared/google-sign-in-button.tsx` (NEW FILE)

```typescript
'use client'

import { useState } from 'react'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'

interface GoogleSignInButtonProps {
  callbackURL?: string
}

export function GoogleSignInButton({ callbackURL = '/adventures' }: GoogleSignInButtonProps) {
  const [isPending, setIsPending] = useState(false)

  const handleGoogleSignIn = async () => {
    setIsPending(true)
    // Initiates redirect flow: user → Google → back to callbackURL
    // On cancel: Better Auth redirects back to the app (current page)
    await authClient.signIn.social({
      provider: 'google',
      callbackURL,
    })
    // Note: setIsPending(false) never fires — redirect happens before it
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      disabled={isPending}
      onClick={handleGoogleSignIn}
    >
      {isPending ? (
        'Redirection...'
      ) : (
        <>
          <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continuer avec Google
        </>
      )}
    </Button>
  )
}
```

> **Redirect vs popup:** Better Auth v1.5.x `signIn.social()` uses a **redirect flow** (not a popup). User is sent to `accounts.google.com`, authenticates, then redirected to `{BETTER_AUTH_URL}/api/auth/callback/google`, which processes the callback and redirects to `callbackURL` (default: `/adventures`). On cancel, Google redirects back with an error param that Better Auth handles gracefully — user ends up on the login page with no session.

### Task 3 & 4: Integration in Login and Register Forms

Add the Google button to both forms, separated by a visual divider:

```typescript
// In login-form.tsx (add ABOVE the email form, inside the <form> wrapper — NOT inside <form>)
// Place between the title section and the form element

import { GoogleSignInButton } from '@/components/shared/google-sign-in-button'

// JSX structure in LoginPage/RegisterPage (the parent component, page.tsx, passes redirectTo):
// Actually: GoogleSignInButton goes in the form component itself, outside the <form> tag

// In login-form.tsx, add ABOVE the <form> element:
<div className="space-y-4">
  <GoogleSignInButton callbackURL={redirectTo} />

  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <span className="w-full border-t" />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-background px-2 text-muted-foreground">ou</span>
    </div>
  </div>

  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
    {/* ... existing form fields ... */}
  </form>
</div>

// In register-form.tsx (same structure, GoogleSignInButton has default callbackURL='/adventures'):
<div className="space-y-4">
  <GoogleSignInButton />
  <div className="relative">
    <div className="absolute inset-0 flex items-center">
      <span className="w-full border-t" />
    </div>
    <div className="relative flex justify-center text-xs uppercase">
      <span className="bg-background px-2 text-muted-foreground">ou</span>
    </div>
  </div>
  <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
    {/* ... existing form fields ... */}
  </form>
</div>
```

> **Important:** The `GoogleSignInButton` and divider must be **outside** the `<form>` element (a button inside a form would submit it). Wrap the whole section in a `<div>` and put the `<form>` after the divider.

> **`LoginForm` signature:** The `redirectTo` prop from `login-form.tsx` should be passed as `callbackURL` to `<GoogleSignInButton callbackURL={redirectTo} />`. For `register-form.tsx`, the default `callbackURL='/adventures'` is fine.

### Required .env Variables

#### `apps/web/.env.local` — ADD:
```
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
```

Get from: https://console.cloud.google.com → APIs & Services → Credentials → OAuth 2.0 Client IDs

#### `apps/web/.env.example` — ADD (placeholders):
```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### No DB Migration Needed

`profiles` table already exists (story 1.2). The `databaseHooks.user.create.after` from story 2.1 handles profile creation for OAuth users automatically. No new tables or columns needed.

### No NestJS Changes Needed

The NestJS API (`apps/api/`) requires zero changes for this story:
- JWT guard works with tokens from Google OAuth sessions (same Better Auth JWT plugin)
- `req.user.id` is the Better Auth user ID regardless of sign-in method

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO Strava OAuth (story 2.3)
- ❌ NO password reset (story 2.4)
- ❌ NO sign out button (story 2.4)
- ❌ NO account deletion (story 2.4)
- ❌ NO additional Google scopes (no Google Calendar, no Google Drive — only basic profile)
- ❌ NO popup mode for Google OAuth — redirect flow only (aligns with better-auth v1.5.x default)
- ❌ NO `account.accountLinking.allowDifferentEmails: true` — same-email linking is default behavior and sufficient

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.2 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — Better Auth socialProviders.google, baseURL]
- [Source: _bmad-output/project-context.md — NestJS/Next.js module resolution rules, port config]
- [Source: _bmad-output/implementation-artifacts/2-1-email-password-registration-login.md — auth.ts current state, login/register form patterns]
- [Source: better-auth.com/docs/authentication/google — socialProviders.google config]
- [Source: better-auth.com/docs/concepts/oauth — signIn.social() redirect flow, account linking]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — Implementation completed cleanly, no issues encountered.

### Completion Notes List

- ✅ Task 2: Added `socialProviders.google` block to `auth.ts`. `baseURL` confirmed set to `process.env.BETTER_AUTH_URL ?? 'http://localhost:3011'` (already in place from story 2.1). Removed placeholder comment.
- ✅ Task 5: Created `google-sign-in-button.tsx` shared component with redirect flow (not popup), `isPending` state for UX feedback, Google SVG icon. Co-located test file with 4 tests (render, default callbackURL, custom callbackURL, pending state).
- ✅ Task 3: Updated `login-form.tsx` — wrapped in `<div className="space-y-4">`, added `<GoogleSignInButton callbackURL={redirectTo} />` + "ou" divider, `<form>` moved inside.
- ✅ Task 4: Updated `register-form.tsx` — same pattern, `<GoogleSignInButton />` with default callbackURL='/adventures'.
- ✅ Task 6.2: Created `apps/web/.env.example` with all placeholder vars (BETTER_AUTH_SECRET, BETTER_AUTH_URL, DATABASE_URL, RESEND_API_KEY, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET).
- ⏳ Task 1 (MANUAL): Guillaume must create OAuth 2.0 credentials in Google Cloud Console.
- ⏳ Task 6.1 (MANUAL): Guillaume must add GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET to `apps/web/.env.local`.
- ⏳ Task 7 (MANUAL): Guillaume must do browser validation once credentials are in place.
- TypeScript: 0 errors (`tsc --noEmit` clean).
- Tests: 30/30 passing (5 tests for GoogleSignInButton, including new error path test).
- Code review fixes applied: try/catch/finally in GoogleSignInButton (M1), error path test (M2), databaseHook error resilience (M3).

### File List

#### New Files
- `apps/web/src/components/shared/google-sign-in-button.tsx`
- `apps/web/src/components/shared/google-sign-in-button.test.tsx`
- `apps/web/.env.example`

#### Modified Files
- `apps/web/src/lib/auth/auth.ts` — added `socialProviders.google` block, removed placeholder comment; added try/catch in databaseHook (code review M3)
- `apps/web/src/app/(marketing)/login/_components/login-form.tsx` — added Google button + divider above email form
- `apps/web/src/app/(marketing)/register/_components/register-form.tsx` — added Google button + divider above email form
- `apps/web/src/components/shared/google-sign-in-button.tsx` — added try/catch/finally for error recovery (code review M1)
- `apps/web/src/components/shared/google-sign-in-button.test.tsx` — added error path test (code review M2)

---

## Change Log

- 2026-03-14: Story 2.2 created — Google OAuth sign-in via Better Auth socialProviders.google, shared GoogleSignInButton component, login+register page integration
- 2026-03-14: Story 2.2 implemented — Tasks 2/3/4/5/6.2 complete. 4 new tests. TypeScript clean. Tasks 1/6.1/7 remain manual (require Google Cloud Console credentials).
