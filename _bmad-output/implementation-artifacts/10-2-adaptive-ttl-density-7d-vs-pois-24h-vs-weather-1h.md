# Story 10.2: Adaptive TTL — Density (permanent) vs POIs (1 month) vs Weather (1h)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **backend system**,
I want different cache TTLs per data type based on OSM data volatility,
so that stable data stays cached much longer — reducing redundant external API calls while keeping time-sensitive data fresh.

## Acceptance Criteria

1. **Given** the density tronçon cache currently uses a local magic number (24h TTL),
   **When** the adaptive cache is implemented,
   **Then** density tronçon counts are cached **permanently** — `redis.set(key, value)` without `EX` argument — the count never expires because OSM accommodation data changes at most monthly and admin cache invalidation (story 10.4) provides the purge lever.

2. **Given** POI search results (`pois:bbox:*`) currently use 24h TTL via `OVERPASS_CACHE_TTL`,
   **When** the adaptive TTL is implemented,
   **Then** POI bbox results use a new constant `POI_BBOX_CACHE_TTL = 30 * 24 * 60 * 60` (2592000s = 30 days), imported from `@ridenrest/shared`, applied in `pois.service.ts` for both corridor mode and live mode `redis.setex()` calls.

3. **Given** weather forecasts use hardcoded `3600 * 1000` in `weather.repository.ts` and `weather.service.ts`,
   **When** the cleanup is implemented,
   **Then** both usages are replaced by `WEATHER_CACHE_TTL * 1000` — the constant `WEATHER_CACHE_TTL = 60 * 60` already exists in `@ridenrest/shared`, no new constant needed.

4. **Given** all TTL constants are defined in `packages/shared/src/constants/api.constants.ts`,
   **When** the codebase is audited,
   **Then** ALL cache TTL values are sourced from shared constants — no magic numbers in service, repository, or processor files.

## Tasks / Subtasks

- [x] Task 1: Add `POI_BBOX_CACHE_TTL` to shared constants (AC: 2, 4)
  - [x] 1.1 In `packages/shared/src/constants/api.constants.ts`, add:
    ```typescript
    /** POI bbox cache TTL in seconds (30 days — Overpass OSM + Google Places data is stable; avoids redundant calls to both APIs) */
    export const POI_BBOX_CACHE_TTL = 30 * 24 * 60 * 60
    ```
  - [x] 1.2 Verify the constant is exported via the shared barrel (follow same pattern as `OVERPASS_CACHE_TTL`, `GOOGLE_PLACES_CACHE_TTL`)

- [x] Task 2: Apply `POI_BBOX_CACHE_TTL` in pois.service.ts (AC: 2, 4)
  - [x] 2.1 In `apps/api/src/pois/pois.service.ts`, add `POI_BBOX_CACHE_TTL` to the existing `@ridenrest/shared` import
  - [x] 2.2 Replace `OVERPASS_CACHE_TTL` with `POI_BBOX_CACHE_TTL` in the **corridor mode** `redis.setex()` call (the `pois:bbox:*` key store)
  - [x] 2.3 Replace `OVERPASS_CACHE_TTL` with `POI_BBOX_CACHE_TTL` in the **live mode** `redis.set()` call (the `pois:live:bbox:*` key store)
  - [x] 2.4 Keep `OVERPASS_CACHE_TTL` import only if it's still used elsewhere in the file (verify — if unused after this change, remove from import)

- [x] Task 3: Migrate density processor to permanent cache (AC: 1, 4)
  - [x] 3.1 In `apps/api/src/density/jobs/density-analyze.processor.ts`, remove the local `const CACHE_TTL_SECONDS = 60 * 60 * 24 // 24h` (line 30)
  - [x] 3.2 Replace `await redis.set(cacheKey, String(count), 'EX', CACHE_TTL_SECONDS)` with `await redis.set(cacheKey, String(count))` — no EX argument = permanent
  - [x] 3.3 No new constant needed for "permanent" — the absence of EX is self-documenting; add inline comment: `// permanent — OSM data is stable, admin cache invalidation (story 10.4) provides purge lever`

- [x] Task 4: Fix weather magic numbers in repository and service (AC: 3, 4)
  - [x] 4.1 In `apps/api/src/weather/weather.repository.ts`, add import: `import { WEATHER_CACHE_TTL } from '@ridenrest/shared'`
  - [x] 4.2 Replace `3600 * 1000` (line 54) with `WEATHER_CACHE_TTL * 1000` for the `expiresAt` DB column calculation
  - [x] 4.3 In `apps/api/src/weather/weather.service.ts`, add `WEATHER_CACHE_TTL` to the existing `@ridenrest/shared` import
  - [x] 4.4 Replace `3600 * 1000` (line 50 — early return expiresAt) with `WEATHER_CACHE_TTL * 1000` (also replaced line 79 — main expiresAt)

- [x] Task 5: Write/update unit tests (AC: 1, 2, 3, 4)
  - [x] 5.1 In `apps/api/src/density/jobs/density-analyze.processor.test.ts`, update the test for cache MISS: verify `redis.set()` is called **without** an `EX` argument (i.e., called with exactly 2 args: key + value)
  - [x] 5.2 In `apps/api/src/pois/pois.service.test.ts`, update tests that assert corridor/live mode cache TTL: expect `POI_BBOX_CACHE_TTL` (2592000) instead of `OVERPASS_CACHE_TTL` (86400)
  - [x] 5.3 In `apps/api/src/weather/weather.service.test.ts`, updated expiresAt assertion to use `WEATHER_CACHE_TTL * 1000` constant

## Dev Notes

### Context: What this story IS and IS NOT

**This story is a cache strategy audit + TTL increase.** It is NOT about changing cache key structures — that was done in Story 10.1. The density cache key remains segment-scoped; bbox migration for density is a separate future concern.

### TTL Rationale by Data Type (validated by Guillaume)

| Data | TTL | Rationale |
|------|-----|-----------|
| Density tronçon counts | **Permanent** | OSM accommodation data changes at most monthly. Permanent cache + admin invalidation story (10.4) = optimal. No Redis memory concern on VPS. |
| POI bbox results (`pois:bbox:*`, `pois:live:bbox:*`) | **30 days** (NEW) | Overpass (OSM) et Google Places API sont stables — noms/coordonnées changent très rarement. 30d réduit drastiquement les appels Overpass ET les appels Google Places (quota limité, plus important à préserver). |
| Weather (Open-Meteo) | 1h | Forecast meaningfully changes every 1-3h. 1h matches Open-Meteo update cycle. **No change.** |
| Google place_id / details | 7 days | Place names and coordinates are stable. `GOOGLE_PLACES_CACHE_TTL = 7d`. **No change.** |

### Current State Audit (as of Story 10.1)

| Location | Current | Target | Action |
|----------|---------|--------|--------|
| `density-analyze.processor.ts:30` | `CACHE_TTL_SECONDS = 60*60*24` (local magic, 24h) | Permanent (no EX) | Remove constant, change `redis.set()` call |
| `pois.service.ts` corridor mode | `OVERPASS_CACHE_TTL` (24h) | `POI_BBOX_CACHE_TTL` (30d) | Replace constant |
| `pois.service.ts` live mode | `OVERPASS_CACHE_TTL` (24h) | `POI_BBOX_CACHE_TTL` (30d) | Replace constant |
| `open-meteo.provider.ts` | `WEATHER_CACHE_TTL` (1h) ✅ | No change | — |
| `weather.repository.ts:54` | `3600 * 1000` (magic) | `WEATHER_CACHE_TTL * 1000` | Replace magic number |
| `weather.service.ts:50` | `3600 * 1000` (magic) | `WEATHER_CACHE_TTL * 1000` | Replace magic number |

### Permanent Redis Cache — Technical Details

In ioredis, `redis.set(key, value)` without `EX`/`PX` option stores the key with no expiry (TTL = -1 in Redis). This key persists indefinitely until:
- Explicit `DEL key`
- Redis `FLUSHDB` / `FLUSHALL`
- Redis eviction policy (default `noeviction` on self-hosted VPS — returns error, doesn't silently evict)

The density cache key format remains segment-scoped:
```typescript
`density:troncon:${segmentId}:${troncon.fromKm}:${troncon.toKm}:${sortedCategories}`
```
When a segment is deleted, its density cache keys become orphaned but harmless (they'll never be read again). Story 10.4 admin invalidation will allow purging by geographic zone when OSM changes significantly.

**Before / After for density processor:**
```typescript
// BEFORE (line 129)
await redis.set(cacheKey, String(count), 'EX', CACHE_TTL_SECONDS)

// AFTER
await redis.set(cacheKey, String(count))
// permanent — OSM data is stable, admin cache invalidation (story 10.4) provides purge lever
```

### POI Cache TTL Change — `pois.service.ts` Impact

Le cache `pois:bbox:*` stocke les résultats **combinés Overpass (OSM) + Google Places**. Un HIT évite simultanément :
- 1 appel Overpass (fair-use OSM)
- 1 appel Google Places `nearbySearch` / `findPlaceFromText` (quota limité — **argument principal**)

Passer de 24h à 30 jours multiplie par ~30 l'efficacité du cache pour les deux sources.

After Story 10.1, `pois.service.ts` uses two Redis write patterns:

**Corridor mode** (search by km range):
```typescript
// BEFORE
await redis.setex(cacheKey, OVERPASS_CACHE_TTL, JSON.stringify(rawPois))
// AFTER
await redis.setex(cacheKey, POI_BBOX_CACHE_TTL, JSON.stringify(rawPois))
```

**Live mode** (GPS-based):
```typescript
// BEFORE
await redis.set(liveCacheKey, JSON.stringify(rawPois), 'EX', OVERPASS_CACHE_TTL)
// AFTER
await redis.set(liveCacheKey, JSON.stringify(rawPois), 'EX', POI_BBOX_CACHE_TTL)
```

Verify if `OVERPASS_CACHE_TTL` is still used anywhere else in `pois.service.ts` after these replacements. If not, remove it from the import to keep the import clean.

### `weather.service.ts` — Early Return Case (line 50)

```typescript
// BEFORE
expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()

// AFTER
import { WEATHER_CACHE_TTL, WMO_ICON, WMO_ICON_FALLBACK } from '@ridenrest/shared'
// ...
expiresAt: new Date(Date.now() + WEATHER_CACHE_TTL * 1000).toISOString()
```

Note: `WEATHER_CACHE_TTL` is in **seconds** (3600). Multiply by 1000 for JS Date milliseconds.

### `weather.repository.ts` — `expiresAt` DB Column (line 54)

```typescript
// BEFORE
const expiresAt = new Date(now.getTime() + 3600 * 1000)

// AFTER
import { WEATHER_CACHE_TTL } from '@ridenrest/shared'
const expiresAt = new Date(now.getTime() + WEATHER_CACHE_TTL * 1000)
```

### Shared Constants — Export Chain

```
packages/shared/src/constants/api.constants.ts  ← add POI_BBOX_CACHE_TTL here
  ↓ re-exported via barrel
packages/shared/src/index.ts                     ← verify export is present
  ↓ consumed as
import { POI_BBOX_CACHE_TTL } from '@ridenrest/shared'
```

Follow exact same export pattern as `OVERPASS_CACHE_TTL`, `GOOGLE_PLACES_CACHE_TTL`, `WEATHER_CACHE_TTL`.

### Files to Touch

| File | Change |
|------|--------|
| `packages/shared/src/constants/api.constants.ts` | Add `POI_BBOX_CACHE_TTL = 30 * 24 * 60 * 60` |
| `apps/api/src/pois/pois.service.ts` | Replace `OVERPASS_CACHE_TTL` → `POI_BBOX_CACHE_TTL` in corridor + live mode cache writes |
| `apps/api/src/density/jobs/density-analyze.processor.ts` | Remove local `CACHE_TTL_SECONDS`, change `redis.set()` to permanent (no EX) |
| `apps/api/src/weather/weather.repository.ts` | Import `WEATHER_CACHE_TTL`, replace `3600 * 1000` |
| `apps/api/src/weather/weather.service.ts` | Add `WEATHER_CACHE_TTL` to import, replace `3600 * 1000` |
| `apps/api/src/density/jobs/density-analyze.processor.test.ts` | Update TTL test: `redis.set` called with 2 args (no EX) |
| `apps/api/src/pois/pois.service.test.ts` | Update TTL assertion: `POI_BBOX_CACHE_TTL` (2592000) not `OVERPASS_CACHE_TTL` (86400) |

### DO NOT Touch

- `apps/api/src/weather/providers/open-meteo.provider.ts` — already uses `WEATHER_CACHE_TTL` ✅
- `apps/api/src/density/density.service.ts` — no Redis usage, only BullMQ queue dispatch ✅
- `apps/api/src/density/density.repository.ts` — no cache TTL ✅
- Any frontend files — pure backend change, transparent to clients ✅
- Database schemas (`packages/database/`) — no schema change ✅

### Previous Story Intelligence (10.1)

From Story 10.1 completion notes (fully done, 0 regressions):
- 162 total API tests passing — current regression baseline
- `pois.service.ts` imports: `OVERPASS_CACHE_TTL, GOOGLE_PLACES_CACHE_TTL` from `@ridenrest/shared` — add `POI_BBOX_CACHE_TTL` to same import
- `[...categories].sort()` pattern (non-mutating) — keep in updated tests
- `pois.repository.ts` has `insertRawPoisForSegment` for the Option A HIT path — don't touch

### References

- [Source: epics.md#Epic 10 Story 10.2] Original acceptance criteria (TTLs updated per Guillaume — permanent density, 30d POI)
- [Source: packages/shared/src/constants/api.constants.ts] Existing TTL constants (OVERPASS_CACHE_TTL=24h, GOOGLE_PLACES_CACHE_TTL=7d, WEATHER_CACHE_TTL=1h)
- [Source: apps/api/src/density/jobs/density-analyze.processor.ts:30] Current magic `CACHE_TTL_SECONDS = 60 * 60 * 24`
- [Source: apps/api/src/density/jobs/density-analyze.processor.ts:129] Current `redis.set(..., 'EX', CACHE_TTL_SECONDS)`
- [Source: apps/api/src/weather/weather.repository.ts:54] Current magic `3600 * 1000`
- [Source: apps/api/src/weather/weather.service.ts:50] Current magic `3600 * 1000`
- [Source: implementation-artifacts/10-1-geographic-cache-key-cross-user-poi-sharing.md] 10.1 completion notes — 162 API tests baseline, files touched
- [Source: project-context.md#Package Import Rules] Constants from `packages/shared/constants/` — NEVER duplicate

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Fix stale JSDoc on `WEATHER_CACHE_TTL` — "WeatherAPI.com" → "Open-Meteo" [`packages/shared/src/constants/api.constants.ts:10`]
- [ ] [AI-Review][LOW] Story filename says "7d vs POIs-24h" but implementation is "permanent vs 30d" — filename is misleading for future reference (non-breaking, cosmetic)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `POI_BBOX_CACHE_TTL = 30 * 24 * 60 * 60` (2592000s) to shared constants; auto-exported via `* from './constants/api.constants'` barrel.
- `pois.service.ts`: Replaced `OVERPASS_CACHE_TTL` with `POI_BBOX_CACHE_TTL` in both corridor mode `redis.setex()` (line ~150) and live mode `redis.setex()` (line ~259). `OVERPASS_CACHE_TTL` kept in import — still used for 4 DB `expiresAt` calculations.
- `density-analyze.processor.ts`: Removed local `CACHE_TTL_SECONDS = 60 * 60 * 24` constant; changed `redis.set(cacheKey, String(count), 'EX', CACHE_TTL_SECONDS)` to `redis.set(cacheKey, String(count))` — permanent cache with inline comment referencing story 10.4.
- `weather.repository.ts`: Added `WEATHER_CACHE_TTL` import from `@ridenrest/shared`, replaced magic `3600 * 1000` with `WEATHER_CACHE_TTL * 1000`.
- `weather.service.ts`: Added `WEATHER_CACHE_TTL` to import, replaced both occurrences of `3600 * 1000` (line 50 early-return + line 79 main expiresAt).
- Tests: 166 passing (baseline was 162, +4 new/updated). New density test validates permanent cache (2-arg `redis.set`). Pois tests now assert TTL = 2592000. Weather test uses `WEATHER_CACHE_TTL * 1000` constant.

### File List

- `packages/shared/src/constants/api.constants.ts` — added `POI_BBOX_CACHE_TTL`
- `apps/api/src/pois/pois.service.ts` — applied `POI_BBOX_CACHE_TTL` for corridor + live mode Redis writes
- `apps/api/src/density/jobs/density-analyze.processor.ts` — permanent density cache (no EX)
- `apps/api/src/weather/weather.repository.ts` — `WEATHER_CACHE_TTL` import + replace magic number
- `apps/api/src/weather/weather.service.ts` — `WEATHER_CACHE_TTL` import + replace both magic numbers
- `apps/api/src/density/jobs/density-analyze.processor.test.ts` — new permanent-cache assertion test
- `apps/api/src/pois/pois.service.test.ts` — TTL assertions updated to `POI_BBOX_CACHE_TTL` (2592000)
- `apps/api/src/weather/weather.service.test.ts` — expiresAt assertion uses `WEATHER_CACHE_TTL * 1000`
