# Story 8.9: App Header — Global Navigation Bar

Status: ready-for-dev

## Story

As a **cyclist user navigating the app**,
I want a persistent header bar with the logo, the current adventure name, and quick links to my adventures and account settings,
so that I always know which adventure I'm viewing and can navigate anywhere in one tap.

## Acceptance Criteria

1. **Given** the user is on any `(app)` page, **When** the header renders, **Then** a fixed-height header (`h-14`) is visible at the top with `bg-background border-b border-[--border]` and `z-50`.

2. **Given** the header renders, **When** looking at the left section, **Then** the Ride'n'Rest `<Logo iconOnly />` is displayed (`h-8 w-auto text-[--primary]`) and is a clickable link to `/adventures`.

3. **Given** the user is on an adventure page (`/adventures/:id/*` — planning map or live mode), **When** the header renders, **Then** the center section displays the adventure name in `text-sm font-semibold text-text-primary truncate max-w-[200px] sm:max-w-[300px]`.

4. **Given** the user is NOT on an adventure page (e.g. `/adventures` list), **When** the header renders, **Then** the center section is empty (no adventure name displayed).

5. **Given** the header renders, **When** looking at the right section, **Then** two navigation items are visible: (a) a "Mes aventures" link (`text-sm text-text-secondary hover:text-text-primary`) pointing to `/adventures`, and (b) a "Mon compte" link pointing to `/settings`.

6. **Given** the user clicks "Mon compte", **When** the settings page renders, **Then** the user can see their account info and Strava connection status/configuration.

7. **Given** the user is in **Live mode** (`/adventures/:id/live`), **When** the header renders, **Then** the header is **hidden** — Live mode is a full-screen immersive experience with only the "Quitter le live" button visible (as defined in Story 8.3).

8. **Given** the viewport is mobile (< 640px), **When** the header renders, **Then** (a) the logo is `iconOnly` (no text), (b) the adventure name truncates with ellipsis, (c) "Mes aventures" and "Mon compte" are collapsed into a hamburger menu (`<Menu />` icon from lucide) opening a `<DropdownMenu>`.

9. **Given** the viewport is desktop (≥ 640px), **When** the header renders, **Then** all items are displayed inline — no hamburger menu.

## Tasks / Subtasks

- [ ] Task 1 — Create `<AppHeader />` component (AC: #1, #2, #5, #8, #9)
  - [ ] 1.1 Create `apps/web/src/components/layout/app-header.tsx`
  - [ ] 1.2 Structure: `<header className="h-14 bg-background border-b border-[--border] z-50 flex items-center px-4">` with three sections: left (logo), center (adventure name), right (nav links)
  - [ ] 1.3 Left section: `<Link href="/adventures"><Logo iconOnly className="h-8 w-auto text-[--primary] sm:hidden" /><Logo className="h-8 w-auto text-[--primary] hidden sm:block" /></Link>` — icon-only on mobile, full logo on desktop
  - [ ] 1.4 Right section (desktop ≥ 640px): `<nav className="hidden sm:flex items-center gap-4">` with `<Link>` to `/adventures` ("Mes aventures") and `<Link>` to `/settings` ("Mon compte")
  - [ ] 1.5 Right section (mobile < 640px): `<div className="sm:hidden">` with shadcn `<DropdownMenu>` triggered by `<Menu />` lucide icon; items: "Mes aventures" → `/adventures`, "Mon compte" → `/settings`

- [ ] Task 2 — Adventure name in header center (AC: #3, #4)
  - [ ] 2.1 Use `useParams()` to detect if we're on `/adventures/:id/*` routes
  - [ ] 2.2 When `adventureId` param is present, fetch adventure name via TanStack Query: `useQuery({ queryKey: ['adventures', adventureId], ... })` — reuse existing query (already cached from adventure pages)
  - [ ] 2.3 Display: `<span className="text-sm font-semibold text-text-primary truncate max-w-[200px] sm:max-w-[300px]">{adventure.name}</span>`
  - [ ] 2.4 While loading: show `<Skeleton className="h-4 w-32" />`
  - [ ] 2.5 When NOT on adventure page: render nothing in center section

- [ ] Task 3 — Integrate into `(app)/layout.tsx` (AC: #1, #7)
  - [ ] 3.1 Import and render `<AppHeader />` above `{children}` in the app layout
  - [ ] 3.2 Conditionally hide header on live mode routes — use `usePathname()` to detect `/live` suffix; if live mode → do not render `<AppHeader />`
  - [ ] 3.3 Ensure `children` container accounts for the 56px (h-14) header height when header is visible

- [ ] Task 4 — Settings page stub (AC: #6)
  - [ ] 4.1 Create `apps/web/src/app/(app)/settings/page.tsx` as a minimal page with heading "Mon compte"
  - [ ] 4.2 Display current user email from auth session
  - [ ] 4.3 Show Strava connection status (connected/not connected) with link to Story 2.3 Strava OAuth flow
  - [ ] 4.4 Note: Full settings page design is post-MVP — this is a functional stub

- [ ] Task 5 — Active link highlighting (AC: #5)
  - [ ] 5.1 Use `usePathname()` to determine current route
  - [ ] 5.2 Active nav link: `text-text-primary font-medium` (vs inactive: `text-text-secondary`)
  - [ ] 5.3 Apply to both desktop inline links and mobile dropdown items

- [ ] Task 6 — Tests (Vitest, co-located)
  - [ ] 6.1 Create `apps/web/src/components/layout/app-header.test.tsx`
  - [ ] 6.2 Test: renders logo with link to `/adventures`
  - [ ] 6.3 Test: shows adventure name when `adventureId` param is present
  - [ ] 6.4 Test: hides adventure name when on `/adventures` list page
  - [ ] 6.5 Test: renders "Mes aventures" and "Mon compte" nav links with correct hrefs
  - [ ] 6.6 Test: header is not rendered when pathname ends with `/live`

## Dev Notes

### Existing Components to Reuse

- `<Logo />` from `@/components/ui/logo` — supports `iconOnly` prop for compact mobile display
- shadcn `<DropdownMenu>` — already available in the project
- shadcn `<Skeleton>` — for loading state of adventure name
- TanStack Query `['adventures', adventureId]` — already cached by adventure pages, no extra API call

### Architecture Decisions

- **Header is in `(app)/layout.tsx`** — not in individual pages. This ensures consistency across all app pages.
- **Live mode hides the header entirely** — consistent with Story 8.3 decision: "only a Quitter le live button is visible for navigation — all other nav intentionally hidden".
- **Settings page is a stub** — full account management (password change, delete account, notification prefs) comes later. The stub gives a landing page for "Mon compte" now.
- **No bottom tab bar** — this is a web app, not a native app. Header-based navigation is the right pattern.

### Visual Reference

The header follows the same visual language as the marketing site header visible in the screenshot: clean white background, logo left, navigation right. The center adventure name is the key differentiator for the `(app)` section.
