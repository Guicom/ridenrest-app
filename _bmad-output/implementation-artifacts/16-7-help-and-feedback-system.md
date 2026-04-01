# Story 16.7: Help & In-App Feedback System

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **new or returning user**,
I want a help page and an easy way to submit feedback,
So that I can discover features and report issues without leaving the app.

## Acceptance Criteria

1. **"Aide" link in app navigation** — The AppHeader desktop nav has an "Aide" link between "Mes aventures" and "Mon compte". The mobile hamburger dropdown also has an "Aide" item at the same position. Clicking "Aide" navigates to `/help`.

2. **`/help` page — structured content** — An auth-gated page at `/help` (in the `(app)` group, uses `AppHeader`) covers all major features in 7 sections: Auth, Adventures & GPX import, Planning mode, Density analysis, Weather, Live mode, Stages. Each section has a heading, 2–3 sentence description, and a bullet list of tips.

3. **Landing page `/help` link** — The `MarketingFooter` has a visible "Aide" link alongside the existing "Contact" and "Mentions légales" links, using the same style.

4. **Feedback entry point in app nav** — A "Feedback" nav item in AppHeader (desktop: after "Mon compte"; mobile: last item in hamburger menu). Clicking it opens a `FeedbackModal` dialog.

5. **Feedback form** — The `FeedbackModal` contains:
   - Category selector (required): Bug / Amélioration / Idée
   - Screen/feature text field (optional): "Sur quelle page ou fonctionnalité ?"
   - Description textarea (required, min 10 chars)
   - Email field: pre-filled from `session.user.email`, read-only/disabled

6. **Feedback notification** — On submit, `POST /feedbacks` (NestJS, auth-required via `JwtAuthGuard`) sends a Resend notification email to `process.env.FEEDBACK_ADMIN_EMAIL`. No DB persistence — email only. On success the modal closes and `toast.success("Merci pour votre retour !")` fires.

## Tasks / Subtasks

- [x] **Task 1 — NestJS `feedbacks` module** (AC: #6) ~~Drizzle schema supprimé — email only~~
  - [x] 1.1 — Create `apps/api/src/feedbacks/` with: `feedbacks.module.ts`, `feedbacks.controller.ts`, `feedbacks.service.ts`, `dto/create-feedback.dto.ts`
  - [x] 1.2 — `POST /feedbacks` — `JwtAuthGuard`, `@CurrentUser()` for `userId`/`email`. DTO: `category` (`IsIn(['bug', 'improvement', 'idea'])`), `screen` (`IsOptional`, `IsString`), `description` (`IsNotEmpty`, `MinLength(10)`)
  - [x] 1.3 — Service: send Resend email to `process.env.FEEDBACK_ADMIN_EMAIL`. No-op (console.log) if `RESEND_API_KEY` absent (dev).
  - [x] 1.4 — Register `FeedbacksModule` in `app.module.ts`
  - [x] 1.5 — Write `feedbacks.service.test.ts`: mock Resend; verify email sent + no-op without API key

- [x] **Task 2 — `/help` page** (AC: #2) ~~déplacé de `(marketing)` vers `(app)` — auth-gated, AppHeader~~
  - [x] 2.1 — Create `apps/web/src/app/(app)/help/page.tsx` — server component, export `metadata` for SEO
  - [x] 2.2 — 7 sections with `id` anchors: `auth`, `adventures`, `planning`, `density`, `weather`, `live`, `stages`. Each: `<h2>` + `<p>` description + `<ul>` tips
  - [x] 2.3 — Layout: `max-w-3xl mx-auto px-4 py-10 space-y-12`. Anchor nav list at top. AppHeader provided by `(app)/layout.tsx`.

- [x] **Task 3 — AppHeader: "Aide" + "Feedback"** (AC: #1, #4)
  - [x] 4.1 — Add `useSession` import from `@/lib/auth/client` in `app-header.tsx`
  - [x] 4.2 — Desktop nav: add `"Aide"` link after `"Mes aventures"`, before `"Mon compte"`. Active state: `pathname === '/help'`. Same `cn('text-sm', ...)` styling as existing links.
  - [x] 4.3 — Desktop nav: add `"Feedback"` button (or text link styled as button) after `"Mon compte"`. `onClick` → `setFeedbackOpen(true)`. Add `useState<boolean>(false)` for modal state.
  - [x] 4.4 — Mobile hamburger `DropdownMenuContent`: add `DropdownMenuItem` for "Aide" (navigate `/help`) and "Feedback" (open modal) — same order as desktop.
  - [x] 4.5 — Render `<FeedbackModal open={feedbackOpen} onOpenChange={setFeedbackOpen} userEmail={session?.user?.email ?? ''} />` below the header JSX (outside the `<header>` element, inside the fragment)

- [x] **Task 4 — `FeedbackModal` component** (AC: #5, #6)
  - [x] 5.1 — Create `apps/web/src/components/shared/feedback-modal.tsx` (see Dev Notes for props and schema)
  - [x] 5.2 — React Hook Form + Zod resolver. Define Zod schema locally (not shared — frontend-only validation)
  - [x] 5.3 — Form fields using shadcn components: `<Select>` for category, `<Input>` for screen, `<Textarea>` for description, `<Input disabled>` for email
  - [x] 5.4 — Submit: calls `submitFeedback()` API client. `onSuccess` → `toast.success`, `onOpenChange(false)`, `form.reset()`. `onError` → `toast.error("Impossible d'envoyer le feedback.")`
  - [x] 5.5 — All buttons in dialog use `size="lg"` (WCAG, see 16.6). `DialogFooter` safety net already in place.
  - [x] 5.6 — Add `submitFeedback()` function to `apps/web/src/lib/api-client.ts`

- [x] **Task 5 — MarketingFooter: "Aide" link** (AC: #3)
  - [x] 6.1 — In `marketing-footer.tsx`, add `<Link href="/help">Aide</Link>` with exact same className as "Contact" and "Mentions légales" links (matching uppercase tracking style)

- [x] **Task 6 — Tests** (AC: all)
  - [x] 6.1 — `app-header.test.tsx`: add tests asserting "Aide" link and "Feedback" button are present in desktop nav
  - [x] 6.2 — Create `apps/web/src/components/shared/feedback-modal.test.tsx`: 3 tests: (1) renders form with correct fields, (2) shows validation error on description < 10 chars, (3) calls `submitFeedback` and shows success toast on valid submit
  - [x] 6.3 — `apps/api/src/feedbacks/feedbacks.service.test.ts`: mock Resend SDK; verify email sent on `create()`, no-op without `RESEND_API_KEY`

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Résoudre la migration orpheline `0008_boring_iron_monger.sql` — la table `feedbacks` est en DB mais jamais utilisée. Options : (a) reverter la migration si Drizzle le permet proprement, (b) laisser en place et documenter explicitement la décision dans le schema registry. `packages/database/migrations/0008_boring_iron_monger.sql`

## Dev Notes

### Route group for `/help` — décision post-implémentation

~~`/help` goes in `(marketing)` group~~ → **décision finale : `(app)` group** à `apps/web/src/app/(app)/help/page.tsx`.
- **Auth-gated** — requiert authentification (middleware.ts protège `/help`)
- Utilise `AppHeader` + `QueryProvider` via `(app)/layout.tsx`
- Lien dans `MarketingFooter` conservé pour la landing page publique (utilisateurs non connectés redirigés vers `/login`)

`middleware.ts` a été mis à jour pour inclure `/help` dans les routes protégées.

### AppHeader — session for FeedbackModal

`AppHeader` is already `'use client'`. Add at the top of the component:

```typescript
import { useSession } from '@/lib/auth/client'

// Inside AppHeader component (before the early return for /live/ pages):
const { data: session } = useSession()
```

`useSession()` is used elsewhere in client components — same pattern, no new setup required.

The modal can be rendered as a sibling of `<header>`:
```tsx
return (
  <>
    <header className="sticky top-0 z-50 ...">
      {/* existing header content */}
    </header>
    <FeedbackModal
      open={feedbackOpen}
      onOpenChange={setFeedbackOpen}
      userEmail={session?.user?.email ?? ''}
    />
  </>
)
```

### Drizzle schema — feedbacks table

```typescript
// packages/database/src/schema/feedbacks.ts
import { pgTable, text, timestamp, index } from 'drizzle-orm/pg-core'

export const feedbacks = pgTable('feedbacks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull(),       // plain string — no FK to Better Auth users table
  category: text('category').notNull(),    // 'bug' | 'improvement' | 'idea'
  screen: text('screen'),                  // nullable — page/feature context
  description: text('description').notNull(),
  email: text('email').notNull(),          // snapshot at submission time
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => ({
  userIdIdx: index('idx_feedbacks_user_id').on(table.userId),
  createdAtIdx: index('idx_feedbacks_created_at').on(table.createdAt),
}))
```

**Why no FK on `userId`**: Better Auth manages its own `users` table internally. The Drizzle schemas in `packages/database/` don't include Better Auth tables. Store `userId` as a plain text field — lookup value from `req.user.id` (JWT). Orphaned feedback records on user deletion are acceptable (feedback log).

### NestJS module — complete pattern (mirror `apps/api/src/stages/`)

```
apps/api/src/feedbacks/
  feedbacks.module.ts
  feedbacks.controller.ts
  feedbacks.service.ts
  feedbacks.service.test.ts
  feedbacks.repository.ts
  dto/
    create-feedback.dto.ts
```

**Controller** (never returns `{ success: true, data }` — `ResponseInterceptor` wraps automatically):
```typescript
@Controller('feedbacks')
@UseGuards(JwtAuthGuard)
export class FeedbacksController {
  @Post()
  create(@Body() dto: CreateFeedbackDto, @CurrentUser() user: { id: string; email: string }) {
    return this.feedbacksService.create(dto, user)
  }
}
```

**Service — Resend email**:
```typescript
// apps/api/src/feedbacks/feedbacks.service.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

async create(dto: CreateFeedbackDto, user: { id: string; email: string }) {
  const feedback = await this.feedbacksRepository.insertFeedback({
    userId: user.id,
    email: user.email,
    category: dto.category,
    screen: dto.screen ?? null,
    description: dto.description,
  })

  // Fire-and-forget — do not await; email failure must NOT block the user response
  resend.emails.send({
    from: "Ride'n'Rest <noreply@ridenrest.app>",
    to: process.env.FEEDBACK_ADMIN_EMAIL ?? 'contact@ridenrest.app',
    subject: `[Feedback] ${dto.category} — ${dto.screen ?? 'N/A'}`,
    text: [
      `Catégorie: ${dto.category}`,
      `Page/feature: ${dto.screen ?? 'Non précisé'}`,
      `Description: ${dto.description}`,
      `Utilisateur: ${user.email}`,
      `Date: ${new Date().toISOString()}`,
    ].join('\n'),
  }).catch((err: unknown) => {
    // Log but do not throw — feedback is already saved in DB
    console.error('[FeedbacksService] Resend email failed', err)
  })

  return feedback
}
```

**IMPORTANT**: `resend.emails.send()` is fire-and-forget (`void`, not awaited). Resend email failure must not affect the HTTP response — feedback is already persisted in DB. Use `.catch()` to prevent unhandled promise rejection.

### New env vars required

Add to VPS `.env` and local `apps/api/.env`:
```
RESEND_API_KEY=re_...          # may already exist for web auth emails
FEEDBACK_ADMIN_EMAIL=contact@ridenrest.app
```

`RESEND_API_KEY` likely already exists in `apps/web/.env.local` (used by Better Auth). It must also be available in `apps/api` for the feedbacks service.

### FeedbackModal — Zod schema and props

```typescript
// apps/web/src/components/shared/feedback-modal.tsx
'use client'
import { z } from 'zod'

const feedbackSchema = z.object({
  category: z.enum(['bug', 'improvement', 'idea'], {
    required_error: 'Sélectionnez une catégorie',
  }),
  screen: z.string().optional(),
  description: z.string().min(10, 'La description doit faire au moins 10 caractères'),
})

interface FeedbackModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
}
```

Define schema locally — this is frontend-only validation. NestJS uses `class-validator` DTOs, not Zod. No need to put this in `packages/shared/schemas/`.

**Category display labels** (enum value → French label):
```typescript
const CATEGORY_LABELS: Record<string, string> = {
  bug: '🐛 Bug',
  improvement: '✨ Amélioration',
  idea: '💡 Idée',
}
```

### API client function

Add to `apps/web/src/lib/api-client.ts` following the existing pattern:

```typescript
export async function submitFeedback(data: {
  category: string
  screen?: string
  description: string
}): Promise<void> {
  await apiRequest('/feedbacks', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}
```

### `/help` page — content guide (French, user-facing)

```typescript
// apps/web/src/app/(marketing)/help/page.tsx
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: "Aide — Ride'n'Rest",
  description:
    "Guide d'utilisation de Ride'n'Rest : créez vos aventures, importez des GPX, planifiez vos étapes et gérez votre bivouac.",
}
```

7 sections (id / titre / contenu résumé):
| id | Titre | Points clés |
|---|---|---|
| `auth` | Connexion & Compte | Email/mdp, Google OAuth, Strava OAuth, reset mdp |
| `adventures` | Aventures & Import GPX | Créer une aventure, upload GPX, multi-segments, reorder, import Strava |
| `planning` | Mode Planning (Carte) | Recherche POIs par km range, filtres couches, météo par étape, analyse densité |
| `density` | Analyse de densité | Ce que mesure l'analyse, couleurs trace, lancer/re-lancer |
| `weather` | Météo | Open-Meteo, heure départ + vitesse, prévisions étapes |
| `live` | Mode Live | Activation, consentement GPS, POIs à X km, pas de données GPS côté serveur |
| `stages` | Étapes | Créer étape (clic trace/profil), drag marker, météo par étape, D+ |

Content should be written in **French** (user-facing, `communication_language = French`).

### AppHeader — desktop nav order after changes

Desktop: `Mes aventures | Aide | Mon compte | Feedback`

For "Feedback", use a subtle differentiation (e.g., `text-accent` color or underline variant) to signal it's an action rather than navigation. Avoid adding a full button component — keep it consistent as a text nav item with `onClick`. Example:

```tsx
<button
  type="button"
  onClick={() => setFeedbackOpen(true)}
  className="text-sm text-text-secondary hover:text-text-primary"
>
  Feedback
</button>
```

Mobile hamburger — add at the end (after "Mon compte"):
```tsx
<DropdownMenuItem onClick={() => { setFeedbackOpen(true) }}>
  Feedback
</DropdownMenuItem>
```

**Note on `isHelpActive`**: Add active state detection for the "Aide" link: `const isHelpActive = pathname === '/help'`.

### MarketingFooter — exact styling to match

Current footer links use this inline class (from `marketing-footer.tsx`):
```tsx
className="hover:text-accent transition-colors hover:underline decoration-accent underline-offset-4"
```
Use exactly the same class for the "Aide" link.

### Project Structure Notes

| File | Action |
|------|--------|
| `packages/database/src/schema/feedbacks.ts` | **New** — feedbacks table schema |
| `packages/database/src/index.ts` | Add `feedbacks` export |
| `apps/api/src/feedbacks/feedbacks.module.ts` | **New** |
| `apps/api/src/feedbacks/feedbacks.controller.ts` | **New** — `POST /feedbacks` |
| `apps/api/src/feedbacks/feedbacks.service.ts` | **New** — insert + Resend email |
| `apps/api/src/feedbacks/feedbacks.service.test.ts` | **New** — unit tests |
| `apps/api/src/feedbacks/feedbacks.repository.ts` | **New** — Drizzle insert |
| `apps/api/src/feedbacks/dto/create-feedback.dto.ts` | **New** — DTO |
| `apps/api/src/app.module.ts` | Register `FeedbacksModule` |
| `apps/web/src/app/(marketing)/help/page.tsx` | **New** — SSG help page (marketing group) |
| `apps/web/src/components/shared/feedback-modal.tsx` | **New** — FeedbackModal component |
| `apps/web/src/components/shared/feedback-modal.test.tsx` | **New** — 3 tests |
| `apps/web/src/components/layout/app-header.tsx` | Add "Aide" + "Feedback" nav, `useSession`, `feedbackOpen` state, render FeedbackModal |
| `apps/web/src/components/layout/app-header.test.tsx` | Add tests for "Aide" + "Feedback" |
| `apps/web/src/app/(marketing)/_components/marketing-footer.tsx` | Add "Aide" link |
| `apps/web/src/lib/api-client.ts` | Add `submitFeedback()` function |

### References

- Epic 16 story 16.7 requirements: `_bmad-output/planning-artifacts/epics.md#Story-16.7`
- AppHeader (current): `apps/web/src/components/layout/app-header.tsx` — already `'use client'`, already has `useState` pattern and nav links
- MarketingFooter: `apps/web/src/app/(marketing)/_components/marketing-footer.tsx:13` — exact class for footer links
- NestJS module pattern reference: `apps/api/src/stages/` (complete structure to mirror)
- Drizzle schema pattern: `packages/database/src/schema/adventure-stages.ts`
- Dialog/Button sizing: story 16.6 — `size="lg"` = `h-11` (44px), `DialogFooter` has `[&_button]:min-h-[44px]` safety net
- Card component: story 16.6 — `apps/web/src/components/ui/card.tsx`
- Resend email from address: `"Ride'n'Rest <noreply@ridenrest.app>"` [project-context.md]
- Route groups: `(marketing)/` = SSG + public, `(app)/` = CSR + auth-gated [project-context.md]
- ResponseInterceptor: NEVER return `{ success: true, data }` from controller — return raw data [project-context.md]
- Error handling: Services throw `HttpException`; controllers have NO try/catch [project-context.md]
- Story 16.6 completion notes (button sizes, dialog patterns): `16-6-ui-polish-modals-settings-tooltips.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- **Feedback email-only (décision post-implémentation)** : pas de persistence DB — le service envoie uniquement un email Resend. Si `RESEND_API_KEY` absent (dev), console.log uniquement, pas d'erreur.
- **`/help` dans `(app)` group** (décision post-implémentation) : page auth-gated avec AppHeader, pas SSG marketing. Le lien dans `MarketingFooter` est conservé pour la landing.
- Module NestJS `feedbacks` : controller + service (email Resend) + DTO `class-validator`. Pas de repository.
- `resend` ajouté aux dépendances de `apps/api`.
- `select.tsx` et `textarea.tsx` ajoutés via shadcn CLI (absents du projet).
- Zod v4 : `required_error` → `error` dans `z.enum()` (breaking change API).
- Radix UI Select en JSDOM : utiliser `fireEvent.click` au lieu de `userEvent.click` (pointer-events workaround).
- Mock Resend dans les tests Jest : via objet ref partagé pour contourner le hoisting.
- Migration `0008_boring_iron_monger.sql` : table `feedbacks` présente en DB (migrée) mais plus utilisée par le code — orpheline inoffensive.

### File List

packages/database/migrations/0008_boring_iron_monger.sql (new — table feedbacks, orpheline, voir action item)
packages/database/migrations/meta/_journal.json (modified)
packages/database/migrations/meta/0008_snapshot.json (new)
apps/api/package.json (modified — resend dependency added)
apps/api/src/feedbacks/feedbacks.module.ts (new)
apps/api/src/feedbacks/feedbacks.controller.ts (new)
apps/api/src/feedbacks/feedbacks.service.ts (new)
apps/api/src/feedbacks/feedbacks.service.test.ts (new)
apps/api/src/feedbacks/dto/create-feedback.dto.ts (new)
apps/api/src/app.module.ts (modified)
apps/web/src/app/(app)/help/page.tsx (new)
apps/web/src/components/shared/feedback-modal.tsx (new)
apps/web/src/components/shared/feedback-modal.test.tsx (new)
apps/web/src/components/ui/select.tsx (new — shadcn)
apps/web/src/components/ui/textarea.tsx (new — shadcn)
apps/web/src/components/layout/app-header.tsx (modified)
apps/web/src/components/layout/app-header.test.tsx (modified)
apps/web/src/app/(marketing)/_components/marketing-footer.tsx (modified)
apps/web/src/lib/api-client.ts (modified)
apps/web/src/middleware.ts (modified — /help added to protected routes)
