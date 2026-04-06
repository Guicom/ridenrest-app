# Story 16.22: Landing Page — Dynamic Auth CTA (Se connecter / Mes aventures)

Status: done

## Story

As a **cyclist who is already logged in**,
I want the landing page header CTA to show "Mes aventures" instead of "Se connecter",
so that I can go straight to my dashboard without being presented with a login prompt I don't need.

## Acceptance Criteria

1. **Given** the user is NOT authenticated (no active session),
   **When** the landing page (`/`) renders (header desktop + mobile menu),
   **Then** the CTA button displays "Se connecter" and links to `/adventures` (existing behavior preserved — auth middleware redirects to `/login`).

2. **Given** the user IS authenticated (active Better Auth session via `useSession()`),
   **When** the landing page header renders,
   **Then** the CTA button label changes to "Mes aventures" and links to `/adventures`.

3. **Given** the session is loading (`useSession()` returns `isPending: true`),
   **When** the header renders,
   **Then** the CTA button renders with a fixed-width skeleton/shimmer placeholder (no label flash from "Se connecter" to "Mes aventures").

4. **Given** the `MarketingHeader` component is a client component (`'use client'`),
   **When** `useSession()` is called,
   **Then** the session check is performed client-side only — no SSR session fetch needed (landing page remains fully cacheable/static).

## Tasks / Subtasks

- [x] Task 1: Add `useSession` to `MarketingHeader` (AC: #1, #2, #4)
  - [x] 1.1 Import `useSession` from `@/lib/auth/client`
  - [x] 1.2 Call `useSession()` in component body, destructure `{ data: session, isPending }`
  - [x] 1.3 Derive `isAuthenticated = !!session?.user`
  - [x] 1.4 Derive `ctaLabel = isAuthenticated ? 'Mes aventures' : 'Se connecter'`

- [x] Task 2: Update desktop CTA (line ~32) (AC: #1, #2, #3)
  - [x] 2.1 Replace hardcoded "Se connecter" with `ctaLabel`
  - [x] 2.2 When `isPending`, render a skeleton placeholder matching button dimensions (~120px × 36px)

- [x] Task 3: Update mobile menu CTA (line ~73) (AC: #1, #2, #3)
  - [x] 3.1 Replace hardcoded "Se connecter" with `ctaLabel`
  - [x] 3.2 When `isPending`, render a skeleton placeholder matching button dimensions

- [x] Task 4: Write unit tests (AC: #1, #2, #3)
  - [x] 4.1 Test: unauthenticated → shows "Se connecter"
  - [x] 4.2 Test: authenticated → shows "Mes aventures"
  - [x] 4.3 Test: isPending → shows skeleton (no text flash)

## Dev Notes

### Key Files to Modify

| File | Action |
|---|---|
| `apps/web/src/app/(marketing)/_components/marketing-header.tsx` | Add `useSession`, conditional label + skeleton |
| `apps/web/src/app/(marketing)/_components/marketing-header.test.tsx` | **NEW** — unit tests |

### Existing Patterns to Follow

- **`useSession` usage pattern** — see `apps/web/src/components/layout/app-header.tsx:27` for the exact same pattern: `const { data: session } = useSession()`. This story adds `isPending` to the destructuring.
- **Auth client import** — always from `@/lib/auth/client` (file: `apps/web/src/lib/auth/client.ts`), never from `better-auth/react` directly.
- **Skeleton component** — already available: `import { Skeleton } from '@/components/ui/skeleton'` (shadcn/ui). Used in `app-header.tsx:63` for adventure name loading state.
- **Testing** — Vitest + React Testing Library (co-located `.test.tsx`). Mock `useSession` from `@/lib/auth/client`. See existing test patterns in `apps/web/src/components/layout/app-header.test.tsx`.

### Anti-Patterns to Avoid

- **DO NOT add server-side session fetching** — the `(marketing)/` route group is SSG/static. Session detection is client-side only via Better Auth cookie + `useSession()`.
- **DO NOT use `getSession` (server)** — that's for `(app)/` route group and server components. This is a `'use client'` component.
- **DO NOT add `Suspense` boundaries** — `useSession` is not a server fetch; handle loading state inline with `isPending`.
- **DO NOT create a separate component** for the CTA — keep the logic inline in `MarketingHeader`, mirroring `AppHeader` simplicity.
- **DO NOT add conditional redirect logic** — the link always points to `/adventures`; the auth middleware handles the redirect to `/login` for unauthenticated users.

### Implementation Details

The component already has `'use client'` and `useState` — adding `useSession` is a minimal change. Both desktop (line ~32) and mobile (line ~73) CTAs must be updated identically.

**Skeleton strategy:** Use `<Skeleton className="h-9 w-28 rounded-lg" />` (desktop) and `<Skeleton className="h-11 w-full rounded-lg" />` (mobile) to prevent layout shift. Match the green button's dimensions.

**No `href` change needed** — both states link to `/adventures`. Only the label text changes.

### Project Structure Notes

- Component lives in `apps/web/src/app/(marketing)/_components/` — private components for marketing route group (per project-context.md rules).
- No new packages, APIs, or database changes required.
- No NestJS changes.
- Fully contained in the web app frontend.

### References

- [Source: apps/web/src/lib/auth/client.ts] — `useSession` export
- [Source: apps/web/src/components/layout/app-header.tsx:19-27] — `useSession` usage pattern
- [Source: apps/web/src/components/ui/skeleton.tsx] — Skeleton component
- [Source: _bmad-output/project-context.md#Next.js App Router Rules] — `(marketing)/` = SSG, `(app)/` = CSR auth-gated
- [Source: _bmad-output/project-context.md#Auth] — `lib/auth/client.ts` (browser) vs `lib/auth/server.ts` (server)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — no debug issues encountered.

### Completion Notes List
- ✅ Task 1: Added `useSession` + `Skeleton` imports, derived `isAuthenticated` and `ctaLabel` — mirrors `AppHeader` pattern exactly.
- ✅ Task 2: Desktop CTA now renders skeleton (`h-9 w-28`) when `isPending`, else dynamic label.
- ✅ Task 3: Mobile CTA now renders skeleton (`h-11 w-full`) when `isPending`, else dynamic label.
- ✅ Task 4: 5 unit tests covering all 3 AC states (unauthenticated, authenticated, pending). All pass.
- ✅ Full regression suite: 838/838 tests pass, 0 regressions.
- ✅ Lint: 0 errors (warnings are pre-existing).
- No SSR session fetch added — landing page remains fully cacheable/static (AC #4).
- `href` always `/adventures` in both states — auth middleware handles redirect (AC #1, #2).

### Change Log
- 2026-04-06: Implemented story 16.22 — Dynamic Auth CTA on landing page header (desktop + mobile).
- 2026-04-06: Code review — Fixed H1 (skeleton tests used document.querySelectorAll instead of Testing Library getByTestId) and M1 (tests now assert exactly 2 CTAs for desktop+mobile). Added data-testid="cta-skeleton" to Skeleton components.

### File List
- `apps/web/src/app/(marketing)/_components/marketing-header.tsx` — Modified: added useSession, conditional CTA label, skeleton loading state
- `apps/web/src/app/(marketing)/_components/marketing-header.test.tsx` — **NEW**: 5 unit tests for auth CTA states
