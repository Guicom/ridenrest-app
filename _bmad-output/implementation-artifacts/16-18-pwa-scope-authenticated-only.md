# Story 16.18: PWA Scope — Limiter à la Partie Connectée

Status: done

## Story

As a **cyclist who installed Ride'n'Rest as a PWA on my home screen**,
I want the app to open directly on my adventures dashboard (not the landing page),
So that the PWA experience feels like a native app — no marketing pages, straight to my content.

## Acceptance Criteria

1. **PWA start_url** — Given the Web App Manifest is served, when a browser reads it, then `start_url` is `/adventures` (not `/`).

2. **PWA scope remains `/`** — Given the manifest `scope` property, when evaluated, then it is `/` (or omitted, defaulting to `/`). This ensures the auth flow (`/login` → `/adventures`) works inside the standalone shell without opening an external browser.

3. **PWA launch lands on dashboard** — Given the user launches the PWA from the home screen, when the app opens, then they land on `/adventures`. If not authenticated, the auth middleware redirects to `/login`, and after login they return to `/adventures`.

4. **Public page links open in external browser** — Given the user is inside the PWA standalone shell and taps a link to a public page (landing `/`, `/mentions-legales`, `/contact`), when the navigation occurs, then it opens in the device's default browser (not inside the standalone shell).

5. **Service Worker excludes marketing routes from precache** — Given the SW is configured via `@ducanh2912/next-pwa`, when it precaches routes, then routes matching `(marketing)/*` patterns (`/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/contact`, `/mentions-legales`) are excluded from the precache manifest. Only `(app)/*` routes are precached.

6. **Manifest test updated** — Given the existing `manifest.test.ts`, when tests run, then they assert `start_url` is `/adventures` (not `/`).

7. **No regression on auth flow** — Given a non-authenticated user opens the PWA, when they are redirected to `/login` and complete authentication, then they are redirected back to `/adventures` without the standalone shell breaking or opening an external browser.

## Tasks / Subtasks

- [x] Task 1: Update manifest `start_url` (AC: #1, #2)
  - [x] 1.1 — In `apps/web/src/app/manifest.ts`, change `start_url: "/"` to `start_url: "/adventures"`
  - [x] 1.2 — Keep `id: "/"` unchanged (stable PWA identity — changing `id` forces re-install)
  - [x] 1.3 — Do NOT add an explicit `scope` property (default `/` is correct for auth flow)

- [x] Task 2: Update manifest test (AC: #6)
  - [x] 2.1 — In `apps/web/src/app/manifest.test.ts`, update assertion for `start_url` from `"/"` to `"/adventures"`

- [x] Task 3: Configure SW to exclude marketing routes from precache (AC: #5)
  - [x] 3.1 — In `apps/web/next.config.ts`, add `exclude` patterns to `workboxOptions` to skip marketing routes
  - [x] 3.2 — Use `workboxOptions.exclude` array with regex patterns matching `(marketing)` route outputs: `[/^\/$/, /\/login/, /\/register/, /\/forgot-password/, /\/reset-password/, /\/contact/, /\/mentions-legales/]`
  - [x] 3.3 — Verify that `(app)/*` routes (`/adventures`, `/map`, `/live`, `/settings`, `/help`) are still precached

- [x] Task 4: Public page links open in external browser (AC: #4)
  - [x] 4.1 — Identify all links from `(app)` layout/components that point to marketing routes (footer links, legal links, etc.)
  - [x] 4.2 — For links to public pages inside the `(app)` layout, add `target="_blank" rel="noopener noreferrer"` — in standalone mode, `target="_blank"` opens the device browser
  - [x] 4.3 — Do NOT modify `(marketing)` layout or components — they only affect non-PWA users

- [x] Task 5: Verify auth redirect flow in standalone (AC: #3, #7)
  - [x] 5.1 — Verify `middleware.ts` already redirects unauthenticated users from `/adventures` to `/login`
  - [x] 5.2 — Verify Better Auth redirects back to the original URL (`/adventures`) after successful login
  - [x] 5.3 — callbackURL already preserved — middleware sets `?redirect=/adventures`, login page reads it and passes to LoginForm + GoogleSignInButton

## Dev Notes

### Current State

- **manifest.ts** (`apps/web/src/app/manifest.ts`): `start_url: "/"`, `display: "standalone"`, no `scope` property
- **next.config.ts** (`apps/web/next.config.ts`): `@ducanh2912/next-pwa` v10.2.9 with `withPWA()` wrapper, `workboxOptions` has `skipWaiting`, `clientsClaim`, one `runtimeCaching` rule for static assets
- **Route groups**: `(marketing)/` = landing, auth pages, legal. `(app)/` = adventures, map, live, settings, help
- **Auth middleware**: `apps/web/src/middleware.ts` handles session checks and redirects

### Key Technical Decisions

1. **`scope` must stay `/`** — Setting `scope: "/adventures"` would break the auth flow because `/login` is outside that scope, causing the browser to open it externally. The user would authenticate in the browser, then have to manually re-open the PWA.

2. **`id` must stay `"/"`** — The `id` field is the stable identity of the PWA. Changing it would cause browsers to treat it as a different app, forcing users to uninstall and reinstall.

3. **`target="_blank"` for public links** — In `display: standalone` mode, `target="_blank"` opens the URL in the device's default browser. This is the standard mechanism — no JavaScript `window.open()` needed.

4. **SW `exclude` vs `navigateFallback` denylist** — Using `workboxOptions.exclude` prevents marketing routes from being added to the precache manifest at build time. This is simpler and more reliable than runtime filtering.

### Architecture Compliance

- **Next.js App Router route groups**: `(marketing)/` for SSG public, `(app)/` for CSR auth-gated — this story reinforces the separation at the PWA level
- **Testing**: co-located test `manifest.test.ts` — update existing test, don't create new file
- **`@ducanh2912/next-pwa`**: all config goes in `next.config.ts` `withPWA()` call — no separate SW file to create

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/app/manifest.ts` | `start_url: "/adventures"` |
| `apps/web/src/app/manifest.test.ts` | Update `start_url` assertion |
| `apps/web/next.config.ts` | Add `exclude` patterns to `workboxOptions` |
| `apps/web/src/app/(app)/*` (various) | `target="_blank"` on links to marketing routes |

### Anti-Patterns

- **Do NOT set `scope: "/adventures"`** — breaks auth flow in standalone mode
- **Do NOT change `id`** — forces PWA re-install for existing users
- **Do NOT create a custom service worker** — `@ducanh2912/next-pwa` handles SW generation
- **Do NOT use `window.open()` for external links** — `target="_blank"` is the standard PWA approach

### Previous Story Context (16.17)

Story 16.17 added `NoResultsSubTypeBanner` component in `apps/web/src/app/(app)/map/[id]/_components/`. No PWA-related changes. The `next.config.ts` was last modified in commits `86cfa66` and `2e85bd2` (SW config fixes for `workboxOptions` structure).

### References

- [Source: apps/web/src/app/manifest.ts] — current manifest
- [Source: apps/web/next.config.ts] — PWA config with `@ducanh2912/next-pwa`
- [Source: _bmad-output/planning-artifacts/architecture.md#Next.js App Router Rules] — route group strategy
- [Source: _bmad-output/planning-artifacts/prd.md#PWA Capabilities] — FR-070→073
- [Source: _bmad-output/implementation-artifacts/12-1-pwa-manifest-app-install.md] — story 12.1 (PWA setup)
- [@ducanh2912/next-pwa docs](https://github.com/AntoineDuCed/next-pwa) — `workboxOptions.exclude` API

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation, no issues encountered.

### Completion Notes List
- **Task 1**: Changed `start_url` from `"/"` to `"/adventures"` in manifest.ts. Kept `id: "/"` unchanged. No explicit `scope` property added (default `/` preserves auth flow in standalone shell).
- **Task 2**: Updated manifest test — assertion changed to `/adventures`. Added 2 new test cases: `id` stays `"/"` and no `scope` property exists. Total: 12 tests in manifest.test.ts, all pass.
- **Task 3**: Added `workboxOptions.exclude` array with 7 regex patterns matching all `(marketing)` routes (`/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/contact`, `/mentions-legales`). `(app)/*` routes are unaffected and remain precached.
- **Task 4**: Found only 1 marketing link from `(app)` layout: `/contact` in `help/page.tsx`. Replaced `<Link>` with `<a target="_blank" rel="noopener noreferrer">`. Removed unused `next/link` import. No changes to `(marketing)` layout/components.
- **Task 5**: Verified auth flow is already correct — middleware redirects to `/login?redirect=/adventures`, login page reads `redirect` param and passes to `LoginForm` + `GoogleSignInButton`. No code changes needed.
- **Regression**: 792/792 tests pass across 70 files. No lint errors introduced.

### File List
- `apps/web/src/app/manifest.ts` — `start_url` changed to `/adventures`
- `apps/web/src/app/manifest.test.ts` — Updated assertion + 2 new tests (id, scope)
- `apps/web/next.config.ts` — Added anchored `exclude` regex patterns to `workboxOptions`
- `apps/web/src/app/(app)/help/page.tsx` — `/contact` link → `target="_blank"`, removed unused `Link` import

### Senior Developer Review (AI)
**Reviewer:** Guillaume — 2026-04-05
**Outcome:** Approved with fixes applied

**Fixes Applied (2):**
- **[M1] Anchored exclude regex patterns** in `next.config.ts` — Changed `/\/login/` → `/^\/login(\/|$)/` (and all 6 others) to prevent false-positive matches on precache entries containing those substrings
- **[L1] Removed extra blank line** in `help/page.tsx` — Cosmetic cleanup after `import Link` removal

**Noted (not fixed):**
- **[L2]** `target="_blank"` on `/contact` link also opens new tab for non-PWA users — acceptable trade-off
- **[L3]** Root path regex `^\/?$` may not match Workbox precache entries formatted as `index.html` — verify via production build
- **[M2]** No automated test for `workboxOptions.exclude` patterns — manual verification only
