# Story 8.3: App Shell & Routing

Status: done

## Story

As a **developer building the app navigation**,
I want a consistent app shell with proper routing between Planning and Live modes,
so that users always know where they are and how to get back.

## Acceptance Criteria

1. **Given** a user enters Planning mode on mobile (< 1024px), **When** navigated to `/map/[id]`, **Then** a non-blocking toast/banner appears: "Mode Planning optimisé pour desktop — certaines fonctionnalités sont réduites sur mobile" — the map still loads but the sidebar is hidden and replaced by the "FILTERS" bottom drawer pattern (drawer shell only — content from Stories 8.4+).

2. **Given** a user enters Planning mode on desktop (≥ 1024px), **When** navigated to `/map/[id]`, **Then** the map renders full-bleed (`100dvh`) with a "← Aventures" back button (top-left, `z-40`) and the sidebar visible.

3. **Given** the desktop Planning sidebar, **When** rendered, **Then** it is 360px wide with a `◀`/`▶` collapse toggle — collapsed state hides the sidebar and gives full width to the map; the sidebar contains: fromKm/toKm slider (`SearchRangeSlider`), layer toggles (`LayerToggles`), weather controls (`WeatherControls`), and placeholder sections for accommodation sub-type chips (Story 8.4+) and stages list (Epic 11).

4. **Given** a user enters Live mode at `/live/[id]`, **When** it's their first access, **Then** `GeolocationConsent` dialog appears; subsequent accesses skip it if consent was granted. *(Already implemented — verify no regression.)*

5. **Given** the user is in Live mode, **When** the map renders, **Then** only a "⏹ Quitter le live" button is visible for navigation — the current `ArrowLeft` "Aventures" back link at top-left is removed.

6. **Given** a user clicks "⏹ Quitter le live", **When** confirmed via an inline confirm step (e.g., button changes to "Confirmer?" for 3s), **Then** `stopWatching()` is called (from `useLiveMode`), the live store is reset, and the user is redirected to `/adventures`.

## Tasks / Subtasks

- [x] Task 1 — Restructure `map-view.tsx` into sidebar layout (AC: #2, #3)
  - [x] 1.1 Wrap the existing `<div className="relative flex h-full w-full">` into a two-column layout: `<div className="flex h-full w-full">`
  - [x] 1.2 Left column (desktop sidebar): `<aside className="hidden lg:flex flex-col w-[360px] shrink-0 bg-background border-r border-[--border] overflow-y-auto relative transition-all">`
  - [x] 1.3 Sidebar collapse toggle: add `useState<boolean>(false)` for `collapsed`; when collapsed, `aside` becomes `w-0 overflow-hidden` and a `◀`/`▶` icon button remains visible at the sidebar edge; when expanded, sidebar is `w-[360px]`
  - [x] 1.4 Right column (map): `<div className="flex-1 relative min-w-0">` — contains existing `<MapCanvas>` and all absolute-positioned overlays
  - [x] 1.5 Move `<SearchRangeSlider>` into sidebar (remove from `absolute top-4 right-4` position)
  - [x] 1.6 Move `<LayerToggles>` into sidebar (remove from `absolute bottom-8 left-1/2 -translate-x-1/2` position)
  - [x] 1.7 Move weather toggle button and `<WeatherControls>` into sidebar
  - [x] 1.8 Add placeholder `<div>` in sidebar for sub-type chips section: `{/* Sub-type chips — Story 8.4 */}` comment placeholder
  - [x] 1.9 Keep `<StatusBanner>` and `<PoiDetailSheet>` overlays in the map column (unchanged)

- [x] Task 2 — Add "← Aventures" back button to Planning map page (AC: #2)
  - [x] 2.1 In `map-view.tsx` map column, add `<Link href="/adventures" className="absolute top-4 left-4 z-40 inline-flex items-center gap-1 rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm hover:bg-background/90"><ArrowLeft className="h-4 w-4" />Aventures</Link>`
  - [x] 2.2 Import `ArrowLeft` from `lucide-react`, `Link` from `next/link`
  - [x] 2.3 Back button must be `z-40` (above map, below consent dialogs)

- [x] Task 3 — Mobile Planning toast (AC: #1)
  - [x] 3.1 In `map/[id]/page.tsx`, detect if viewport is mobile: use `useEffect` + `window.innerWidth < 1024` or Tailwind responsive breakpoint; trigger once on mount
  - [x] 3.2 If mobile: call `toast("Mode Planning optimisé pour desktop — certaines fonctionnalités sont réduites sur mobile", { duration: 6000 })` using `sonner` (already installed: `import { toast } from 'sonner'`)
  - [x] 3.3 Map still loads normally on mobile — toast is informational only, no redirect
  - [x] 3.4 `map/[id]/page.tsx` must be converted to `'use client'` for this, OR extract a `<PlanningModeToast />` client component and import it in the server page

- [x] Task 4 — Remove ArrowLeft link from live page, add "Quitter le live" (AC: #5, #6)
  - [x] 4.1 In `apps/web/src/app/(app)/live/[id]/page.tsx`, remove the `<div className="absolute top-4 left-4 z-40">` containing the `<Link href="/adventures">` ArrowLeft component
  - [x] 4.2 Add a "⏹ Quitter le live" button in the top-right area: `<div className="absolute top-4 right-4 z-40">`
  - [x] 4.3 Button style: `variant="outline"` with `bg-background/80 backdrop-blur-sm` — subtle, not competing with map
  - [x] 4.4 Implement 2-step confirm: first click → button label changes to "Confirmer?" for 3 seconds (setTimeout to revert); second click within 3s → confirms exit
  - [x] 4.5 On confirm: call `stopWatching()` from `useLiveMode()` (check exact function name — `useLiveMode` hook in `@/hooks/use-live-mode`), then `router.push('/adventures')`
  - [x] 4.6 Import `useRouter` from `next/navigation` for redirect

- [x] Task 5 — Adjust map page height for future header compatibility (AC: #2)
  - [x] 5.1 In `map/[id]/page.tsx`, update container from `h-[calc(100vh-4rem)]` → `h-[calc(100dvh-3.5rem)]` to match Story 8.9's `h-14` header (3.5rem = 56px)
  - [x] 5.2 Add code comment: `{/* h-14 header from Story 8.9 — update when AppHeader is added to (app)/layout.tsx */}`
  - [x] 5.3 Live page stays `h-dvh` (header hidden in live mode per Story 8.9 AC7)

- [x] Task 6 — Tests (Vitest, co-located) (AC: #1, #2, #3, #5, #6)
  - [x] 6.1 Create `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` (or add to existing if it exists — check first)
  - [x] 6.2 Test: sidebar renders on desktop (`lg:flex` class present in DOM)
  - [x] 6.3 Test: collapse toggle changes sidebar width state
  - [x] 6.4 Test: `SearchRangeSlider`, `LayerToggles` are inside the sidebar element
  - [x] 6.5 Test: "← Aventures" link has `href="/adventures"` and `z-40`
  - [x] 6.6 Create `apps/web/src/app/(app)/live/[id]/page.test.tsx` (already exists — extend it)
  - [x] 6.7 Test: `ArrowLeft` "Aventures" link is NOT rendered (verify it was removed)
  - [x] 6.8 Test: "⏹ Quitter le live" button is rendered
  - [x] 6.9 Test: clicking "Quitter le live" twice (or confirming) calls `stopWatching` and routes to `/adventures`

## Dev Notes

### Current State (Pre-story baseline)

**`map/[id]/page.tsx`** (server component):
```tsx
// Height already anticipates a header:
<div className="relative h-[calc(100vh-4rem)] w-full">
  <Suspense fallback={<Skeleton />}>
    <MapView adventureId={id} />
  </Suspense>
</div>
```

**`map/[id]/_components/map-view.tsx`** (client component):
- Currently renders controls as absolute-positioned overlays:
  - Weather toggle: `absolute top-4 left-4 z-10`
  - WeatherControls panel: `absolute top-16 left-4 z-10`
  - LayerToggles: `absolute bottom-8 left-1/2 -translate-x-1/2 z-10`
  - SearchRangeSlider: `absolute top-4 right-4 z-10`
- All these must move into the sidebar column
- `MapCanvas` is the main map element — keep it in the right column as `w-full h-full`

**`live/[id]/page.tsx`** (client component):
- Has `<Link href="/adventures">` with `ArrowLeft` at `absolute top-4 left-4 z-40` — **REMOVE**
- `useLiveMode()` hook — check it for `stopWatching` / `clearWatch` / `stopLive` exact function name
- `LiveControls` at bottom (sliders) — keep unchanged
- `GeolocationConsent` — keep unchanged (AC4 already done)

**`live/[id]/_components/live-controls.tsx`**:
- Bottom panel with distance/radius/speed sliders
- Has NO "Quitter le live" button — this must be added directly in `page.tsx`

### Sidebar Architecture

```
apps/web/src/app/(app)/map/[id]/
  page.tsx            — server component, height tweak
  _components/
    map-view.tsx      — REWRITE layout to sidebar + map columns
    planning-sidebar.tsx  — OPTIONAL: extract sidebar into its own component
    ...
```

Consider extracting the sidebar content into `planning-sidebar.tsx` for:
- Cleaner separation of concerns
- Easier testing of sidebar independently
- Story 8.4 can just add content to this component

`PlanningLayoutSidebar` props:
```typescript
interface PlanningLayoutSidebarProps {
  totalDistanceKm: number
  isPoisPending: boolean
  // weather props
  weatherActive: boolean
  weatherDimension: WeatherDimension
  onWeatherToggle: () => void
  onDimensionChange: (d: WeatherDimension) => void
  savedPace: { departureTime: string; speedKmh: string }
  onPaceSubmit: (departureTime: string | null, speedKmh: number | null) => void
  isPending: boolean  // weather data pending
}
```

### Layout Structure After This Story

```
map/[id] page:
┌──────────────────────────────────────────────────────┐
│ h-[calc(100dvh-3.5rem)]                              │
│ ┌─────────────────────┬────────────────────────────┐ │
│ │ Sidebar (360px)     │ Map (flex-1)               │ │
│ │ hidden on mobile    │                            │ │
│ │                     │  [← Aventures] z-40        │ │
│ │ SearchRangeSlider   │                            │ │
│ │ LayerToggles        │  MapCanvas (full)          │ │
│ │ WeatherControls     │                            │ │
│ │ {/* 8.4 chips */}   │  PoiDetailSheet            │ │
│ └──────┬──────────────┴────────────────────────────┘ │
│        ◀/▶ collapse                                  │
└──────────────────────────────────────────────────────┘
```

### Collapse Toggle Placement

The `◀`/`▶` toggle button sits at the sidebar/map boundary:
```tsx
<button
  onClick={() => setCollapsed(v => !v)}
  className="absolute top-1/2 -right-3 z-20 translate-y-[-50%] flex h-6 w-6 items-center justify-center rounded-full bg-background border border-[--border] shadow-sm text-text-secondary hover:text-text-primary"
  aria-label={collapsed ? 'Ouvrir le panneau' : 'Fermer le panneau'}
>
  {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
</button>
```

### Mobile Planning Toast

Prefer the client component extraction pattern to keep `map/[id]/page.tsx` as a server component:

```tsx
// apps/web/src/app/(app)/map/[id]/_components/planning-mobile-toast.tsx
'use client'
import { useEffect } from 'react'
import { toast } from 'sonner'

export function PlanningMobileToast() {
  useEffect(() => {
    if (window.innerWidth < 1024) {
      toast('Mode Planning optimisé pour desktop — certaines fonctionnalités sont réduites sur mobile', {
        duration: 6000,
      })
    }
  }, [])
  return null
}
```

Import in server page `map/[id]/page.tsx`:
```tsx
import { PlanningMobileToast } from './_components/planning-mobile-toast'
// In JSX: <PlanningMobileToast />
```

`sonner` `<Toaster>` is already mounted in `(app)/layout.tsx` — toasts will render automatically.

### "Quitter le live" Button Pattern

```tsx
// In live/[id]/page.tsx — add state
const [quitPending, setQuitPending] = useState(false)
const router = useRouter()

const handleQuitRequest = () => {
  if (quitPending) {
    // Second click = confirmed
    stopWatching()             // from useLiveMode — check exact name
    router.push('/adventures')
    return
  }
  setQuitPending(true)
  setTimeout(() => setQuitPending(false), 3000)
}
```

```tsx
// Button JSX — top-right z-40
<div className="absolute top-4 right-4 z-40">
  <button
    onClick={handleQuitRequest}
    className="inline-flex items-center gap-1.5 rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm hover:bg-background/90 border border-[--border]"
    data-testid="quit-live-btn"
  >
    {quitPending ? '✓ Confirmer ?' : '⏹ Quitter le live'}
  </button>
</div>
```

### useLiveMode Hook — Confirmed API

File: `apps/web/src/hooks/use-live-mode.ts`

The hook exposes: `isLiveModeActive`, `hasConsented`, `permissionDenied`, `startWatching`, **`stopWatching`**, `grantConsent`.

**`stopWatching` is already implemented** (line 39):
```typescript
const stopWatching = useCallback(() => {
  if (watchIdRef.current !== null) {
    navigator.geolocation.clearWatch(watchIdRef.current)
    watchIdRef.current = null
    useLiveStore.getState().deactivateLiveMode()
  }
}, [])
```

Use `stopWatching()` directly — no new code needed in the hook. Just destructure it from `useLiveMode()` and call it on quit confirmation.

### Design Tokens to Use

From Story 8.1 (all safe, all defined):
```
bg-background           → #FFFFFF — sidebar background
border-[--border]       → #D4E0DA — sidebar border-right
text-text-secondary     → #4D6E5A — collapse button icon
text-text-primary       → #1A2D22 — hover state
bg-background/80        → semi-transparent for floating buttons
```

**NEVER** use raw hex colors — always use CSS var tokens from `globals.css`.

### Tailwind v4 — Critical Reminder

No `tailwind.config.ts`. All tokens defined in `globals.css` `@theme inline`. Custom tokens (`bg-background-page`, etc.) used directly as Tailwind classes. The `w-[360px]` syntax works normally in v4.

### Routing Architecture (Confirmed in Story 8.2)

```
/adventures           → adventure list            (app)/adventures/
/adventures/:id       → adventure detail          (app)/adventures/[id]/
/map/:id              → planning mode             (app)/map/[id]/
/live/:id             → live mode                 (app)/live/[id]/
```

⚠️ **NOT** `/adventures/:id/map` or `/adventures/:id/live` — these routes do NOT exist. The correct routes are `/map/:id` and `/live/:id`. "← Aventures" back button → `/adventures` (not `/adventures/:id`).

### Coordination with Story 8.9 (App Header)

Story 8.9 (also `ready-for-dev`) will:
- Add `<AppHeader h-14>` to `(app)/layout.tsx`
- Hide header on live routes (`usePathname()` check)
- Require map page height adjustment

**If implementing 8.3 and 8.9 together (recommended):**
- Map page: `h-[calc(100dvh-3.5rem)]` (accounts for 56px = 3.5rem header)
- Live page: `h-dvh` (header hidden → full height)
- `(app)/layout.tsx`: add `<AppHeader />` + `<main className="flex-1 overflow-hidden">{children}</main>` pattern

**If implementing 8.3 alone (before 8.9):**
- Map page: keep `h-[calc(100vh-4rem)]` OR switch to `h-dvh` temporarily (no header yet)
- Add TODO comment for 8.9 coordination

### What NOT to Change

- `MapCanvas` component interface — no changes needed
- `usePois`, `useDensity`, `useMapStore` hooks — no changes
- `LayerToggles`, `SearchRangeSlider`, `WeatherControls` components — move their placement only, no internal changes
- `LiveControls` component (bottom sliders) — keep unchanged
- `GeolocationConsent` dialog — already implemented, no changes
- `queryKey: ['adventures', adventureId, 'map']` — must remain exact
- All existing tests — must not regress (run full suite after changes)

### Project Structure Notes

Files to modify:
- `apps/web/src/app/(app)/map/[id]/page.tsx` — height tweak + `<PlanningMobileToast />`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — sidebar layout restructure
- `apps/web/src/app/(app)/live/[id]/page.tsx` — remove ArrowLeft, add Quitter le live

Files to create:
- `apps/web/src/app/(app)/map/[id]/_components/planning-mobile-toast.tsx` — client component for toast
- `apps/web/src/app/(app)/map/[id]/_components/planning-sidebar.tsx` — optional but recommended extraction

No API changes. No new packages. `sonner` and all required icons (`ArrowLeft`, `ChevronLeft`, `ChevronRight`) are already installed.

### Testing Pattern

Follow established patterns from existing tests:
```typescript
// Standard mock pattern for this codebase
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => ({ id: 'adventure-123' }),
  usePathname: () => '/map/adventure-123',
}))
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return { ...actual, useQuery: vi.fn(), useQueries: vi.fn(), useMutation: vi.fn() }
})
```

Reference: `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx`

### References

- [Source: epics.md#Story 8.3, line 1187] — Acceptance criteria
- [Source: epics.md#Story 8.4, line 1221] — Filter panel spec (next story, affects sidebar content)
- [Source: _bmad-output/implementation-artifacts/8-2-adventures-list-page.md#Routing Architecture] — Confirmed URL structure
- [Source: _bmad-output/implementation-artifacts/8-9-app-header-global-navigation-bar.md#Task 3] — Header integration coordination
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx] — Current map view (sidebar migration source)
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx] — Current live page (ArrowLeft removal + Quitter button)
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx] — LiveControls (keep unchanged)
- [Source: apps/web/src/app/globals.css] — Design tokens (Story 8.1)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented two-column layout in `map-view.tsx`: `<aside>` (desktop sidebar, hidden on mobile) + `<div className="flex-1">` (map column)
- Sidebar collapse uses CSS `w-0 overflow-hidden` / `w-[360px]` transition — toggle button placed in map column, dynamically shifts from `-left-3` (expanded) to `left-0` (collapsed) to remain fully visible
- Moved `SearchRangeSlider`, `LayerToggles`, weather toggle + `WeatherControls` from absolute-positioned overlays into the sidebar; `StatusBanner`, `PoiDetailSheet`, `DensityLegend` stay in map column
- `{/* Sub-type chips — Story 8.4 */}` and `{/* Stages list — Epic 11 */}` placeholder comments added in sidebar
- "← Aventures" back button added at `z-40` in map column with `data-testid="back-to-adventures"`
- `PlanningMobileToast` extracted as a `'use client'` component — `map/[id]/page.tsx` stays a server component
- Map page height updated: `h-[calc(100vh-4rem)]` → `h-[calc(100dvh-3.5rem)]` with Story 8.9 coordination comment
- Removed `ArrowLeft` Link from live page; added "⏹ Quitter le live" button with 2-step confirm (3s timeout, `useRef` cleanup on unmount) + `stopWatching()` + `router.push('/adventures')`
- Added `next/navigation` mock to `map-view.test.tsx`; added `SearchRangeSlider` and `PoiDetailSheet` mocks with data-testids; extended `useMapStore` mock with `fromKm/toKm/setSearchRange`
- Extended `live/[id]/page.test.tsx`: updated `next/navigation` mock to include `useRouter`, replaced stale back-link test, added 4 new tests for Quitter le live (AC #5/#6)
- **Code review fixes (2026-03-20):** CSS conflict on aside fixed (`overflow-y-auto` now conditional); toggle button position fixed (`left-0` when collapsed); inner sidebar div no longer has hardcoded `w-[360px]`; `setTimeout` cleanup added via `quitTimerRef`; Epic 11 placeholder added; `PlanningMobileToast` test file created

### Review Follow-ups (AI)

- [x] [AI-Review][Medium] Fix `overflow-y-auto` + `overflow-hidden` CSS conflict on sidebar `aside` [map-view.tsx:140]
- [x] [AI-Review][Medium] Add test coverage for `PlanningMobileToast` (AC #1 untested) [planning-mobile-toast.test.tsx — created]
- [x] [AI-Review][Medium] Fix collapse toggle partially off-screen when sidebar collapsed [map-view.tsx:188]
- [ ] [AI-Review][Medium] Document or commit `apps/web/src/components/ui/logo.tsx` — untracked file not related to story 8.3
- [x] [AI-Review][Low] Add `clearTimeout` cleanup for `quitPending` setTimeout [live/page.tsx:45]
- [x] [AI-Review][Low] Add Epic 11 stages list placeholder comment in sidebar [map-view.tsx:178]
- [x] [AI-Review][Low] Remove hardcoded `w-[360px]` from inner sidebar div [map-view.tsx:144]

### File List

- `apps/web/src/app/(app)/map/[id]/page.tsx` — updated height + PlanningMobileToast import
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — sidebar layout rewrite + code review fixes
- `apps/web/src/app/(app)/map/[id]/_components/planning-mobile-toast.tsx` — new client component
- `apps/web/src/app/(app)/map/[id]/_components/planning-mobile-toast.test.tsx` — new test file (code review)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — removed ArrowLeft link, added Quitter le live button + clearTimeout fix
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — extended with 8 new Story 8.3 tests
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` — updated mock + 4 new Story 8.3 tests
