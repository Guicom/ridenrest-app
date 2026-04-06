# Story 15.2: Click Tracking Enrichi — Booking Deep Links (FR-062)

Status: ready-for-dev

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

- [ ] **Task 1: Create Plausible event helper** (AC: #1, #4)
  - [ ] Create `apps/web/src/lib/analytics.ts` — thin wrapper around `usePlausible()` from `next-plausible`
  - [ ] Export `trackBookingClick(props: BookingClickProps)` function
  - [ ] Type `BookingClickProps`: `{ source: 'booking.com' | 'airbnb', poi_type: string, page: 'map' | 'live', user_tier: string }`
  - [ ] NO PII: no user ID, no email, no GPS coordinates, no POI external ID

- [ ] **Task 2: Instrument SearchOnDropdown** (AC: #1)
  - [ ] In `apps/web/src/components/shared/search-on-dropdown.tsx`:
  - [ ] Add new props: `page: 'map' | 'live'`, `poiType?: string`, `userTier?: string`
  - [ ] On Booking.com link click: call `trackBookingClick({ source: 'booking.com', poi_type: poiType ?? 'none', page, user_tier: userTier ?? 'anonymous' })`
  - [ ] On Airbnb link click: same with `source: 'airbnb'`
  - [ ] Update all call sites to pass `page` and optional `poiType` / `userTier`

- [ ] **Task 3: Instrument POI popup and detail sheet booking links** (AC: #1)
  - [ ] In `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — if booking links exist there
  - [ ] In `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — if booking links exist there
  - [ ] Extract `poi_type` from the POI data, `page` from context, `user_tier` from auth session

- [ ] **Task 4: Remove legacy server-side tracking** (AC: #2)
  - [ ] Remove `POST /pois/booking-click` endpoint from `apps/api/src/pois/pois.controller.ts`
  - [ ] Remove `apps/api/src/pois/dto/track-booking-click.dto.ts`
  - [ ] Remove `trackBookingClick()` from `apps/web/src/lib/api-client.ts` (lines 288-297)
  - [ ] Remove any imports/usages of the old `trackBookingClick` in components

- [ ] **Task 5: Get user tier for event props** (AC: #1)
  - [ ] Use existing auth session to get `user.tier` (from `profiles` table via Better Auth)
  - [ ] If no session → `user_tier: 'anonymous'`
  - [ ] Pass tier down to SearchOnDropdown and POI detail components

- [ ] **Task 6: Tests** (AC: #1, #2)
  - [ ] Vitest: `analytics.ts` — verify `trackBookingClick` calls `plausible()` with correct event name and props
  - [ ] Vitest: SearchOnDropdown — verify click handlers fire analytics event with correct props
  - [ ] Vitest: verify no remaining imports of old `trackBookingClick` from `api-client`
  - [ ] Update `apps/web/src/components/shared/search-on-dropdown.test.tsx`
  - [ ] Update `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx`

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

### Debug Log References

### Completion Notes List

### File List
