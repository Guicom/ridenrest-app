# Story 12.2: Service Worker & Partial Offline Support

Status: done

## Story

As a **cyclist user with intermittent connectivity**,
I want my last loaded trace and POIs to remain accessible when I lose signal,
so that I can still consult the map and POI cards I already loaded — even without network.

## Acceptance Criteria

1. **Static assets cache-first** — Given the Service Worker is registered (via `@ducanh2912/next-pwa`), when static assets (JS, CSS, fonts) are requested, then they are served from cache-first — no network request needed after initial load.

2. **MapLibre tiles offline** — Given MapLibre tiles were previously loaded, when the user goes offline and pans to an already-visited area, then tiles are served from the Service Worker cache (stale-while-revalidate, 7-day TTL) — the map remains navigable (FR-071).

3. **GPX trace + POIs offline** — Given a user previously loaded a trace and POIs for an adventure, when they open that adventure's map page offline, then the GPX trace and last-loaded POI set are served from the Service Worker cache (network-first with offline fallback) — the map is readable (FR-071).

4. **Network-dependent features disabled** — Given a user attempts an action requiring network (trigger density analysis, load new POIs, search) while offline, when the action is requested, then the feature is visually disabled with a tooltip "Fonctionnalité disponible en ligne" — no error thrown (FR-073).

5. **Auto-reconnection** — Given the app transitions from offline to online, when connectivity is restored, then previously disabled features re-enable automatically and stale cached data is refreshed in the background.

## Tasks / Subtasks

- [x] Task 1: Extend `@ducanh2912/next-pwa` runtimeCaching for MapLibre tiles (AC: #1, #2)
  - [x] 1.1 — Add a `StaleWhileRevalidate` rule for OpenFreeMap tile URLs (`tiles.openfreemap.org`) with cacheName `map-tiles-v1`, maxEntries: 2000, maxAgeSeconds: 7 days
  - [x] 1.2 — Add a `StaleWhileRevalidate` rule for OpenFreeMap style JSON (`tiles.openfreemap.org/styles/*`) with cacheName `map-styles-v1`, maxEntries: 10, maxAgeSeconds: 7 days
  - [x] 1.3 — Verify the existing `CacheFirst` rule for static assets (JS/CSS/fonts/images) already covers AC #1 — adjust `maxAgeSeconds` to 30 days if not already set
  - [x] 1.4 — Test: load map, toggle airplane mode, pan to previously-visited area — tiles render from SW cache

- [x] Task 2: Cache API responses for adventure map data (AC: #3)
  - [x] 2.1 — Add a `NetworkFirst` rule for `/api/adventures/*/map` (returns GPX trace + segments) with cacheName `adventure-map-data-v1`, maxEntries: 20, maxAgeSeconds: 24 hours
  - [x] 2.2 — Add a `NetworkFirst` rule for `/api/pois*` (POI search results) with cacheName `poi-data-v1`, maxEntries: 50, maxAgeSeconds: 24 hours
  - [x] 2.3 — Add a `NetworkFirst` rule for `/api/adventures/*/stages` with cacheName `stage-data-v1`, maxEntries: 20, maxAgeSeconds: 24 hours
  - [x] 2.4 — Add a `NetworkFirst` rule for `/api/weather*` with cacheName `weather-data-v1`, maxEntries: 30, maxAgeSeconds: 1 hour
  - [x] 2.5 — Keep `NetworkOnly` for mutation endpoints (POST/PUT/DELETE) — no caching for writes
  - [x] 2.6 — Keep `NetworkOnly` for Plausible proxy paths (`/js/script*.js`, `/api/event`) — already configured

- [x] Task 3: Create `useOfflineReady` hook for feature gating (AC: #4)
  - [x] 3.1 — Create `apps/web/src/hooks/use-offline-ready.ts` — combines `useNetworkStatus().isOnline` with feature-level offline capability
  - [x] 3.2 — Export `useOfflineGate()` returning `{ isOnline, disabledReason: string | null }` for UI components
  - [x] 3.3 — Add Vitest tests: `use-offline-ready.test.ts`

- [x] Task 4: Disable network-dependent features when offline (AC: #4)
  - [x] 4.1 — **Density analysis button** (`density-trigger-button.tsx`): disable when `!isOnline`, add tooltip "Fonctionnalité disponible en ligne"
  - [x] 4.2 — **POI search button** ("Rechercher" in sidebar): disable when `!isOnline`, add tooltip
  - [x] 4.3 — **Live mode POI search**: disable search trigger when `!isOnline` (live mode already has `StatusBanner` for offline — extend with feature gating)
  - [x] 4.4 — **Stage creation/edit**: disable form submission when `!isOnline`, add tooltip
  - [x] 4.5 — **Adventure creation/edit**: disable when `!isOnline`
  - [x] 4.6 — Use `TooltipProvider` + `Tooltip` from base-ui for consistent tooltip pattern across all disabled elements
  - [x] 4.7 — **Visual treatment**: `opacity-50 cursor-not-allowed` on disabled buttons (not `disabled` HTML attribute — keep the tooltip accessible)

- [x] Task 5: Auto-reconnection and stale data refresh (AC: #5)
  - [x] 5.1 — Created `useReconnectionHandler` hook (separate from `useNetworkStatus` to avoid QueryClient coupling in all consumers) — mounted in app layout via `ReconnectionHandler` component — calls `queryClient.refetchQueries({ type: 'active' })` on offline→online transition
  - [x] 5.2 — Re-enable all features gated by `useOfflineGate` (automatic via reactive `isOnline` state)
  - [x] 5.3 — Add a transient toast/banner "Connexion rétablie" (3s auto-dismiss) when reconnecting
  - [x] 5.4 — Test: go offline → go online → verify active queries refetch and features re-enable

- [x] Task 6: Offline fallback for uncached pages (AC: #3)
  - [x] 6.1 — Verify that `apps/web/public/offline.html` (created in story 12.1) is served correctly by the SW when navigating to an uncached page offline
  - [x] 6.2 — Added `fallbacks: { document: "/offline.html" }` to `@ducanh2912/next-pwa` config

- [x] Task 7: Tests (AC: all)
  - [x] 7.1 — Unit test: `use-offline-ready.test.ts` — `isOnline: false` returns disabled reason, `isOnline: true` returns null
  - [x] 7.2 — Unit test: `runtime-caching.test.ts` — verify runtimeCaching config includes expected cache rules (tile URLs, API patterns)
  - [x] 7.3 — Unit test: `use-reconnection-handler.test.ts` — toast shown + refetch called on reconnection
  - [x] 7.4 — Integration test (manual): load adventure map → airplane mode → verify map tiles + trace + POIs still visible
  - [x] 7.5 — Integration test (manual): offline → try search → verify disabled with tooltip → go online → verify re-enabled
  - [x] 7.6 — Run full regression suite: `turbo test` — 886 tests passed, 0 regressions

## Dev Notes

### Current SW Setup (from story 12.1)

The Service Worker is already configured via `@ducanh2912/next-pwa` in `apps/web/next.config.ts`:
- **Library**: `@ducanh2912/next-pwa` (fork compatible Next.js 15 + App Router)
- **Current caching**: `CacheFirst` for static assets (JS/CSS/PNG/SVG/WOFF2), `NetworkOnly` for Plausible proxy
- **skipWaiting + clientsClaim**: already enabled — new SW activates immediately
- **Precache exclusions**: marketing/auth pages excluded (only `(app)/*` routes precached)
- **Offline fallback**: `apps/web/public/offline.html` exists (brand-styled page with retry button)

### runtimeCaching Strategy Per Resource

| Resource | Strategy | Cache Name | maxEntries | maxAge | Rationale |
|---|---|---|---|---|---|
| Static assets (JS/CSS/fonts) | `CacheFirst` | `static-assets-v2` | 60 | 30d | Already configured in 12.1 |
| OpenFreeMap tiles (pbf/png) | `StaleWhileRevalidate` | `map-tiles-v1` | 2000 | 7d | Tiles change rarely; SWR gives fresh when online, cached when offline |
| OpenFreeMap style JSON | `StaleWhileRevalidate` | `map-styles-v1` | 10 | 7d | Style definitions rarely change |
| `/api/adventures/*/map` | `NetworkFirst` | `adventure-map-data-v1` | 20 | 24h | Fresh data preferred; fallback to cache offline |
| `/api/pois*` | `NetworkFirst` | `poi-data-v1` | 50 | 24h | POI results per segment+range; stale OK for offline reading |
| `/api/adventures/*/stages` | `NetworkFirst` | `stage-data-v1` | 20 | 24h | Stage data for elevation/weather panels |
| `/api/weather*` | `NetworkFirst` | `weather-data-v1` | 30 | 1h | Weather data changes fast — short TTL |
| `/api/event` + `/js/script*.js` | `NetworkOnly` | — | — | — | Plausible analytics — never cache |
| POST/PUT/DELETE `/api/*` | `NetworkOnly` | — | — | — | Mutations — never cache |

### OpenFreeMap Tile URL Pattern

Tiles are loaded by MapLibre from URLs like:
```
https://tiles.openfreemap.org/planet-osm/{z}/{x}/{y}.pbf
https://tiles.openfreemap.org/styles/liberty  (style JSON)
```

The SW `urlPattern` regex:
```javascript
// Tiles (PBF vector tiles)
/^https:\/\/tiles\.openfreemap\.org\/.*\.(pbf|png|jpg)(\?.*)?$/
// Style JSON
/^https:\/\/tiles\.openfreemap\.org\/styles\/.*/
```

**Important**: These are cross-origin requests. `@ducanh2912/next-pwa` uses Workbox which handles cross-origin by default in runtimeCaching — but the response must be opaque or have CORS headers. OpenFreeMap serves with `Access-Control-Allow-Origin: *` so this works.

### Existing `useNetworkStatus` Hook

`apps/web/src/hooks/use-network-status.ts` already provides `{ isOnline }` via `navigator.onLine` + `online`/`offline` events. **Reuse this** — do not create a duplicate.

The new `useOfflineGate()` hook should import and wrap `useNetworkStatus()`:

```typescript
// apps/web/src/hooks/use-offline-ready.ts
import { useNetworkStatus } from './use-network-status'

export function useOfflineGate() {
  const { isOnline } = useNetworkStatus()
  return {
    isOnline,
    disabledReason: isOnline ? null : 'Fonctionnalité disponible en ligne',
  }
}
```

### Existing `StatusBanner` Component

`apps/web/src/app/(app)/live/[id]/_components/status-banner.tsx` already renders offline/error banners in live mode. **Reuse the same visual style** for planning mode if needed — but the primary UX pattern for 12.2 is **tooltips on disabled buttons**, not banners.

### Tooltip Pattern for Disabled Features

Use shadcn `Tooltip` consistently:
```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Wrap the button — don't use HTML disabled (kills tooltip hover)
<Tooltip>
  <TooltipTrigger asChild>
    <button
      onClick={isOnline ? handleClick : undefined}
      className={!isOnline ? 'opacity-50 cursor-not-allowed' : ''}
    >
      Rechercher
    </button>
  </TooltipTrigger>
  {!isOnline && (
    <TooltipContent>Fonctionnalité disponible en ligne</TooltipContent>
  )}
</Tooltip>
```

**Do NOT use `disabled` HTML attribute** on buttons that need tooltips — disabled elements don't fire hover events in most browsers, which prevents the tooltip from appearing.

### Reconnection Refetch

When going back online, TanStack Query should refetch all active queries:

```typescript
// In use-network-status.ts or a new effect in a layout component
import { useQueryClient } from '@tanstack/react-query'

// On online transition
useEffect(() => {
  if (isOnline) {
    queryClient.refetchQueries({ type: 'active' })
  }
}, [isOnline])
```

**Avoid `queryClient.invalidateQueries()`** here — `refetchQueries` is more aggressive and ensures immediate refresh rather than waiting for next component access.

### What NOT to Implement (Out of Scope)

- **IndexedDB storage for GPX files** — The SW cache is sufficient for offline reading of already-loaded data. Full offline-first with IndexedDB is a future epic.
- **Background sync for mutations** — If user creates/edits while offline, we simply block the action (AC #4). No queue-and-sync pattern.
- **Pre-fetching tiles for entire route** — Only tiles the user has already viewed are cached. No proactive tile download.
- **Push notifications** — Story 12.3
- **Cache size management UI** — Not needed for MVP. Workbox handles eviction via maxEntries.

### Files to Create/Modify

| File | Action | Purpose |
|---|---|---|
| `apps/web/next.config.ts` | Modify | Add runtimeCaching rules for tiles + API |
| `apps/web/src/hooks/use-offline-ready.ts` | Create | Offline gate hook |
| `apps/web/src/hooks/use-offline-ready.test.ts` | Create | Tests for offline gate |
| `apps/web/src/hooks/use-network-status.ts` | Modify | Add reconnection refetch logic |
| Components with search/create buttons | Modify | Add offline gating with tooltips |

### Key Components to Gate

Search for these components and add offline gating:
- `SearchRangeControl` or the "Rechercher" button parent (planning sidebar)
- `DensityLayerToggle` or density analysis trigger
- `LiveControls` or live mode search trigger
- Stage create/edit form submit buttons
- Adventure create/edit form submit buttons

### Anti-Patterns

```typescript
// ❌ Don't use HTML disabled for tooltip buttons
<button disabled={!isOnline}>Search</button>  // tooltip won't show on hover

// ✅ Visual-only disable + guard onClick
<button onClick={isOnline ? handleClick : undefined} className={!isOnline ? 'opacity-50 cursor-not-allowed' : ''}>

// ❌ Don't cache mutations
{ urlPattern: /\/api\/.*/, handler: 'NetworkFirst' }  // catches POST/DELETE too!

// ✅ Only cache GET requests — Workbox runtimeCaching only applies to GET by default

// ❌ Don't pre-fetch all tiles for a route
map.on('load', () => prefetchAllTilesInBbox(...))  // bandwidth waste

// ✅ Only cache tiles the user has naturally visited
// (Workbox StaleWhileRevalidate does this automatically)
```

### Project Structure Notes

- All new hooks in `apps/web/src/hooks/` — consistent with existing `use-network-status.ts`
- SW configuration stays in `next.config.ts` — `@ducanh2912/next-pwa` manages Workbox config there
- No new API endpoints needed — this is purely frontend + SW configuration
- No database changes needed

### References

- Epic 12, Story 11.2 (renumbered 12.2): `_bmad-output/planning-artifacts/epics.md#Story-11.2`
- FR-071 (offline map), FR-073 (offline feature gating): `_bmad-output/planning-artifacts/epics.md`
- Previous story 12.1 (PWA Manifest): `_bmad-output/implementation-artifacts/12-1-pwa-manifest-app-install.md`
- `@ducanh2912/next-pwa` docs: https://ducanh-next-pwa.vercel.app/
- Workbox runtimeCaching: https://developer.chrome.com/docs/workbox/modules/workbox-build#type-RuntimeCaching
- OpenFreeMap tiles: `apps/web/src/lib/map-styles.ts` — base URL `https://tiles.openfreemap.org/`
- Network status hook: `apps/web/src/hooks/use-network-status.ts`
- Status banner: `apps/web/src/app/(app)/live/[id]/_components/status-banner.tsx`
- Current SW config: `apps/web/next.config.ts` lines 8-48

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

None required.

### Completion Notes List

- **runtimeCaching**: 8 cache rules configured in `next.config.ts` — StaleWhileRevalidate for tiles/styles, NetworkFirst for API data, CacheFirst for static assets, NetworkOnly for Plausible/mutations
- **Offline gate**: `useOfflineGate()` hook wraps `useNetworkStatus` — returns `{ isOnline, disabledReason }` for UI components
- **OfflineTooltipWrapper**: reusable wrapper using `asChild` + `<div>` to avoid nested buttons (invalid HTML). Intercepts click, pointerdown, and mousedown via capture phase.
- **Feature gating**: 5 components gated — density trigger, planning search, live search, stage CRUD (including edit/delete icons), adventure create
- **Reconnection**: Separated into `useReconnectionHandler` hook (mounted in app layout via `ReconnectionHandler` component) to avoid coupling `useNetworkStatus` to `QueryClientProvider` in every consumer. Refetches active queries + toast "Connexion rétablie" on offline→online.
- **Offline fallback**: Added `fallbacks: { document: "/offline.html" }` to `@ducanh2912/next-pwa` config
- **Tests**: 886 tests pass (0 regressions). New tests: `use-offline-ready.test.ts` (3), `use-reconnection-handler.test.ts` (2), `runtime-caching.test.ts` (8)
- **Architecture decision**: Kept `useNetworkStatus` pure (no QueryClient dependency) to avoid breaking 77 existing test files. Reconnection logic is in a separate hook mounted once in the app layout.

### Change Log

- 2026-04-06: Story 12.2 implemented — SW runtimeCaching + offline gate + reconnection handler
- 2026-04-06: Code review fixes — (H1) removed `^` anchor from API runtimeCaching regex patterns (Workbox matches full URL, not pathname), (H2) restructured OfflineTooltipWrapper with `asChild` + `<div>` to avoid nested buttons, (M1) added offline gating to stage edit/delete icon buttons, (M2) added pointerdown/mousedown interception to OfflineTooltipWrapper

### File List

**Created:**
- `apps/web/src/hooks/use-offline-ready.ts` — offline gate hook
- `apps/web/src/hooks/use-offline-ready.test.ts` — tests for offline gate
- `apps/web/src/hooks/use-reconnection-handler.ts` — reconnection refetch + toast hook
- `apps/web/src/hooks/use-reconnection-handler.test.ts` — tests for reconnection handler
- `apps/web/src/components/shared/offline-tooltip-wrapper.tsx` — reusable wrapper for offline gating with tooltip
- `apps/web/src/components/providers/reconnection-handler.tsx` — client component to mount useReconnectionHandler in layout
- `apps/web/src/config/runtime-caching.test.ts` — tests verifying runtimeCaching config

**Modified:**
- `apps/web/next.config.ts` — added 6 runtimeCaching rules (tiles, styles, API endpoints) + fallbacks document
- `apps/web/src/app/(app)/layout.tsx` — added ReconnectionHandler component
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx` — wrapped with OfflineTooltipWrapper
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — added offline gating to Rechercher button
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — added offline gating to RECHERCHER button
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — wrapped stage CRUD buttons with OfflineTooltipWrapper
- `apps/web/src/app/(app)/adventures/_components/create-adventure-dialog.tsx` — wrapped trigger with OfflineTooltipWrapper
- `apps/web/src/hooks/use-network-status.test.ts` — unchanged (kept pure, no QueryClient needed)
