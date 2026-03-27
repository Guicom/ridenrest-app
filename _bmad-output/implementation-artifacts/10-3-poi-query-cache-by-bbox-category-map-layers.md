# Story 10.3: POI Query Cache by BBox + Category (Map Layer Requests)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user browsing the map**,
I want POI layer data to be served from cache when I toggle a layer on a corridor I already searched,
so that repeated layer toggles and re-visits to the same area are instantaneous — no redundant Overpass calls.

## Acceptance Criteria

1. **Given** a user has already searched accommodations on a corridor,
   **When** they toggle the accommodation layer off and back on,
   **Then** the second `GET /pois` request is served from Redis cache in <200ms — no Overpass API call made.

2. **Given** the geographic key migration (Story 10.1) is applied to `GET /pois`,
   **When** the POI cache key is constructed,
   **Then** the key is `pois:bbox:{rounded_bbox}:{sorted_categories}` — segment-agnostic, reusable across users and adventures.

3. **Given** lat/lng values are used to compute the cache key,
   **When** the bbox is computed,
   **Then** values are rounded to 3 decimal places (`Math.round(val * 1000) / 1000`) — prevents cache fragmentation from floating-point precision differences.

## Tasks / Subtasks

- [x] Task 1: Refactor `use-pois.ts` to per-layer queries (AC: 1, 2)
  - [x] 1.1 Change query generation: instead of one query per segment with ALL active categories combined, generate **one query per active layer per segment** — `visibleLayers` drives the outer iteration
  - [x] 1.2 Each query's `categories` param = `LAYER_CATEGORIES[layer]` (the specific categories for that single layer), NOT the union of all layers
  - [x] 1.3 Update `queryKey` to use `layer` as discriminator: `['pois', { segmentId, fromKm, toKm, layer }]` — stable per-layer cache entry in TanStack Query
  - [x] 1.4 The `queryFn` still calls `getPois({ segmentId, fromKm, toKm, categories: LAYER_CATEGORIES[layer] })`
  - [x] 1.5 Keep `isEnabled` logic unchanged (no sliding, readySegments > 0, visibleLayers.size > 0)

- [x] Task 2: Fix `staleTime` magic number (AC: 1)
  - [x] 2.1 Import `POI_BBOX_CACHE_TTL` from `@ridenrest/shared` in `use-pois.ts`
  - [x] 2.2 Replace `staleTime: 1000 * 60 * 60 * 24` with `staleTime: POI_BBOX_CACHE_TTL * 1000` — aligns TanStack Query client cache with Redis TTL (30 days)

- [x] Task 3: Update `use-pois.test.ts` (AC: 1, 2)
  - [x] 3.1 Update test "fires queries when visibleLayers has active layers": verify there is now **one query per active layer** (not one combined query) — e.g., `visibleLayers = Set(['accommodations', 'restaurants'])` → 2 queries for 1 segment
  - [x] 3.2 Update test "computes correct segLocalFrom/segLocalTo": verify query key uses `layer` field, not `categories` array
  - [x] 3.3 Update test "fires queries for multiple segments": adjust expected query count (numSegments × numActiveLayers)
  - [x] 3.4 Update test "groups returned POIs by layer": mock two queries (one per layer) and verify correct grouping
  - [x] 3.5 Add new test: "toggling one layer does not invalidate other layer's query key" — assert that query keys for different layers are independent (different `layer` values = different query keys)
  - [x] 3.6 Verify `staleTime` assertion: expected value is `POI_BBOX_CACHE_TTL * 1000` (2592000000)

- [x] Task 4: Update project-context.md TanStack Query key convention (AC: 2)
  - [x] 4.1 In `_bmad-output/project-context.md`, update the `['pois', { segmentId, fromKm, toKm }]` line to `['pois', { segmentId, fromKm, toKm, layer }]` — reflect per-layer query key pattern

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Add test: segment with `parseStatus !== 'done'` is excluded from queries — `readySegments.filter` path untested [use-pois.test.ts]
- [ ] [AI-Review][LOW] ACs 2 and 3 describe backend cache key format (bbox rounding, sorted categories) — implemented in Stories 10.1/10.2; confirm backend tests cover them or add integration test reference
- [ ] [AI-Review][LOW] `vi.useRealTimers()` duplicated in debounce test body (line 316) and `afterEach` — remove redundant call [use-pois.test.ts:316]

## Dev Notes

### Context: What Changed and Why

**Stories 10.1 + 10.2 already implemented the backend cache mechanism:**
- `pois.service.ts` uses geographic bbox cache key: `pois:bbox:{round3(minLat)}:{round3(minLng)}:{round3(maxLat)}:{round3(maxLng)}:{sortedCategories}` ✅
- TTL: `POI_BBOX_CACHE_TTL` = 30 days ✅
- Cross-user sharing via bbox ✅
- Both corridor mode and live mode ✅

**What story 10.3 fixes (frontend layer query efficiency):**

Current `use-pois.ts` generates **one query per segment** that combines ALL active layer categories:
```typescript
// CURRENT — problematic: all active categories combined in one query
const activeCategories = [...visibleLayers].flatMap(layer => LAYER_CATEGORIES[layer] ?? [])
// → queryKey: ['pois', { segmentId, fromKm, toKm, categories: ['hotel','hostel','restaurant','supermarket'] }]
// → when user adds 'bike' layer, new query key → new API call → ALL layers re-fetched
```

Target `use-pois.ts` generates **one query per active layer per segment**:
```typescript
// TARGET — efficient: each layer independently cached
// Layer 'accommodations' → queryKey: ['pois', { segmentId, fromKm, toKm, layer: 'accommodations' }]
// Layer 'restaurants'    → queryKey: ['pois', { segmentId, fromKm, toKm, layer: 'restaurants' }]
// Toggling 'bike' on/off does NOT invalidate 'accommodations' TanStack Query cache entry
```

**Why per-layer matters:**
- User has accommodations loaded → turns on restaurants → current: ONE new query with combined categories → invalidates the accommodations TQ cache
- With per-layer: two independent TQ queries, each with `staleTime: POI_BBOX_CACHE_TTL * 1000` (30 days)
- Layer toggles only affect their own query, never others
- TanStack Query HIT = no API call at all (the fastest path)
- If TQ staleTime expired → API call → backend Redis HIT (<200ms, no Overpass call)

### Query Count Impact

| Scenario | Current queries | Per-layer queries |
|----------|----------------|-------------------|
| 1 segment, 1 active layer | 1 | 1 |
| 1 segment, 2 active layers | 1 | 2 |
| 2 segments, 3 active layers | 2 | 6 |

The increase in requests is **only for the initial load** (TQ MISS). Subsequent layer toggles → TQ HIT (0 requests). This is the correct tradeoff: more granular caching = fewer total API calls over time.

### Backend Cache Key — Already Correct

The backend `pois.service.ts` already handles per-layer category requests efficiently:
```typescript
// In pois.service.ts (already implemented in 10.1+10.2):
const sortedCategories = [...activeCategories].sort().join(',')
const cacheKey = `pois:bbox:${round3(minLat)}:${round3(minLng)}:${round3(maxLat)}:${round3(maxLng)}:${sortedCategories}`
// When frontend sends categories for 'accommodations' layer: 'camp_site,guesthouse,hostel,hotel,shelter'
// → stable Redis key, cross-user shared, 30d TTL
```

**No backend changes needed.** The backend is already optimized; this story is a pure frontend improvement.

### `use-pois.ts` — Before / After

**BEFORE (current):**
```typescript
const activeCategories = [...visibleLayers].flatMap(
  (layer) => LAYER_CATEGORIES[layer] ?? [],
)

const segmentQueries = isSliding ? [] : readySegments.flatMap((segment) => {
  // ...km overlap calculation...
  return [{
    segment,
    segLocalFrom: Math.round(segLocalFrom * 10) / 10,
    segLocalTo: Math.round(segLocalTo * 10) / 10,
  }]
})

const queries = segmentQueries.map(({ segment, segLocalFrom, segLocalTo }) => ({
  queryKey: ['pois', {
    segmentId: segment.id,
    fromKm: segLocalFrom,
    toKm: segLocalTo,
    categories: [...activeCategories].sort(),
  }] as const,
  queryFn: () => getPois({
    segmentId: segment.id,
    fromKm: segLocalFrom,
    toKm: segLocalTo,
    categories: activeCategories,
  }),
  enabled: isEnabled,
  staleTime: 1000 * 60 * 60 * 24,  // ← magic number, 24h
}))
```

**AFTER (target):**
```typescript
import { POI_BBOX_CACHE_TTL, LAYER_CATEGORIES } from '@ridenrest/shared'
// Note: LAYER_CATEGORIES is already imported

const activeLayers = [...visibleLayers] as MapLayer[]

// km overlap helper (extract to keep map clean — same logic as before)
const segmentRanges = isSliding ? [] : readySegments.flatMap((segment) => {
  // ...exact same km overlap calculation as before...
  return [{
    segment,
    segLocalFrom: Math.round(segLocalFrom * 10) / 10,
    segLocalTo: Math.round(segLocalTo * 10) / 10,
  }]
})

// Per-layer × per-segment queries
const queries = segmentRanges.flatMap(({ segment, segLocalFrom, segLocalTo }) =>
  activeLayers.map((layer) => ({
    queryKey: ['pois', {
      segmentId: segment.id,
      fromKm: segLocalFrom,
      toKm: segLocalTo,
      layer,
    }] as const,
    queryFn: () => getPois({
      segmentId: segment.id,
      fromKm: segLocalFrom,
      toKm: segLocalTo,
      categories: LAYER_CATEGORIES[layer] ?? [],
    }),
    enabled: isEnabled,
    staleTime: POI_BBOX_CACHE_TTL * 1000,  // ← 30 days, aligned with Redis TTL
  })),
)
```

### `use-pois.ts` — POI Grouping (unchanged)

The `allPois` aggregation and `CATEGORY_TO_LAYER` grouping at the end of the hook remain unchanged — they already work correctly regardless of how many queries produced the POIs:
```typescript
const allPois = results.flatMap((r) => r.data ?? [])
// Then group by CATEGORY_TO_LAYER — unchanged
```

### TanStack Query Key Convention Update

The `project-context.md` currently shows:
```typescript
['pois', { segmentId, fromKm, toKm }]      // complex params → object
```

After this story, update to:
```typescript
['pois', { segmentId, fromKm, toKm, layer }]  // per-layer — stable cache entry per layer
```

### `LAYER_CATEGORIES` Import Check

`LAYER_CATEGORIES` is already imported in `use-pois.ts` from `@ridenrest/shared`. Just add `POI_BBOX_CACHE_TTL` to the same import line.

### Files to Touch

| File | Change |
|------|--------|
| `apps/web/src/hooks/use-pois.ts` | Per-layer query generation, import `POI_BBOX_CACHE_TTL`, staleTime fix |
| `apps/web/src/hooks/use-pois.test.ts` | Update tests for per-layer query structure |
| `_bmad-output/project-context.md` | Update TQ key convention for `pois` |

### DO NOT Touch

- `apps/api/src/pois/pois.service.ts` — backend cache already optimal (10.1+10.2) ✅
- `packages/shared/src/constants/api.constants.ts` — `POI_BBOX_CACHE_TTL` already defined ✅
- `apps/api/src/pois/**/*.ts` — no backend changes needed ✅
- Any Zustand stores — layer visibility managed by `useMapStore`, no change ✅
- Database schemas — no schema change ✅

### Project Structure Notes

- `use-pois.ts` is in `apps/web/src/hooks/` — follows kebab-case hook naming convention ✅
- Tests are co-located: `use-pois.test.ts` same folder ✅
- Web app uses Vitest (not Jest) — `vi.fn()`, `vi.mock()`, `describe/it/expect` ✅
- `LAYER_CATEGORIES` maps `MapLayer` → `PoiCategory[]` (defined in `@ridenrest/shared`) ✅
- `CATEGORY_TO_LAYER` maps `PoiCategory` → `MapLayer` (used for grouping, unchanged) ✅

### References

- [Source: apps/web/src/hooks/use-pois.ts] Current implementation — per-segment, all-categories combined
- [Source: apps/web/src/hooks/use-pois.test.ts] Current tests — 13 tests to update/add
- [Source: apps/api/src/pois/pois.service.ts:89] Backend cache key — already `pois:bbox:{round3}:...:{sortedCategories}`
- [Source: packages/shared/src/constants/api.constants.ts:5] `POI_BBOX_CACHE_TTL = 30 * 24 * 60 * 60` (2592000s)
- [Source: project-context.md#TanStack Query Convention] `['pois', { segmentId, fromKm, toKm }]` — to update
- [Source: implementation-artifacts/10-1-geographic-cache-key-cross-user-poi-sharing.md] 10.1 completion — bbox key implemented
- [Source: implementation-artifacts/10-2-adaptive-ttl-density-7d-vs-pois-24h-vs-weather-1h.md] 10.2 completion — `POI_BBOX_CACHE_TTL` = 30 days
- [Source: epics.md#Epic 10 Story 10.3] Original ACs — backend already satisfies them; this story adds frontend layer isolation

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Refactored `use-pois.ts`: replaced single combined query (all active categories) with per-layer × per-segment queries using `segmentRanges.flatMap(... activeLayers.map(...))`. Each layer now has an independent TanStack Query cache entry — toggling one layer never invalidates another layer's cached data.
- `queryKey` changed from `['pois', { segmentId, fromKm, toKm, categories: [...] }]` to `['pois', { segmentId, fromKm, toKm, layer }]` — stable per-layer discriminator.
- Replaced magic number `staleTime: 1000 * 60 * 60 * 24` (24h) with `POI_BBOX_CACHE_TTL * 1000` (30 days) — aligned with Redis TTL from Story 10.2.
- Added 2 new tests: "toggling one layer does not invalidate other layer query key" and "staleTime/gcTime equals POI_BBOX_CACHE_TTL * 1000". Updated 4 existing tests for per-layer structure.
- Updated `project-context.md` TanStack Query key convention for `pois` to include `layer` field.
- **Code review fixes (2026-03-28):** Added `gcTime: POI_BBOX_CACHE_TTL * 1000` to prevent GC eviction before staleTime expires. Removed dead `isEnabled` variable and `enabled:` field (queries are only generated when conditions are met — `enabled` was always `true`). Simplified `isPending` accordingly. Fixed vacuously-true test "queries disabled when visibleLayers empty" to assert `queries.toHaveLength(0)`. Removed stale `enabled === true` assertion.
- All 550 tests pass (55 test files), no regressions.

### File List

- `apps/web/src/hooks/use-pois.ts`
- `apps/web/src/hooks/use-pois.test.ts`
- `_bmad-output/project-context.md`
- `_bmad-output/implementation-artifacts/10-3-poi-query-cache-by-bbox-category-map-layers.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
