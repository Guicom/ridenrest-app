# Story 7.4: Graceful Degradation on Unstable Connection

Status: done

## Story

As a **cyclist user in Live mode on a poor mobile connection**,
I want clear visual feedback when the network is degraded — and to keep seeing previously loaded results,
So that I can still navigate and find a place to stop even when the app can't refresh data.

## Acceptance Criteria

1. **Given** a POI search request fails (timeout or network error) in Live mode,
   **When** TanStack Query surfaces the error (after its built-in 3 retries),
   **Then** previously loaded POIs remain visible on the map (no clear) AND a `<StatusBanner />` appears: "Connexion instable — X hébergements chargés" — X = count from last successful fetch (FR-045).

2. **Given** a network error is active,
   **When** the connection is restored,
   **Then** TanStack Query automatically retries (`refetchOnReconnect` default) — the `<StatusBanner />` disappears on success — no user action required (FR-045).

3. **Given** `navigator.onLine` returns `false` (complete offline),
   **When** the Live page is open,
   **Then** a "Mode hors ligne — données non disponibles" banner replaces the error banner — no crash (NFR-032).

4. **Given** the device goes offline while Live mode is active,
   **When** the `offline` window event fires,
   **Then** a `useNetworkStatus` hook detects it and the offline banner appears immediately — GPS dot and last known POIs remain on the map.

5. **Given** the device comes back online,
   **When** the `online` window event fires,
   **Then** the offline banner disappears and a fresh POI fetch is triggered automatically.

6. **Given** Live mode is active and `isError` is true for weather but NOT for POIs,
   **When** the UI renders,
   **Then** only the weather error indicator in `<LiveWeatherPanel />` is shown (already implemented in 7.3) — no duplicate banner for weather.

## Tasks / Subtasks

### Frontend Only — No Backend Changes

- [x] Task 1: Create `useNetworkStatus` hook (AC: #3, #4, #5)
  - [x] 1.1 Create `apps/web/src/hooks/use-network-status.ts`
  - [x] 1.2 Implementation:
    ```typescript
    import { useEffect, useState } from 'react'

    export function useNetworkStatus() {
      const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
      )

      useEffect(() => {
        const handleOnline = () => setIsOnline(true)
        const handleOffline = () => setIsOnline(false)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        return () => {
          window.removeEventListener('online', handleOnline)
          window.removeEventListener('offline', handleOffline)
        }
      }, [])

      return { isOnline }
    }
    ```
  - [x] 1.3 SSR-safe: initialize with `navigator.onLine` — returns `true` on server (no window)
  - [x] 1.4 Write tests in `use-network-status.test.ts` (Vitest):
    - initial state = `true` (navigator.onLine mock)
    - dispatching `offline` event → `isOnline` becomes `false`
    - dispatching `online` event → `isOnline` becomes `true`
    - cleanup: event listeners removed on unmount

- [x] Task 2: Create `<StatusBanner />` component (AC: #1, #2, #3)
  - [x] 2.1 Create `apps/web/src/app/(app)/live/[id]/_components/status-banner.tsx`
  - [x] 2.2 Props:
    ```typescript
    interface StatusBannerProps {
      variant: 'error' | 'offline'
      message: string
    }
    ```
  - [x] 2.3 Render: fixed bar above `<LiveControls />` (z-30), full width, translucent background:
    ```tsx
    <div
      role="status"
      aria-live="polite"
      data-testid="status-banner"
      className={`absolute bottom-[calc(var(--live-controls-height,120px))] left-0 right-0 z-30 px-4 py-2 text-center text-sm font-medium backdrop-blur-sm ${
        variant === 'offline'
          ? 'bg-destructive/90 text-destructive-foreground'
          : 'bg-amber-500/90 text-white'
      }`}
    >
      {message}
    </div>
    ```
  - [x] 2.4 Positioning: use `bottom-0` offset relative to `<LiveControls />` height. If `isExpanded` unknown, use `bottom-24` as safe default — the banner sits just above the controls drawer.
  - [x] 2.5 Write tests in `status-banner.test.tsx` (Vitest):
    - renders message text
    - `variant="offline"` → destructive classes
    - `variant="error"` → amber classes
    - `role="status"` + `aria-live="polite"` present

- [x] Task 3: Wire banner into `live/[id]/page.tsx` (AC: #1, #2, #3, #4, #5, #6)
  - [x] 3.1 Import `useNetworkStatus` and `<StatusBanner />`
  - [x] 3.2 Add to page:
    ```typescript
    const { isOnline } = useNetworkStatus()
    const { pois, isPending: poisPending, isError: poisError } = useLivePoisSearch(segmentId)
    ```
    Note: `useLivePoisSearch` already returns `isError` — expose it (currently destructured as `{ pois, targetKm }` only — add `isError`)
  - [x] 3.3 Compute banner state:
    ```typescript
    const showOfflineBanner = !isOnline && isLiveModeActive
    const showErrorBanner = isOnline && poisError && isLiveModeActive && !poisPending
    const poisCount = pois.length
    ```
  - [x] 3.4 Render banners (only when live mode active AND mounted):
    ```tsx
    {mounted && showOfflineBanner && (
      <StatusBanner variant="offline" message="Mode hors ligne — données non disponibles" />
    )}
    {mounted && showErrorBanner && !showOfflineBanner && (
      <StatusBanner
        variant="error"
        message={`Connexion instable — ${poisCount} hébergement${poisCount !== 1 ? 's' : ''} chargé${poisCount !== 1 ? 's' : ''}`}
      />
    )}
    ```
  - [x] 3.5 No banner for weather errors — already handled by `<LiveWeatherPanel />` "Météo non disponible" (AC #6)
  - [x] 3.6 Update `page.test.tsx`:
    - offline banner appears when `navigator.onLine = false`
    - error banner appears when `poisError = true` AND `isOnline = true`
    - no banner when `isLiveModeActive = false`
    - banner disappears when POI query succeeds after error

- [x] Task 4: Expose `isError` from `useLivePoisSearch` (AC: #1)
  - [x] 4.1 In `apps/web/src/hooks/use-live-poi-search.ts`, add `isError` to the return value:
    ```typescript
    const { data: pois = [], isPending, isError } = useQuery({ ... })
    return { pois, isPending, targetKm, isError }
    ```
  - [x] 4.2 Update `use-live-poi-search.test.ts` — verify `isError` returned correctly

## Dev Notes

### Why TanStack Query Already Handles Most of This

TanStack Query v5 defaults that make this story lightweight:
- `retry: 3` + exponential backoff → 3 automatic retries before surfacing `isError`
- `refetchOnReconnect: true` → auto re-fetch when connection restores
- `data` field retains last successful value when `isError = true` → POIs stay visible

Story 7.4's real contribution is **UI feedback only** — users already get resilient data, they just have no visual indicator of the problem.

### POI Data Retention — Already Working

In `useLivePoisSearch`:
```typescript
const { data: pois = [] } = useQuery({ ... })
```

When TanStack Query has previously fetched pois for a given queryKey, and a subsequent fetch fails:
- `data` = last successful result (cached in memory)
- `isError = true`
- So `pois` = last loaded set — POIs already stay on the map without any code change

The `= []` fallback only kicks in when there is NO previous cached data (first fetch ever for this queryKey).

### `<StatusBanner />` Positioning

The banner sits between the map and `<LiveControls />`. Since `<LiveControls />` uses `absolute bottom-0`, the banner must be positioned above it. Use:

```tsx
// In page.tsx layout, order matters:
// 1. <LiveMapCanvas />        z-0
// 2. <StatusBanner />         z-30, bottom-24 (above controls)
// 3. <LiveControls />         z-30, bottom-0
// 4. <GeolocationConsent />   z-60
```

### `useNetworkStatus` — SSR Safety

Next.js may render the live page on the server (though it's `'use client'`). The hook guards against `typeof navigator !== 'undefined'` to avoid server-side crashes.

### No "Partial Results by Category" Scope

The epics describe per-category failure handling. This is not feasible with the current single-call API design (`GET /pois` returns all categories at once). Deferred to a potential future API refactor. Not in scope for 7.4.

### Previous Story Intelligence (7.3)

- `<LiveWeatherPanel />` already shows "Météo non disponible" on `isError` — do NOT add weather errors to `<StatusBanner />`
- `page.tsx` already imports and uses `useLivePoisSearch`, `useLiveWeather`, `useLiveMode`, `useLiveStore` — add `useNetworkStatus` alongside
- `mounted` guard already in `page.tsx` — wrap all new UI in `{mounted && ...}` to avoid hydration mismatch
- `isLiveModeActive` already in scope from `useLiveMode()` destructuring

### Anti-Patterns to Avoid

```typescript
// ❌ Clearing pois on network error
setQueryData(['pois', 'live', ...], [])  // destroys cached data
// ✅ Let TanStack Query retain data — it already does this

// ❌ Polling navigator.onLine in a setInterval
// ✅ window events 'online'/'offline' — event-driven, no polling

// ❌ Showing StatusBanner when live mode is inactive
// ✅ Guard: showOfflineBanner = !isOnline && isLiveModeActive

// ❌ Duplicate error UI for weather (already in LiveWeatherPanel)
// ✅ StatusBanner only for POI errors
```

### Project Structure — New / Modified Files

```
apps/web/src/
├── hooks/
│   ├── use-network-status.ts          ← NEW
│   └── use-network-status.test.ts     ← NEW
│   └── use-live-poi-search.ts         ← MODIFY (expose isError)
│   └── use-live-poi-search.test.ts    ← MODIFY (test isError)
├── app/(app)/live/[id]/
│   ├── page.tsx                       ← MODIFY (useNetworkStatus, banners)
│   ├── page.test.tsx                  ← MODIFY (banner scenarios)
│   └── _components/
│       ├── status-banner.tsx          ← NEW
│       └── status-banner.test.tsx     ← NEW
```

### References

- Epics: Epic 7, Story 7.4 — `_bmad-output/planning-artifacts/epics.md`
- Previous stories: `7-2-real-time-poi-discovery-by-target-distance-configurable-radius.md`, `7-3-live-mode-weather-gps-based.md`
- Live POI search hook: `apps/web/src/hooks/use-live-poi-search.ts`
- Live weather panel (weather errors already handled): `apps/web/src/app/(app)/live/[id]/_components/live-weather-panel.tsx`
- Live page: `apps/web/src/app/(app)/live/[id]/page.tsx`
- TanStack Query v5 docs: `retry`, `refetchOnReconnect`, `placeholderData`
- Project context: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None — clean implementation, no issues.

### Completion Notes List

- Task 1: Created `useNetworkStatus` hook — SSR-safe, event-driven online/offline detection. 5 tests.
- Task 2: Created `<StatusBanner />` component — two variants (error/amber, offline/destructive), positioned above LiveControls. 5 tests.
- Task 4: Exposed `isError` from `useLivePoisSearch` return value. 2 tests added.
- Task 3: Wired `useNetworkStatus` + `<StatusBanner />` into live page. Computed banner state guards (isOnline, isLiveModeActive, poisError). 5 page tests added.
- TanStack Query's built-in retry (3x) + `refetchOnReconnect` + cached data retention handle AC #1/#2 automatically — story only adds UI feedback.
- Weather errors NOT duplicated in StatusBanner — already handled by LiveWeatherPanel (AC #6).
- Total: 31 tests across 4 files, 308 tests full regression — 0 failures, 0 lint errors.

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Redundant `!showOfflineBanner` guard in error banner JSX — `showErrorBanner` already requires `isOnline=true` making `!showOfflineBanner` always true [page.tsx:175]
- [ ] [AI-Review][LOW] No animation/transition on StatusBanner appear/disappear — `animate-slideUp` or `transition-opacity` would reduce flicker on unstable connections [status-banner.tsx]
- [ ] [AI-Review][MEDIUM] `ux-design-specification.md` modified in working tree (`--trace-default` color change) — not related to story 7.4, should be committed separately or reverted

### Change Log

- 2026-03-19: Implemented story 7.4 — graceful degradation on unstable connection (all 4 tasks, all 6 ACs)
- 2026-03-19: Code review — fixed 4 issues: added missing mocks (useLiveWeather, useLiveStore, useUIStore, LiveWeatherOverlay) in page.test.tsx, corrected banner copy "hébergements" → "résultats" (POIs include all 4 categories)

### File List

- `apps/web/src/hooks/use-network-status.ts` — NEW
- `apps/web/src/hooks/use-network-status.test.ts` — NEW
- `apps/web/src/app/(app)/live/[id]/_components/status-banner.tsx` — NEW
- `apps/web/src/app/(app)/live/[id]/_components/status-banner.test.tsx` — NEW
- `apps/web/src/hooks/use-live-poi-search.ts` — MODIFIED (exposed isError)
- `apps/web/src/hooks/use-live-poi-search.test.ts` — MODIFIED (isError tests)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — MODIFIED (useNetworkStatus, banners)
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` — MODIFIED (banner test scenarios)
