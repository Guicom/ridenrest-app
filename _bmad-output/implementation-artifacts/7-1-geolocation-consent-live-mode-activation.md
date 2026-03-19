# Story 7.1: Geolocation Consent & Live Mode Activation

Status: done

## Story

As a **cyclist user on the road**,
I want to activate Live mode with an explicit consent step,
So that I understand what GPS data is used for before sharing my location — and the app complies with RGPD.

## Acceptance Criteria

1. **Given** a user navigates to `(app)/live/[adventureId]` for the first time,
   **When** the page loads,
   **Then** a `<GeolocationConsent />` modal appears explaining that GPS data is used locally only, never stored server-side — with "Activer" and "Annuler" buttons (FR-040, NFR-013).

2. **Given** the user taps "Activer",
   **When** the browser permission prompt appears and the user accepts,
   **Then** `navigator.geolocation.watchPosition({ enableHighAccuracy: true })` is called, `useLiveStore.activateLiveMode()` is dispatched, and the Live map view activates (FR-040, FR-041).

3. **Given** the user denies browser geolocation permission,
   **When** the denial is detected (error.code === PERMISSION_DENIED),
   **Then** the message "Géolocalisation refusée — activez-la dans les paramètres de votre navigateur" is shown and the Live mode remains inactive — no crash (NFR-032).

4. **Given** Live mode is active,
   **When** the user navigates away from the Live page,
   **Then** `watchPosition` is stopped immediately via `clearWatch()` — no background GPS tracking continues (NFR-012).

5. **Given** a returning user who previously granted permission visits the Live page,
   **When** the page loads,
   **Then** the consent modal does not re-appear — Live mode activates directly using the stored consent flag from `localStorage`.

6. **Given** the user taps "Annuler" on the consent modal,
   **When** dismissed,
   **Then** the modal closes, the user stays on the Live page in an "inactive" state with a prompt to activate, no `watchPosition` is started.

## Tasks / Subtasks

- [x] Task 1: Create `use-live-mode.ts` hook (AC: #2, #3, #4, #5)
  - [x] 1.1 Create `apps/web/src/hooks/use-live-mode.ts`
  - [x] 1.2 Implement consent persistence: read/write `localStorage` key `ridenrest:geoloc-consent` (boolean)
  - [x] 1.3 Implement `startWatching()`: calls `navigator.geolocation.watchPosition({ enableHighAccuracy: true, timeout: 10000 })` — stores `watchId` in a `useRef`
  - [x] 1.4 Implement `stopWatching()`: calls `clearWatch(watchId)`, dispatches `useLiveStore.deactivateLiveMode()`
  - [x] 1.5 On position success: call `useLiveStore.updateGpsPosition({ lat, lng })` + `useLiveStore.activateLiveMode()`
  - [x] 1.6 On position error (PERMISSION_DENIED): set `permissionDenied: true` in local state — does NOT clear consent flag
  - [x] 1.7 `useEffect` cleanup: call `stopWatching()` on unmount — ensures `clearWatch()` fires on navigation (AC #4)
  - [x] 1.8 Return `{ isLiveModeActive, hasConsented, permissionDenied, startWatching, stopWatching }` from hook

- [x] Task 2: Create `<GeolocationConsent />` component (AC: #1, #2, #3, #6)
  - [x] 2.1 Create `apps/web/src/app/(app)/live/[id]/_components/geolocation-consent.tsx`
  - [x] 2.2 Use `shadcn/ui Dialog` (already in `components/ui/dialog.tsx`) — modal is NOT dismissible via backdrop click (it's a deliberate RGPD gate)
  - [x] 2.3 Dialog content: title "Activer la géolocalisation", body explaining GPS is used locally only and never sent to the server, two buttons: primary "Activer" + ghost "Annuler"
  - [x] 2.4 On "Activer": write `localStorage` consent flag, call `onConsent()` callback, close dialog
  - [x] 2.5 On "Annuler": call `onDismiss()` callback, close dialog — no consent stored
  - [x] 2.6 Props: `open: boolean`, `onConsent: () => void`, `onDismiss: () => void`

- [x] Task 3: Create `<LiveMapCanvas />` component (AC: #2)
  - [x] 3.1 Create `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx`
  - [x] 3.2 Initialize MapLibre GL JS map with OpenFreeMap tiles (same config as `map-canvas.tsx`)
  - [x] 3.3 Display GPX trace as a white `line` layer (simplified — no density coloring in live mode)
  - [x] 3.4 Display GPS position as a pulsing dot using a `circle` layer sourced from `useLiveStore.currentPosition`
  - [x] 3.5 Auto-center map on `currentPosition` whenever it updates (pan, not fly — smoother for cycling)
  - [x] 3.6 Render `<OsmAttribution />` (required — `components/shared/osm-attribution.tsx`)
  - [x] 3.7 Accept props: `adventureId: string`, `segments: AdventureSegment[]`

- [x] Task 4: Create `live/[id]/page.tsx` route (AC: #1, #5, #6)
  - [x] 4.1 Create `apps/web/src/app/(app)/live/[id]/page.tsx`
  - [x] 4.2 Client component (`'use client'`) — needs `useEffect`, `useLiveStore`, `use-live-mode`
  - [x] 4.3 Fetch adventure + segments using TanStack Query (`useQuery(['adventures', id, 'segments'])`)
  - [x] 4.4 On mount: check `hasConsented` from `use-live-mode` — if true, call `startWatching()` immediately (AC #5), else show `<GeolocationConsent />`
  - [x] 4.5 Layout: full-bleed map (`h-dvh w-full`) with `<LiveMapCanvas />` underneath + overlays on top
  - [x] 4.6 Top overlay: "← Aventures" back link (navigates to `/adventures`) at `z-40`
  - [x] 4.7 Bottom overlay: permission denied error message when `permissionDenied === true`
  - [x] 4.8 While live mode inactive + not denied: show centered "🔴 Activer le mode Live" button to re-open consent modal

- [x] Task 5: Update `live.store.ts` — no schema changes needed, but add `setRadius` for Story 7.2 prep
  - [x] 5.1 Verify existing `useLiveStore` actions match the hook (they do — no changes needed per current state)
  - [x] 5.2 Add `searchRadiusKm: number` + `setSearchRadius: (km: number) => void` (default: 3) — prep for Story 7.2, avoids re-opening the store then

- [x] Task 6: Write tests (AC: all)
  - [x] 6.1 `use-live-mode.test.ts` (Vitest): mock `navigator.geolocation`, test `startWatching()` calls `watchPosition`, `stopWatching()` calls `clearWatch`, consent flag written to `localStorage`, unmount triggers cleanup
  - [x] 6.2 `geolocation-consent.test.tsx` (Vitest): renders dialog, "Activer" calls `onConsent`, "Annuler" calls `onDismiss`, backdrop click does NOT close dialog
  - [x] 6.3 `live-map-canvas.test.tsx` (Vitest): mock MapLibre (same pattern as `map-canvas.test.tsx`), verify map initialized, GPS marker source updated when `currentPosition` changes
  - [x] 6.4 `page.test.tsx` (Vitest): mock `use-live-mode`, verify `<GeolocationConsent />` shown when `!hasConsented`, hidden when `hasConsented`, "← Aventures" link present

## Dev Notes

### No Backend Changes

Story 7.1 is **100% frontend**. The NestJS API is not touched. No new endpoints. GPS coordinates stay in the browser — this is the RGPD constraint from `project-context.md`.

### Consent Persistence Strategy

Use `localStorage` directly — **not** Zustand persist middleware — to keep the store lightweight:

```typescript
// hooks/use-live-mode.ts
const CONSENT_KEY = 'ridenrest:geoloc-consent'

export function useLiveMode() {
  const [hasConsented, setHasConsented] = useState(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem(CONSENT_KEY) === 'true'
      : false
  )

  const grantConsent = useCallback(() => {
    localStorage.setItem(CONSENT_KEY, 'true')
    setHasConsented(true)
    startWatching()
  }, [startWatching])
  // ...
}
```

The `useLiveStore.geolocationConsented` field is for in-session state sharing between components (e.g., map layer visibility). It's reset on page refresh — that's fine because localStorage re-initializes it.

### `watchPosition` Cleanup Pattern

```typescript
const watchIdRef = useRef<number | null>(null)

const startWatching = useCallback(() => {
  if (!navigator.geolocation) return
  watchIdRef.current = navigator.geolocation.watchPosition(
    (pos) => {
      updateGpsPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      activateLiveMode()
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) setPermissionDenied(true)
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  )
}, [activateLiveMode, updateGpsPosition])

useEffect(() => {
  return () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
      deactivateLiveMode()
    }
  }
}, [deactivateLiveMode])
```

### `GeolocationConsent` Dialog — Non-Dismissible via Backdrop

RGPD-gate: users must make an explicit choice. Use `onInteractOutside={(e) => e.preventDefault()}` on `DialogContent`:

```tsx
<DialogContent onInteractOutside={(e) => e.preventDefault()}>
```

This is from Radix UI / shadcn dialog API — already available.

### GPS Position Marker — MapLibre Pattern

```typescript
// In live-map-canvas.tsx
// Source: 'live-gps-position' — updated via setData()
map.addSource('live-gps-position', {
  type: 'geojson',
  data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }
})
map.addLayer({
  id: 'gps-dot',
  type: 'circle',
  source: 'live-gps-position',
  paint: {
    'circle-radius': 10,
    'circle-color': '#2D6A4A',   // --primary
    'circle-opacity': 0.9,
    'circle-stroke-width': 3,
    'circle-stroke-color': '#FFFFFF',
  }
})

// Update on position change:
(map.getSource('live-gps-position') as maplibregl.GeoJSONSource).setData({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },  // GeoJSON = [lng, lat]
  properties: {}
})
```

⚠️ GeoJSON coordinates order is `[lng, lat]` — but `useLiveStore` uses `{ lat, lng }`. Convert carefully.

### MapLibre — Same Init Pattern as `map-canvas.tsx`

The Live page map uses the same OpenFreeMap tiles as the Planning map. Copy the `maplibregl.Map` init config from `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` (style URL, attribution config). Do NOT copy-paste the entire file — extract only the init block. Import `maplibregl` from `'maplibre-gl'`.

### Live Page Layout

```
h-dvh w-full relative overflow-hidden
├── <LiveMapCanvas />  (absolute inset-0, z-0)
├── Top bar (absolute top-4 left-4, z-40)
│     └── "← Aventures" button (ghost, small)
├── <GeolocationConsent /> (Dialog, z-60, when !hasConsented)
└── Bottom overlay (absolute bottom-8 left-0 right-0, z-30)
      └── permissionDenied: error message
      └── !isLiveModeActive && !permissionDenied: "Activer le mode Live" button
```

Z-index convention (from UX spec):
- Map canvas: z-0
- Map controls: z-30
- Back button: z-40
- Modals: z-60

### `OsmAttribution` — Always Required

```tsx
// In live-map-canvas.tsx (same as map-canvas.tsx)
import { OsmAttribution } from '@/components/shared/osm-attribution'
// Render inside the map container div
```

### TanStack Query — Segments Fetch

```typescript
// In live/[id]/page.tsx
const { data: segments, isPending } = useQuery({
  queryKey: ['adventures', adventureId, 'segments'],
  queryFn: () => apiClient.get<AdventureSegment[]>(`/adventures/${adventureId}/segments`),
})
```

Use the existing `['adventures', adventureId, 'segments']` key — do NOT invent a new one.

### Zustand Store — `searchRadiusKm` Addition

Add to `live.store.ts` now to avoid a two-step diff when Story 7.2 arrives:

```typescript
interface LiveState {
  // ... existing fields ...
  searchRadiusKm: number        // Add: default 3 km
  setSearchRadius: (km: number) => void  // Add
}
// In create(): searchRadiusKm: 3, setSearchRadius: (km) => set({ searchRadiusKm: km })
```

### Project Structure — New Files

```
apps/web/src/
├── app/(app)/live/[id]/
│   ├── page.tsx                        ← NEW (client component)
│   └── _components/
│       ├── geolocation-consent.tsx     ← NEW
│       ├── geolocation-consent.test.tsx ← NEW
│       ├── live-map-canvas.tsx         ← NEW
│       └── live-map-canvas.test.tsx    ← NEW
├── hooks/
│   ├── use-live-mode.ts               ← NEW
│   └── use-live-mode.test.ts          ← NEW
└── stores/
    └── live.store.ts                  ← UPDATE (add searchRadiusKm)
```

### Previous Stories Intelligence

**From Story 6.1 (weather layer + MapLibre popup):**
- MapLibre must be mocked in Vitest tests — use `vi.hoisted()` for the mock to avoid dynamic import interception issues. See `map-canvas.test.tsx` for the established pattern.
- `'use client'` is required for any component using MapLibre, `useEffect`, or Zustand stores.

**From Story 5.2 (density layer):**
- MapLibre event listeners must be cleaned up in `useEffect` return — same principle applies to `watchPosition` cleanup.
- Layer ordering matters: add `'gps-dot'` layer AFTER the trace layers so it renders on top.

**From Story 4.2 (POI pin display):**
- The `OsmAttribution` component is required on every map view — without exception.

### Git Context (Last 5 Commits)

```
6dbb412 feat(story-6.2): wind arrows proportional to wind speed
c8d769c fix(story-6.1): use class constructor in popup mock to fix dynamic import interception
8ed3461 fix(story-6.1): code review — fix popup tests using vi.hoisted for mock hoisting
a4230e5 feat(story-6.1): pace-adjusted weather forecast on map
bbf0b91 fix(story-5.2): code review — event listener cleanup, layer ordering, test assertions
```

Key learnings:
- **MapLibre mock must use class constructor syntax** (not object mock) — see fix commit c8d769c
- **`vi.hoisted()`** required for mocks that intercept dynamic imports — see 8ed3461
- **Event listener cleanup** must be in `useEffect` return — see bbf0b91

### References

- Epics: Epic 7, Story 7.1 — `_bmad-output/planning-artifacts/epics.md`
- Architecture: Live mode data flow, file structure — `_bmad-output/planning-artifacts/architecture.md`
- UX: `<GeolocationConsent>` design, Live mode UX — `_bmad-output/planning-artifacts/ux-design-specification.md`
- RGPD GPS rule: `_bmad-output/project-context.md#RGPD — Geolocation Rule`
- Existing store: `apps/web/src/stores/live.store.ts`
- Map pattern reference: `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- OsmAttribution: `apps/web/src/components/shared/osm-attribution.tsx`
- Dialog: `apps/web/src/components/ui/dialog.tsx`

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

### Completion Notes List

- ✅ Task 1: `useLiveMode` hook with consent persistence (localStorage), watchPosition/clearWatch lifecycle, PERMISSION_DENIED handling, unmount cleanup
- ✅ Task 2: `<GeolocationConsent />` RGPD-gate modal using base-ui Dialog — non-dismissible via backdrop (onOpenChange noop), showCloseButton=false
- ✅ Task 3: `<LiveMapCanvas />` with MapLibre init (same OpenFreeMap tiles as planning map), white GPX trace layer, GPS dot circle layer, Zustand subscription for position updates with panTo
- ✅ Task 4: `live/[id]/page.tsx` client component — consent flow, auto-start on returning user, back link, permission denied message, "Activer le mode Live" button
- ✅ Task 5: Added `searchRadiusKm: 3` + `setSearchRadius()` to live.store.ts (Story 7.2 prep)
- ✅ Task 6: 35 tests across 5 test files — all pass, zero regressions (252 total)
- Dialog uses `@base-ui/react` (not Radix) — used `onOpenChange={() => {}}` + `showCloseButton={false}` instead of `onInteractOutside`
- LiveMapCanvas uses `MapSegmentData` (with waypoints) not `AdventureSegmentResponse` (no waypoints)
- Page uses `getAdventureMapData` query key `['adventures', id, 'map']` to get segments with waypoints

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] "Activer le mode Live" button was a dead click — called `setShowConsent(true)` but consent dialog open condition `showConsent && !hasConsented` always false when `hasConsented=true`. Fixed: button now calls `startWatching()` directly [page.tsx:91]
- [x] [AI-Review][HIGH] No prompt to re-activate after user taps "Annuler" — button only rendered when `hasConsented`. Fixed: added second button branch for `!hasConsented && !showConsent` state [page.tsx:97-104]
- [x] [AI-Review][HIGH] Trace color `#E44C26` contradicted story spec "white line layer". Fixed: `TRACE_COLOR = '#FFFFFF'` [live-map-canvas.tsx:15]
- [x] [AI-Review][MEDIUM] 4x console.log/console.error in production hook. Fixed: removed all debug logging [use-live-mode.ts]
- [x] [AI-Review][MEDIUM] No test for RGPD backdrop non-dismissibility. Fixed: added "does not close on backdrop click" test [geolocation-consent.test.tsx]
- [x] [AI-Review][MEDIUM] `useLiveStore.geolocationConsented` never updated by any code. Fixed: `grantConsent()` now calls `setGeolocationConsent(true)` [use-live-mode.ts]

### Change Log

- 2026-03-19: Story 7.1 implementation complete — geolocation consent, live mode hook, live map canvas, live page route, store update
- 2026-03-19: Code review — fixed 6 issues (3 HIGH, 3 MEDIUM): dead-click activate button, missing post-dismiss prompt, wrong trace color, console.log in prod, missing RGPD backdrop test, store consent sync

### File List

- apps/web/src/hooks/use-live-mode.ts (NEW)
- apps/web/src/hooks/use-live-mode.test.ts (NEW)
- apps/web/src/app/(app)/live/[id]/page.tsx (NEW)
- apps/web/src/app/(app)/live/[id]/page.test.tsx (NEW)
- apps/web/src/app/(app)/live/[id]/_components/geolocation-consent.tsx (NEW)
- apps/web/src/app/(app)/live/[id]/_components/geolocation-consent.test.tsx (NEW)
- apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx (NEW)
- apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx (NEW)
- apps/web/src/stores/live.store.ts (MODIFIED — added searchRadiusKm + setSearchRadius)
- apps/web/src/stores/live.store.test.ts (MODIFIED — added searchRadiusKm tests)
