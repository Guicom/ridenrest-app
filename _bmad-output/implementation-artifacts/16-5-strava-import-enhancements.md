# Story 16.5: Strava Import Enhancements

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist importing routes from Strava**,
I want to browse all my routes with pagination and select multiple ones at once,
So that I can efficiently import several segments in a single operation without being limited to the first 30 routes.

## Acceptance Criteria

1. **Pagination — "Charger plus"** — When the Strava import modal is open and the current page returned 30 routes, a "Charger plus" button is visible below the route list. Clicking it fetches the next page (`page` increments, `per_page=30`) and appends the new routes to the existing list without replacing it. The button is hidden or disabled when the last fetched page returned fewer than 30 routes (no more pages available).

2. **Multi-selection with checkboxes** — Each route row in the modal has a checkbox on the left. The previously single-route "Importer" button per row is removed. A "Importer X segment(s)" CTA button at the bottom of the modal is enabled when ≥ 1 route is checked, and its label reflects the current selection count (e.g., "Importer 3 segment(s)"). The CTA is disabled when no route is selected or when import is in progress.

3. **Multi-import pipeline** — When the user clicks the "Importer X segment(s)" CTA, all selected routes are imported **sequentially** (to preserve `order_index` consistency), each going through the same `SegmentsService.createSegment()` + BullMQ `parse-segment` pipeline as a single import. Segments are created in the order routes were selected (checkbox insertion order). After all imports complete: the segments query is invalidated, the modal closes, and a toast "X segment(s) importé(s)" is shown.

## Tasks / Subtasks

- [x] **Task 1 — Backend: `listRoutes()` accepts `page` param** (AC: #1)
  - [x] 1.1 — `strava.service.ts`: update `listRoutes(userId: string, page: number = 1)` signature; use `page` in Strava API call: `GET /api/v3/athletes/{athleteId}/routes?per_page=30&page={page}`
  - [x] 1.2 — Cache key: change from `strava:routes:v2:{userId}` → `strava:routes:v2:{userId}:page:{page}` (per-page cache, same TTL 1h)
  - [x] 1.3 — Controller: `@Query('page', new ParseIntPipe({ optional: true })) page = 1` on `GET /strava/routes`; pass to `stravaService.listRoutes(user.id, page)`
  - [x] 1.4 — Response shape unchanged: still `StravaRouteItem[]` — frontend infers `hasMore = routes.length === 30`

- [x] **Task 2 — Frontend: `api-client.ts` page param** (AC: #1)
  - [x] 2.1 — Update `listStravaRoutes(page: number = 1): Promise<StravaRouteItem[]>` — append `?page=${page}` to request URL: `GET /api/strava/routes?page=${page}`
  - [x] 2.2 — No change to `StravaRouteItem` type or `importStravaRoute`

- [x] **Task 3 — Frontend: `strava-import-modal.tsx` — pagination + multi-select** (AC: #1, #2, #3)
  - [x] 3.1 — Replace `useQuery` with `useInfiniteQuery` (TanStack Query v5)
  - [x] 3.2 — Add `selectedIds` state: `const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())`
  - [x] 3.3 — Reset selection when modal opens/closes: `useEffect(() => { if (!open) setSelectedIds(new Set()) }, [open])`
  - [x] 3.4 — Route row: replace per-row "Importer" Button with a `<Checkbox>` (`@/components/ui/checkbox` — new component, native HTML checkbox with Tailwind); row layout: `flex items-start gap-3` with checkbox on left, route info on right
  - [x] 3.5 — Checkbox toggle handler implemented; `onClick={(e) => e.stopPropagation()}` added to prevent double-toggle from div onClick bubbling
  - [x] 3.6 — Search filter (keep existing): `allRoutes.filter(...)` — applies to all currently loaded routes
  - [x] 3.7 — "Charger plus" button: render below route list when `hasNextPage`; disable when `isFetchingNextPage`
  - [x] 3.8 — Sequential multi-import `useMutation` implemented
  - [x] 3.9 — "Importer X segment(s)" CTA in `DialogFooter` with cancel button and selection count

- [x] **Task 4 — Tests** (AC: all)
  - [x] 4.1 — Updated `strava-import-modal.test.tsx` with 13 tests covering all scenarios
  - [x] 4.2 — Updated `strava.service.test.ts`: cache key assertions updated + 2 new page tests (10 → 10 tests, cache keys now `strava:routes:v2:{userId}:page:{page}`)
  - [x] 4.3 — All tests pass: 875 total (665 web + 210 api), up from 864

### Review Follow-ups (AI — Code Review 2026-04-01)

- [x] [AI-Review][HIGH] `importRoute()` cache key `strava:routes:v2:${userId}` never populated after pagination — route names always fell back to `Route Strava {id}`. Fixed → `strava:routes:v2:${userId}:page:1` [`strava.service.ts:94`]
- [x] [AI-Review][MEDIUM] `onError` dropped error message — now `toast.error(\`Erreur lors de l'importation : ${err.message}\`)` [`strava-import-modal.tsx:82`]
- [x] [AI-Review][MEDIUM] `onSuccess` used `selectedIds.size` (closure) — now uses `ids.length` (mutation param) [`strava-import-modal.tsx:77`]
- [x] [AI-Review][MEDIUM] Backend `page` param allowed 0/negative values — now clamped with `Math.max(1, page)` [`strava.controller.ts:19`]
- [x] [AI-Review][MEDIUM] Skeleton test was a placeholder — now asserts 3 skeletons visible and no checkboxes [`strava-import-modal.test.tsx:75`]
- [x] [AI-Review][MEDIUM] AC #2 "CTA disabled during import" not tested — new test added [`strava-import-modal.test.tsx`]
- [x] [AI-Review][LOW] Checkbox missing `focus-visible` ring — added Tailwind focus-visible classes [`checkbox.tsx:19`]

## Dev Notes

### Terminology clarification: "Routes" vs. "Activities"

The story title and epic text use "activités Strava" but the existing implementation (Story 3.5) **uses the Strava Routes API** (`/api/v3/athletes/{athleteId}/routes`), not the Activities API. This was a deliberate choice (ToS compliance, bikepacking use case). The Strava import modal internally shows routes. This story keeps the routes API. No change to the Strava endpoint used.

---

### Backend: `strava.service.ts` — pagination

**Current signature:**
```typescript
async listRoutes(userId: string): Promise<StravaRouteItem[]>
```

**Updated signature:**
```typescript
async listRoutes(userId: string, page: number = 1): Promise<StravaRouteItem[]>
```

**Cache key update** (critical — must be page-scoped):
```typescript
// Before
const cacheKey = `strava:routes:v2:${userId}`
// After
const cacheKey = `strava:routes:v2:${userId}:page:${page}`
```

**Strava API call update:**
```typescript
// Before
`https://www.strava.com/api/v3/athletes/${athleteId}/routes?per_page=30`
// After
`https://www.strava.com/api/v3/athletes/${athleteId}/routes?per_page=30&page=${page}`
```

Everything else in `listRoutes` (token validation, rate limiting, large-ID parsing, Redis set) stays identical.

---

### Backend: Controller — `ParseIntPipe` for optional query param

```typescript
@Get('routes')
async listRoutes(
  @CurrentUser() user: { id: string },
  @Query('page', new ParseIntPipe({ optional: true })) page = 1,
): Promise<StravaRouteItem[]> {
  return this.stravaService.listRoutes(user.id, page)
}
```

`ParseIntPipe({ optional: true })` (NestJS 10+) allows the param to be absent (defaults to 1). No DTO needed for a single numeric query param.

---

### Frontend: `useInfiniteQuery` v5 — key patterns

TanStack Query v5 `useInfiniteQuery` requires `initialPageParam`:
```typescript
import { useInfiniteQuery } from '@tanstack/react-query'

const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useInfiniteQuery({
  queryKey: ['strava-routes'],
  queryFn: ({ pageParam }: { pageParam: number }) => listStravaRoutes(pageParam),
  initialPageParam: 1,
  getNextPageParam: (lastPage: StravaRouteItem[], allPages: StravaRouteItem[][]) =>
    lastPage.length === 30 ? allPages.length + 1 : undefined,
  enabled: open && stravaConnected,
  staleTime: 0,
})

const allRoutes: StravaRouteItem[] = data?.pages.flat() ?? []
```

`hasNextPage` is automatically `true` when `getNextPageParam` returns a non-undefined value.

**Reset on modal reopen**: With `staleTime: 0` + `enabled: open`, when `open` goes `false → true`, TQ refetches from page 1 (single page, resets accumulated list). ✅

---

### Frontend: Route row UI — checkbox layout

Replace the existing per-row `<Button>Importer</Button>` with:
```tsx
<div
  key={route.id}
  className="flex items-start gap-3 py-2 cursor-pointer"
  onClick={() => toggleSelection(route.id)}
>
  <Checkbox
    checked={selectedIds.has(route.id)}
    onCheckedChange={() => toggleSelection(route.id)}
    className="mt-0.5 shrink-0"
    aria-label={`Sélectionner ${route.name}`}
  />
  <div className="flex-1 min-w-0">
    <p className="text-sm font-medium truncate">{route.name}</p>
    <p className="text-xs text-muted-foreground">
      {route.distanceKm.toFixed(1)} km
      {route.elevationGainM !== null && ` · ↑ ${route.elevationGainM} m`}
    </p>
  </div>
</div>
```

Import `Checkbox` from `@/components/ui/checkbox` (shadcn/ui, already in project via Radix UI).

---

### Frontend: "Charger plus" button

Place below the scrollable route list, before `DialogFooter`:
```tsx
{hasNextPage && (
  <Button
    variant="outline"
    className="w-full mt-2"
    onClick={() => void fetchNextPage()}
    disabled={isFetchingNextPage}
  >
    {isFetchingNextPage ? 'Chargement…' : 'Charger plus'}
  </Button>
)}
```

---

### Frontend: Multi-import sequential flow

Sequential import (preserves `order_index`):
```typescript
const importMutation = useMutation({
  mutationFn: async (ids: string[]) => {
    for (const id of ids) {
      await importStravaRoute(id, adventureId)
    }
  },
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ['adventures', adventureId, 'segments'] })
    toast.success(`${selectedIds.size} segment(s) importé(s)`)
    onOpenChange(false)
  },
  onError: (err: Error) => {
    toast.error(`Erreur lors de l'importation : ${err.message}`)
  },
})
```

**Why sequential**: `SegmentsService.createSegment()` assigns `order_index = MAX(existing) + 1`. Parallel calls would race on `order_index` → segments arrive in undefined order. Sequential ensures selection order is preserved.

**Note**: Each `importStravaRoute` returns immediately with `parseStatus: 'pending'` — the BullMQ `parse-segment` job runs asynchronously. So 5 sequential API calls take ~200ms total, not 5× GPX parse time. ✅

---

### Frontend: `DialogFooter` — complete layout

```tsx
<DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:items-center">
  <p className="text-xs text-muted-foreground order-2 sm:order-1">
    {selectedIds.size > 0 ? `${selectedIds.size} sélectionné(s)` : 'Aucun segment sélectionné'}
  </p>
  <div className="flex gap-2 order-1 sm:order-2">
    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importMutation.isPending}>
      Annuler
    </Button>
    <Button
      onClick={() => importMutation.mutate([...selectedIds])}
      disabled={selectedIds.size === 0 || importMutation.isPending}
    >
      {importMutation.isPending
        ? 'Importation…'
        : `Importer ${selectedIds.size > 0 ? selectedIds.size : ''} segment(s)`}
    </Button>
  </div>
</DialogFooter>
```

---

### Tests: mocking `useInfiniteQuery`

The current modal test mocks `listStravaRoutes` at module level (not TanStack Query hooks directly). This approach still works with `useInfiniteQuery` since the hook calls `listStravaRoutes` internally. Use `vi.mock('@/lib/api-client', ...)` to return controlled page data:

```typescript
import { vi } from 'vitest'
import * as apiClient from '@/lib/api-client'

// 30 items → hasNextPage = true
const mockPage1 = Array.from({ length: 30 }, (_, i) => ({
  id: `route-${i}`,
  name: `Route ${i}`,
  distanceKm: 42,
  elevationGainM: 500,
}))
// 5 items → hasNextPage = false
const mockPage2 = Array.from({ length: 5 }, (_, i) => ({
  id: `route-extra-${i}`,
  name: `Route extra ${i}`,
  distanceKm: 20,
  elevationGainM: 100,
}))

vi.spyOn(apiClient, 'listStravaRoutes')
  .mockResolvedValueOnce(mockPage1)   // page 1
  .mockResolvedValueOnce(mockPage2)   // page 2
```

**Note**: Tests should wrap component renders in `QueryClientProvider` with a fresh `QueryClient` per test to avoid cache bleeding between tests. If the existing test setup already does this, no change needed.

---

### Tests: `strava.service.test.ts` — cache key update

Existing tests use cache key `strava:routes:v2:{userId}`. All must be updated to `strava:routes:v2:{userId}:page:1` (since default `page = 1`). Add new tests for page 2.

```typescript
it('should use page-scoped cache key', async () => {
  mockRedis.get.mockResolvedValue(null)
  mockRedis.set.mockResolvedValue(null)
  // ... setup token mock, fetch mock returning 30 routes
  await service.listRoutes(userId, 2)
  expect(mockRedis.get).toHaveBeenCalledWith(`strava:routes:v2:${userId}:page:2`)
  expect(mockRedis.set).toHaveBeenCalledWith(
    `strava:routes:v2:${userId}:page:2`,
    expect.any(String),
    'EX',
    3600,
  )
})
```

---

### Strava Rate Limit note

Each "Charger plus" click = 1 Strava API call (cache miss only). With 15-min limit of 100 req (global), typical usage (1 user, 2–3 page loads) is negligible. Rate limiting logic in `checkAndIncrementRateLimit()` is unchanged.

### Project Structure Notes

| File | Action |
|------|--------|
| `apps/api/src/strava/strava.service.ts` | Add `page` param to `listRoutes()` + page-scoped cache key |
| `apps/api/src/strava/strava.controller.ts` | Add `@Query('page', ParseIntPipe)` to `GET /routes` |
| `apps/api/src/strava/strava.service.test.ts` | Update cache key assertions + add page 2 tests |
| `apps/web/src/lib/api-client.ts` | Add `page` param to `listStravaRoutes()` |
| `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx` | Replace `useQuery` with `useInfiniteQuery`, add multi-select + "Charger plus" |
| `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.test.tsx` | Update all tests for new multi-select UI + pagination |

### References

- Epic 16 story 16.5 requirements: `_bmad-output/planning-artifacts/epics.md#Story-16.5`
- Existing `StravaImportModal`: `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx`
- Existing `StravaService.listRoutes()`: `apps/api/src/strava/strava.service.ts`
- Controller: `apps/api/src/strava/strava.controller.ts`
- API client Strava functions: `apps/web/src/lib/api-client.ts` (`listStravaRoutes`, `importStravaRoute`)
- shadcn/ui Checkbox: `apps/web/src/components/ui/checkbox.tsx`
- TanStack Query v5 `useInfiniteQuery` docs: project uses v5 — `initialPageParam` is required
- Story 16.4 completion notes (test count 864, mock patterns): `16-4-density-analysis-ux.md`
- Tailwind JIT rule: never dynamic class generation — use full class strings in ternary [project-context.md]
- Rate limit implementation: `apps/api/src/strava/strava.service.ts#checkAndIncrementRateLimit`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Created `apps/web/src/components/ui/checkbox.tsx` — native HTML checkbox component (no `@radix-ui/react-checkbox` in project, used native input with Tailwind styling and `onCheckedChange` prop to match shadcn/ui API)
- Fixed double-toggle bug: Checkbox `onClick={(e) => e.stopPropagation()}` prevents click from bubbling to parent div's `onClick`, which would otherwise call `toggleSelection` twice
- `importRoute` cache key fixed post-review: now uses `strava:routes:v2:${userId}:page:1` (old non-paginated key was never populated after pagination change → route names always fell back to `Route Strava {id}`)
- `onError` fixed post-review: now includes `err.message` in toast
- `onSuccess` fixed post-review: uses `ids.length` (mutation param) instead of `selectedIds.size` (closure)
- Backend controller fixed post-review: `Math.max(1, page)` guards against 0/negative page params
- Checkbox `focus-visible` ring added post-review for keyboard accessibility
- Skeleton test strengthened post-review: now asserts 3 skeleton elements and no checkboxes
- New test added post-review: CTA disabled while import in progress (AC #2 full coverage)
- Test count: 864 → 875 (+11: 14 frontend modal tests, 10 backend service tests)

### File List

- `apps/api/src/strava/strava.service.ts`
- `apps/api/src/strava/strava.controller.ts`
- `apps/api/src/strava/strava.service.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/components/ui/checkbox.tsx` (new)
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.test.tsx`
