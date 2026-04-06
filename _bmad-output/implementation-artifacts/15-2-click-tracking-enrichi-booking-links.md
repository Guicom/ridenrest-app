# Story 15.2: Click Tracking Enrichi — Booking Deep Links (FR-062)

Status: done

## Story

As a **developer building the Booking.com affiliate application**,
I want enriched custom event tracking on every booking link click,
So that I have granular data on which accommodations, POI types, and user segments generate the most booking intent.

## Acceptance Criteria (BDD)

1. **Given** a user clicks a "Rechercher sur Booking.com" or "Rechercher sur Airbnb" CTA in the SearchOnDropdown or POI popup,
   **When** the click event fires,
   **Then** a Plausible custom event `booking_click` is sent with props: `{ source: 'booking.com' | 'airbnb', poi_type: 'hotel' | 'hostel' | 'camp_site' | 'shelter' | 'none', page: 'map' | 'live', user_tier: 'free' | 'pro' | 'team' | 'anonymous' }`.

2. **Given** the existing FR-062 implementation in Story 4.4 (basic click tracking via `POST /api/pois/booking-click`),
   **When** Story 15.2 is implemented,
   **Then** the basic server-side tracking is replaced by client-side Plausible events — the NestJS endpoint `POST /pois/booking-click` and `TrackBookingClickDto` are removed.

3. **Given** a `booking_click` event is fired,
   **When** checking Plausible dashboard under "Custom Events",
   **Then** the event appears with filterable props (source, poi_type, page, user_tier) — enabling segmentation for the Booking.com application report.

4. **Given** Plausible custom events are used,
   **When** the implementation is reviewed,
   **Then** no PII (Personally Identifiable Information) is sent in event props — only anonymized metadata — compliant with GDPR (NFR-016).

## Tasks / Subtasks

- [x] **Task 1: Create Plausible event helper** (AC: #1, #4)
  - [x] Create `apps/web/src/lib/analytics.ts` — thin wrapper using `window.plausible` directly (works inside and outside React components)
  - [x] Export `trackBookingClick(props: BookingClickProps)` function
  - [x] Type `BookingClickProps`: `{ source: 'booking.com' | 'airbnb', poi_type: string, page: 'map' | 'live', user_tier: string }`
  - [x] NO PII: no user ID, no email, no GPS coordinates, no POI external ID

- [x] **Task 2: Instrument SearchOnDropdown** (AC: #1)
  - [x] In `apps/web/src/components/shared/search-on-dropdown.tsx`:
  - [x] Add new props: `page: 'map' | 'live'`, `poiType?: string`
  - [x] On Booking.com link click: call `trackBookingClick({ source: 'booking.com', poi_type: poiType ?? 'none', page, user_tier })`
  - [x] On Airbnb link click: same with `source: 'airbnb'`
  - [x] Update all call sites to pass `page` and optional `poiType`

- [x] **Task 3: Instrument POI popup and detail sheet booking links** (AC: #1)
  - [x] In `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — passes `page` (live/map) and `poiType` (poi.category)
  - [x] In `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — passes `page` (live/map) and `poiType` (poi.category)
  - [x] Extract `poi_type` from POI data, `page` from context, `user_tier` resolved internally by SearchOnDropdown

- [x] **Task 4: Remove legacy server-side tracking** (AC: #2)
  - [x] Remove `POST /pois/booking-click` endpoint from `apps/api/src/pois/pois.controller.ts`
  - [x] Remove `apps/api/src/pois/dto/track-booking-click.dto.ts`
  - [x] Remove `trackBookingClick()` from `apps/web/src/lib/api-client.ts` (lines 288-297)
  - [x] Remove any imports/usages of the old `trackBookingClick` in components — confirmed none existed

- [x] **Task 5: Get user tier for event props** (AC: #1)
  - [x] Use `useProfile()` + `useSession()` internally in SearchOnDropdown (avoids prop drilling through 5+ components)
  - [x] If no session → `user_tier: 'anonymous'`; if session but no profile → `user_tier: 'free'`
  - [x] Added `tier` field to `ProfileResponse` (API + frontend) — reads from `profiles.tier` column
  - [x] `ProfileRepository.findByUserId()` now selects `tier` alongside `overpassEnabled`

- [x] **Task 6: Tests** (AC: #1, #2)
  - [x] Vitest: `analytics.ts` — verify `trackBookingClick` calls `plausible()` with correct event name and props
  - [x] Vitest: SearchOnDropdown — verify click handlers fire analytics event with correct props (4 new tests)
  - [x] Vitest: verified no remaining imports of old `trackBookingClick` from `api-client` (grep confirmed)
  - [x] Update `apps/web/src/components/shared/search-on-dropdown.test.tsx` — added mocks + 4 analytics tracking tests
  - [x] `poi-detail-sheet.test.tsx` — existing tests pass with new props (mocked SearchOnDropdown accepts them)

## Dev Notes

### Existing Code to Modify

**Legacy tracking (to remove):**
- `apps/api/src/pois/pois.controller.ts:32-39` — `@Post('booking-click')` endpoint, currently just logs
- `apps/api/src/pois/dto/track-booking-click.dto.ts` — DTO with `externalId` + `platform`
- `apps/web/src/lib/api-client.ts:288-297` — `trackBookingClick()` fire-and-forget POST

**Booking link components (to instrument):**
- `apps/web/src/components/shared/search-on-dropdown.tsx` — Main CTA "Rechercher sur Booking.com / Airbnb", used in both planning sidebar and live controls
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — POI popup on map
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — POI detail bottom sheet
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — Live mode controls

**SearchOnDropdown current props:**
```typescript
interface SearchOnDropdownProps {
  center: { lat: number; lng: number } | null
  city?: string | null
  variant?: 'outline' | 'action'
  className?: string
}
```
New props to add: `page`, `poiType`, `userTier`.

### Plausible Custom Events API

```typescript
// next-plausible hook
import { usePlausible } from 'next-plausible'

// In a component:
const plausible = usePlausible()
plausible('booking_click', {
  props: {
    source: 'booking.com',
    poi_type: 'hotel',
    page: 'map',
    user_tier: 'free',
  },
})
```

**Outside React components** (e.g., in utility functions), use `window.plausible` directly:
```typescript
window.plausible?.('booking_click', { props: { ... } })
```

### GDPR Compliance

- **NO** `poi_id`, `externalId`, or any identifier that could trace back to a specific search
- **NO** user ID or email — only the tier (free/pro/team/anonymous)
- **NO** GPS coordinates
- `poi_type` is a category (hotel/hostel/etc.), not identifying

### Dependency

- Depends on Story 15.1 (Plausible CE must be running and `next-plausible` installed)
- If 15.1 is not done yet, the `usePlausible()` calls will be no-ops (graceful degradation)

### Project Structure Notes

- New file: `apps/web/src/lib/analytics.ts` — centralized analytics helpers (reused in 15.3)
- Modified: `search-on-dropdown.tsx`, `poi-popup.tsx`, `poi-detail-sheet.tsx`, `live-controls.tsx`
- Deleted: `track-booking-click.dto.ts`, endpoint from `pois.controller.ts`, function from `api-client.ts`

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 15, Story 15.2]
- [Source: apps/web/src/components/shared/search-on-dropdown.tsx — current booking CTA]
- [Source: apps/api/src/pois/pois.controller.ts:32-39 — legacy tracking endpoint]
- [Source: apps/web/src/lib/api-client.ts:288-297 — legacy tracking function]
- [Source: apps/api/src/pois/dto/track-booking-click.dto.ts — legacy DTO]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
None — clean implementation, all tests pass on first run.

### Completion Notes List
- Created `analytics.ts` using `window.plausible` directly (not `usePlausible()` hook) — works both inside and outside React components, simpler API
- User tier resolved internally by SearchOnDropdown via `useSession()` + `useProfile()` — avoids prop drilling through 5+ intermediate components (map-view → SearchRangeControl → SearchOnDropdown, live page → LiveControls → SearchOnDropdown, etc.)
- Added `tier` field to `ProfileResponse` (API repository → service → frontend type) — reads from existing `profiles.tier` DB column
- Legacy `POST /pois/booking-click` endpoint removed cleanly — no component was importing the old `trackBookingClick` from api-client
- All 860 web tests + 245 API tests pass — zero regressions

### File List
- `apps/web/src/lib/analytics.ts` — **NEW** — Plausible custom event helpers (trackBookingClick, UserTier type)
- `apps/web/src/lib/analytics.test.ts` — **NEW** — Unit tests for analytics helpers
- `apps/web/src/components/shared/search-on-dropdown.tsx` — **MODIFIED** — Added analytics tracking on Booking/Airbnb link clicks, new props (page, poiType), internal userTier resolution
- `apps/web/src/components/shared/search-on-dropdown.test.tsx` — **MODIFIED** — Added mocks + 4 analytics tracking tests + clearAllMocks
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — **MODIFIED** — Pass page + poiType to SearchOnDropdown
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — **MODIFIED** — Pass page + poiType to SearchOnDropdown
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — **MODIFIED** — Pass page="map" to SearchOnDropdown
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — **MODIFIED** — Pass page="live" to SearchOnDropdown
- `apps/web/src/hooks/use-profile.ts` — **MODIFIED** — Added optional `enabled` parameter
- `apps/web/src/lib/api-client.ts` — **MODIFIED** — Removed legacy trackBookingClick function, typed tier as union
- `apps/api/src/pois/pois.controller.ts` — **MODIFIED** — Removed POST /pois/booking-click endpoint
- `apps/api/src/pois/dto/track-booking-click.dto.ts` — **DELETED** — Legacy booking click DTO
- `apps/api/src/profile/profile.repository.ts` — **MODIFIED** — Added tier to select query
- `apps/api/src/profile/profile.service.ts` — **MODIFIED** — Typed tier as union in ProfileResponse

### Senior Developer Review (AI)

**Reviewer:** Guillaume (via adversarial code review agent) — 2026-04-06
**Result:** APPROVED with fixes applied

**Issues found and fixed (3 Medium, 4 Low):**
- M1: Tightened `BookingClickProps.user_tier` to `UserTier` union type, `ProfileResponse.tier` to `'free' | 'pro' | 'team'` (analytics.ts, api-client.ts, profile.service.ts)
- M2: Added `beforeEach(() => vi.clearAllMocks())` to search-on-dropdown.test.tsx — prevents mock state leaking between analytics tests
- M3: `useProfile(!!session)` — skip API call until session is resolved, avoids 401 noise for unauthenticated edge cases (use-profile.ts, search-on-dropdown.tsx)
- L1: Removed redundant `?? 'anonymous'` — `userTier` already guaranteed non-null (search-on-dropdown.tsx)
- L2: Added `use-profile.ts` and `sprint-status.yaml` to File List (story file)
- L3: Removed unnecessary `as unknown as Record<string, string>` cast (analytics.ts)
- L4: Covered by M2 fix (clearAllMocks)
