# Story 16.15: Map Auto-Zoom to Search Zone

Status: done

## Story

As a **cyclist searching for POIs in planning or live mode**,
I want the map to automatically zoom to display the searched zone after each search completes,
so that I can immediately see the results without having to manually navigate to the right area.

---

## Context & Root Cause Analysis

### Planning mode — regression bug (Story 16.3 AC broken)

`map-view.tsx` uses a `prevIsPendingRef` mechanism to detect the `poisPending: true → false` transition:

```typescript
// Current code (broken on warm cache)
useEffect(() => {
  if (searchCommitted && prevIsPendingRef.current && !poisPending) {
    mapCanvasRef.current?.fitToCorridorRange(...)
  }
  prevIsPendingRef.current = poisPending
  return () => { prevIsPendingRef.current = false }
}, [poisPending, searchCommitted])
```

**Root cause**: `usePois` uses TanStack Query's `isPending` which is only `true` when there is **no cached data AND the query is loading**. When Redis cache is warm (24h TTL), TanStack Query returns data immediately from its local cache — `isPending` starts and stays `false`. The `true → false` transition never fires. Zoom never happens.

**Fix**: Also handle the case where `searchCommitted` just became `true` and `poisPending` is already `false` (warm cache path):

```typescript
const prevSearchCommittedRef = useRef(false)
const prevIsPendingRef = useRef(false)

useEffect(() => {
  const justCommitted = searchCommitted && !prevSearchCommittedRef.current
  const justResolved = searchCommitted && prevIsPendingRef.current && !poisPending

  if ((justCommitted && !poisPending) || justResolved) {
    mapCanvasRef.current?.fitToCorridorRange(
      mapFromKmRef.current,
      mapToKmRef.current,
      readySegmentsRef.current
    )
  }

  prevSearchCommittedRef.current = searchCommitted
  prevIsPendingRef.current = poisPending
  return () => {
    prevIsPendingRef.current = false
    prevSearchCommittedRef.current = false
  }
}, [poisPending, searchCommitted])
```

### Live mode — missing feature

`LiveMapCanvasHandle` only exposes `resetZoom()`. No method to zoom to the search zone.
`live/[id]/page.tsx` doesn't detect `poisFetching: true → false` to trigger a zoom.

---

## Acceptance Criteria

1. **Planning mode — warm cache fix**: Given the user commits a POI search, when the search returns results immediately (warm Redis cache, `isPending` stays `false`), then the map auto-zooms to fit the search corridor (`fromKm, toKm`) with ~10% padding.

2. **Planning mode — cold cache**: Given the user commits a POI search that requires a network fetch (`isPending` goes `true → false`), when the fetch completes, then the map auto-zooms to fit the corridor (existing behavior, must still work).

3. **Planning mode — no results**: Given the committed search returns zero POIs, when the empty result is returned, then the map still auto-zooms to the corridor zone.

4. **Live mode — new feature**: Given live mode is active and the user triggers a POI search (`refetchPois()`), when `poisFetching` transitions `true → false` and `poisHasFetched === true`, then the map viewport fits the waypoints in range `[currentKm, targetKm + searchRadiusKm]` with ~10% padding.

5. **Live mode — GPS pause**: Given live mode auto-zooms after a search, when the zoom fires, then GPS auto-tracking pauses (same `userInteractedRef = true` as a manual pan/zoom) — user must tap "Centre sur ma position" to resume.

6. **Live mode — no spurious zoom**: Given live mode is active but no search has been triggered yet (`!poisHasFetched`), when the user moves the target slider, then no auto-zoom fires.

---

## Tasks / Subtasks

- [x] Task 1 — Fix planning mode auto-zoom (AC: #1, #2, #3)
  - [x] 1.1 — In `map-view.tsx`, add `prevSearchCommittedRef` alongside `prevIsPendingRef`
  - [x] 1.2 — Update the `useEffect` to also fire when `justCommitted && !poisPending` (warm cache path)
  - [x] 1.3 — Reset both refs in the effect cleanup

- [x] Task 2 — Add `fitToSearchZone` to `LiveMapCanvasHandle` (AC: #4, #5)
  - [x] 2.1 — Add `fitToSearchZone(targetKm: number, radiusKm: number, segments: MapSegmentData[], waypoints: MapWaypoint[])` to `LiveMapCanvasHandle` interface in `live-map-canvas.tsx`
  - [x] 2.2 — Implement the method: filter waypoints in `[currentKm - 1, targetKm + radiusKm]`, fit bounds with 10% padding via `fitBounds()` with `padding: 40`
  - [x] 2.3 — Set `userInteractedRef.current = true` inside `fitToSearchZone` to pause GPS tracking

- [x] Task 3 — Trigger `fitToSearchZone` from `live/[id]/page.tsx` (AC: #4, #5, #6)
  - [x] 3.1 — Add `prevPoisFetchingRef = useRef(false)` to track `poisFetching` transitions
  - [x] 3.2 — Add `useEffect` watching `[poisFetching, poisHasFetched, isLiveModeActive]`: fire zoom when `prevPoisFetchingRef.current && !poisFetching && poisHasFetched && isLiveModeActive`
  - [x] 3.3 — Pass `targetKm` and `liveSearchRadiusKm` (from `useLiveStore`) as arguments to `fitToSearchZone`
  - [x] 3.4 — Reset `prevPoisFetchingRef.current = false` in cleanup (React Strict Mode safety)

- [x] Task 4 — Tests (AC: #1–#6)
  - [x] 4.1 — `map-view.test.tsx`: warm-cache + cold-cache + no-search guard tests (3 tests)
  - [x] 4.2 — `live-map-canvas.test.tsx`: `fitToSearchZone` bounds + GPS pause + fallback tests (2 tests)
  - [x] 4.3 — `page.test.tsx` (live): transition survival + no-spurious-zoom guard tests (2 tests)

- [x] Task 5 — Review Follow-ups (AI Code Review)
  - [x] 5.1 — [M1] Remove dead `searchTrigger` prop from `LiveMapCanvasProps` + page.tsx JSX + dead comments
  - [x] 5.2 — [M2] Replace hardcoded `Math.min(20, ...)` with `MAX_LIVE_RADIUS_KM` in `live-filters-drawer.tsx`
  - [x] 5.3 — [M3] Add missing `gpsTrackingActive` field to `page.test.tsx` live store mock
  - [x] 5.4 — [L1] Remove dead comment about searchTrigger flyTo in `live-map-canvas.tsx`
  - [x] 5.5 — [L2] Simplify redundant `&& poisHasFetched` in `page.tsx` auto-zoom condition
  - [x] 5.6 — [L3] Complete incomplete `useLivePoisSearch` mocks in `page.test.tsx` (missing `hasFetched`, `refetch`, `canSearch`)

---

## Dev Notes

### Files to touch

| File | Change |
|---|---|
| `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` | Fix auto-zoom effect — add `prevSearchCommittedRef`, update condition |
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` | Add `fitToSearchZone` to `LiveMapCanvasHandle` interface + implementation |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Add `prevPoisFetchingRef` effect to trigger `fitToSearchZone` |
| `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` | Warm-cache zoom test |
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` | `fitToSearchZone` unit test |
| `apps/web/src/app/(app)/live/[id]/page.test.tsx` | Zoom trigger integration test |

### MapCanvasHandle / LiveMapCanvasHandle patterns (project-context.md)

```typescript
// Planning — existing (map-canvas.tsx)
export interface MapCanvasHandle {
  getMap: () => maplibregl.Map | null
  resetZoom: () => void
  fitToCorridorRange: (fromKm: number, toKm: number, segments: MapSegmentData[]) => void
  updateCrosshair: (km: number | null) => void
}

// Live — current (live-map-canvas.tsx)
export interface LiveMapCanvasHandle {
  getMap: () => maplibregl.Map | null
  resetZoom: () => void
  centerOnGps: () => void
  // ADD:
  fitToSearchZone: (targetKm: number, radiusKm: number, segments: MapSegmentData[], waypoints: KmWaypoint[]) => void
}
```

### fitToSearchZone implementation pattern

Follow `fitToCorridorRange` in `map-canvas.tsx` (lines 419–440). For live mode, the relevant range is `[currentKm - 1, targetKm + radiusKm]` — include 1 km behind for visual context. Use `map.fitBounds(bounds, { padding: 40, animate: true })`.

```typescript
fitToSearchZone(targetKm, radiusKm, segments, waypoints) {
  const map = mapRef.current
  if (!map) return

  // Pause GPS tracking (same pattern as dragstart/zoomstart)
  userInteractedRef.current = true

  const currentKm = currentKmOnRouteRef.current ?? 0
  const fromKm = Math.max(0, currentKm - 1)
  const toKm = targetKm + radiusKm

  const inRange = waypoints.filter(wp => wp.distKm >= fromKm && wp.distKm <= toKm)
  if (inRange.length === 0) {
    fitToTrace(map, segments, true)
    return
  }

  const bounds = inRange.reduce(/* LngLatBounds extend */, new maplibregl.LngLatBounds())
  map.fitBounds(bounds, { padding: 40, animate: true })
}
```

### prevIsPendingRef pattern — React Strict Mode safety (project-context.md)

The cleanup `return () => { ref.current = false }` is required in all `prevXxxRef` effects to handle React Strict Mode double-invocation. **Both** `prevIsPendingRef` and `prevSearchCommittedRef` must be reset in the same cleanup function.

### useLiveStore — available values

```typescript
const liveSearchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
```

### poisHasFetched vs poisFetching

`poisHasFetched = data !== undefined` (from `useLivePoisSearch`). This is the correct gate — prevents zoom from firing before the first search. `poisFetching` is `isFetching` from TanStack Query (covers both initial fetch and refetch).

### GPS tracking pause mechanism (live-map-canvas.tsx)

```typescript
// userInteractedRef = true → pauses GPS auto-center
const pauseTracking = () => { userInteractedRef.current = true }
map.on('dragstart', pauseTracking)
map.on('pitchstart', pauseTracking)
map.on('zoomstart', (e) => { if (e.originalEvent) pauseTracking() })
```

`fitToSearchZone` is a programmatic zoom (no `originalEvent`), so `zoomstart` won't auto-pause. Must set `userInteractedRef.current = true` explicitly before calling `fitBounds`.

### Auto-zoom after search — page.tsx pattern

```typescript
// Live page.tsx addition
const prevPoisFetchingRef = useRef(false)

useEffect(() => {
  const justResolved = prevPoisFetchingRef.current && !poisFetching
  if (justResolved && poisHasFetched && isLiveModeActive) {
    const targetKmValue = targetKm ?? 0
    liveMapCanvasRef.current?.fitToSearchZone(
      targetKmValue,
      liveSearchRadiusKm,
      segments,
      allCumulativeWaypoints
    )
  }
  prevPoisFetchingRef.current = poisFetching
  return () => { prevPoisFetchingRef.current = false }
}, [poisFetching, poisHasFetched, isLiveModeActive])
// Note: targetKm, liveSearchRadiusKm, segments, allCumulativeWaypoints intentionally excluded
// (refs or stable-during-search values — same pattern as map-view.tsx lines 186–191)
```

### MapSegmentData type

Import from `@/app/(app)/map/[id]/_components/map-canvas` or the shared types — do not redefine locally.

### KmWaypoint type

```typescript
import type { KmWaypoint } from '@ridenrest/gpx'
```

Already imported in `live-map-canvas.tsx`.

### z-index and positioning

No new UI elements — this story is purely behavioral (zoom logic). No CSS changes needed.

### Project Structure Notes

- Planning map: `apps/web/src/app/(app)/map/[id]/`
- Live map: `apps/web/src/app/(app)/live/[id]/`
- `fitToTrace` helper function is local to each canvas file — not shared. `fitToSearchZone` follows the same pattern.
- `allCumulativeWaypoints` is already computed in `page.tsx` via `useAdventureWaypoints(readySegments)` — reuse it, don't recompute.

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

Console log debugging used during live mode zoom tuning (removed after validation).

### Completion Notes List

- **Task 1**: Fixed planning mode auto-zoom regression. Added `prevSearchCommittedRef` to detect when `searchCommitted` just became `true` with warm Redis cache (where `isPending` stays `false`). Both warm-cache and cold-cache paths now trigger `fitToCorridorRange`.
- **Task 2**: Added `fitToSearchZone` to `LiveMapCanvasHandle`. Uses `MapWaypoint[]` (not `KmWaypoint[]`) because `allCumulativeWaypoints` from `useAdventureWaypoints` returns `MapWaypoint`. Computes bounds centered on target area `[targetKm - radiusKm, targetKm + radiusKm]` with 30% lateral expansion + asymmetric padding (bottom: 240px for LiveControls panel). Pauses GPS tracking via `userInteractedRef = true` + `setGpsTrackingActive(false)`.
- **Task 3**: Added `prevPoisFetchingRef` + `prevSearchTriggerRef` effect in `page.tsx`. Two zoom paths: cold cache (`poisFetching: true→false`) and warm cache (`searchTrigger` increment while `!poisFetching`). Zoom fires even on API error (`justResolved` path doesn't require `poisHasFetched`). Ref cleanup for React Strict Mode.
- **Task 4**: Added 7 new tests across 3 files. Removed obsolete `searchTrigger` flyTo test (replaced by fitToSearchZone). Note: page-level ref integration test not feasible with vitest mock module isolation.
- **Task 5 (post-review)**: Removed competing `searchTrigger` flyTo effect from `live-map-canvas.tsx` — it zoomed to a single point at zoom 13, overriding `fitToSearchZone`. Fixed API DTO `@Max(10)` → `@Max(MAX_LIVE_RADIUS_KM)` (was rejecting radius > 10km with 400). Updated search limits: `MAX_SEARCH_RANGE_KM` 30→50 (planning), new `MAX_LIVE_RADIUS_KM = 20` (live), live slider max 30→20.

### Change Log

- 2026-04-05: Story 16.15 implementation — fix auto-zoom planning mode (warm cache) + new auto-zoom live mode
- 2026-04-05: Post-review fixes — remove competing flyTo, fix API radiusKm validation, update search limits (planning 50km, live 20km), tune live zoom (target-centered bounds + bottom padding for LiveControls)
- 2026-04-05: Code review cleanup — remove dead searchTrigger prop, use MAX_LIVE_RADIUS_KM constant in drawer, fix test mocks (gpsTrackingActive + useLivePoisSearch completeness), simplify redundant condition

### File List

| File | Change |
|---|---|
| `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` | Added `prevSearchCommittedRef`, updated auto-zoom effect to handle warm cache path |
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` | Added `fitToSearchZone` (target-centered bounds, 30% expansion, 240px bottom padding), removed competing `searchTrigger` flyTo |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Added `prevPoisFetchingRef` + `prevSearchTriggerRef` effect — cold cache + warm cache + error paths |
| `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` | Slider max radius 30→20 |
| `packages/shared/src/constants/gpx.constants.ts` | `MAX_SEARCH_RANGE_KM` 30→50, added `MAX_LIVE_RADIUS_KM = 20` |
| `apps/api/src/pois/dto/find-pois.dto.ts` | `@Max(MAX_LIVE_RADIUS_KM)` instead of hardcoded `@Max(10)` |
| `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` | Added 3 auto-zoom tests (warm cache, cold cache, no-search guard) |
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` | Added 2 fitToSearchZone tests, removed obsolete flyTo test |
| `apps/web/src/app/(app)/live/[id]/page.test.tsx` | Added 2 tests for auto-zoom behavior |
| `apps/web/src/app/(app)/map/[id]/_components/search-range-slider.test.tsx` | Updated for 50km max |
| `apps/api/src/pois/pois.service.test.ts` | Updated validation test for 50km max |
