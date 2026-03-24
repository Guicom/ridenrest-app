# Story 9.2: Auth Pages Polish

Status: done

## Story

As a **new or returning user**,
I want auth pages cohesive with the app's identity,
So that my first interaction is reassuring and polished.

## Acceptance Criteria

1. **Given** a user visits any auth page (`/login`, `/register`, `/forgot-password`, `/reset-password`),
   **When** the page renders,
   **Then** the background is `hero.webp` full-bleed (same image as the landing page hero); a white card is centered on it (`max-w-sm mx-auto`, `rounded-2xl shadow-sm`); no logo inside the card (the global header handles branding).

2. **Given** a user visits `/register`,
   **When** the card renders,
   **Then** a short pitch block is displayed at the top of the card, above the form fields, listing 3 key benefits:
   - Import GPX depuis Strava
   - Hébergements et ravitaillements sur ta trace
   - Météo adaptée à ton pace

3. **Given** a user visits `/login`,
   **When** the card renders,
   **Then** a short returning-user message is displayed at the top of the card, above the form fields: "Reprends là où tu t'es arrêté."

4. **Given** the `/register` form renders,
   **When** the user types in the password or confirmPassword field,
   **Then** an eye icon (`Eye` / `EyeOff` from `lucide-react`) is visible at the end of the field; clicking it toggles the field between `type="password"` and `type="text"`; the toggle is independent per field.

5. **Given** the auth form renders,
   **When** displayed,
   **Then** primary CTA button uses `--primary` bg + white text (already `bg-primary` class — no change needed if already correct); inputs have `border-[--border]` with `focus-visible:ring-[--primary]`.

6. **Given** a form validation error,
   **When** displayed,
   **Then** error text uses `text-destructive` class (already `#dc2626` — verify it matches `--density-low`), `text-xs`, below the field.

## Tasks / Subtasks

- [x] Task 1: Full-bleed background layout — all auth pages (AC: #1)
  - [x] 1.1 Extract shared auth layout: create `apps/web/src/app/(marketing)/_components/auth-page-wrapper.tsx` — `'use client'` NOT needed (pure layout), wraps children in `relative min-h-screen` with `hero.webp` as `<Image fill className="object-cover" priority alt="" />` + semi-transparent white overlay `bg-white/60` for readability + centered white card
  - [x] 1.2 Update `apps/web/src/app/(marketing)/login/page.tsx` — replace current `min-h-screen flex items-center justify-center bg-background p-4` wrapper with `<AuthPageWrapper>`
  - [x] 1.3 Update `apps/web/src/app/(marketing)/register/page.tsx` — same replacement
  - [x] 1.4 Update `apps/web/src/app/(marketing)/forgot-password/page.tsx` — same replacement
  - [x] 1.5 Check if `reset-password` page exists; if yes apply same wrapper — exists, applied

- [x] Task 2: Pitch block on `/register` (AC: #2)
  - [x] 2.1 Create `apps/web/src/app/(marketing)/register/_components/register-pitch.tsx` — server component (no `'use client'`), renders the 3-bullet pitch above the form
  - [x] 2.2 Render `<RegisterPitch />` inside the card in `register/page.tsx`, above `<RegisterForm />`
  - [x] 2.3 Pitch styling: small overline text (e.g., `text-xs text-muted-foreground uppercase tracking-wide`), then 3 items each with a `check_circle` Material Symbol icon (already loaded in root layout) or `lucide-react` `Check` icon in `text-primary`

- [x] Task 3: Returning-user message on `/login` (AC: #3)
  - [x] 3.1 Add short pitch text inline in `apps/web/src/app/(marketing)/login/page.tsx` — server component, no extra file needed — e.g. `<p className="text-sm text-muted-foreground text-center">Reprends là où tu t'es arrêté.</p>` above `<LoginForm />`

- [x] Task 4: Show/hide password toggle on `/register` (AC: #4)
  - [x] 4.1 In `apps/web/src/app/(marketing)/register/_components/register-form.tsx` — add `useState` for `showPassword` and `showConfirmPassword` (already `'use client'`)
  - [x] 4.2 Wrap each password `<Input>` in `relative` div; add `<button type="button">` with `Eye`/`EyeOff` from `lucide-react` (already installed) absolutely positioned right inside the input; toggle `type` between `password` and `text`
  - [x] 4.3 Ensure `autoComplete="new-password"` is preserved on both password fields

- [x] Task 5: Verify CTA and input styling (AC: #5, #6)
  - [x] 5.1 Verify `Button` component uses `bg-primary` — confirmed correct, no change needed
  - [x] 5.2 Verify `Input` component focus ring uses `--primary` color — `--ring: #2D6A4A` = `--primary`, no change needed
  - [x] 5.3 Verify error text class — `text-destructive` = `#dc2626` = `--density-low`, confirmed, no change needed

- [x] Task 6: Tests (AC: all)
  - [x] 6.1 Add/update Vitest test for `register-form.tsx`: assert eye toggle changes input type on click
  - [x] 6.2 Smoke test: `AuthPageWrapper` renders children — basic render test

### Review Follow-ups (AI)

- [ ] [AI-Review][HIGH] `MarketingHeader` affiche un CTA "Se connecter" → `/adventures` sur toutes les pages auth — crée une confusion UX (ex: sur `/login`, le header dit "Se connecter" alors que c'est déjà la page de connexion). Décision consciente pour cette story, à reconsidérer lors d'un polish UX futur. [`apps/web/src/app/(marketing)/_components/marketing-header.tsx:32-36`]
- [ ] [AI-Review][LOW] Absence de show/hide password toggle sur `/login` — seul `/register` l'a (per AC#4). À ajouter pour cohérence UX. [`apps/web/src/app/(marketing)/login/_components/login-form.tsx:94-100`]
- [ ] [AI-Review][LOW] Overlay `bg-black/50` dévie des dev notes qui préconisaient `bg-white/60` — choix conscient du dev agent, à valider visuellement sur l'écran cible. [`apps/web/src/app/(marketing)/_components/auth-page-wrapper.tsx:14`]
- [ ] [AI-Review][LOW] Absence de test pour `autoComplete="new-password"` (AC 4.3 demandait sa préservation, non vérifiée dans les tests). [`apps/web/src/app/(marketing)/register/_components/register-form.test.tsx`]

## Dev Notes

### Context from Story 9.1 (landing page)

- `hero.webp` already exists at `apps/web/public/images/hero.webp` (1.4 MB WebP) — reuse it for auth background
- The landing page uses `(marketing)/` route group with its own layout in `apps/web/src/app/(marketing)/layout.tsx`
- Auth pages are already inside `(marketing)/` group: `login/`, `register/`, `forgot-password/`
- Material Symbols icon font is loaded in root `apps/web/src/app/layout.tsx` via `<link>` in `<head>` — available on all pages

### Existing auth pages state

All 4 auth pages currently use:
```tsx
<div className="min-h-screen flex items-center justify-center bg-background p-4">
  <div className="w-full max-w-sm space-y-6">
    <div className="space-y-2 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      ...
    </div>
    <{Form} />
  </div>
</div>
```
→ Replace outer div structure with `<AuthPageWrapper>`, keep inner card/form structure.

### AuthPageWrapper design

The wrapper must:
1. Use `<Image fill>` from `next/image` for `hero.webp` — same as in the hero component of 9.1
2. Add a white overlay for readability: `bg-white/60` or `bg-white/70` (test visually — photo is dark, adjust to taste)
3. Center a white card: `bg-white rounded-2xl shadow-sm p-6 w-full max-w-sm`
4. The existing `space-y-6` inside pages can move inside the card

```tsx
// apps/web/src/app/(marketing)/_components/auth-page-wrapper.tsx
import Image from 'next/image'

export function AuthPageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center p-4">
      <Image
        src="/images/hero.webp"
        alt=""
        fill
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-white/60" />
      <div className="relative z-10 w-full max-w-sm bg-white rounded-2xl shadow-sm p-6 space-y-6">
        {children}
      </div>
    </div>
  )
}
```

> ⚠️ No `'use client'` — this is a pure layout Server Component. The form components inside are already `'use client'`.

### Show/hide password pattern

Use `lucide-react` (already in `apps/web/package.json`):

```tsx
import { Eye, EyeOff } from 'lucide-react'

const [showPassword, setShowPassword] = useState(false)

<div className="relative">
  <Input
    id="password"
    type={showPassword ? 'text' : 'password'}
    placeholder="••••••••"
    autoComplete="new-password"
    {...register('password')}
  />
  <button
    type="button"
    onClick={() => setShowPassword((v) => !v)}
    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
  >
    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
  </button>
</div>
```

Apply same pattern to `confirmPassword` field with its own independent `showConfirmPassword` state.

### Register pitch block

```tsx
// apps/web/src/app/(marketing)/register/_components/register-pitch.tsx
import { Check } from 'lucide-react'

const benefits = [
  'Import GPX depuis Strava',
  'Hébergements et ravitaillements sur ta trace',
  'Météo adaptée à ton pace',
]

export function RegisterPitch() {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground uppercase tracking-wide text-center">
        Gratuit · Sans carte bancaire
      </p>
      <ul className="space-y-1">
        {benefits.map((b) => (
          <li key={b} className="flex items-center gap-2 text-sm text-foreground">
            <Check className="h-4 w-4 text-primary shrink-0" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

### Login pitch

Inline in `login/page.tsx` (server component, no extra file):

```tsx
<p className="text-sm text-muted-foreground text-center">
  Reprends là où tu t&apos;es arrêté.
</p>
```

Place it above `<LoginForm />`, inside the `space-y-6` wrapper.

### Design tokens in use

From `apps/web/src/app/globals.css`:
- `--primary: #2D6A4A` → `bg-primary`, `text-primary`
- `--background: #FFFFFF` → white card background
- `--background-page: #F5F7F5` → NOT used here (replaced by hero image)
- `--border: #D4E0DA` → `border-[--border]`
- `--density-low: #dc2626` → same as Tailwind `destructive` — validation errors

### Input component — check focus ring

Verify `apps/web/src/components/ui/input.tsx` uses `focus-visible:ring-primary` (or equivalent CSS var). The default shadcn input uses `focus-visible:ring-ring` — check if `--ring` is mapped to `--primary` in the design system. If not, update the Input component globally or override per usage.

### Files to create/modify

**Create:**
- `apps/web/src/app/(marketing)/_components/auth-page-wrapper.tsx`
- `apps/web/src/app/(marketing)/register/_components/register-pitch.tsx`

**Modify:**
- `apps/web/src/app/(marketing)/login/page.tsx` — use `AuthPageWrapper` + add pitch text
- `apps/web/src/app/(marketing)/register/page.tsx` — use `AuthPageWrapper` + add `<RegisterPitch />`
- `apps/web/src/app/(marketing)/forgot-password/page.tsx` — use `AuthPageWrapper`
- `apps/web/src/app/(marketing)/forgot-password/_components/forgot-password-form.tsx` — check for similar reset-password
- `apps/web/src/app/(marketing)/register/_components/register-form.tsx` — add show/hide password toggle
- `apps/web/src/components/ui/input.tsx` — potentially update focus ring color (verify first)

**Check if exists (and apply wrapper if yes):**
- `apps/web/src/app/(marketing)/reset-password/page.tsx`

### Project Structure Notes

- Auth pages are in `(marketing)/` route group — correct, they have no `noindex` requirement and are publicly accessible
- `(marketing)/layout.tsx` wraps all pages — the `AuthPageWrapper` goes INSIDE each page, not in the layout (layout already handles marketing-specific metadata concerns)
- Do NOT add the `<AuthPageWrapper>` to the layout — it would break the landing page and other marketing pages

### References

- [Source: `apps/web/src/app/(marketing)/login/page.tsx`] — current login page structure
- [Source: `apps/web/src/app/(marketing)/register/_components/register-form.tsx`] — current register form with RHF + Zod
- [Source: `apps/web/src/app/(marketing)/_components/hero.tsx`] — pattern for `<Image fill>` with `hero.webp`
- [Source: `apps/web/src/app/globals.css`] — design tokens (`--primary`, `--border`, etc.)
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.2`] — revised ACs

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (SM agent — story creation in #yolo mode)

### Debug Log References

None.

### Completion Notes List

- Created `AuthPageWrapper` server component (no `'use client'`) using `<Image fill>` from `next/image` with `hero.webp`, overlay sombre `bg-black/50`, `MarketingHeader` en haut, carte blanche centrée `rounded-2xl shadow-sm`.
- Applied `AuthPageWrapper` to all 4 auth pages: login, register, forgot-password, reset-password.
- Added returning-user pitch ("Reprends là où tu t'es arrêté.") inline in login page above `<LoginForm />`.
- Created `RegisterPitch` server component with 3 benefits + Check icons from lucide-react.
- Added show/hide password toggles in `register-form.tsx` for both password fields independently using `Eye`/`EyeOff` from lucide-react with independent `useState` per field.
- Verified: `--ring: #2D6A4A` = `--primary` so input focus ring is already correct; `Button` default variant uses `bg-primary`; `text-destructive = #dc2626 = --density-low`.
- Post-review polish: `py-6` ajouté sur les boutons submit (login, register) et sur `GoogleSignInButton`.
- Post-review polish: séparateur "ou" — `border-border`, `text-foreground font-medium`, `bg-white` pour meilleur contraste.
- All 451 tests passing; 0 lint errors (3 pre-existing warnings unrelated to this story).
- Code review fixes: added `getServerSession()` guard on `reset-password/page.tsx` (H1); mocked `MarketingHeader` in `auth-page-wrapper.test.tsx` + added overlay/card structure assertions (M1/M2); replaced brittle `getAllByPlaceholderText` selectors with `getByLabelText` in `register-form.test.tsx` (M3).
- Action items created for H2 (MarketingHeader CTA, voulu), L1, L2, L3.

### File List

**Created:**
- `apps/web/src/app/(marketing)/_components/auth-page-wrapper.tsx`
- `apps/web/src/app/(marketing)/_components/auth-page-wrapper.test.tsx`
- `apps/web/src/app/(marketing)/register/_components/register-pitch.tsx`
- `apps/web/src/app/(marketing)/register/_components/register-form.test.tsx`

**Modified:**
- `apps/web/src/app/(marketing)/login/page.tsx`
- `apps/web/src/app/(marketing)/login/_components/login-form.tsx`
- `apps/web/src/app/(marketing)/register/page.tsx`
- `apps/web/src/app/(marketing)/forgot-password/page.tsx`
- `apps/web/src/app/(marketing)/reset-password/page.tsx`
- `apps/web/src/app/(marketing)/register/_components/register-form.tsx`
- `apps/web/src/components/shared/google-sign-in-button.tsx`
- `apps/web/src/app/(marketing)/_components/auth-page-wrapper.test.tsx` *(code review: mock MarketingHeader + assertions)*
- `apps/web/src/app/(marketing)/register/_components/register-form.test.tsx` *(code review: robust selectors)*
