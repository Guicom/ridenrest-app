# Story 15.3: Funnel Tracking Complet — Parcours Utilisateur

Status: done

## Story

As a **product owner wanting to understand user behavior**,
I want the full user journey tracked from GPX upload to booking click,
So that I can identify drop-off points and report a credible conversion funnel to Booking.com.

## Acceptance Criteria (BDD)

1. **Given** a user uploads a GPX file successfully,
   **When** the segment parse completes,
   **Then** a Plausible custom event `gpx_uploaded` is sent with props: `{ segment_count: number, total_km: number }`.

2. **Given** a user opens the map view for an adventure,
   **When** the map page loads with the trace displayed,
   **Then** a custom event `map_opened` is sent with props: `{ adventure_id_hash: string }` (hashed, not raw ID — no PII).

3. **Given** a user triggers a POI search (changes km range or activates a layer),
   **When** results are returned,
   **Then** a custom event `poi_search_triggered` is sent with props: `{ mode: 'planning' | 'live', poi_categories: string[], result_count: number }`.

4. **Given** a user taps a POI pin and the detail sheet opens,
   **When** the sheet is displayed,
   **Then** a custom event `poi_detail_opened` is sent with props: `{ poi_type: string, source: 'overpass' | 'google' }`.

5. **Given** all funnel events are tracked,
   **When** viewing Plausible's "Funnels" feature,
   **Then** a configured funnel `gpx_uploaded → map_opened → poi_search_triggered → poi_detail_opened → booking_click` shows step-by-step conversion rates.

## Tasks / Subtasks

- [x] **Task 1: Extend `analytics.ts` with funnel event helpers** (AC: all)
  - [x] In `apps/web/src/lib/analytics.ts` (created in 15.2), add:
    - `trackGpxUploaded(props: { segment_count: number, total_km: number })`
    - `trackMapOpened(props: { adventure_id_hash: string })`
    - `trackPoiSearchTriggered(props: { mode: 'planning' | 'live', poi_categories: string[], result_count: number })`
    - `trackPoiDetailOpened(props: { poi_type: string, source: 'overpass' | 'google' })`
  - [x] All use `window.plausible?.()` pattern (works outside React components too)
  - [x] Hash adventure ID: simple hash truncated to 8 chars — never send raw UUID

- [x] **Task 2: Instrument GPX upload** (AC: #1)
  - [x] In `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
  - [x] After successful segment upload + parse completion (when `parseStatus` transitions to `'done'`), fire `trackGpxUploaded`
  - [x] Get `segment_count` from adventure data, `total_km` from `totalDistanceKm`
  - [x] Fire once per successful upload, not on re-renders

- [x] **Task 3: Instrument map view open** (AC: #2)
  - [x] In `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
  - [x] Fire `trackMapOpened` on initial mount when segments are loaded and trace is displayed
  - [x] Use `useRef` guard to fire only once per page load (React Strict Mode safe — reset in cleanup)
  - [x] Hash the adventure ID client-side before sending

- [x] **Task 4: Instrument POI search** (AC: #3)
  - [x] In `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — in the existing auto-zoom useEffect that detects `isPending: true → false`
  - [x] Fire `trackPoiSearchTriggered` with `mode: 'planning'`, active categories, and result count
  - [x] For live mode: instrumented in `apps/web/src/app/(app)/live/[id]/page.tsx` auto-zoom effect with `mode: 'live'`
  - [x] `poi_categories` as comma-separated string (handled by `trackPoiSearchTriggered` internally)

- [x] **Task 5: Instrument POI detail open** (AC: #4)
  - [x] In `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — on POI change (externalId)
  - [x] Fires on every new POI selection (both planning and live mode, via shared PoiPopup component)
  - [x] Extract `poi_type` from `poi.category`, `source` from `poi.source` field

- [x] **Task 6: Plausible funnel configuration** (AC: #5)
  - [x] Document the funnel setup in Plausible dashboard:
    - Goal 1: `gpx_uploaded`
    - Goal 2: `map_opened`
    - Goal 3: `poi_search_triggered`
    - Goal 4: `poi_detail_opened`
    - Goal 5: `booking_click` (from story 15.2)
  - [ ] Create all 5 goals in Plausible's Goal settings *(manual — Guillaume must do in dashboard)*
  - [ ] Configure the funnel: `gpx_uploaded → map_opened → poi_search_triggered → poi_detail_opened → booking_click` *(manual — Plausible dashboard)*

- [x] **Task 7: Tests** (AC: #1-#4)
  - [x] Vitest: `analytics.ts` — 14 tests: each track function calls `window.plausible` with correct event name and stringified props
  - [x] Vitest: `hashAdventureId` — consistent hashing, max 8 chars, never returns raw UUID
  - [x] Vitest: poi-popup — 43 existing tests pass (no regressions from `trackPoiDetailOpened` addition)
  - [x] Component-level tests for adventure-detail/map-view not created (heavy mocking infra required; tracking calls are no-ops, verified by analytics.ts unit tests)

## Dev Notes

### Instrumentation Points in Existing Code

**GPX Upload** (`adventure-detail.tsx`):
- Upload flow: dropzone → `uploadSegment` mutation → poll `parseStatus` via TanStack Query `refetchInterval`
- Best hook point: when `parseStatus` transitions from `pending` to `done` in the polling cycle
- `segment_count` and `total_km` available from the adventure query data

**Map View** (`map-view.tsx`):
- Already has `useEffect` patterns with `useRef` guards (e.g., `prevIsPendingRef` for auto-zoom)
- Add a `mapOpenedTrackedRef` with cleanup reset for React Strict Mode safety
- Fire after `readySegments.length > 0` (trace is actually displayed)

**POI Search** (`map-view.tsx` / `use-pois.ts`):
- Existing `useEffect` in `map-view.tsx` detects `isPending: true → false` transition with `searchCommitted === true`
- This is the ideal hook point — piggyback on the same effect
- For live mode: similar pattern in `live/[id]/page.tsx`

**POI Detail** (`poi-popup.tsx` / `poi-detail-sheet.tsx`):
- Pin click → `handlePoiClick` → opens popup/sheet
- POI data includes `category` (poi_type) and `source` ('overpass' | 'google')

### Plausible Props Constraints

Plausible custom event props are **strings only** (no numbers, no arrays). Convert:
- `segment_count: number` → `segment_count: String(count)`
- `total_km: number` → `total_km: String(Math.round(km))`
- `poi_categories: string[]` → `poi_categories: categories.join(',')`
- `result_count: number` → `result_count: String(count)`

### Adventure ID Hashing (GDPR)

```typescript
// Simple hash — no crypto import needed for non-security hashing
function hashId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(36).slice(0, 8)
}
```

Or use `crypto.subtle.digest('SHA-256', ...)` if available in the browser context. The goal is to make the ID non-reversible while still being consistent (same adventure → same hash for deduplication in Plausible).

### React Strict Mode Safety

ALL `useRef` tracking guards MUST be reset in the effect cleanup:
```typescript
const trackedRef = useRef(false)
useEffect(() => {
  if (trackedRef.current) return
  trackedRef.current = true
  trackMapOpened({ ... })
  return () => { trackedRef.current = false } // CRITICAL: Strict Mode reset
}, [deps])
```

### Dependencies

- Depends on Story 15.1 (Plausible CE running + `next-plausible` installed)
- Depends on Story 15.2 (for `analytics.ts` file and `booking_click` event)
- If 15.1/15.2 not done: `window.plausible?.()` calls are harmless no-ops

### Project Structure Notes

- Modified file: `apps/web/src/lib/analytics.ts` (extend from 15.2)
- Modified files: `adventure-detail.tsx`, `map-view.tsx`, `use-pois.ts` or live page, `poi-detail-sheet.tsx`
- Plausible dashboard configuration: manual steps documented in Task 6

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 15, Story 15.3]
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx — GPX upload flow]
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx — map open + POI search detection]
- [Source: apps/web/src/hooks/use-pois.ts �� POI fetch hook]
- [Source: project-context.md — React Strict Mode refs pattern]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — no debug issues encountered

### Completion Notes List
- **Task 1**: Added 4 funnel event helpers (`trackGpxUploaded`, `trackMapOpened`, `trackPoiSearchTriggered`, `trackPoiDetailOpened`) + `hashAdventureId` utility to `analytics.ts`. All props stringified for Plausible compatibility. 14 unit tests.
- **Task 2**: Instrumented `adventure-detail.tsx` — fires `gpx_uploaded` on `parseStatus` transition to `done` (both fast-path and polling-path).
- **Task 3**: Instrumented `map-view.tsx` — fires `map_opened` once when `readySegments.length > 0`, with `useRef` guard + Strict Mode cleanup.
- **Task 4**: Instrumented POI search in both modes — planning (`map-view.tsx` auto-zoom effect) and live (`live/[id]/page.tsx` auto-zoom effect).
- **Task 5**: Instrumented `poi-popup.tsx` — fires `poi_detail_opened` on POI change (shared between planning and live modes).
- **Task 6**: Documented funnel goals; manual Plausible dashboard setup required by Guillaume.
- **Task 7**: 870/870 tests pass (14 new analytics tests, 43 existing poi-popup tests, zero regressions).

### File List
- `apps/web/src/lib/analytics.ts` — extended with 4 funnel helpers + hashAdventureId
- `apps/web/src/lib/analytics.test.ts` — 13 new tests (funnel events + hash + no-op safety)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — trackGpxUploaded on parse done
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — trackMapOpened + trackPoiSearchTriggered (planning)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — trackPoiSearchTriggered (live)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — trackPoiDetailOpened

### Senior Developer Review (AI) — 2026-04-06

**Reviewer:** Claude Opus 4.6 (adversarial code review)

**Issues Found:** 0 Critical, 3 Medium, 1 Low — **3 fixed, 1 noted**

| # | Severity | Issue | Resolution |
|---|----------|-------|------------|
| 1 | MEDIUM | `total_km` stale/zero in `gpx_uploaded` — adventure query not invalidated on parse done | **Fixed**: compute `total_km` from segments data directly + invalidate adventure query |
| 2 | MEDIUM | Missing no-op safety tests for `trackMapOpened`, `trackPoiSearchTriggered`, `trackPoiDetailOpened` | **Fixed**: 3 no-op tests added (17 total) |
| 3 | MEDIUM | Live mode `trackPoiSearchTriggered` fires on search error with stale `result_count` | **Fixed**: guard with `!poisError` |
| 4 | LOW | `visibleLayers` (layer names) used as `poi_categories` — layer-level granularity, not category-level | **Noted**: acceptable for MVP, revisit for analytics refinement |
