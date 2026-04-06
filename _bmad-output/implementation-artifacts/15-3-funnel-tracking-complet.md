# Story 15.3: Funnel Tracking Complet — Parcours Utilisateur

Status: ready-for-dev

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

- [ ] **Task 1: Extend `analytics.ts` with funnel event helpers** (AC: all)
  - [ ] In `apps/web/src/lib/analytics.ts` (created in 15.2), add:
    - `trackGpxUploaded(props: { segment_count: number, total_km: number })`
    - `trackMapOpened(props: { adventure_id_hash: string })`
    - `trackPoiSearchTriggered(props: { mode: 'planning' | 'live', poi_categories: string[], result_count: number })`
    - `trackPoiDetailOpened(props: { poi_type: string, source: 'overpass' | 'google' })`
  - [ ] All use `window.plausible?.()` pattern (works outside React components too)
  - [ ] Hash adventure ID: simple SHA-256 truncated to 8 chars — never send raw UUID

- [ ] **Task 2: Instrument GPX upload** (AC: #1)
  - [ ] In `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
  - [ ] After successful segment upload + parse completion (when `parseStatus` transitions to `'done'`), fire `trackGpxUploaded`
  - [ ] Get `segment_count` from adventure data, `total_km` from `totalDistanceKm`
  - [ ] Fire once per successful upload, not on re-renders

- [ ] **Task 3: Instrument map view open** (AC: #2)
  - [ ] In `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
  - [ ] Fire `trackMapOpened` on initial mount when segments are loaded and trace is displayed
  - [ ] Use `useRef` guard to fire only once per page load (React Strict Mode safe — reset in cleanup)
  - [ ] Hash the adventure ID client-side before sending

- [ ] **Task 4: Instrument POI search** (AC: #3)
  - [ ] In `apps/web/src/hooks/use-pois.ts` — after successful fetch (when `isPending` transitions to `false` with data)
  - [ ] OR in `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — in the existing auto-zoom useEffect that already detects `isPending: true → false`
  - [ ] Fire `trackPoiSearchTriggered` with `mode: 'planning'`, active categories, and result count
  - [ ] For live mode: instrument in `apps/web/src/app/(app)/live/[id]/page.tsx` or the live POI search hook with `mode: 'live'`
  - [ ] `poi_categories` as comma-separated string (Plausible props are strings, not arrays)

- [ ] **Task 5: Instrument POI detail open** (AC: #4)
  - [ ] In POI popup click handler (when a pin is clicked and detail sheet opens)
  - [ ] In `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — on mount
  - [ ] OR in the click handler that opens the detail sheet
  - [ ] Extract `poi_type` from POI data, `source` from POI source field

- [ ] **Task 6: Plausible funnel configuration** (AC: #5)
  - [ ] Document the funnel setup in Plausible dashboard:
    - Goal 1: `gpx_uploaded`
    - Goal 2: `map_opened`
    - Goal 3: `poi_search_triggered`
    - Goal 4: `poi_detail_opened`
    - Goal 5: `booking_click` (from story 15.2)
  - [ ] Create all 5 goals in Plausible's Goal settings
  - [ ] Configure the funnel: `gpx_uploaded → map_opened → poi_search_triggered → poi_detail_opened → booking_click`

- [ ] **Task 7: Tests** (AC: #1-#4)
  - [ ] Vitest: `analytics.ts` — verify each track function calls `window.plausible` with correct event name and props
  - [ ] Vitest: adventure-detail — verify `trackGpxUploaded` called after successful upload
  - [ ] Vitest: map-view — verify `trackMapOpened` called once on mount
  - [ ] Vitest: verify adventure ID is hashed (not raw UUID) in `map_opened` event

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

### Debug Log References

### Completion Notes List

### File List
