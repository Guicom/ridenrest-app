# Story 8.6: Accommodation Type Display Filters

Status: done

## Story

As a **cyclist user**,
I want to filter which accommodation sub-types are shown on the map,
so that I can hide shelter/refuge pins if I only care about hotels, for example.

## Acceptance Criteria

**AC1 — Planning sidebar: all chips displayed when accommodations active**

**Given** the 🏨 Hébergements layer is active in the Planning sidebar,
**When** the sub-type filter section renders,
**Then** chips are displayed for all 5 accommodation categories: Hôtel, Camping, Refuge/Abri, Auberge de jeunesse, Chambre d'hôte — all active by default.

**AC2 — Immediate map update on chip toggle**

**Given** the user deactivates a sub-type chip (e.g. Refuge/Abri),
**When** the chip is clicked,
**Then** pins of that sub-type disappear from the map immediately — no apply button needed; other accommodation pins remain.

**AC3 — Count badge for all sub-types**

**Given** accommodation POIs are loaded in the current search corridor,
**When** the sub-type chips render,
**Then** each chip displays its result count inline: `🏨 Hôtel (3)`, `⛺ Camping (0)`, etc. — sub-types with 0 results are greyed-out (`opacity-60`) but still tappable to pre-select for future searches. No count shown when data is not yet loaded.

**AC4 — Live mode: same sub-type chips in Filters drawer**

**Given** the user opens the Live mode "FILTERS" drawer,
**When** 🛏️ Hébergements layer is selected locally,
**Then** sub-type chips appear with the same `(0)` count badge behaviour — counts reflect the current live POI result set.

## Tasks / Subtasks

- [x] Task 1: Update `AccommodationSubTypes` component with count badge (AC1, AC2, AC3)
  - [x] 1.1 Add optional `accommodationPois?: Poi[]` prop
  - [x] 1.2 Compute per-sub-type counts from `accommodationPois`
  - [x] 1.3 When count = 0: render chip greyed-out + `(0)` text — regardless of active state
  - [x] 1.4 Keep chip tappable even when count = 0 (pre-select for future searches)
  - [x] 1.5 When `accommodationPois` is undefined/null (no data yet): render chips normally, no badge

- [x] Task 2: Thread `accommodationPois` down to `AccommodationSubTypes` — Planning mode (AC3)
  - [x] 2.1 Add `accommodationPois?: Poi[]` prop to `SearchRangeControl`
  - [x] 2.2 Pass it through to `<AccommodationSubTypes accommodationPois={accommodationPois} />`
  - [x] 2.3 In `MapView`, pass `poisByLayer.accommodations` to `<SearchRangeControl accommodationPois={poisByLayer.accommodations} />`

- [x] Task 3: Thread accommodation counts into `LiveFiltersDrawer` — Live mode (AC4)
  - [x] 3.1 Add `accommodationPois?: Poi[]` prop to `LiveFiltersDrawer`
  - [x] 3.2 In the sub-type chips section, compute counts from `accommodationPois` (same logic as planning)
  - [x] 3.3 In `live/[id]/page.tsx`, filter `pois` to accommodation categories and pass to `<LiveFiltersDrawer accommodationPois={...} />`

- [x] Task 4: Update tests (AC1, AC2, AC3)
  - [x] 4.1 `accommodation-sub-types.test.tsx`: add test for count badge rendering when `accommodationPois` provided
  - [x] 4.2 `accommodation-sub-types.test.tsx`: add test for greyed-out chip when count = 0
  - [x] 4.3 `accommodation-sub-types.test.tsx`: chip is still tappable when count = 0
  - [x] 4.4 `live-filters-drawer.test.tsx`: add test for count badge in live mode

## Dev Notes

### Critical Context: What Story 8.4 Already Built

Story 8.4 already implemented the **full store + filter + UI skeleton**. Story 8.6 is a targeted **enhancement** to add count badges and grey-out styling — do NOT rewrite the existing logic.

**Already in place — do NOT change:**
- `map.store.ts` — `activeAccommodationTypes: Set<PoiCategory>` + `toggleAccommodationType()` ✅
- `use-poi-layers.ts` — client-side filtering: `rawPois.filter((poi) => activeAccommodationTypes.has(poi.category))` ✅
- `accommodation-sub-types.tsx` — 5 chips, basic active/inactive style ✅
- `live-filters-drawer.tsx` — inline accommodation chips with local state committed on "Appliquer" ✅
- `search-range-control.tsx` — renders `<AccommodationSubTypes />` when `visibleLayers.has('accommodations')` ✅

### Implementation: Count Badge Logic

The `accommodationPois` prop should contain **all accommodation POIs** in the current corridor (before sub-type filtering). Count is computed client-side:

```typescript
// In AccommodationSubTypes — count computation
const countByType = accommodationPois
  ? accommodationPois.reduce<Record<string, number>>((acc, poi) => {
      acc[poi.category] = (acc[poi.category] ?? 0) + 1
      return acc
    }, {})
  : null

// Per chip:
const count = countByType ? (countByType[type] ?? 0) : null
const hasZeroResults = count !== null && count === 0
```

**Chip style when `hasZeroResults`:**
- Override to `bg-muted text-muted-foreground` (same as inactive) + `opacity-60`
- Append `(0)` to the label text — e.g. `⛺ Camping (0)`
- Keep `onClick` handler intact — still toggleable

### Planning Mode: Data Flow

```
MapView
  ├── poisByLayer = usePois(readySegments)   ← already exists
  └── <SearchRangeControl
        accommodationPois={poisByLayer.accommodations}   ← ADD THIS
        ...
      />
        └── <AccommodationSubTypes
              accommodationPois={accommodationPois}   ← PASS THROUGH
            />
```

`poisByLayer.accommodations` contains ALL accommodation POIs in the current `[fromKm, toKm]` corridor, before sub-type filtering — exactly the right dataset for counting.

### Live Mode: Data Flow

```
live/[id]/page.tsx
  ├── pois = useLivePoisSearch(segmentId).pois   ← already exists, all categories
  └── <LiveFiltersDrawer
        accommodationPois={pois.filter(p =>
          LAYER_CATEGORIES.accommodations.includes(p.category)
        )}   ← ADD THIS
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
      />
```

Import `LAYER_CATEGORIES` from `@ridenrest/shared` in live page (already imported in use-pois.ts, may not be in page.tsx).

In `LiveFiltersDrawer`, the chips already use `localAccTypes` for active state. The count badge uses `accommodationPois` from props (the current committed live result set) — this is intentional: counts show what's currently fetched, local state changes only apply after "Appliquer".

### TypeScript: Poi Import in AccommodationSubTypes

The component currently only imports `PoiCategory` from `@ridenrest/shared`. Add `Poi` to the import:
```typescript
import type { Poi, PoiCategory } from '@ridenrest/shared'
```

### TypeScript: LAYER_CATEGORIES in live/[id]/page.tsx

Check if `LAYER_CATEGORIES` is already imported in `live/[id]/page.tsx`. If not, add:
```typescript
import { LAYER_CATEGORIES } from '@ridenrest/shared'
```

Then compute accommodation pois once:
```typescript
const accommodationPois = pois.filter((p) =>
  (LAYER_CATEGORIES.accommodations as readonly string[]).includes(p.category)
)
```

### Greyed-Out Chip Design Decision

When `hasZeroResults = true`, the chip should look visually distinct **regardless** of whether `isActive` is true or false. This prevents confusion where a chip looks "active" (green) but has no pins to show. The chip remains tappable to allow pre-selecting types for when the user moves to a corridor where they exist.

Suggested implementation:
```tsx
className={[
  'text-xs px-2.5 py-1 rounded-full font-medium',
  hasZeroResults
    ? 'bg-muted text-muted-foreground border border-[--border] opacity-60'
    : isActive
      ? 'bg-primary text-primary-foreground border border-transparent'
      : 'bg-muted text-muted-foreground border border-[--border]',
].join(' ')}
```

### Project Structure Notes

**Files to modify (Planning mode):**
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx` — add prop + count badge
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — add `accommodationPois` prop + thread through
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — pass `poisByLayer.accommodations`

**Files to modify (Live mode):**
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — add prop + count badge logic
- `apps/web/src/app/(app)/live/[id]/page.tsx` — pass filtered accommodation pois

**Files to modify (Tests):**
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.test.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx`

### References

- Existing chips implementation: `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx`
- Store definition: `apps/web/src/stores/map.store.ts` (`activeAccommodationTypes`)
- Map-level filtering: `apps/web/src/hooks/use-poi-layers.ts:50-54`
- POI types: `packages/shared/src/types/poi.types.ts` — `PoiCategory`, `LAYER_CATEGORIES.accommodations`
- Live drawer: `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx`
- Live page: `apps/web/src/app/(app)/live/[id]/page.tsx` (pois from `useLivePoisSearch`)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- `AccommodationSubTypes` enhanced with optional `accommodationPois?: Poi[]` prop — counts computed via `reduce` into `countByType` record
- Count shown for ALL sub-types when data available: `🏨 Hôtel (3)`, `⛺ Camping (0)`, etc. — not just for zero results
- Chip style when `hasZeroResults`: `opacity-60` + `bg-muted text-muted-foreground` (grey regardless of active state)
- Chip remains tappable (onClick intact) when count = 0 — pre-select for future corridors
- No count shown when `accommodationPois` is `undefined` (data not yet loaded) — `countByType` is `null`
- `accCountByType` computed once per render in `LiveFiltersDrawer` body (not inside `.map()` loop)
- `LAYER_CATEGORIES` imported from `@ridenrest/shared` in `live/[id]/page.tsx` to filter pois before passing
- Pre-existing TS errors in `weather-layer.test.tsx` (lines 281, 301) not introduced by this story

### Review Follow-ups (AI) — Code Review 2026-03-22

- [x] [AI-Review][MEDIUM] M1+M2 — `ACCOMMODATION_SUB_TYPES` constant and `countByType` reduce logic were duplicated in `accommodation-sub-types.tsx` and `live-filters-drawer.tsx` — extracted `ACCOMMODATION_SUB_TYPES` (exported) and new `computeAccCountByType()` helper; `live-filters-drawer.tsx` now imports both via `@/app/(app)/map/[id]/_components/accommodation-sub-types`
- [x] [AI-Review][MEDIUM] M3 — `accommodationPois` filter in `live/[id]/page.tsx` was creating a new array on every render (GPS poll); wrapped in `useMemo([pois])`
- [x] [AI-Review][MEDIUM] L1 — `live-filters-drawer.test.tsx` was missing tests for greyed-out chip (`opacity-60` when count=0) and chip tappability when count=0 — added 2 tests
- [ ] [AI-Review][LOW] L2 — `aria-pressed` semantics mismatch when `hasZeroResults=true`: chip is visually grey but `aria-pressed` still reflects `isActive`. Consider `aria-pressed={!hasZeroResults && isActive}` or `aria-disabled` for zero-result chips [`accommodation-sub-types.tsx:41`, `live-filters-drawer.tsx:213`]
- [ ] [AI-Review][LOW] L3 — No test for `accommodationPois = []` (empty array) edge case — all chips would show `(0)` and go grey, distinct from `undefined` (no badges); untested in both test files

### File List

**Modified files:**
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx` — add `Poi` import, `accommodationPois` prop, count badge logic; export `ACCOMMODATION_SUB_TYPES` + `computeAccCountByType` (code review fix)
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.test.tsx` — 5 new tests (badge, greyed-out, tappable)
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — add `accommodationPois` prop, thread to `AccommodationSubTypes`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — pass `poisByLayer.accommodations` to `SearchRangeControl`
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — add `accommodationPois` prop, import shared constant+helper, count badge in sub-types section (code review: removed duplication)
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx` — 4 new tests (badge in live mode + 2 code review additions)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — import `LAYER_CATEGORIES`, memoized `accommodationPois` filter, pass to `LiveFiltersDrawer`
