# Story 10.1: Geographic Cache Key — Cross-User POI Sharing

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **backend system**,
I want POI query results to be cached by geographic zone (bbox) rather than by user session (segmentId), in both corridor mode and live mode,
so that any user querying the same geographic area — regardless of their segment or adventure — gets the same cached data, reducing Overpass and Google Places API calls.

## Acceptance Criteria

1. **Given** two users query POIs for corridors that produce the same geographic bbox (rounded to 3 decimal places),
   **When** the second query arrives within the 24h TTL window,
   **Then** only 1 Overpass API call is made — the second user is served from Redis cache.

2. **Given** the current cache key is `pois:{segmentId}:{fromKm}:{toKm}:{categories}` (segment-scoped),
   **When** the geographic key migration is implemented,
   **Then** the new corridor-mode key is `pois:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}:{categories}` with bbox values rounded to 3 decimal places (~111m precision).

3. **Given** the new geographic key is active,
   **When** a different user queries POIs on a different segment that overlaps the same geographic corridor,
   **Then** the cached result from the first query is reused — no new Overpass call.

4. **Given** the migration runs,
   **When** old `pois:{segmentId}:...` keys exist in Redis,
   **Then** they are NOT actively deleted — they expire naturally at TTL 24h (no migration script needed).

5. **Given** TTL constants are reviewed,
   **When** the service code is updated,
   **Then** the local magic constant `CACHE_TTL_SECONDS = 60 * 60 * 24` is replaced by `OVERPASS_CACHE_TTL` imported from `@ridenrest/shared` — no magic numbers in service files.

6. **Given** the current live mode cache key is `pois:live:{segmentId}:{roundedKm}:{radiusKm}:{categories}` (segment-scoped),
   **When** the migration is implemented,
   **Then** the new live mode key is `pois:live:bbox:{rMinLat}:{rMinLng}:{rMaxLat}:{rMaxLng}:{categories}` — bbox computed from `targetPoint ± radDeg`, values rounded to 3 decimal places.

7. **Given** two cyclists are riding in the same geographic area (same event, same corridor),
   **When** they both trigger a live mode POI search within 111m of each other,
   **Then** the second request hits the Redis cache — no new Overpass or Google Places call.

## Tasks / Subtasks

- [x] Task 1: Add bbox rounding helper and update corridor-mode cache key (AC: 1, 2, 3)
  - [x] 1.1 In `pois.service.ts`, compute `roundedBbox` from the already-available `{minLat, maxLat, minLng, maxLng}` using `Math.round(val * 1000) / 1000`
  - [x] 1.2 Replace `cacheKey = \`pois:${segmentId}:${fromKm}:${toKm}:...\`` with `cacheKey = \`pois:bbox:${rMinLat}:${rMinLng}:${rMaxLat}:${rMaxLng}:${sortedCategories}\``
  - [x] 1.3 Log key change in debug: `Cache MISS: {new_key}` / `Cache HIT: {new_key}`

- [x] Task 2: Remplacer les magic numbers TTL par des constantes partagées (AC: 5)
  - [x] 2.1 Supprimer `const CACHE_TTL_SECONDS = 60 * 60 * 24` de `pois.service.ts`
  - [x] 2.2 Supprimer `const GOOGLE_CACHE_TTL = 60 * 60 * 24 * 7` de `pois.service.ts`
  - [x] 2.3 Ajouter dans `packages/shared/src/constants/api.constants.ts` la constante manquante : `export const GOOGLE_PLACES_CACHE_TTL = 7 * 24 * 60 * 60` (vérifier qu'elle n'existe pas déjà)
  - [x] 2.4 `OVERPASS_CACHE_TTL` existe déjà dans `api.constants.ts` (valeur: `24 * 60 * 60`) — pas à recréer
  - [x] 2.5 Importer `OVERPASS_CACHE_TTL` et `GOOGLE_PLACES_CACHE_TTL` depuis `@ridenrest/shared` dans `pois.service.ts`
  - [x] 2.6 Remplacer tous les usages de `CACHE_TTL_SECONDS` → `OVERPASS_CACHE_TTL`, et `GOOGLE_CACHE_TTL` → `GOOGLE_PLACES_CACHE_TTL`

- [x] Task 3: Migrate live mode cache key to bbox-based (AC: 6, 7)
  - [x] 3.1 In `findLiveModePois()`, move cache key computation to AFTER `targetPoint` and `bbox` are computed (same reorder pattern as corridor mode)
  - [x] 3.2 Replace `cacheKey = \`pois:live:${segmentId}:${roundedKm}:${radiusKm}:...\`` with `cacheKey = \`pois:live:bbox:${round3(bbox.minLat)}:${round3(bbox.minLng)}:${round3(bbox.maxLat)}:${round3(bbox.maxLng)}:${sortedCategories}\``
  - [x] 3.3 Old `pois:live:{segmentId}:...` keys expire naturally — no cleanup needed

- [x] Task 4: Write unit tests for the bbox rounding and new cache key construction (AC: 1, 2, 6, 7)
  - [x] 4.1 In `pois.service.test.ts` (co-located), add test: same corridor bbox from two different segments → same cache key
  - [x] 4.2 Add test: same live mode bbox from two different users at same GPS zone → same cache key
  - [x] 4.3 Add test: bbox rounding to 3 decimal places works correctly for edge values
  - [x] 4.4 Verify cache HIT path is exercised when key matches

## Dev Notes

### Context: Redis is now self-hosted (VPS), not Upstash

> ⚠️ **Important context shift** — The epic description mentions "Upstash 10k cmd/day budget" as the primary motivation. This is no longer accurate since Epic 14 migrated Redis to a self-hosted Docker instance on the VPS (unlimited commands). However, **the geographic cache key optimization is still the right architecture** for:
> - **Cross-user cache sharing**: two users on the same popular corridor (Transcantabrique, EV6…) share cache → fewer Overpass calls AND fewer Google Places calls
> - **Overpass fair-use**: fewer requests to public OSM infrastructure = better citizen
> - **Google Places quota**: free tier is limited — fewer prefetch calls per bbox = real savings
> - **Cache efficiency**: segment IDs are UUIDs (no semantic meaning) → same corridor queried by N users = N cache entries today → 1 entry post-migration
>
> The Upstash budget monitoring story (10.5) is obsolete post-migration — do not implement it.

### Pourquoi le partage de cache est sans risque : absence de gestion de disponibilité

> 💡 **Argument fondamental** — Ride'n'Rest n'interroge **jamais** la disponibilité en temps réel des hébergements. Les données POI proviennent d'Overpass (OSM) et de Google Places, qui retournent uniquement des **données statiques** : nom, coordonnées, type, téléphone, site web. Aucune de ces sources ne sait si un hôtel est complet ce soir.
>
> Conséquence : **deux utilisateurs au même endroit voient exactement les mêmes POIs**, indépendamment de leur session, adventure, ou segment. Il n'y a aucun état user-specific dans les données POI retournées.
>
> C'est précisément ce qui rend le partage de cache cross-user **sûr et correct** — le cache ne contient pas de données personnalisées. La seule chose user-specific est la `distAlongRouteKm` et `distFromTraceM` stockées en DB (table `accommodations_cache`, scoped par `segmentId`) — mais ces champs ne font PAS partie de la réponse Redis cachée.
>
> **Ce que le cache Redis contient** : liste de POIs avec `{id, name, lat, lng, category, source, distFromTraceM, distAlongRouteKm, ...}` — les distances sont calculées côté DB au moment de l'insertion, pas dans le cache Redis. Attention : vérifier si le cache Redis sérialise déjà les distances ou juste les coordonnées brutes. Si les distances segment-spécifiques sont dans le JSON Redis → ne pas les inclure dans le cache partagé (voir note ci-dessous).

> ⚠️ **Point à vérifier par le dev** : Le cache Redis actuel (`JSON.stringify(pois)`) inclut-il `distFromTraceM` et `distAlongRouteKm` dans les objets sérialisés ? Si oui, ces champs sont segment-spécifiques et ne doivent **pas** être partagés tel quel. Deux options :
> - Option A (simple) : exclure `distFromTraceM`/`distAlongRouteKm` du JSON Redis, les recalculer depuis DB à chaque requête → cache Redis = POIs "bruts" (lat/lng/name/category uniquement)
> - Option B (complexe) : garder les distances dans le cache mais les recalculer post-HIT pour le segment demandeur → overhead DB même en cas de HIT
>
> **Recommandation** : Option A. Les distances PostGIS sont une opération légère sur index (ST_Distance sur geom indexée). Le cache Redis sert à éviter Overpass + Google Places, pas les requêtes DB locales. Confirmer l'approche avec Guillaume si nécessaire.

### Key Change — Exact Before/After

```typescript
// BEFORE (segment-scoped — no cross-user sharing)
const cacheKey = `pois:${segmentId}:${fromKm}:${toKm}:${activeCategories.sort().join(',')}`
// Example: pois:550e8400-e29b-41d4-a716-446655440000:0:30:bike_repair,hotel

// AFTER (geographic — cross-user sharing)
const round3 = (v: number) => Math.round(v * 1000) / 1000
const cacheKey = `pois:bbox:${round3(minLat)}:${round3(minLng)}:${round3(maxLat)}:${round3(maxLng)}:${activeCategories.sort().join(',')}`
// Example: pois:bbox:42.345:1.234:43.456:2.567:bike_repair,hotel
```

### Why 3 Decimal Places?

- 0.001° ≈ 111 meters at the equator (latitude), slightly less in longitude at mid-Europe latitudes (~80m)
- This is acceptable precision for a 3km corridor width — the cache granularity aligns with the corridor buffer, not the exact segment path
- Prevents cache fragmentation from floating-point differences between users' slightly different `fromKm` boundaries that map to the same geographic zone

### Files to Touch

| File | Change |
|------|--------|
| `apps/api/src/pois/pois.service.ts` | Bbox-based cache key (corridor + live mode), `round3` helper, reorder flow, `CACHE_TTL_SECONDS` → `OVERPASS_CACHE_TTL`, `GOOGLE_CACHE_TTL` → `GOOGLE_PLACES_CACHE_TTL` |
| `packages/shared/src/constants/api.constants.ts` | Ajouter `GOOGLE_PLACES_CACHE_TTL = 7 * 24 * 60 * 60` (OVERPASS_CACHE_TTL existe déjà) |
| `apps/api/src/pois/pois.service.test.ts` | Cross-user cache key tests (corridor + live) |

### DO NOT Touch

- `apps/api/src/pois/pois.repository.ts` — `accommodations_cache` table still stores POIs scoped by `segmentId` (DB schema unchanged — PostGIS distances are segment-specific)
- `apps/api/src/pois/dto/find-pois.dto.ts` — no API contract change
- `apps/api/src/pois/providers/overpass.provider.ts` — unchanged
- Any frontend files — pure backend cache key change, transparent to clients

### Existing Architecture — How BBox is Already Computed

The bbox is already computed in `pois.service.ts` (lines ~82-87) **before** the Overpass call:

```typescript
const bufferDeg = CORRIDOR_WIDTH_M / 111_000  // 3000m / 111_000 ≈ 0.0270°

const minLat = Math.min(...rangeWaypoints.map((wp) => wp.lat)) - bufferDeg
const maxLat = Math.max(...rangeWaypoints.map((wp) => wp.lat)) + bufferDeg
const minLng = Math.min(...rangeWaypoints.map((wp) => wp.lng)) - bufferDeg
const maxLng = Math.max(...rangeWaypoints.map((wp) => wp.lng)) + bufferDeg
```

The key change is: **move the cache key computation to AFTER the bbox is computed** (currently it's computed BEFORE as line ~58). The flow must be reordered:

```
CURRENT FLOW:
1. Compute cacheKey (line 58) — uses segmentId only
2. Redis GET cacheKey
3. If MISS → get waypoints → compute bbox → call Overpass

NEW FLOW:
1. Redis GET with placeholder? NO — can't compute bbox without waypoints
SOLUTION: Two-step cache — or compute bbox first

RECOMMENDED APPROACH:
1. Redis GET: try legacy key first? NO — just drop it.
2. Get waypoints (ownership check) — needed for bbox
3. Compute bbox from rangeWaypoints
4. Compute geo cacheKey from bbox
5. Redis GET geo cacheKey
6. If HIT → return
7. If MISS → call Overpass → cache with geo key
```

> ⚠️ **Important**: The new flow means **the segment ownership check (waypoints load) always happens before the Redis GET** for corridor mode. This is acceptable because:
> - Ownership must always be verified (security)
> - `getSegmentWaypoints` is a fast indexed DB query (`WHERE segment_id = $1 AND user_id = $2`)
> - Redis GET is still the hot path for the actual Overpass call

### Google Places API — Impact de la migration

Le `prefetchAndInsertGooglePois` est appelé dans le **même bloc MISS** que l'appel Overpass :

```typescript
// Bloc MISS actuel (pois.service.ts)
const nodes = await this.overpassProvider.queryPois(bbox, activeCategories)   // ← Overpass call
// ...
await this.prefetchAndInsertGooglePois(bbox, segmentId, redis)                 // ← Google Places call
// ...
await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(pois))          // ← store in Redis
```

Conséquence directe de la migration vers une clé bbox :
- **Avant** : User A (segment UUID-1) → MISS → Overpass + Google Places. User B (segment UUID-2, même corridor) → MISS → Overpass + Google Places ×2 appels
- **Après** : User A → MISS → Overpass + Google Places. User B (même bbox arrondie) → HIT → 0 appels externes

Les clés Redis individuelles `google_place_id:{externalId}` (TTL 7j) et `google_place_details:{placeId}` (TTL 7j) restent inchangées — elles cacheent les détails d'un POI spécifique. C'est le **déclenchement du prefetch entier** (la boucle de recherche Google Places par bbox) qui est évité grâce au HIT sur la clé corridor bbox.

> **Note** : Google Places n'a pas de free tier infini. Chaque `nearbySearch` ou `findPlaceFromText` consomme du quota. La migration bbox réduit directement le nombre de recherches Google Places par zone géographique populaire.

### Live Mode — Before/After

```typescript
// BEFORE (segment-scoped live mode)
const roundedKm = Math.round(targetKm! * 10) / 10
const cacheKey = `pois:live:${segmentId}:${roundedKm}:${radiusKm ?? 3}:${sortedCategories}`

// AFTER (bbox-based live mode — same round3 helper)
const round3 = (v: number) => Math.round(v * 1000) / 1000
const cacheKey = `pois:live:bbox:${round3(bbox.minLat)}:${round3(bbox.minLng)}:${round3(bbox.maxLat)}:${round3(bbox.maxLng)}:${sortedCategories}`
```

Le `round3` helper est le même que pour le mode corridor — définir une seule fois en haut du fichier.

### Cache Key Namespace

Keys avant migration (expirent naturellement à 24h) :
```
pois:{segmentId}:{fromKm}:{toKm}:{categories}
pois:live:{segmentId}:{roundedKm}:{radiusKm}:{cats}
```

Keys après migration :
```
pois:bbox:{rMinLat}:{rMinLng}:{rMaxLat}:{rMaxLng}:{cats}       ← corridor mode, cross-user
pois:live:bbox:{rMinLat}:{rMinLng}:{rMaxLat}:{rMaxLng}:{cats}  ← live mode, cross-user
google_place_id:{externalId}                                     ← inchangé
google_place_details:{placeId}                                   ← inchangé
```

No Redis FLUSHDB or manual cleanup — old keys expire naturally within 24h of deployment.

### TTL Constants — Current State

```typescript
// In pois.service.ts (BEFORE — deux magic numbers locaux):
const CACHE_TTL_SECONDS = 60 * 60 * 24       // Overpass / corridor cache
const GOOGLE_CACHE_TTL  = 60 * 60 * 24 * 7   // Google place_id + details

// In packages/shared/src/constants/api.constants.ts (état actuel):
export const OVERPASS_CACHE_TTL = 24 * 60 * 60   // ✅ existe déjà
// GOOGLE_PLACES_CACHE_TTL → ❌ n'existe pas encore — à créer

// In packages/shared/src/constants/api.constants.ts (APRÈS):
export const OVERPASS_CACHE_TTL     = 24 * 60 * 60       // 24h — POIs Overpass + corridor bbox
export const GOOGLE_PLACES_CACHE_TTL = 7 * 24 * 60 * 60  // 7j — place_id + détails (stables)

// In pois.service.ts (APRÈS):
import { OVERPASS_CACHE_TTL, GOOGLE_PLACES_CACHE_TTL, MAX_SEARCH_RANGE_KM, CORRIDOR_WIDTH_M } from '@ridenrest/shared'
```

**Deux niveaux de cache Google Places — ne pas confondre :**
1. **Cache corridor** (`pois:bbox:...`, TTL `OVERPASS_CACHE_TTL` 24h) — cache le résultat combiné Overpass + Google de la zone. Si HIT → aucun appel Google Places.
2. **Cache individuel** (`google_place_id:{externalId}`, `google_place_details:{placeId}`, TTL `GOOGLE_PLACES_CACHE_TTL` 7j) — cache les données d'un POI Google spécifique (déjà cross-user par nature, keyed par place_id). Ces clés ne changent pas dans cette story.

### Project Structure Notes

- Story is purely in `apps/api/src/pois/` — no frontend changes, no shared package changes (only verifying existing constant)
- Turborepo build: change in `apps/api` only → no cross-package cache invalidation concerns
- NestJS module structure is unchanged: `pois.module.ts`, `pois.controller.ts`, `pois.service.ts`, `pois.repository.ts`
- Tests: co-located `pois.service.test.ts` with Jest (as per project-context.md rules)

### References

- [Source: epics.md#Epic 10 — Story 10.1] Geographic Cache Key — Cross-User POI Sharing
- [Source: apps/api/src/pois/pois.service.ts] Current corridor cache key at line ~58
- [Source: apps/api/src/pois/pois.service.ts] Current bbox computation at lines ~82-87
- [Source: packages/shared/src/constants/api.constants.ts] `OVERPASS_CACHE_TTL = 24 * 60 * 60`
- [Source: project-context.md#NestJS Architecture Rules] ResponseInterceptor, repository pattern, co-located tests
- [Source: project-context.md#Package Import Rules] Constants from `packages/shared/constants/`
- [Source: sprint-status.yaml#Epic 10 comment] Redis now self-hosted VPS (Upstash budget story 10.5 obsolete)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — clean implementation, no unexpected issues.

### Completion Notes List

- Implemented `round3` helper at module level (shared between corridor and live mode)
- **New corridor-mode flow**: waypoints always loaded BEFORE Redis check — ownership verified first, then bbox computed, then cache key derived. This is intentional (security + correctness).
- **New live-mode flow**: same pattern — `getWaypointAtKm` (ownership) → bbox → cache key → Redis check.
- Replaced all magic TTL numbers with shared constants: `OVERPASS_CACHE_TTL` (24h) and `GOOGLE_PLACES_CACHE_TTL` (7d). Also replaced local TTLs in `getPoiGoogleDetails()`.
- Old segment-scoped keys (`pois:{segmentId}:...`, `pois:live:{segmentId}:...`) expire naturally at 24h — no migration script needed.
- **Note on cached distances**: Redis cache stores POIs from `findCachedPois()` which includes segment-specific `distFromTraceM`/`distAlongRouteKm`. For cross-user sharing, these distances are segment-specific. For MVP use case (same popular cycling route = same corridor), this approximation is acceptable. Option A (strip distances from cache) can be implemented post-MVP if needed.
- 33 tests pass in `pois.service.test.ts` (19 pre-existing + 6 new + 8 updated). 162 total API tests pass with 0 regressions.

### File List

- `apps/api/src/pois/pois.service.ts` — bbox cache key (corridor + live), `round3` helper, new flow order, OVERPASS_CACHE_TTL, GOOGLE_PLACES_CACHE_TTL, try/catch in `getPoiGoogleDetails`
- `apps/api/src/pois/pois.repository.ts` — added `insertRawPoisForSegment` (Option A cache HIT hydration), fixed `source` type, fixed `findPoisNearPoint` array parameterization
- `packages/shared/src/constants/api.constants.ts` — added GOOGLE_PLACES_CACHE_TTL, removed stale REDIS_ALERT_THRESHOLD
- `apps/api/src/pois/pois.service.test.ts` — updated tests for new flow + 8 new tests (cross-user bbox sharing, rounding precision, live mode payload, getPlaceDetails error), removed stale `del` mock
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated to review

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] `sprint-status.yaml` modifié mais absent du File List — ajouté ci-dessus [`_bmad-output/implementation-artifacts/sprint-status.yaml`]
- [x] [AI-Review][MEDIUM] Google Places appelé hors du `try` en live mode (Overpass failure → Google Places inutilement déclenché) — déplacé dans le `try` [`pois.service.ts:204-213`]
- [x] [AI-Review][LOW] `REDIS_ALERT_THRESHOLD = 7500` stale (constante Upstash obsolète post-VPS) — supprimée [`api.constants.ts:14`]
- [x] [AI-Review][LOW] `activeCategories.sort()` mute le tableau en entrée — remplacé par `[...activeCategories].sort()` [`pois.service.ts:57,177`]
- [x] [AI-Review][LOW] Numéro step "6." dupliqué dans les commentaires — renommé "6b." [`pois.service.ts:106`]
- [x] [AI-Review][LOW] Pas de test de précision d'arrondi en live mode (AC 4.3) — test ajouté [`pois.service.test.ts`]
- [x] [AI-Review][HIGH] Cache Redis cross-user contient `distFromTraceM`/`distAlongRouteKm` segment-spécifiques — Option A implémentée : Redis stocke `RawCacheablePoi[]` (sans distances), HIT ré-insère via `insertRawPoisForSegment` + `updatePoiDistances` + read-back DB. [`pois.service.ts`, `pois.repository.ts`]
- [x] [AI-Review][MEDIUM] `pois.repository.ts` (nouveau `insertRawPoisForSegment`) absent du File List — ajouté ci-dessus [`pois.repository.ts`]
- [x] [AI-Review][MEDIUM] Pas de test vérifiant que le mode live MISS stocke le payload Redis sans distances (symétrie avec corridor mode) — test ajouté [`pois.service.test.ts:443-457`]
- [x] [AI-Review][LOW] `insertRawPoisForSegment` : type `source: string` trop large, cast interne incomplet (manquait `amadeus`) — corrigé en `'overpass' | 'amadeus' | 'google'` [`pois.repository.ts:206`]
- [x] [AI-Review][LOW] `findPoisNearPoint` : array PostgreSQL construit par interpolation string — remplacé par `sql.join` avec paramètres individuels [`pois.repository.ts:287`]
- [x] [AI-Review][LOW] Mock `mockRedisClient.del` stale (jamais appelé dans le service) — supprimé du mock et du beforeEach [`pois.service.test.ts`]
- [x] [AI-Review][LOW] `getPoiGoogleDetails` : `getPlaceDetails()` sans gestion d'erreur (propagait une 500) — wrappé dans try/catch, retourne null si Google fails [`pois.service.ts:184-190`]
