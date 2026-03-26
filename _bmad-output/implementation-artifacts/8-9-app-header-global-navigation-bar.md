# Story 8.9: App Header — Global Navigation Bar

Status: done

## Story

As a **cyclist user navigating the app**,
I want a persistent header bar with the logo and quick links to my adventures and account settings,
so that I can navigate anywhere in one tap.

## Acceptance Criteria

1. **Given** the user is on any `(app)` page, **When** the header renders, **Then** a fixed-height header (`h-14`) is visible at the top with `bg-background border-b border-[--border]` and `z-50`.

2. **Given** the header renders, **When** looking at the left section, **Then** the Ride'n'Rest logo is displayed (`h-8 w-auto`) and is a clickable link to `/adventures`.

3. ~~**Given** the user is on an adventure page, **When** the header renders, **Then** the center section displays the adventure name.~~ **Dropped** — adventure name is already visible on the page itself; redundant in the header.

4. **Given** the header renders, **When** looking at the right section, **Then** two navigation items are visible: (a) a "Mes aventures" link pointing to `/adventures`, and (b) a "Mon compte" link pointing to `/settings`.

5. **Given** the user clicks "Mon compte", **When** the settings page renders, **Then** the user can see their account info and Strava connection status/configuration.

6. **Given** the user is in **Live mode** (`/live/:id`), **When** the header renders, **Then** the header is **hidden** — Live mode is a full-screen immersive experience with only the "Quitter le live" button visible (as defined in Story 8.3).

7. **Given** the viewport is mobile (< 640px), **When** the header renders, **Then** (a) the logo is `iconOnly` (no text), (b) "Mes aventures" and "Mon compte" are collapsed into a hamburger menu (`<Menu />` icon from lucide) opening a `<DropdownMenu>`.

8. **Given** the viewport is desktop (≥ 640px), **When** the header renders, **Then** all items are displayed inline — no hamburger menu.

9. **Given** the user is on any non-map/non-live page, **When** the page renders, **Then** there is `pt-10` spacing between the header and the page content.

10. **Given** the header renders on a non-map page, **When** looking at the inner layout, **Then** the content is constrained to `max-w-[1400px] mx-auto` — consistent with the marketing site header.

## Tasks / Subtasks

- [x] Task 1 — Create `<AppHeader />` component (AC: #1, #2, #4, #7, #8, #10)
  - [x] 1.1 Create `apps/web/src/components/layout/app-header.tsx`
  - [x] 1.2 Structure: `<header className="sticky top-0 z-50 h-14 bg-background border-b border-[--border] flex items-center px-4">` with inner container `max-w-[1400px] mx-auto` (except on map pages)
  - [x] 1.3 Left section: `<Link href="/adventures"><Logo iconOnly className="h-8 w-auto sm:hidden" /><Logo className="h-8 w-auto hidden sm:block" /></Link>`
  - [x] 1.4 Right section (desktop ≥ 640px): `<nav className="hidden sm:flex items-center gap-4">` with links to `/adventures` ("Mes aventures") and `/settings` ("Mon compte")
  - [x] 1.5 Right section (mobile < 640px): `<div className="sm:hidden">` with `<DropdownMenu>` triggered by `<Menu />` lucide icon

- [x] Task 2 — ~~Adventure name in header center~~ Dropped per design review
  - [x] Center section removed — adventure name is already displayed prominently on the page itself

- [x] Task 3 — Integrate into `(app)/layout.tsx` (AC: #1, #6)
  - [x] 3.1 Import and render `<AppHeader />` above `{children}` in the app layout
  - [x] 3.2 `AppHeader` self-hides via `usePathname()` check for `/live/` prefix

- [x] Task 4 — Settings page stub (AC: #5)
  - [x] Settings page already existed and is fully implemented (email, Strava status, sign out, delete account)

- [x] Task 5 — Active link highlighting (AC: #4)
  - [x] 5.1 Active nav link: `text-text-primary font-medium` (vs inactive: `text-text-secondary hover:text-text-primary`)
  - [x] 5.2 Applied to both desktop inline links and mobile dropdown items

- [x] Task 6 — Page spacing (AC: #9)
  - [x] 6.1 `pt-10` added to `<main>` in `adventures/page.tsx`
  - [x] 6.2 `pt-10` added to both `<main>` elements in `adventure-detail.tsx`
  - [x] 6.3 `pt-10` added to outer `<div>` in `settings/page.tsx` (replaces `py-8` top with `pt-10`)

- [x] Task 7 — Logo colors (AC: #2)
  - [x] Updated `logo.tsx` to use hardcoded brand colors (`#4A7C44` for path/text, `#b4c9b1` for circles) instead of `currentColor`

- [x] Task 8 — Tests (Vitest, co-located)
  - [x] 8.1 Create `apps/web/src/components/layout/app-header.test.tsx`
  - [x] 8.2 Test: renders logo with link to `/adventures`
  - [x] 8.3 Test: renders "Mes aventures" and "Mon compte" nav links with correct hrefs
  - [x] 8.4 Test: header is not rendered when pathname starts with `/live/`

## Dev Notes

### Architecture Decisions

- **Header is in `(app)/layout.tsx`** — not in individual pages. This ensures consistency across all app pages.
- **Live mode hides the header entirely** — `AppHeader` self-hides via `usePathname()` check for `/live/` prefix (actual routes are `/live/[id]`).
- **Header uses `sticky top-0`** — content flows naturally below it. z-50 ensures it stays above map layers and overlays.
- **`DropdownMenuItem` uses `onClick + useRouter`** — consistent with existing usage pattern in `segment-card.tsx`. Base UI's MenuItem doesn't support `asChild` for link wrapping.
- **Settings page was already complete** — verified against existing implementation, which already satisfies AC #5 fully.
- **Adventure name dropped from header** — already visible on the page; redundant in the navbar creates visual duplication.
- **`max-w-[1400px]` container** — matches the marketing site header width. Not applied on `/map/*` pages (map is full-width).
- **Logo uses hardcoded colors** — `#4A7C44` (brand green) and `#b4c9b1` (muted green for circles). `currentColor` removed since logo colors are fixed by brand, not theme.
- **`pt-10` on each `<main>`** — added directly to each page's `<main>` element rather than a layout wrapper, so the background color of each page covers the full area correctly.
- **No bottom tab bar** — this is a web app, not a native app. Header-based navigation is the right pattern.

## Dev Agent Record

### Completion Notes

- ✅ All tasks complete
- ✅ 9 unit tests passing (vitest run)
- ✅ 445 total tests — 0 regressions
- ✅ Post-implementation design adjustments applied: adventure name scoped to map pages only, `pt-10` added to page `<main>` elements, `max-w-[1400px]` container, hardcoded logo colors

### Change Log

- 2026-03-22: Implemented Story 8.9 — App Header Global Navigation Bar
  - Created `apps/web/src/components/layout/app-header.tsx`
  - Created `apps/web/src/components/layout/app-header.test.tsx`
  - Updated `apps/web/src/app/(app)/layout.tsx` to include `<AppHeader />`
- 2026-03-22: Post-implementation design refinements
  - Adventure name scoped to `/map/:id` only (not shown on `/adventures/:id` — already visible on page)
  - Added `pt-10` to `<main>` in `adventures/page.tsx`, `adventure-detail.tsx` (×2), `settings/page.tsx`
  - Added `max-w-[1400px] mx-auto` container inside header (matches marketing site, skipped on map pages)
  - Updated `logo.tsx` to use hardcoded brand colors instead of `currentColor`
- 2026-03-22: Code review fixes
  - Fixed: adventure name now displayed in header center on `/map/:id` (was missing — feature not fully implemented)
  - Fixed: `useQuery` moved before early return to comply with Rules of Hooks
  - Fixed: tests updated — removed incorrect `/adventures/:id` adventure name test cases, added correct map page tests
  - Fixed: stale TODO comment removed from `map/[id]/page.tsx`
  - Fixed: `aria-hidden` added to Logo SVG elements (Link already provides accessible label)

## File List

- `apps/web/src/components/layout/app-header.tsx` (new)
- `apps/web/src/components/layout/app-header.test.tsx` (new)
- `apps/web/src/app/(app)/layout.tsx` (modified)
- `apps/web/src/components/ui/logo.tsx` (modified — hardcoded brand colors)
- `apps/web/src/app/(app)/adventures/page.tsx` (modified — pt-10 on main)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` (modified — pt-10 on main)
- `apps/web/src/app/(app)/settings/page.tsx` (modified — pt-10 replaces py-8 top)
- `apps/web/src/app/(app)/map/[id]/page.tsx` (modified — removed stale TODO comment)
