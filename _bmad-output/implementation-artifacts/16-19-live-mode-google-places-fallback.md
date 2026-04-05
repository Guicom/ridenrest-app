# Story 16.19: Bug Fix — Live Mode POI Search Skips Google Places (Primary Source) When Overpass Disabled

Status: done

## Story

As a **cyclist using Live mode with overpassEnabled=false**,
I want the POI search to call Google Places (the primary data source) when the local DB cache is empty,
So that I see nearby accommodations and POIs — Google Places being the base API, Overpass/OSM being the optional complement.

## Bug Description

**Architecture reminder:** Google Places is the **primary/base** POI data source. Overpass (OSM) is an **optional complement** that enriches results when enabled by the user (`overpassEnabled=true`).

In `apps/api/src/pois/pois.service.ts`, the corridor mode (planning) correctly implements this when `overpassEnabled=false` (lines 90–106):
1. Check DB cache → if non-empty, return it
2. If empty AND Google Places is configured → call `prefetchAndInsertGooglePois` (primary source), then return DB results
3. If Google Places not configured → return empty DB result

However, the live mode (`findLiveModePois`, line 237) simply returns `findPoisNearPoint` directly — **it never calls Google Places**, skipping the primary data source entirely. In production, when the DB is empty (no prior fetch for that area), this always returns zero results.

## Acceptance Criteria

1. **Google Places (primary source) called in live mode** — Given `overpassEnabled=false` in live mode, when the DB cache for the target area is empty, then `prefetchAndInsertGooglePois` is called with the computed bbox, and `findPoisNearPoint` is called again to return the newly-inserted results.

2. **No unnecessary API calls** — Given `overpassEnabled=false` in live mode, when the DB cache for the target area already contains POIs, then no Google Places API call is made — the cached results are returned directly.

3. **Graceful degradation without Google Places** — Given `overpassEnabled=false` AND `googlePlacesProvider.isConfigured()` returns false, when the live mode search executes, then the DB cache is returned as-is (same behavior as current — no error, just potentially empty results).

4. **Unit tests** — Given the fix is implemented, when tests run, then:
   - Test A: DB non-empty → `prefetchAndInsertGooglePois` is NOT called, DB results returned
   - Test B: DB empty + Google configured → `prefetchAndInsertGooglePois` IS called, then `findPoisNearPoint` returns enriched results
   - Test C: DB empty + Google NOT configured → empty array returned, no error thrown

## Tasks / Subtasks

- [x] Task 1: Add Google Places primary source call to `findLiveModePois` (AC: #1, #2, #3)
  - [x] 1.1 — In the `if (!overpassEnabled)` block (line 237), first call `findPoisNearPoint` and store the result
  - [x] 1.2 — If result is non-empty, return it immediately (DB cache warm, no API call needed — AC #2)
  - [x] 1.3 — If result is empty AND `googlePlacesProvider.isConfigured()`, compute bbox from `targetPoint` + `radiusKm`, call `prefetchAndInsertGooglePois` (primary source), then return `findPoisNearPoint` again
  - [x] 1.4 — If result is empty AND Google NOT configured, return the empty result (AC #3)
  - [x] 1.5 — Wrap `prefetchAndInsertGooglePois` in `.catch()` with `logger.warn` (consistent with corridor mode pattern)

- [x] Task 2: Unit tests (AC: #4)
  - [x] 2.1 — Test: DB has cached POIs → returns them, `prefetchAndInsertGooglePois` never called
  - [x] 2.2 — Test: DB empty + Google configured → calls `prefetchAndInsertGooglePois`, then returns `findPoisNearPoint` result
  - [x] 2.3 — Test: DB empty + Google NOT configured → returns empty array

## Dev Notes

### Data Source Architecture

- **Google Places** = primary/base POI data source (always used)
- **Overpass (OSM)** = optional complement (opt-in via `overpassEnabled` toggle)
- When `overpassEnabled=true`: Overpass fetches first, then Google Places enriches
- When `overpassEnabled=false`: Google Places is the sole data source — this is where the live mode bug is

### Current Code (buggy)

```typescript
// Line 236-239 in pois.service.ts
if (!overpassEnabled) {
  // BUG: returns DB cache directly — never calls Google Places (primary source)
  return this.poisRepository.findPoisNearPoint(segmentId, targetPoint.lat, targetPoint.lng, radiusM, activeCategories)
}
```

### Expected Code Pattern (from corridor mode, lines 90-106)

```typescript
if (!overpassEnabled) {
  const dbCached = await this.poisRepository.findPoisNearPoint(
    segmentId, targetPoint.lat, targetPoint.lng, radiusM, activeCategories,
  )
  if (dbCached.length > 0) return dbCached

  // DB cache empty — call Google Places (primary data source)
  if (this.googlePlacesProvider.isConfigured()) {
    const radDeg = (radiusKm ?? 3) / 111.0
    const bbox = {
      minLat: targetPoint.lat - radDeg, maxLat: targetPoint.lat + radDeg,
      minLng: targetPoint.lng - radDeg, maxLng: targetPoint.lng + radDeg,
    }
    const redis = this.redisProvider.getClient()
    await this.prefetchAndInsertGooglePois(bbox, segmentId, redis)
      .catch((err) => this.logger.warn('Google Places primary fetch (overpass disabled, live) failed', err))
    return this.poisRepository.findPoisNearPoint(
      segmentId, targetPoint.lat, targetPoint.lng, radiusM, activeCategories,
    )
  }

  return dbCached
}
```

### Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/pois/pois.service.ts` | Add Google Places (primary source) call in `findLiveModePois` when `overpassEnabled=false` |
| `apps/api/src/pois/pois.service.spec.ts` (or new test file) | Add 3 unit tests covering the branches |

### Architecture Compliance

- Follows exact same pattern as corridor mode (lines 90–106) — consistent error handling, same `.catch()` pattern
- No new dependencies — uses existing `googlePlacesProvider`, `redisProvider`, `prefetchAndInsertGooglePois`
- bbox computation reuses the same `radDeg = radiusKm / 111.0` formula already in the method (line 242)

## Dev Agent Record

### Implementation Plan
Applied the same corridor-mode pattern (lines 90–106) to the `findLiveModePois` method's `!overpassEnabled` block. The fix replaces a direct DB return with a 3-step check: (1) return if DB non-empty, (2) call Google Places if configured + DB empty, (3) return empty if Google not configured.

### Completion Notes
- ✅ Bug fix applied to `findLiveModePois` — Google Places (primary source) now called when `overpassEnabled=false` and DB cache is empty
- ✅ 3 new unit tests added covering all branches (AC #4)
- ✅ Full regression suite passes (244/244 tests)
- ✅ Pattern is identical to corridor mode — consistent `.catch()` error handling, same bbox computation

## File List

| File | Change |
|------|--------|
| `apps/api/src/pois/pois.service.ts` | Fixed `findLiveModePois` to call Google Places when `overpassEnabled=false` and DB cache empty |
| `apps/api/src/pois/pois.service.test.ts` | Added 3 unit tests for live mode `overpassEnabled=false` branches |

## Change Log

- 2026-04-05: Fixed live mode POI search to call Google Places (primary source) when `overpassEnabled=false` and DB cache is empty — Story 16.19
- 2026-04-05: Code review fixes — added `.catch()` error path test, strengthened `isConfigured` assertion on early-return test — Review 16.19
