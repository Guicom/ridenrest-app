# Story 15.5: Admin Cache Invalidation by Geographic Zone

Status: ready-for-dev

> Moved from Story 10.4 (2026-03-27) — better grouped with admin tools in Epic 15.

## Story

As a **system administrator**,
I want to purge the Redis cache for a specific geographic zone (bbox),
So that when a significant OSM data update occurs in a region, the stale POI and density cache can be invalidated without restarting the server.

## Acceptance Criteria (BDD)

1. **Given** an admin needs to invalidate cache for a specific bbox,
   **When** they call `DELETE /admin/cache/zone?minLat=42.0&minLng=-2.0&maxLat=43.5&maxLng=3.0`,
   **Then** all Redis keys matching `pois:bbox:{keys within bbox}` and `density:troncon:{keys within bbox}` are deleted — response includes count of deleted keys.

2. **Given** the admin endpoint is created,
   **When** accessed,
   **Then** it is protected by a static `ADMIN_SECRET` header — not exposed in Swagger, not subject to `JwtAuthGuard`.

3. **Given** the zone invalidation runs on a large bbox,
   **When** many keys match,
   **Then** deletion is batched in groups of 100 using Redis `SCAN` + `DEL` pipeline — never uses `FLUSHDB`.

## Tasks / Subtasks

- [ ] **Task 1: Create Admin module in NestJS** (AC: #2)
  - [ ] Create `apps/api/src/admin/admin.module.ts`
  - [ ] Create `apps/api/src/admin/admin.controller.ts`
  - [ ] Create `apps/api/src/admin/admin.service.ts`
  - [ ] Create `apps/api/src/admin/guards/admin-secret.guard.ts`
  - [ ] Register in `app.module.ts`
  - [ ] Guard checks `x-admin-secret` header against `ADMIN_SECRET` env var
  - [ ] NOT exposed in Swagger: use `@ApiExcludeController()` decorator
  - [ ] NOT behind `JwtAuthGuard` — uses static secret instead

- [ ] **Task 2: Create cache zone invalidation endpoint** (AC: #1)
  - [ ] `DELETE /admin/cache/zone` with query params: `minLat`, `minLng`, `maxLat`, `maxLng`
  - [ ] Create `apps/api/src/admin/dto/invalidate-cache-zone.dto.ts`
  - [ ] DTO validation: all 4 params required, numbers, lat in [-90,90], lng in [-180,180], minLat < maxLat, minLng < maxLng
  - [ ] Return `{ deletedKeys: number, patterns: string[] }`

- [ ] **Task 3: Redis SCAN + DEL pipeline for POI cache** (AC: #1, #3)
  - [ ] Scan pattern: `pois:bbox:*` and `pois:live:bbox:*`
  - [ ] For each key, parse the bbox from the key: `pois:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}:{categories}`
  - [ ] Key bbox overlaps requested zone if: `keyMinLat <= reqMaxLat && keyMaxLat >= reqMinLat && keyMinLng <= reqMaxLng && keyMaxLng >= reqMinLng`
  - [ ] Use Redis `SCAN` with cursor (count 100) — never `KEYS *`
  - [ ] Batch `DEL` commands in pipeline of 100 keys max
  - [ ] Log deleted keys count

- [ ] **Task 4: Redis SCAN + DEL pipeline for density cache** (AC: #1, #3)
  - [ ] Scan pattern: `density:troncon:*`
  - [ ] Density keys are segment-based (`density:troncon:{segmentId}:{fromKm}:{toKm}:{categories}`), not bbox-based
  - [ ] For density keys: need to resolve segment bbox from DB to check overlap, OR accept that density invalidation for a bbox requires scanning all density keys and checking if the segment's geographic extent overlaps the bbox
  - [ ] Alternative simpler approach: scan all `density:troncon:*` keys and delete those whose segmentId belongs to a segment with geometry intersecting the bbox (PostGIS query: `ST_Intersects(geom, ST_MakeEnvelope(minLng, minLat, maxLng, maxLat, 4326))`)
  - [ ] Batch segment lookup to avoid N+1 queries

- [ ] **Task 5: Env var and security** (AC: #2)
  - [ ] Add `ADMIN_SECRET` to VPS `.env` — long random string: `openssl rand -hex 32`
  - [ ] Guard implementation:
    ```typescript
    @Injectable()
    export class AdminSecretGuard implements CanActivate {
      canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest()
        const secret = request.headers['x-admin-secret']
        return secret === process.env.ADMIN_SECRET
      }
    }
    ```
  - [ ] Return 403 (not 401) if secret is missing or wrong — don't reveal the endpoint exists

- [ ] **Task 6: Tests** (AC: #1, #2, #3)
  - [ ] Jest: admin-secret.guard — verify 403 on missing/wrong header, pass on correct
  - [ ] Jest: admin.service — verify SCAN + DEL pipeline with mocked Redis
  - [ ] Jest: verify bbox overlap logic correctly identifies matching keys
  - [ ] Jest: verify batching (100 keys per pipeline)
  - [ ] Jest: admin.controller — verify DTO validation rejects invalid bbox

## Dev Notes

### Existing Redis Cache Key Patterns

From `apps/api/src/pois/pois.service.ts`:
```
pois:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}:{sortedCategories}
  └── round3() = 3 decimal places ≈ 111m precision

pois:live:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}:{sortedCategories}
  └── same rounding
```

From `apps/api/src/density/jobs/density-analyze.processor.ts`:
```
density:troncon:{segmentId}:{fromKm}:{toKm}:{sortedCategories}
  └── segmentId is a UUID — need PostGIS lookup to resolve geographic position
```

### Redis Provider

`apps/api/src/common/providers/redis.provider.ts` — global provider via `RedisModule`. Uses `ioredis`. Access via `this.redisProvider.getClient()`.

**ioredis SCAN pattern:**
```typescript
const redis = this.redisProvider.getClient()
const stream = redis.scanStream({ match: 'pois:bbox:*', count: 100 })
const keysToDelete: string[] = []

for await (const keys of stream) {
  for (const key of keys as string[]) {
    // Parse bbox from key and check overlap
    if (bboxOverlaps(parsedKey, requestedBbox)) {
      keysToDelete.push(key)
    }
    // Batch delete every 100 keys
    if (keysToDelete.length >= 100) {
      await redis.pipeline(keysToDelete.map(k => ['del', k])).exec()
      keysToDelete.length = 0
    }
  }
}
// Flush remaining
if (keysToDelete.length > 0) {
  await redis.pipeline(keysToDelete.map(k => ['del', k])).exec()
}
```

### Bbox Overlap Logic

Two bboxes overlap when:
```typescript
function bboxOverlaps(a: Bbox, b: Bbox): boolean {
  return a.minLat <= b.maxLat && a.maxLat >= b.minLat
      && a.minLng <= b.maxLng && a.maxLng >= b.minLng
}
```

### Density Key Challenge

Density keys are segment-based, not bbox-based. Two approaches:

**Option A (simpler, recommended for MVP):** Query PostGIS for all segment IDs whose geometry intersects the bbox, then scan `density:troncon:{segmentId}:*` for each matching segment:
```sql
SELECT id FROM adventure_segments
WHERE ST_Intersects(geom, ST_MakeEnvelope($minLng, $minLat, $maxLng, $maxLat, 4326))
```
Then scan Redis for each segment ID — efficient because the PostGIS query narrows the set.

**Option B (brute force):** Scan all `density:troncon:*` keys and parse segmentId → batch DB lookup. Wasteful if many segments exist.

### NestJS Module Structure

```
apps/api/src/admin/
  admin.module.ts
  admin.controller.ts
  admin.service.ts
  admin.service.test.ts
  guards/
    admin-secret.guard.ts
  dto/
    invalidate-cache-zone.dto.ts
```

The admin module needs `RedisProvider` (already global via `RedisModule`) and access to the segments repository for density key resolution. Import `SegmentsModule` or inject the repository directly.

### Security Notes

- `ADMIN_SECRET` is a shared secret — acceptable for a single-admin, single-VPS setup
- Use `@ApiExcludeController()` to hide from Swagger
- Return 403 (Forbidden) — not 401 (Unauthorized) — to avoid revealing auth mechanism
- Log all cache invalidation calls (admin audit trail)

### Project Structure Notes

- New module: `apps/api/src/admin/` — standard NestJS feature module structure
- New env var: `ADMIN_SECRET` on VPS
- Depends on: `RedisProvider` (global), potentially `SegmentsRepository` for density keys
- No frontend changes — this is an API-only admin tool (called via curl/Postman)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 15, Story 15.5]
- [Source: apps/api/src/pois/pois.service.ts:109 — POI bbox cache key pattern]
- [Source: apps/api/src/density/jobs/density-analyze.processor.ts:110 — density troncon cache key pattern]
- [Source: apps/api/src/common/providers/redis.provider.ts — Redis provider with ioredis]
- [Source: project-context.md — NestJS architecture rules, module structure]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
