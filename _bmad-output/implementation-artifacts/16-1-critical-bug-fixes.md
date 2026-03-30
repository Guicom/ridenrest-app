# Story 16.1: Critical Bug Fixes

Status: done

## Story

As a **user on mobile or desktop**,
I want all critical UI bugs fixed,
So that the core workflow functions correctly without workarounds.

## Acceptance Criteria

1. **Mobile adventure card buttons always visible** — On mobile (< 1024px), the action buttons (Planning, Live, Modifier) on adventure cards are displayed without requiring any tap or hover interaction. The buttons are always rendered as part of the card layout.

2. **POI search is manually triggered** — On the Planning map, the POI/hotel search does NOT fire automatically when the page loads, when the km range changes, or when a layer is toggled. Search only executes when the user explicitly clicks the "Rechercher" button. The search button is visually distinct (primary CTA, enabled once a range is set).

3. **Wind arrows visibly larger** — Wind direction arrows rendered in the weather layer are 2× to 3× larger than the current sizes at equivalent wind speeds. New interpolation: `[0→16, 20→24, 40→36, 60→48]` (was `[0→8, 20→12, 40→18, 60→24]`). Arrows remain readable and do not overlap excessively at standard zoom levels.

4. **Overpass opt-in setting** — A toggle in the Settings page allows the user to enable Overpass API as an additional POI source. The toggle is **disabled by default**. When enabled, the UI clearly warns that searches will be slower but more complete (especially for camping/shelter categories). The setting is persisted in the user's profile (`profiles` table, `overpass_enabled boolean DEFAULT false`).

## Tasks / Subtasks

- [x] **Task 1 — Fix mobile adventure card buttons always visible** (AC: #1)
  - [x] 1.1 — In `adventure-card.tsx`: remove the `{isSelected && ...}` condition around the mobile button block. The mobile buttons (`className="block lg:hidden"`) should render unconditionally — always visible on mobile without requiring a tap.
  - [x] 1.2 — Remove the outer `isSelected` guard (`{isSelected && (...)}`). The desktop buttons already use `hidden lg:flex` correctly; apply the same logic for mobile: `block lg:hidden`, no condition.
  - [x] 1.3 — If keeping selection highlight for navigation, retain `isSelected` only for the ring highlight on the card container (already present: `ring-2 ring-[--primary]`).
  - [x] 1.4 — Update `adventure-list.test.tsx` if any test asserts that mobile buttons are hidden by default.

- [x] **Task 2 — Gate POI search behind explicit trigger** (AC: #2)
  - [x] 2.1 — Add `searchCommitted: boolean` + `setSearchCommitted: (v: boolean) => void` to `useMapStore` (`apps/web/src/stores/map.store.ts`). Default: `false`. Reset to `false` whenever `setSearchRange` is called (slider move resets the gate).
  - [x] 2.2 — In `use-pois.ts`: gate the `segmentRanges` computation behind `searchCommitted` — when `false`, return empty `segmentRanges` (no queries fired). Same pattern as the existing `isSliding` guard.
  - [x] 2.3 — In `search-range-control.tsx` (or `map-view.tsx`): add a "Rechercher" primary button that calls `setSearchCommitted(true)` when clicked. The button should be visible in the search panel and enabled whenever a valid range is set (`fromKm < toKm`).
  - [x] 2.4 — Button label is always "Rechercher" (label "Mettre à jour" removed — UX decision, label unique plus clair).
  - [x] 2.5 — Preserve `searchRangeInteracted` for corridor highlight and weather panel show/hide (it currently gates `{searchRangeInteracted && <WeatherSection>}` at `map-view.tsx:356` and the MapCanvas corridor highlight). Do NOT remove or alter this flag.
  - [x] 2.6 — Update `use-pois.test.ts` to assert that queries do NOT fire when `searchCommitted = false`, and DO fire after `setSearchCommitted(true)`.

- [x] **Task 3 — Increase wind arrow sizes 2-3×** (AC: #3)
  - [x] 3.1 — In `weather-layer.tsx` (line ~149), change the `text-size` interpolation expression:
    ```
    // Before:
    ['interpolate', ['linear'], ['coalesce', ['get', 'windSpeedKmh'], 0],
      0,  8,   // calm
      20, 12,  // light breeze
      40, 18,  // strong breeze
      60, 24,  // storm
    ]
    // After:
    ['interpolate', ['linear'], ['coalesce', ['get', 'windSpeedKmh'], 0],
      0,  16,  // calm
      20, 24,  // light breeze
      40, 36,  // strong breeze
      60, 48,  // storm
    ]
    ```
  - [x] 3.2 — Visually verify in the browser that arrows are clearly visible at standard zoom levels without causing excessive overlap. Adjust upper bound (48) up or down ±6 if needed after visual check.
  - [x] 3.3 — No test changes required for this subtask (purely visual MapLibre paint property).

- [x] **Task 5 — Fix: reset `searchCommitted` on SPA navigation** (AC: #2 — regression)
  - [x] 5.1 — In `map-view.tsx`, add `setSearchCommitted(false)` to the cleanup `useEffect` that runs on unmount (alongside the existing `setWeatherActive(false)` and `setSelectedStageId(null)`). This prevents auto-search when the user navigates away and returns to the map within the same SPA session (Zustand store persists across client-side navigations).

- [x] **Task 6 — Overpass opt-in setting** (AC: #4)
  - [x] 6.1 — Add `overpass_enabled boolean DEFAULT false` column to the `profiles` table (Drizzle migration in `packages/database/`).
  - [x] 6.2 — Expose `overpassEnabled: boolean` in the profile API response (`GET /profile`). New NestJS `profile` module with `GET /api/profile` + `PATCH /api/profile`.
  - [x] 6.3 — Settings page: added `OverpassToggle` client component with label "Recherche étendue (Overpass)" and description. Persisted via `updateOverpassEnabled` server action (direct DB write).
  - [x] 6.4 — `getProfile()` in `api-client.ts`, `useProfile()` hook, `use-pois.ts` passes `overpassEnabled` in query params via `getPois()`. `use-live-poi-search.ts` also passes `overpassEnabled` via `getLivePois()`.
  - [x] 6.5 — `PoisService.findPois()` gates Overpass+Redis in **both planning and live mode** behind `dto.overpassEnabled`. When `false`, returns DB cache directly without Redis check or Overpass call.
  - [x] 6.6 — TQ query keys updated to include `overpassEnabled`: planning `['pois', { segmentId, fromKm, toKm, layer, overpassEnabled }]`, live `['pois', 'live', { segmentId, targetKm, radiusKm, overpassEnabled }]`.
  - [x] 6.7 — 2 tests added to `pois.service.test.ts`: skips Overpass when `overpassEnabled=false`, calls Overpass when `true`. Live mode `liveDto` updated with `overpassEnabled: true`.

- [x] **Task 4 — Tests** (AC: all)
  - [x] 4.1 — Run all tests: `pnpm turbo test` — all must pass.
  - [x] 4.2 — Update any snapshot or assertion that asserts the old behavior for mobile card buttons or POI search triggering.

## Review Follow-ups (AI)

- [x] **[AI-Review][HIGH]** `MAX_RANGE_KM = 50` → UI permet 50km mais l'API rejette > 30km (HTTP 400 silencieux). Fix appliqué: `const MAX_RANGE_KM = MAX_SEARCH_RANGE_KM` importé depuis `@ridenrest/shared`. [`search-range-control.tsx:10`]
- [x] **[AI-Review][HIGH]** Cache `useProfile()` non invalidé après toggle Overpass → `overpassEnabled` périmé jusqu'à 5min sur la carte. Fix appliqué: `queryClient.invalidateQueries({ queryKey: ['profile'] })` dans `OverpassToggle.handleToggle`. [`overpass-toggle.tsx`]
- [x] **[AI-Review][MEDIUM]** `UpdateProfileDto` défini inline dans le controller — violate la convention NestJS. Déplacé vers `apps/api/src/profile/dto/update-profile.dto.ts`. [`profile.controller.ts:8`]
- [x] **[AI-Review][MEDIUM]** `updateProfile()` dans `api-client.ts` est du dead code — supprimé. [`api-client.ts:198`]
- [x] **[AI-Review][MEDIUM]** `map.store.test.ts:6` — `beforeEach` ne reset pas tous les champs. Utilise maintenant `setState({...}, true)` (replace mode) avec tous les champs. [`map.store.test.ts:6`]
- [x] **[AI-Review][LOW]** `ProfileService.updateOverpassEnabled` retourne maintenant `getProfile(userId)` (lecture DB). [`profile.service.ts:18`]
- [x] **[AI-Review][LOW]** `updateOverpassEnabled` server action — `revalidatePath('/settings')` ajouté. [`actions.ts:10`]

## Dev Notes

### Bug 1: Mobile Adventure Card Buttons

**File:** `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx`

The current implementation shows mobile buttons only when `isSelected` is true (line 59: `{isSelected && (...)`). This requires the user to tap a card first to reveal the buttons.

**Fix:** Remove the `isSelected` guard around the mobile button block. The mobile button block (`className="block lg:hidden"`) should always render. The `isSelected` state can still be used for the card ring highlight — just not for button visibility.

```tsx
// BEFORE (line 58-88):
{/* Mobile action rows — < 1024px, visible only when card is selected */}
{isSelected && (
  <div className="block lg:hidden mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
    ...
  </div>
)}

// AFTER:
{/* Mobile action rows — < 1024px, always visible */}
<div className="block lg:hidden mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
  ...
</div>
```

### Bug 2: Auto-triggered POI Search

**Files:**
- `apps/web/src/stores/map.store.ts` — add `searchCommitted` state
- `apps/web/src/hooks/use-pois.ts` — gate queries on `searchCommitted`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — add "Rechercher" button

**Root cause:** `use-pois.ts` fires TanStack Query calls reactively as soon as `debouncedFromKm`/`debouncedToKm` settle (400ms debounce). There is no explicit user-triggered gate.

**Existing `searchRangeInteracted`** (in `map.store.ts:19`, `map.store.ts:80`) gates the corridor highlight on the map and the weather panel visibility — do NOT remove or change this. It is NOT a search gate.

**Fix pattern:**
```typescript
// map.store.ts — add to MapState interface:
searchCommitted: boolean
setSearchCommitted: (v: boolean) => void

// map.store.ts — add to initial state:
searchCommitted: false,

// map.store.ts — reset on range change:
setSearchRange: (fromKm, toKm) => set({
  fromKm, toKm,
  searchRangeInteracted: true,
  searchCommitted: false,  // ← reset gate when range changes
}),

// map.store.ts — add action:
setSearchCommitted: (v) => set({ searchCommitted: v }),
```

```typescript
// use-pois.ts — gate segmentRanges:
const { visibleLayers, fromKm: storeFromKm, toKm: storeToKm, searchCommitted } = useMapStore()
// ...
const segmentRanges = (isSliding || !searchCommitted) ? [] : readySegments.flatMap(...)
```

The "Rechercher" button in `search-range-control.tsx` must:
- Call `setSearchCommitted(true)` on click
- Be a primary CTA (e.g., `bg-[var(--primary)] text-white`)
- Be enabled only when `toKm > fromKm` and at least one segment is ready

### Bug 3: Wind Arrow Size

**File:** `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx`, lines ~149-154

MapLibre `text-size` property in the wind arrows symbol layer. Current interpolation produces arrows that are too small (8-24px). Doubling the values to 16-48px makes them clearly visible.

The `→` glyph used for wind arrows benefits from larger sizes — at 8px it's essentially invisible at normal screen resolution.

**No impact on `text-halo-width`** (stays at 1) — just the size interpolation values.

### Project Structure Notes

- `adventure-card.tsx` lives in `apps/web/src/app/(app)/adventures/_components/` — not in `_components` for a specific adventure
- `use-pois.ts` lives in `apps/web/src/hooks/` — shared hook
- `map.store.ts` lives in `apps/web/src/stores/map.store.ts` — Zustand store, flat structure per project conventions
- `weather-layer.tsx` lives in `apps/web/src/app/(app)/map/[id]/_components/`
- `search-range-control.tsx` lives in `apps/web/src/app/(app)/map/[id]/_components/` — likely where the "Rechercher" button will be added

### Zustand Store Convention (project-context.md)
- Naming: `use{Domain}Store`
- File: `stores/{domain}.store.ts`
- Structure: flat (no deep nesting)
- Actions: imperative verbs → `setSearchCommitted()`

### TanStack Query Key Convention (project-context.md)
```typescript
['pois', { segmentId, fromKm, toKm, layer }]  // per-layer — stable cache entry per layer
```
Already followed in `use-pois.ts` — do not change key structure.

### Testing Standards (project-context.md)
- `apps/web`: Vitest
- Co-located tests: `use-pois.test.ts`, `adventure-list.test.tsx`
- Run via Turborepo: `pnpm turbo test`

### Bug 2b: searchCommitted SPA Persistence (regression fix)

**Root cause:** Zustand stores are module-level singletons that survive client-side navigations in Next.js App Router. When the user commits a search (`searchCommitted = true`) and then navigates to `/adventures` and returns to `/map/[id]`, `searchCommitted` is still `true` — POI queries fire immediately on mount without user action.

**Fix:** Add `setSearchCommitted(false)` to the unmount cleanup in `map-view.tsx`:
```typescript
useEffect(() => {
  return () => {
    setWeatherActive(false)
    setSelectedStageId(null)
    setSearchCommitted(false)  // ← prevents auto-search on return navigation
  }
}, [setWeatherActive, setSelectedStageId, setSearchCommitted])
```

### Overpass Opt-in Feature (AC #4)

**Context:** Overpass queries are slow (5-25s depending on instance load) and the user base may not need the extra completeness for every search. By making it opt-in, the default experience is fast (DB cache only / Google Places), while users who need camping/shelter coverage can enable it explicitly.

**Architecture:** The `overpassEnabled` flag flows top-to-bottom:
```
profiles.overpass_enabled (DB) → /profile API → useProfile() hook → usePois() → getPois(overpassEnabled) → PoisService.findPois(overpassEnabled)
```

**Query key:** Must include `overpassEnabled` to avoid serving Overpass-less cache to users who have enabled it:
```typescript
['pois', { segmentId, fromKm, toKm, layer, overpassEnabled }]
```

**Settings page:** The setting lives in the user's profile (server-persisted), not localStorage — allows sync across devices.

### References

- `adventure-card.tsx` mobile button guard: `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx:59`
- `use-pois.ts` search auto-trigger: `apps/web/src/hooks/use-pois.ts:41` (`segmentRanges` computation)
- `map.store.ts` `searchRangeInteracted`: `apps/web/src/stores/map.store.ts:19,57,80` — keep for corridor/weather, add `searchCommitted` alongside
- `weather-layer.tsx` wind arrow size: `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx:149-154`
- `map-view.tsx` weather panel gate: `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:356` — uses `searchRangeInteracted` (keep unchanged)
- Architecture conventions: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- **Bug 1 (AC #1):** Removed `{isSelected && ...}` guard in `adventure-card.tsx` — mobile button block now renders unconditionally. `isSelected` retained only for ring highlight on card container. Updated `adventure-list.test.tsx`: 2 tests rewritten to assert always-visible behavior; `getAllByText()` used for Planning/Modifier (2 instances in DOM now).
- **Bug 2 (AC #2):** Added `searchCommitted: boolean` + `setSearchCommitted()` to `useMapStore`. `setSearchRange` resets `searchCommitted: false` on slider move. `setSearchCommitted(true)` also sets `searchRangeInteracted: true` for corridor/weather panel gate compatibility. `use-pois.ts` gates `segmentRanges` behind `!searchCommitted`. `isPending` ne reflète que les vraies requêtes HTTP en vol (pas le sliding). Bouton "Rechercher" toujours avec ce label (label "Mettre à jour" abandonné). `use-pois.test.ts` + `map.store.test.ts` updated with new assertions.
- **Bug 3 (AC #3):** Updated `text-size` interpolation in `weather-layer.tsx` from `[0→8, 20→12, 40→18, 60→24]` to `[0→16, 20→24, 40→36, 60→48]` — 2× increase. Updated `weather-layer.test.tsx` to expect new values.
- **Task 6 (AC #4):** Added `overpass_enabled boolean DEFAULT false` to `profiles` schema + migration `0008_add_overpass_enabled.sql`. New NestJS `profile` module (`GET /api/profile`, `PATCH /api/profile`). Settings page has `OverpassToggle` client component (label: "Recherche étendue (Overpass)") persisted via server action. `useProfile()` hook + `getProfile()` API client. Gate applies to **both planning and live mode**: `use-pois.ts` and `use-live-poi-search.ts` both read `overpassEnabled` and include it in their TQ query keys. `PoisService.findPois()` (corridor + live) early-returns DB cache (skipping Redis+Overpass) when `overpassEnabled=false`. Tests updated.
- **Tests:** All tests pass (202 API + 618 web tests), 0 failures.

### File List

- `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx`
- `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx`
- `apps/web/src/stores/map.store.ts`
- `apps/web/src/stores/map.store.test.ts`
- `apps/web/src/hooks/use-pois.ts`
- `apps/web/src/hooks/use-pois.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.test.tsx`
- `packages/database/src/schema/profiles.ts`
- `packages/database/migrations/0008_add_overpass_enabled.sql`
- `apps/api/src/profile/profile.module.ts`
- `apps/api/src/profile/profile.controller.ts`
- `apps/api/src/profile/profile.service.ts`
- `apps/api/src/profile/profile.repository.ts`
- `apps/api/src/profile/dto/update-profile.dto.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/pois/dto/find-pois.dto.ts`
- `apps/api/src/pois/pois.service.ts`
- `apps/api/src/pois/pois.service.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/hooks/use-profile.ts`
- `apps/web/src/hooks/use-pois.ts`
- `apps/web/src/hooks/use-pois.test.ts`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/settings/actions.ts`
- `apps/web/src/app/(app)/settings/_components/overpass-toggle.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx`
- `apps/web/src/hooks/use-live-poi-search.ts`
- `apps/web/src/hooks/use-live-poi-search.test.ts`
