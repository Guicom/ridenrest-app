# Story 16.23: Mobile Sidebar Toggle — Responsive Planning Mode

Status: done

## Story

As a **cyclist using the planning map on mobile or tablet**,
I want a visible toggle button on the left edge of the screen to open/close the sidebar,
so that I can access all planning tools (search, weather, density, stages) without needing a desktop screen.

## Acceptance Criteria

1. **Given** the user is on the planning map page on a viewport < `lg` breakpoint (< 1024px),
   **When** the page renders,
   **Then** a floating CTA button is visible on the left edge of the screen (vertically centered, z-index above map), with a `ChevronRight` icon indicating the sidebar can be opened.

2. **Given** the mobile toggle button is visible,
   **When** the user taps the button,
   **Then** the sidebar slides in from the left as a full-height overlay panel (width: 85vw, max 360px) over the map, with a semi-transparent backdrop. The toggle icon switches to `ChevronLeft`.

3. **Given** the sidebar overlay is open on mobile,
   **When** the user taps the backdrop area, taps the toggle button again, OR taps the close chevron inside the sidebar,
   **Then** the sidebar slides closed and the map is fully visible again.

4. **Given** the mobile sidebar overlay is open,
   **When** rendered,
   **Then** it contains all the same sections as the desktop sidebar: vitesse moyenne, search range, meteo, densite, etapes, density CTA — in the same order, fully scrollable.

5. **Given** the user is on a viewport >= `lg` breakpoint,
   **When** the page renders,
   **Then** the existing desktop sidebar behavior (inline, collapse/expand toggle on map edge) remains unchanged.

6. **Given** the mobile sidebar is open and the user triggers a POI search,
   **When** the search is committed,
   **Then** the sidebar auto-closes so the user can see the map results.

## Tasks / Subtasks

- [x] Task 1: Add `mobileOpen` state and refactor sidebar visibility (AC: #1, #2, #4, #5)
  - [x] 1.1 Add `const [mobileOpen, setMobileOpen] = useState(false)` in `MapView`
  - [x] 1.2 Refactor `<aside>` className: remove `hidden lg:flex`, replace with conditional classes that handle both mobile overlay and desktop inline modes
  - [x] 1.3 Desktop: keep existing `collapsed` state logic (`w-0 overflow-hidden` vs `w-[360px]`) with `hidden lg:flex`
  - [x] 1.4 Mobile: when `mobileOpen`, render as `fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[360px]` with `translate-x-0`; when closed, `translate-x-[-100%]` (or keep `hidden` on mobile when closed)

- [x] Task 2: Add mobile toggle button (AC: #1, #2)
  - [x] 2.1 Add a `<button>` with `lg:hidden` class, positioned `fixed left-0 top-1/2 -translate-y-1/2 z-40`
  - [x] 2.2 Icon: `ChevronRight` when closed, `ChevronLeft` when open
  - [x] 2.3 Style: `rounded-r-lg bg-background/90 backdrop-blur-sm border border-l-0 border-[--border] shadow-md px-1 py-3`
  - [x] 2.4 `onClick={() => setMobileOpen(v => !v)}`
  - [x] 2.5 `aria-label` dynamic: "Ouvrir le panneau" / "Fermer le panneau"

- [x] Task 3: Add backdrop overlay (AC: #3)
  - [x] 3.1 Render `<div>` when `mobileOpen` is true: `lg:hidden fixed inset-0 z-40 bg-black/30`
  - [x] 3.2 `onClick={() => setMobileOpen(false)}`
  - [x] 3.3 Add `transition-opacity duration-300` for smooth fade
  - [x] 3.4 Mobile toggle button inside sidebar wrapper (`translate-x-full` at right edge) — slides with the panel, visible both open and closed

- [x] Task 4: Add slide animation (AC: #2, #3)
  - [x] 4.1 Mobile sidebar: `transition-transform duration-300 ease-in-out`
  - [x] 4.2 Closed: `translate-x-[-100%]` or `-translate-x-full`
  - [x] 4.3 Open: `translate-x-0`

- [x] Task 5: Auto-close on search commit (AC: #6)
  - [x] 5.1 Add `useEffect` watching `searchCommitted`: when it becomes `true`, set `mobileOpen(false)`
  - [x] 5.2 Use ref pattern to detect transition (same as existing `prevSearchCommittedRef` pattern at line ~206)

- [x] Task 6: Write unit tests (AC: #1, #2, #3, #5, #6)
  - [x] 6.1 Test: on mobile viewport, toggle button is visible (`lg:hidden` — test via data-testid)
  - [x] 6.2 Test: clicking toggle opens sidebar (check `data-testid="mobile-sidebar"` is in DOM and visible)
  - [x] 6.3 Test: clicking backdrop closes sidebar
  - [x] 6.4 Test: desktop viewport — mobile toggle is not visible, desktop sidebar renders normally
  - [x] 6.5 Test: searchCommitted triggers auto-close

## Dev Notes

### Key File to Modify

| File | Action |
|---|---|
| `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` | Refactor sidebar + add mobile toggle + backdrop + auto-close |

No new files needed. All changes are contained in `map-view.tsx`.

### Existing Code Structure (Critical — Read Before Coding)

**Current sidebar (lines 282-375):**
```tsx
<aside
  data-testid="planning-sidebar"
  className={`hidden lg:flex flex-col shrink-0 bg-background border-r border-[--border] transition-all duration-200 ${
    collapsed ? 'w-0 overflow-hidden' : 'w-[360px] overflow-y-auto'
  }`}
>
  <div className="flex flex-col gap-4 p-4">
    {/* vitesse moyenne, SearchRangeControl, SidebarWeatherSection,
        SidebarDensitySection, SidebarStagesSection, SidebarDensityCta */}
  </div>
</aside>
```

**Current desktop toggle (lines 381-391):**
```tsx
<button
  data-testid="sidebar-toggle"
  onClick={() => setCollapsed((v) => !v)}
  className={`hidden lg:flex absolute top-1/2 z-20 ...`}
>
```

**States already in component:**
- `collapsed` (line 42) — desktop sidebar collapse. **DO NOT reuse for mobile.** Keep separate.
- `searchCommitted` — from `useMapStore()` (line 66). Use this for AC #6.

**Mobile corridor range pill (lines 522-528):**
```tsx
<div className="lg:hidden absolute bottom-0 left-0 right-0 z-20 ...">
```
This stays as-is — it's a separate mobile-only widget.

### Implementation Strategy

The cleanest approach is to **duplicate the `<aside>` rendering** — one for desktop (existing, `hidden lg:flex`), one for mobile (new, `lg:hidden`). This avoids complex className juggling and keeps the two modes cleanly separated.

**Approach:**
1. Keep the existing `<aside>` exactly as-is for desktop (`hidden lg:flex`)
2. Add a **new mobile `<aside>`** rendered via a portal or simply as a `fixed` overlay (`lg:hidden`) that **renders the same sidebar content**
3. Extract sidebar content into a local variable or fragment to avoid JSX duplication:

```tsx
const sidebarContent = (
  <div className="flex flex-col gap-4 p-4">
    {/* all existing sidebar sections — move from inline to variable */}
  </div>
)
```

Then render it in both:
```tsx
{/* Desktop sidebar */}
<aside className={`hidden lg:flex ... ${collapsed ? 'w-0 overflow-hidden' : 'w-[360px] overflow-y-auto'}`}>
  {sidebarContent}
</aside>

{/* Mobile sidebar overlay */}
<aside className={`lg:hidden fixed inset-y-0 left-0 z-50 w-[85vw] max-w-[360px] bg-background border-r border-[--border] overflow-y-auto transition-transform duration-300 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
  {sidebarContent}
</aside>
```

### z-index Layering

Existing z-indexes in map-view.tsx:
- `z-10`: pending/error banners
- `z-20`: sidebar toggle, corridor pill, no-results banner
- `z-30`: hover preview overlay
- `z-40`: back button ("Aventures")

**New z-indexes:**
- Mobile backdrop: `z-40` (same level as back button — backdrop covers everything)
- Mobile sidebar: `z-50` (above backdrop)
- Mobile toggle button: `z-40` when closed, but visually on the sidebar edge when open

### Anti-Patterns to Avoid

- **DO NOT use a media query hook** (e.g., `useMediaQuery`) — Tailwind responsive classes (`lg:hidden`, `hidden lg:flex`) handle this purely in CSS with zero JS overhead. No ResizeObserver needed.
- **DO NOT create a new component file** for the mobile sidebar — keep it inline in `map-view.tsx` to match the existing pattern.
- **DO NOT abstract a `<Sidebar>` wrapper component** — the sidebar content is already deeply coupled to `MapView` local state/props. Premature abstraction would require passing 15+ props.
- **DO NOT touch the `collapsed` state** — it's for desktop only. Add a separate `mobileOpen` state.
- **DO NOT add Zustand state** for `mobileOpen` — this is ephemeral UI state local to `MapView`, not shared across components. Use `useState`.
- **DO NOT use a Sheet/Drawer component from shadcn** — the sidebar is not a modal dialog; it's a slide-in panel. Using Sheet would add unnecessary complexity (focus trap, aria-modal, portal) for what is essentially a CSS transform toggle.
- **DO NOT move the sidebar content to a separate file** — it depends on too many local variables from `MapView`. Keep the extracted JSX as a local variable (`sidebarContent`).

### Existing Patterns to Follow

- **Toggle button style** — match the existing desktop toggle at line 382: `rounded-full bg-background border border-[--border] shadow-sm`. For mobile, use `rounded-r-lg` since it's flush against the left edge.
- **Transition style** — `transition-all duration-200` is used on the desktop sidebar. For mobile slide, use `transition-transform duration-300` for a slightly slower, smoother feel.
- **`data-testid` convention** — existing: `"planning-sidebar"`, `"sidebar-toggle"`. Add: `"mobile-sidebar-toggle"`, `"mobile-sidebar-backdrop"`.
- **Auto-close pattern** — follow the `prevSearchCommittedRef` pattern already at lines 206-228 for detecting `searchCommitted` transitions.

### Testing Notes

- **Vitest + React Testing Library** — co-located test file `map-view.test.tsx` already exists (line reference from glob results).
- Mock `useMapStore` to control `searchCommitted`.
- Testing responsive visibility (`lg:hidden`) is tricky in JSDOM — test via `data-testid` presence and state-based rendering rather than CSS media queries.
- The auto-close effect (AC #6) can be tested by updating the mocked `searchCommitted` value and asserting `mobileOpen` changes.

### Project Structure Notes

- All changes in `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — follows Next.js App Router co-location pattern per project-context.md.
- No new packages, APIs, or database changes required.
- No NestJS changes.
- Fully contained in the web app frontend.
- Icons `ChevronLeft`, `ChevronRight` already imported at line 5.

### References

- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:42] — `collapsed` state (desktop only)
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:66] — `searchCommitted` from Zustand
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:282-375] — current desktop sidebar block
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:381-391] — current desktop toggle
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:522-528] — mobile corridor pill (keep as-is)
- [Source: apps/web/src/stores/map.store.ts:47] — `setSearchCommitted` action
- [Source: _bmad-output/project-context.md#Technology Stack] — Tailwind CSS v4, shadcn/ui, MapLibre GL JS v4
- [Source: _bmad-output/planning-artifacts/epics.md#Story 16.23] — Epic definition

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — no debug issues encountered.

### Completion Notes List
- Mobile toggle button inside a wrapper div that slides with the sidebar — positioned at right edge (`translate-x-full`), visible in both open and closed states
- Extracted sidebar content into `sidebarContent` local variable to avoid JSX duplication between desktop and mobile sidebars
- Desktop sidebar (`planning-sidebar`) unchanged — still `hidden lg:flex` with `collapsed` state
- Desktop toggle button restyled to match mobile toggle: `rounded-r-lg bg-background/90 backdrop-blur-sm shadow-md` (was `rounded-full h-6 w-6`)
- Mobile sidebar (`mobile-sidebar`) rendered as `lg:hidden fixed` overlay with `-translate-x-full` ↔ `translate-x-0` slide animation
- Backdrop (`mobile-sidebar-backdrop`) conditionally rendered when `mobileOpen` is true, closes sidebar on click
- Auto-close on `searchCommitted` via `prevSearchCommittedMobileRef` pattern (same as existing auto-zoom pattern)
- 9 new tests added to existing `map-view.test.tsx` covering AC #1-#6
- Updated 5 existing tests to use `within()` from RTL due to duplicate testids from sidebarContent rendered in both sidebars
- All 847 tests pass, 0 regressions

### Change Log
- 2026-04-06: Implemented mobile sidebar toggle — Story 16.23 complete
- 2026-04-06: Unified toggle button style — desktop toggle restyled to match mobile (rounded-r-lg, backdrop-blur)
- 2026-04-06: Code review fixes — backdrop fade animation (opacity toggle instead of mount/unmount), `-left-0` → `left-0`, Escape key closes mobile sidebar, +1 test

### File List
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — Modified: added mobileOpen state, extracted sidebarContent, added mobile sidebar overlay + toggle + backdrop + auto-close effect
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — Modified: added 8 tests for Story 16.23, updated 5 existing tests for duplicate testid handling
