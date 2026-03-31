# Story 16.3: Map Interaction UX

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist using the planning map**,
I want more intuitive map interactions,
So that I can navigate search results and control the viewport efficiently.

## Acceptance Criteria

1. **Auto-zoom to search corridor** — When a POI search completes (transitions from `isPending=true` to `isPending=false` while `searchCommitted=true`), the map auto-zooms to fit the search corridor (the km range segment + ~10% padding around the bounding box). If no POIs are found, the zoom still fits the corridor. The auto-zoom only fires once per search commit (not on re-renders). Animation: smooth (`animate: true`).

2. **Reset zoom button** — A persistent "reset zoom" button is visible in the map controls (bottom-right corner, above the style picker). Clicking it re-fits the map to the full adventure trace (reusing the existing `fitToTrace()` behavior with `animate: true`). Icon: `ZoomOut` from lucide-react. Tooltip: "Réinitialiser le zoom".

3. **Click-on-trace → "Rechercher ici" CTA** — When the user clicks on the GPX trace line (within the MapLibre hit area of layer `'trace-line'`), a floating mini-panel appears near the click point showing `<MapPin />` icon + "Km X.X — Rechercher ici". Clicking the CTA sets `fromKm` to the clicked km position and `searchCommitted` to `false` (so the user can adjust the range before searching). The panel closes when clicking outside, on escape, or when a new search is committed. If `stageMode` is active (stage placement in progress), this interaction is disabled.

4. **Loading overlay on map** — While `searchCommitted === true` AND `isPending === true`, a centered loading overlay is displayed over the map canvas (not the entire viewport). Content: `<Loader2 className="animate-spin" />` + "Recherche en cours…". Background: semi-transparent `bg-black/20`. `z-index` above the map, below the sidebar and POI popup. Overlay disappears as soon as `isPending` becomes `false`. The existing skeleton in `poi-layer-grid.tsx` stays in place (complementary UX).

5. **"Aucun résultat" banner (planning + live)** — After a committed search returns zero POIs across all active layers, a centered orange banner (`bg-orange-500/90 text-white`) is displayed inside the map area. Conditions: planning mode — `searchCommitted && !poisPending && !poisError && allPois.length === 0 && readySegments.length > 0 && visibleLayers.size > 0`; live mode — `isLiveModeActive && !poisFetching && !poisError && pois.length === 0 && searchTrigger > 0`. The banner does not appear if there's already an error or offline banner visible.

## Tasks / Subtasks

- [x] **Task 1 — Expose `fitToTrace()` + new `fitToCorridorRange()` via imperative handle** (AC: #1, #2)
  - [x] 1.1 — In `map-canvas.tsx`, add two methods to the `MapCanvasHandle` imperative interface
  - [x] 1.2 — Implement `resetZoom()` in `useImperativeHandle`: calls `fitToTrace(map, segmentsRef.current, true)` with `animate: true`
  - [x] 1.3 — Implement `fitToCorridorRange(fromKm, toKm, segments)`: accounts for `cumulativeStartKm` (local km conversion), 10% padding, fallback to `fitToTrace` if no waypoints in range

- [x] **Task 2 — Auto-zoom after POI search** (AC: #1)
  - [x] 2.1 — Added `prevIsPendingRef` and auto-zoom `useEffect` in `map-view.tsx` triggered on `poisPending` / `searchCommitted` / `mapFromKm` / `mapToKm` / `readySegments` changes
  - [x] 2.2 — `prevIsPendingRef.current = false` reset in cleanup (React Strict Mode safe)

- [x] **Task 3 — Reset zoom button** (AC: #2)
  - [x] 3.1 — Created `reset-zoom-button.tsx` using `@/components/ui/tooltip` (base-ui, no `asChild`)
  - [x] 3.2 — Rendered `<ResetZoomButton>` at `bottom-20 right-4 z-10` above `<MapStylePicker>` in `map-view.tsx`

- [x] **Task 4 — Click-on-trace → "Rechercher ici" CTA** (AC: #3)
  - [x] 4.1 — Added `traceClickedKm: number | null` + `setTraceClickedKm` to `map.store.ts`
  - [x] 4.2 — Added `trace-line-click-target` invisible layer (width 16px) in `addTraceLayers()` + click handler `useEffect` (depends on `styleVersion`, uses WeakMap for cleanup, guards on `stageClickModeRef`)
  - [x] 4.3 — Created `trace-click-cta.tsx` (uses `setSearchRange` to preserve range width when setting `fromKm`)
  - [x] 4.4 — Added `<TraceClickCta />` in map area + Escape key handler using destructured `setTraceClickedKm`
  - [x] 4.5 — Added effect to clear `traceClickedKm` when `searchCommitted` becomes true

- [x] **Task 5 — Loading overlay on map** (AC: #4)
  - [x] 5.1 — Created `map-search-overlay.tsx` with `pointer-events-none`, `z-20`, centered in map container
  - [x] 5.2 — Rendered `<MapSearchOverlay visible={searchCommitted && poisPending} />` in map area
  - [x] 5.3 — `pointer-events-none` applied — no interaction blocking

- [x] **Task 6 — Tests** (AC: all)
  - [x] 6.1 — Added 3 tests to `map.store.test.ts` for `traceClickedKm` (init null, set, clear)
  - [x] 6.2 — Created `trace-click-cta.test.tsx`: 4 tests (renders nothing, Km 15.3, CTA click, ✕ close)
  - [x] 6.3 — Created `map-search-overlay.test.tsx`: 3 tests (hidden, text, spinner)
  - [x] 6.4 — All 644 tests pass (`pnpm turbo test`)

- [ ] **Review Follow-ups (AI)**
  - [ ] [AI-Review][LOW] `map-view.test.tsx` mock `useMapStore` sans `getState` — si un test déclenche le callback `onClose` du PoiPopup, il plantera avec "useMapStore.getState is not a function". Ajouter `getState: vi.fn(() => ({ setSelectedPoiId: vi.fn() }))` dans le mock `useMapStore` de `map-view.test.tsx`.
  - [ ] [AI-Review][LOW] `trace-click-cta.test.tsx:19` — `beforeEach` set `toKm: 30` alors que le store initial est 15 (post bug fix 7.3). Le test "clicking Rechercher ici" hérite de `toKm: 30`, testant un rangeWidth (30) qui ne reflète pas le défaut réel (15). Aligner le beforeEach sur `toKm: 15` et ajuster les assertions `toKm` du test.

- [x] **Task 7 — Post-review fixes & additions**
  - [x] 7.1 — `trace-click-cta.tsx`: replaced 📍 emoji with `<MapPin />` (lucide-react)
  - [x] 7.2 — `reset-zoom-button.tsx`: replaced `Maximize2` icon with `ZoomOut` (lucide-react)
  - [x] 7.3 — Bug fix: store initial `toKm` corrected from 30 → 15 to match sidebar default display; removed special-case in `search-range-control.tsx`
  - [x] 7.4 — Added "Aucun résultat" orange banner in planning mode (`map-view.tsx`) and live mode (`live/[id]/page.tsx`)
  - [x] 7.5 — Live mode: replaced small spinner (`top-14 right-4`) with `<MapSearchOverlay>` (same centered overlay as planning mode)
  - [x] 7.6 — Bug fix: `useLivePoisSearch` now exposes `hasFetched` (`data !== undefined`) — replaces unreliable `searchTrigger > 0` gate for the no-results banner. Root cause: with `enabled: false`, TanStack Query keeps `data = undefined` until first fetch for a given queryKey; using `?? []` masked this, making it impossible to distinguish "not yet searched" from "searched, zero results". `hasFetched` resets correctly when `targetKm` changes (new queryKey), so the banner auto-hides when the user moves the slider. 3 new tests in `use-live-poi-search.test.ts`.
  - [x] 7.7 — Added `resetZoom()` to `LiveMapCanvasHandle` + `fitToTrace` updated with optional `animate` param. `<ResetZoomButton>` rendered at `top-14 right-4 z-10` in `live/[id]/page.tsx` (below the style picker at `top-4 right-4`).

## Dev Notes

### Existing `fitToTrace()` — Already Implemented, Reuse It

`fitToTrace()` is an internal function in `map-canvas.tsx` (lines 851–866). It computes bounds from `segments[].boundingBox` and calls `map.fitBounds()`. It currently uses `animate: false` (called on map load).

For the **reset zoom button**, you need to expose this as a public method on the `MapCanvasHandle`:
```typescript
// Current signature (internal):
function fitToTrace(map: maplibregl.Map, segments: MapSegmentData[]) { ... }

// Change to accept optional animate flag:
function fitToTrace(map: maplibregl.Map, segments: MapSegmentData[], animate = false) {
  // ... existing bounds computation ...
  map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 40, maxZoom: 14, animate })
}

// In useImperativeHandle:
resetZoom: () => {
  if (!mapRef.current) return
  fitToTrace(mapRef.current, segments, true)  // animate: true for user-triggered
}
```

### Corridor Bounds Computation

**Use waypoints directly** (simpler than parsing `buildCorridorFeatures()` output). Each segment has `waypoints: { lat, lng, distance_km, elevation?: number }[]`. The `MapSegmentData` type already includes this.

```typescript
function fitToCorridorRange(fromKm: number, toKm: number, segments: MapSegmentData[]) {
  const inRange = segments
    .flatMap(s => s.waypoints ?? [])
    .filter(wp => wp.distance_km >= fromKm && wp.distance_km <= toKm)

  if (inRange.length === 0) {
    fitToTrace(mapRef.current!, segments, true)
    return
  }

  const lats = inRange.map(wp => wp.lat)
  const lngs = inRange.map(wp => wp.lng)
  const minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs)

  // 10% padding
  const dLat = Math.max(maxLat - minLat, 0.001)  // min span to avoid 0-height bounds
  const dLng = Math.max(maxLng - minLng, 0.001)

  mapRef.current!.fitBounds(
    [[minLng - dLng * 0.1, minLat - dLat * 0.1], [maxLng + dLng * 0.1, maxLat + dLat * 0.1]],
    { padding: 60, maxZoom: 16, animate: true, duration: 600 }
  )
}
```

### Click-on-Trace — MapLibre Layer Click

MapLibre layer click events fire when clicking within the rendered feature boundary. For a line layer, this is the stroke width (default: 2px is too small — verify the trace-line paint property). If `line-width` is 2, add an invisible wider click target layer:

```typescript
// After addTraceLayers(), add a transparent click-target layer:
map.addLayer({
  id: 'trace-line-click-target',
  type: 'line',
  source: 'trace',
  paint: {
    'line-color': 'transparent',
    'line-width': 16,  // wider hit area
    'line-opacity': 0,
  },
})
// Listen on the click-target layer, not 'trace-line' itself:
map.on('click', 'trace-line-click-target', handler)
map.on('mouseenter', 'trace-line-click-target', ...)
map.on('mouseleave', 'trace-line-click-target', ...)
```

This avoids the "10px" hit area requirement from the AC — the invisible layer provides the click buffer natively.

### TraceClickCta — Positioning

The CTA is positioned at `bottom-20 left-1/2 -translate-x-1/2` (centered horizontally, above the elevation profile). This is inside the map canvas container. It should appear above the elevation profile bar — check `map-view.tsx` layout to ensure no `overflow: hidden` clips it.

If the elevation profile is at the bottom (story 8.8), position above it. Adjust `bottom-20` → `bottom-32` if the elevation profile is 80px tall.

### `stageMode` in map-canvas.tsx

The stage mode flag already exists in map-canvas.tsx from stories 11.1/11.2. It controls whether clicks on the map place stage markers. When `stageMode` is active, clicking the trace should NOT open the "Rechercher ici" CTA — the user is placing a stage endpoint.

Find how `stageMode` is currently tracked in map-canvas.tsx (likely via `useMapStore` or a prop). Use the same mechanism for the guard in the trace click handler.

### MapSearchOverlay — z-index Stack

Current z-index landscape in map-view.tsx (approximate):
- Map canvas: base (z-0)
- Sidebar: `z-10`
- Map controls (reset zoom, style picker): `z-10`
- TraceClickCta: `z-30`
- POI popup: `z-40`
- Sidebar collapse toggle: `z-20`

**The overlay should be `z-20`** — visible over the map but behind the sidebar and CTA. If you render the overlay inside the map canvas div (not full viewport), the z-index is scoped to that container.

### Previous Story (16.2) — Context Patterns

From story 16.2 completion notes:
- `useMutation` + `queryClient.invalidateQueries` is well-established
- Tests run via `pnpm turbo test` — 629 web + API tests currently passing (post-16.2 code review)
- Zustand stores use merge mode in tests (`beforeEach` in `map.store.test.ts`)
- React Strict Mode: **always reset `useRef` booleans in cleanup** (feedback memory) — applies to `prevIsPendingRef`

### Anti-Pattern: Don't Block Entire Viewport

The overlay must be scoped to the **map canvas container**, not the full page. Using `absolute inset-0` inside the relatively-positioned map wrapper achieves this. If the overlay uses `fixed` positioning, it will cover the sidebar — that's wrong.

### MapCanvasHandle — Current Interface

Check the current `MapCanvasHandle` interface in map-canvas.tsx before adding the two new methods. Ensure the `useImperativeHandle` block (line ~330) is extended, not replaced.

### Project Structure Notes

| File | Path |
|---|---|
| Map view (main container) | `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` |
| Map canvas (MapLibre) | `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` |
| Map Zustand store | `apps/web/src/stores/map.store.ts` |
| POI layer grid | `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` |
| Map style picker | `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx` |
| use-pois hook | `apps/web/src/hooks/use-pois.ts` |
| ResetZoomButton (NEW) | `apps/web/src/app/(app)/map/[id]/_components/reset-zoom-button.tsx` |
| TraceClickCta (NEW) | `apps/web/src/app/(app)/map/[id]/_components/trace-click-cta.tsx` |
| MapSearchOverlay (NEW) | `apps/web/src/app/(app)/map/[id]/_components/map-search-overlay.tsx` |
| map.store test | `apps/web/src/stores/map.store.test.ts` |

### References

- Epic 16 story 16.3 requirements: `_bmad-output/planning-artifacts/epics.md`
- `fitToTrace()` existing implementation: `map-canvas.tsx:851–866`
- `MapCanvasHandle.getMap()` imperative handle: `map-canvas.tsx:~330`
- `searchCommitted` gate: `map.store.ts` + `use-pois.ts:44`
- Trace layer ID: `'trace-line'` (source: `'trace'`) — `map-canvas.tsx:~409–420`
- POI loading skeleton: `poi-layer-grid.tsx:46–49` (keep, complementary)
- Zustand store conventions: `project-context.md#Zustand Stores — Convention`
- React Strict Mode refs: `memory/feedback_react_strict_mode_refs.md`
- Story 16.2 completion notes (test count, patterns): `16-2-adventures-list-timeline-ux.md`
- POI search gate `searchCommitted`: `project-context.md#POI Search — Explicit Trigger Gate`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

_None_

### Completion Notes List

- **Task 1**: `MapCanvasHandle` extended with `resetZoom()` and `fitToCorridorRange()`. `fitToTrace()` updated with optional `animate = false` param for backward compat. `fitToCorridorRange` correctly converts global adventure km to local segment km (matching `buildCorridorFeatures` pattern).
- **Task 2**: Auto-zoom uses `prevIsPendingRef` transition detection. `readySegments` wrapped in `useMemo` (new — fixes spurious re-renders + lint warning from explicit dep inclusion).
- **Task 3**: `ResetZoomButton` uses `@/components/ui/tooltip` (base-ui) without `asChild` (Radix pattern not applicable). Positioned `bottom-20 right-4` above existing `MapStylePicker` (`bottom-6 right-4`).
- **Task 4**: Trace click uses a dedicated `trace-line-click-target` invisible layer (16px wide, opacity 0) for easy hit area. WeakMap pattern matches `densityEventHandlers` convention. `setSearchRange` used instead of non-existent `setFromKm` — preserves range width.
- **Task 5**: Overlay scoped to map container via `absolute inset-0` — does not cover sidebar. `z-20` stack per dev notes spec.
- **Task 6**: All 644 tests pass. Updated `map-canvas.test.tsx` + `map-view.test.tsx` mocks with new store fields.
- **Bug fix (post-review)**: Store initial `toKm` corrected from 30 → 15 to match the sidebar's default display range. The sidebar had a special-case `(fromKm === 0 && toKm === 30) ? 15 : toKm - fromKm` that created a discrepancy: `TraceClickCta` computed `rangeWidth` from store (30) while sidebar showed 15. Fix: align store initial state, remove sidebar special case. All 644 tests pass.
- **Code review fixes**: (1) Click-outside handler added via `mapClickHandler` general map listener — `traceClickedThisEvent` flag differentiates trace clicks from background clicks, clearing `traceClickedKm` on any non-trace click (AC #3 complete). (2) `mouseleaveHandler` now guards on `stageClickModeRef.current` to avoid resetting stageClickMode cursor. (3) `prevIsPendingRef` cleanup added to auto-zoom effect (`return () => { prevIsPendingRef.current = false }`) — React Strict Mode safe.

### File List

- `apps/web/src/stores/map.store.ts` — added `traceClickedKm` state + `setTraceClickedKm` action
- `apps/web/src/stores/map.store.test.ts` — added 3 tests for `traceClickedKm`, updated `beforeEach`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — extended `MapCanvasHandle`, updated `fitToTrace`, added `fitToCorridorRange` + `resetZoom` to handle, added `trace-line-click-target` layer, added trace click `useEffect` + `traceClickHandlers` WeakMap
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — added auto-zoom effect, `useMemo` for `readySegments`, Escape key handler, `searchCommitted` watcher, renders `ResetZoomButton` + `TraceClickCta` + `MapSearchOverlay`
- `apps/web/src/app/(app)/map/[id]/_components/reset-zoom-button.tsx` — NEW component
- `apps/web/src/app/(app)/map/[id]/_components/trace-click-cta.tsx` — NEW component
- `apps/web/src/app/(app)/map/[id]/_components/map-search-overlay.tsx` — NEW component
- `apps/web/src/app/(app)/map/[id]/_components/trace-click-cta.test.tsx` — NEW tests
- `apps/web/src/app/(app)/map/[id]/_components/map-search-overlay.test.tsx` — NEW tests
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — updated `useMapStore` mock with `getState`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — updated `useMapStore` mock with `traceClickedKm` + `setTraceClickedKm`
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — added `resetZoom()` to `LiveMapCanvasHandle`, `fitToTrace` updated with optional `animate` param (Task 7.7)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — added "Aucun résultat" banner, replaced spinner with `<MapSearchOverlay>`, rendered `<ResetZoomButton>` (Tasks 7.4, 7.5, 7.7)
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — removed special-case `(fromKm===0 && toKm===30)?15:toKm-fromKm` (Task 7.3 bug fix)
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx` — updated tests for Task 7.3 fix
- `apps/web/src/hooks/use-live-poi-search.ts` — exposes `hasFetched` (`data !== undefined`) replacing `searchTrigger > 0` gate (Task 7.6)
- `apps/web/src/hooks/use-live-poi-search.test.ts` — 3 new tests for `hasFetched` (Task 7.6)
