# Story 2.4: Password Reset & Account Management

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **user**,
I want to reset my password by email, sign out, and delete my account if needed,
So that I have full control over my credentials and data (RGPD compliance).

## Acceptance Criteria

1. **Given** a user clicks "Mot de passe oublié?" and submits their email on `/forgot-password`,
   **When** the request is sent to Better Auth,
   **Then** a password reset email is sent via Resend (`noreply@ridenrest.app`) and a confirmation is displayed (FR-007).

2. **Given** a user clicks the reset link in the email and lands on `/reset-password`,
   **When** they submit a new valid password (≥ 8 chars),
   **Then** their password is updated and they are redirected to `/login` with a success message.

3. **Given** a logged-in user clicks "Se déconnecter" in Settings,
   **When** the sign-out action completes,
   **Then** the session is cleared, cookies removed, and the user is redirected to `/` (landing page) (FR-004).

4. **Given** a user clicks "Supprimer mon compte" in Settings and confirms by typing their email,
   **When** the confirmation matches and the deletion is submitted,
   **Then** all their data is deleted in cascade (user, profiles, adventures, segments, etc.) and they are redirected to `/` (FR-005).

5. **Given** a user attempts to delete their account,
   **When** the confirmation dialog is shown,
   **Then** the delete button remains disabled until the typed email exactly matches `session.user.email`.

## Tasks / Subtasks

- [x] Task 1 — Enable password reset in Better Auth (AC: #1, #2)
  - [x] 1.1 Update `apps/web/src/lib/auth/auth.ts` — add `sendResetPassword` to `emailAndPassword` config using `getResend()` lazy init (see Dev Notes)

- [x] Task 2 — Create Forgot Password page (AC: #1)
  - [x] 2.1 Create `apps/web/src/app/(marketing)/forgot-password/page.tsx` — Server Component; if session exists, redirect to `/adventures`; renders `<ForgotPasswordForm />`
  - [x] 2.2 Create `apps/web/src/app/(marketing)/forgot-password/_components/forgot-password-form.tsx` — `'use client'`; email field; calls `authClient.requestPasswordReset()` (note: Better Auth 1.5.5 uses `requestPasswordReset` not `forgetPassword`)

- [x] Task 3 — Create Reset Password page (AC: #2)
  - [x] 3.1 Create `apps/web/src/app/(marketing)/reset-password/page.tsx` — Server Component; reads `token` from `searchParams`; if no token, redirect to `/forgot-password`; renders `<ResetPasswordForm token={token} />`
  - [x] 3.2 Create `apps/web/src/app/(marketing)/reset-password/_components/reset-password-form.tsx` — `'use client'`; new password + confirm; calls `authClient.resetPassword({ newPassword, token })` (see Dev Notes)

- [x] Task 4 — Add Sign Out button to Settings (AC: #3)
  - [x] 4.1 Create `apps/web/src/app/(app)/settings/_components/sign-out-button.tsx` — `'use client'`; calls `authClient.signOut()` then redirects to `/`
  - [x] 4.2 Update `apps/web/src/app/(app)/settings/page.tsx` — add "Session" section with `<SignOutButton />` below Intégrations

- [x] Task 5 — Add Delete Account to Settings (AC: #4, #5)
  - [x] 5.1 Create `apps/web/src/app/(app)/settings/_components/delete-account-dialog.tsx` — `'use client'`; email confirmation input; disabled until email matches; calls `deleteAccount` server action (see Dev Notes)
  - [x] 5.2 Update `apps/web/src/app/(app)/settings/actions.ts` — add `deleteAccount()` server action: verifies session, calls `auth.api.deleteUser()`, redirects to `/` (see Dev Notes)
  - [x] 5.3 Update `apps/web/src/app/(app)/settings/page.tsx` — add "Zone dangereuse" section with `<DeleteAccountDialog userEmail={session.user.email} />` below Session

- [ ] Review Follow-ups (AI)
  - [ ] [AI-Review][LOW] Move Zod schemas to `packages/shared/schemas/` — `forgot-password-form.tsx:13`, `reset-password-form.tsx:14` (project convention: never define Zod schemas in component files)
  - [ ] [AI-Review][LOW] Replace `useState` + manual `setIsPending` with `useTransition` in `sign-out-button.tsx:10` (inconsistent with `delete-account-dialog.tsx` pattern)
  - [ ] [AI-Review][LOW] Move `forgot-password` and `reset-password` pages to an `(auth)` route group — currently in `(marketing)` which is reserved for SSG/SEO pages per project context
  - [ ] [AI-Review][MEDIUM] Fix inconsistent `from` address in `sendResetPassword` (`auth.ts:90`) — use same fallback as `sendVerificationEmail` once Resend domain is verified (tracked by TODO comment)

- [x] Task 6 — Final validation (AC: #1–#5)
  - [x] 6.1 Click "Mot de passe oublié?" → submit email → confirmation shown → email received ✅
  - [x] 6.2 Click email link → `/reset-password?token=...` → submit new password → redirected to `/login` ✅
  - [x] 6.3 Click "Se déconnecter" → session cleared → redirected to `/` ✅
  - [x] 6.4 Click "Supprimer mon compte" → dialog → type email → delete button enabled → redirected to `/`, all data gone ✅
  - [x] 6.5 Type wrong email in dialog → delete button stays disabled ✅

## Dev Notes

### CRITICAL: What's Already Done — Do NOT Redo

From stories 2.1–2.3 (already implemented):
- ✅ `apps/web/src/lib/auth/auth.ts` — `getResend()` lazy init, `emailVerification`, `databaseHooks`, `genericOAuth` Strava, `socialProviders.google`
- ✅ `apps/web/src/lib/auth/client.ts` — `authClient` with `jwtClient()` + `genericOAuthClient()`; exports `{ signIn, signOut, signUp, useSession }`
- ✅ `apps/web/src/app/(app)/settings/page.tsx` — Settings page with Strava section; `getServerSession()` already used
- ✅ `apps/web/src/app/(app)/settings/_components/strava-connection-card.tsx` — pattern reference
- ✅ `apps/web/src/app/(app)/settings/actions.ts` — `disconnectStrava()` server action (pattern reference for `deleteAccount`)
- ✅ `apps/web/src/app/(marketing)/login/_components/login-form.tsx` — has `href="/forgot-password"` link already
- ✅ `components/ui/button.tsx`, `components/ui/input.tsx`, `components/ui/label.tsx`, `components/shared/error-message.tsx`
- ✅ All cascade deletes already in DB schema: `adventures.userId → user.id CASCADE`, `profiles.id → user.id CASCADE`, `session/account/verification → user.id CASCADE`

**This story adds:** `sendResetPassword` in auth.ts + forgot-password page + reset-password page + sign out button in Settings + delete account dialog in Settings.

### Cascade Delete Architecture (CRITICAL — understand before implementing AC #4)

When `auth.api.deleteUser()` is called, Better Auth deletes the `user` record. DB cascade:
```
user (deleted)
  ├── session          CASCADE ✅ (Better Auth schema)
  ├── account          CASCADE ✅ (Better Auth schema)
  ├── verification     CASCADE ✅ (Better Auth schema)
  ├── profiles         CASCADE ✅ (profiles.id → user.id)
  └── adventures       CASCADE ✅ (adventures.user_id → user.id)
       └── adventure_segments  CASCADE (check schema)
            └── accommodations_cache CASCADE (check schema)
```

**No manual data deletion needed** — `auth.api.deleteUser()` deletes `user`, all FK cascades handle the rest. RGPD compliance achieved automatically.

> ⚠️ If `adventure_segments` or `accommodations_cache` reference `adventure_id` with `onDelete: 'cascade'`, they cascade from adventures. Verify by reading `packages/database/src/schema/adventure-segments.ts` before implementing. If cascade is missing, add it to the task.

### Story 2.1–2.3 Learnings (CRITICAL)

- **Port:** Web on `:3011`, API on `:3010`
- **`moduleResolution: "bundler"` in `apps/web`** — NO `.js` extensions
- **`getResend()` lazy init** — Resend only instantiated when `sendResetPassword` is called, not at module load
- **`RESEND_API_KEY`** — must be set in `apps/web/.env.local` (MVP: domain not verified, so emails go to Resend sandbox only)
- **`sendOnSignUp: false`** already in place — keep it; password reset uses a separate `sendResetPassword` config
- **Server Actions pattern** — use `auth.api.getSession({ headers: await headers() })` for session in Server Actions (vs `getServerSession()` in Server Components)
- **`revalidatePath()`** — call after state-changing server actions
- **`router.refresh()`** — call after client-side auth state changes (sign-in, sign-out)

### Task 1: auth.ts Update — sendResetPassword

Add `sendResetPassword` to the `emailAndPassword` config:

```typescript
emailAndPassword: {
  enabled: true,
  minPasswordLength: 8,
  // ← ADD
  sendResetPassword: async ({ user, url }) => {
    await getResend().emails.send({
      from: "Ride'n'Rest <noreply@ridenrest.app>",
      to: user.email,
      subject: "Réinitialisation de votre mot de passe — Ride'n'Rest",
      html: `<p>Bonjour,</p><p><a href="${url}">Réinitialiser mon mot de passe</a></p><p>Ce lien expire dans 1 heure.</p>`,
    })
  },
},
```

> **`url` parameter**: Better Auth constructs the full reset URL as `{BETTER_AUTH_URL}/reset-password?token=xxx`. Since `BETTER_AUTH_URL` is the Next.js app URL (`:3011`), the link in the email points directly to the app's `/reset-password` route — no extra `redirectTo` config needed server-side.
>
> **MVP caveat**: `RESEND_API_KEY` env var must be set and Resend domain verified for emails to send to real addresses. In dev without domain verification, use Resend sandbox mode (emails appear in Resend dashboard only).

### Task 2: Forgot Password Page

#### `apps/web/src/app/(marketing)/forgot-password/page.tsx` (NEW)

```typescript
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth/server'
import { ForgotPasswordForm } from './_components/forgot-password-form'

export const metadata = {
  title: "Mot de passe oublié — Ride'n'Rest",
}

export default async function ForgotPasswordPage() {
  const session = await getServerSession()
  if (session) redirect('/adventures')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Mot de passe oublié</h1>
          <p className="text-muted-foreground text-sm">
            Entrez votre email pour recevoir un lien de réinitialisation.
          </p>
        </div>
        <ForgotPasswordForm />
      </div>
    </div>
  )
}
```

#### `apps/web/src/app/(marketing)/forgot-password/_components/forgot-password-form.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorMessage } from '@/components/shared/error-message'

const schema = z.object({
  email: z.string().email('Email invalide'),
})

type Values = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: Values) => {
    setAuthError(null)
    const { error } = await authClient.forgetPassword({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) {
      setAuthError('Une erreur est survenue. Réessayez.')
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="rounded-lg border p-4 text-center space-y-2">
        <p className="font-medium">Email envoyé !</p>
        <p className="text-sm text-muted-foreground">
          Vérifiez votre boîte email pour le lien de réinitialisation.
        </p>
        <p className="text-xs text-muted-foreground">
          Pas reçu ?{' '}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => setSent(false)}
          >
            Renvoyer
          </button>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="votre@email.com"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className="text-destructive text-xs">{errors.email.message}</p>}
      </div>

      {authError && <ErrorMessage message={authError} />}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Envoi...' : 'Envoyer le lien'}
      </Button>

      <p className="text-center text-sm">
        <a href="/login" className="text-primary underline-offset-4 hover:underline">
          Retour à la connexion
        </a>
      </p>
    </form>
  )
}
```

> **`authClient.forgetPassword()`**: Better Auth sends the reset email via `sendResetPassword`. The `redirectTo` must be an **absolute URL** (Better Auth requirement — use `window.location.origin`). Better Auth appends `?token=xxx` to the URL automatically.
>
> **No-error on unknown email**: Better Auth returns success even if the email doesn't exist (security best practice — prevents email enumeration). So `setSent(true)` fires regardless. This is correct behavior.

### Task 3: Reset Password Page

#### `apps/web/src/app/(marketing)/reset-password/page.tsx` (NEW)

```typescript
import { redirect } from 'next/navigation'
import { ResetPasswordForm } from './_components/reset-password-form'

export const metadata = {
  title: "Nouveau mot de passe — Ride'n'Rest",
}

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>
}) {
  const { token, error } = await searchParams

  if (!token) redirect('/forgot-password')

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold">Nouveau mot de passe</h1>
          <p className="text-muted-foreground text-sm">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </div>
        {error === 'INVALID_TOKEN' && (
          <p className="text-destructive text-sm text-center">
            Ce lien a expiré ou est invalide.{' '}
            <a href="/forgot-password" className="underline">
              Demander un nouveau lien
            </a>
          </p>
        )}
        <ResetPasswordForm token={token} />
      </div>
    </div>
  )
}
```

#### `apps/web/src/app/(marketing)/reset-password/_components/reset-password-form.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ErrorMessage } from '@/components/shared/error-message'

const schema = z
  .object({
    newPassword: z.string().min(8, 'Mot de passe : 8 caractères minimum'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  })

type Values = z.infer<typeof schema>

interface ResetPasswordFormProps {
  token: string
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const router = useRouter()
  const [authError, setAuthError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: Values) => {
    setAuthError(null)
    const { error } = await authClient.resetPassword({
      newPassword: values.newPassword,
      token,
    })
    if (error) {
      setAuthError('Lien invalide ou expiré. Demandez un nouveau lien.')
      return
    }
    router.push('/login?reset=success')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="newPassword">Nouveau mot de passe</Label>
        <Input
          id="newPassword"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          {...register('newPassword')}
        />
        {errors.newPassword && (
          <p className="text-destructive text-xs">{errors.newPassword.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
        <Input
          id="confirmPassword"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword && (
          <p className="text-destructive text-xs">{errors.confirmPassword.message}</p>
        )}
      </div>

      {authError && <ErrorMessage message={authError} />}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
      </Button>
    </form>
  )
}
```

> **`authClient.resetPassword({ newPassword, token })`**: `token` comes from the URL `?token=xxx` (passed as prop from the Server Component). Better Auth validates the token server-side, updates the password, and invalidates the token. On success, redirect to `/login?reset=success`.
>
> **Success toast/banner on login page**: Optional — the login page can show a banner if `?reset=success` is in the URL. Not required for AC compliance; the redirect itself is sufficient.

### Task 4: Sign Out Button in Settings

#### `apps/web/src/app/(app)/settings/_components/sign-out-button.tsx` (NEW)

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth/client'
import { Button } from '@/components/ui/button'

export function SignOutButton() {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  const handleSignOut = async () => {
    setIsPending(true)
    try {
      await authClient.signOut()
      router.push('/')
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Button variant="outline" onClick={handleSignOut} disabled={isPending}>
      {isPending ? 'Déconnexion...' : 'Se déconnecter'}
    </Button>
  )
}
```

#### `apps/web/src/app/(app)/settings/page.tsx` — Updated structure (add Session + Danger Zone)

```typescript
// ADD imports
import { SignOutButton } from './_components/sign-out-button'
import { DeleteAccountDialog } from './_components/delete-account-dialog'

// ADD to JSX (after Intégrations section):
<section className="space-y-4">
  <h2 className="text-lg font-semibold">Session</h2>
  <div className="flex items-center justify-between rounded-lg border p-4">
    <div>
      <p className="font-medium">Compte</p>
      <p className="text-sm text-muted-foreground">{session.user.email}</p>
    </div>
    <SignOutButton />
  </div>
</section>

<section className="space-y-4">
  <h2 className="text-lg font-semibold text-destructive">Zone dangereuse</h2>
  <div className="rounded-lg border border-destructive p-4">
    <div className="flex items-center justify-between">
      <div>
        <p className="font-medium">Supprimer mon compte</p>
        <p className="text-sm text-muted-foreground">
          Cette action est irréversible. Toutes vos données seront effacées.
        </p>
      </div>
      <DeleteAccountDialog userEmail={session.user.email} />
    </div>
  </div>
</section>
```

> **`session.user.email`**: Already fetched via `getServerSession()` in the settings page. Pass as prop to `DeleteAccountDialog` and display in the Session section.

### Task 5: Delete Account Dialog

#### `apps/web/src/app/(app)/settings/_components/delete-account-dialog.tsx` (NEW)

```typescript
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { deleteAccount } from '../actions'

interface DeleteAccountDialogProps {
  userEmail: string
}

export function DeleteAccountDialog({ userEmail }: DeleteAccountDialogProps) {
  const [open, setOpen] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDeleting, startDelete] = useTransition()

  const emailMatches = emailInput === userEmail

  const handleDelete = () => {
    setError(null)
    startDelete(async () => {
      const result = await deleteAccount()
      if (result?.error) {
        setError(result.error)
      }
      // On success: server action redirects to '/' — no client-side redirect needed
    })
  }

  if (!open) {
    return (
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        Supprimer mon compte
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-lg border p-6 w-full max-w-sm space-y-4 mx-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold">Supprimer mon compte</h3>
          <p className="text-sm text-muted-foreground">
            Cette action est <strong>irréversible</strong>. Toutes vos aventures, segments et données seront définitivement effacés.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-email">
            Tapez votre email pour confirmer :{' '}
            <span className="font-mono text-xs">{userEmail}</span>
          </Label>
          <Input
            id="confirm-email"
            type="email"
            placeholder={userEmail}
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            autoComplete="off"
          />
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => { setOpen(false); setEmailInput(''); setError(null) }}
            disabled={isDeleting}
          >
            Annuler
          </Button>
          <Button
            variant="destructive"
            className="flex-1"
            onClick={handleDelete}
            disabled={!emailMatches || isDeleting}
          >
            {isDeleting ? 'Suppression...' : 'Supprimer définitivement'}
          </Button>
        </div>
      </div>
    </div>
  )
}
```

> **No external dialog library**: Simple overlay div for MVP. Avoid importing Dialog from shadcn/ui if it's not already installed — keeps the bundle lean. If `@radix-ui/react-dialog` is available from the existing Button/Input components, use it; otherwise this native approach is sufficient.
>
> **`emailMatches` check**: Compares the typed input with `userEmail` prop (server-provided, trusted). The delete button is `disabled={!emailMatches}` — strict equality, case-sensitive. This satisfies AC #5.

#### `apps/web/src/app/(app)/settings/actions.ts` — Add deleteAccount

Add to the existing `actions.ts` file (DO NOT replace — keep `disconnectStrava`):

```typescript
// ADD to existing actions.ts
export async function deleteAccount(): Promise<{ error?: string } | void> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) redirect('/login')

  try {
    await auth.api.deleteUser({
      headers: await headers(),
    })
  } catch (err) {
    console.error('[settings] deleteAccount failed:', err)
    return { error: 'Une erreur est survenue. Contactez le support.' }
  }

  redirect('/')
}
```

> **`auth.api.deleteUser()`**: Better Auth's built-in server-side delete. Deletes the `user` record and all related data via DB cascade (session, account, profiles, adventures). Does NOT require the user's password for confirmation — the email-match check in the dialog is the confirmation mechanism.
>
> **`redirect('/')` after delete**: Next.js `redirect()` in a Server Action throws a `NEXT_REDIRECT` error which is caught and handled by Next.js. The client receives a redirect to `/`. The `DeleteAccountDialog` component doesn't need to handle success — the page navigates away.
>
> **Return type `Promise<{ error?: string } | void>`**: On error, returns `{ error }` so the dialog can display it. On success, `redirect()` fires (never returns). The `useTransition` in the dialog handles the pending state.

### Better Auth Password Reset Flow (FULL)

```
1. User submits email on /forgot-password
   → authClient.forgetPassword({ email, redirectTo: 'http://localhost:3011/reset-password' })
   → Better Auth generates token → calls auth.ts emailAndPassword.sendResetPassword({ user, url })
   → getResend().emails.send({ to: email, ... url contains token ... })

2. User clicks link in email → GET /reset-password?token=abc123

3. User submits new password on /reset-password
   → authClient.resetPassword({ newPassword, token: 'abc123' })
   → Better Auth validates token (1h expiry) → updates password hash in DB
   → router.push('/login?reset=success')
```

### No NestJS Changes in This Story

Account deletion is handled entirely client-side via Better Auth + Server Actions. NestJS is not involved. No changes to `apps/api/`.

### Settings Page — Final Structure After This Story

```
Settings page
├── Intégrations (story 2.3)
│   └── StravaConnectionCard (connect/disconnect)
├── Session (story 2.4)
│   └── User email + SignOutButton
└── Zone dangereuse (story 2.4)
    └── DeleteAccountDialog (email confirm → deleteAccount server action)
```

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO email verification enforcement (MVP: `sendOnSignUp: false` stays)
- ❌ NO password change form for already-logged-in users (only reset via email)
- ❌ NO account deletion grace period / soft delete (hard delete, RGPD compliant)
- ❌ NO Strava deauthorization call on account delete (Strava tokens cascade-deleted with `account` row; Strava ToS requires calling `/oauth/deauthorize` — defer to post-MVP cleanup job)
- ❌ NO profile editing (name, avatar) — post-MVP
- ❌ NO NestJS changes

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 2.4 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — Better Auth emailAndPassword.sendResetPassword, auth.api.deleteUser, Resend]
- [Source: _bmad-output/project-context.md — Next.js App Router patterns, module resolution]
- [Source: _bmad-output/implementation-artifacts/2-1-email-password-registration-login.md — getResend() lazy init pattern, form patterns]
- [Source: _bmad-output/implementation-artifacts/2-3-strava-oauth-connection.md — disconnectStrava server action pattern, settings page structure]
- [Source: packages/database/src/schema/adventures.ts — adventures.userId → user.id CASCADE confirmed]
- [Source: packages/database/src/schema/auth.ts — session/account/verification → user.id CASCADE]
- [Source: better-auth.com — forgetPassword(), resetPassword(), deleteUser() API]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented all 5 tasks + final validation (Tasks 1–6) in a single session.
- **API correction:** Story spec used `authClient.forgetPassword()` but Better Auth 1.5.5 exports `authClient.requestPasswordReset()`. Fixed accordingly.
- **`auth.api.deleteUser()` fix:** Requires `body: {}` alongside `headers` — TypeScript error revealed this; fixed by passing empty body object.
- All ACs validated: password reset flow (forgot-password + reset-password pages), sign-out in Settings, delete account with email confirmation gate, cascade delete via `auth.api.deleteUser()`.
- TypeScript: 0 errors. Vitest: 41 tests passed, 0 regressions.
- **Code review fixes (2026-03-14):** [H1] `deleteAccount` server action now verifies `confirmedEmail` against `session.user.email` server-side — client-side-only guard was bypassable; [M2] `DeleteAccountDialog` gains Escape key handler + `role="dialog"` + `aria-modal` + `aria-labelledby`; [M3] `getResend()` refactored to singleton pattern (`_resend ??= new Resend(...)`); [M1] `sprint-status.yaml` added to File List.

### File List

#### New Files
- `apps/web/src/app/(marketing)/forgot-password/page.tsx`
- `apps/web/src/app/(marketing)/forgot-password/_components/forgot-password-form.tsx`
- `apps/web/src/app/(marketing)/reset-password/page.tsx`
- `apps/web/src/app/(marketing)/reset-password/_components/reset-password-form.tsx`
- `apps/web/src/app/(app)/settings/_components/sign-out-button.tsx`
- `apps/web/src/app/(app)/settings/_components/delete-account-dialog.tsx`

#### Modified Files
- `apps/web/src/lib/auth/auth.ts` — add `sendResetPassword` to `emailAndPassword`; fix `getResend()` to singleton pattern
- `apps/web/src/app/(app)/settings/page.tsx` — add Session + Zone dangereuse sections
- `apps/web/src/app/(app)/settings/actions.ts` — add `deleteAccount` server action with server-side email confirmation
- `apps/web/src/app/(app)/settings/_components/delete-account-dialog.tsx` — pass `emailInput` to `deleteAccount`; add Escape key handler; add ARIA `role="dialog"` + `aria-modal` + `aria-labelledby`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated to review

---

## Change Log

- 2026-03-14: Story 2.4 created — password reset (forgot-password + reset-password pages), sign out button, delete account with email confirmation, full cascade delete via auth.api.deleteUser()
- 2026-03-14: Story 2.4 implemented — all tasks complete, TypeScript clean, 41 tests passing. Note: Better Auth 1.5.5 uses `requestPasswordReset` (not `forgetPassword`); `deleteUser` requires `body: {}`.
