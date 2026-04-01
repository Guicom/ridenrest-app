# Story 16.8: Advanced Stage Management & Global Average Speed

Status: done

## Story

As a **cyclist doing detailed stage planning**,
I want more control over stage positioning and a global speed setting,
So that my ETAs, weather forecasts, and elevation estimates are as accurate as possible.

## Acceptance Criteria

1. **Stage split on insert** — When the user creates a new stage with an `endKm` falling inside an existing stage's `[startKm, endKm]`, the existing stage is split at the new `endKm`: the user's new stage covers `[existingStage.startKm, dto.endKm]` at the same `orderIndex`, and the existing stage becomes a "remainder" covering `[dto.endKm, existingStage.endKm]` at `orderIndex + 1`. All subsequent stages' `orderIndex` and `startKm`/`distanceKm`/`elevationGainM`/`etaMinutes` are recalculated. D+ and ETA are recomputed for both halves using the adventure's `avgSpeedKmh`.

2. **Elevation profile click for stage placement** — When the user is in "Créer une étape" click mode (`isClickModeActive = true`), clicking a point on the `ElevationProfile` chart sets `pendingEndKm` to the `distKm` at that point and opens the naming dialog — same flow as a click on the map trace.

3. **`avg_speed_kmh` on adventure** — A `avg_speed_kmh` field (numeric, `real`, DB default `15`, valid range 5–50 km/h) is stored on the `adventures` table. It is returned in `AdventureResponse` and patchable via `PATCH /adventures/:id` with `{ avgSpeedKmh: number }`.

4. **`avg_speed_kmh` UI** — The "Vitesse moyenne" inline-editable field (range 5–50, default 15, pencil icon) is placed at the **top of the planning sidebar** (`map-view.tsx`) and at the **top of the live filters drawer** (`live-filters-drawer.tsx`). It is NOT on the adventure detail page. On save, the mutation calls `PATCH /adventures/:id` and invalidates TanStack Query keys `['adventures', id]`, `['stages', adventureId]`, and `{ queryKey: ['weather'] }`.

5. **ETA uses `avg_speed_kmh`** — `computeEtaMinutes(distanceKm, elevationGainM, speedKmh)` replaces the hardcoded `15 km/h`. All stage create/update/delete operations load `adventure.avgSpeedKmh` and pass it as `speedKmh`. The `StagesService` uses `adventuresService.getAdventure()` (already called for ownership check) to get `avgSpeedKmh`.

6. **Weather defaults to `avg_speed_kmh`** — The speed field has been **removed from `WeatherControls`** (and `SidebarWeatherSection`). Weather queries in `map-view.tsx` use `adventure?.avgSpeedKmh ?? 15` directly. Stage weather badges (`SidebarStagesSection`) use `adventure.avgSpeedKmh` as fallback `speedKmh` when pace is not stored.

7. **Re-computation on speed change** — When `PATCH /adventures/:id` sets `avgSpeedKmh`, the backend loads all stages for the adventure and recomputes/saves `etaMinutes` for each using the new speed. Returns the updated adventure.

## Tasks / Subtasks

- [x] **Task 1 — DB schema: `avg_speed_kmh` on `adventures`** (AC: #3, #5)
  - [x] 1.1 — Add `avgSpeedKmh: real('avg_speed_kmh').notNull().default(15)` to `packages/database/src/schema/adventures.ts`
  - [x] 1.2 — Run `pnpm --filter @ridenrest/database db:generate` to generate migration
  - [x] 1.3 — Verify migration SQL: `ALTER TABLE adventures ADD COLUMN avg_speed_kmh REAL NOT NULL DEFAULT 15`

- [x] **Task 2 — NestJS `adventures`: expose and patch `avgSpeedKmh`** (AC: #3, #4, #6, #7)
  - [x] 2.1 — `packages/shared/src/types/adventure.types.ts`: add `avgSpeedKmh: number` to `AdventureResponse`
  - [x] 2.2 — `apps/api/src/adventures/adventures.service.ts` `toResponse()`: add `avgSpeedKmh: a.avgSpeedKmh`
  - [x] 2.3 — `apps/api/src/adventures/dto/update-adventure.dto.ts`: add optional `@IsNumber() @Min(5) @Max(50) avgSpeedKmh?: number`
  - [x] 2.4 — `apps/api/src/adventures/adventures.repository.ts`: add `updateAvgSpeedKmh(id, value)` method (pattern: same as `updateName`)
  - [x] 2.5 — `apps/api/src/adventures/adventures.service.ts` `updateAdventure()`: handle `dto.avgSpeedKmh !== undefined` → call `repo.updateAvgSpeedKmh()`, then recompute all stage ETAs (see Task 3 for `computeEtaMinutes` signature)
  - [x] 2.6 — For ETA recompute on speed change: load all stages, load waypoints, compute new `etaMinutes` for each stage, call `stagesRepo.updateMany()`. Inject `StagesRepository` into `AdventuresService` (or call via `StagesService.recomputeAllEtasForAdventure(adventureId, speedKmh)` — prefer a dedicated service method). Implemented via controller-layer coordination with `forwardRef()` modules.

- [x] **Task 3 — NestJS `stages`: split logic + `computeEtaMinutes` with speed param** (AC: #1, #5)
  - [x] 3.1 — `stages.service.ts` `computeEtaMinutes(distanceKm, elevationGainM, speedKmh = 15)`: replace hardcoded `/ 15` with `/ speedKmh`
  - [x] 3.2 — `stages.service.ts`: in `createStage`, `updateStage`, `deleteStage` — replace `verifyOwnership` call with `adventuresService.getAdventure(adventureId, userId)` to get `adventure.avgSpeedKmh`; pass it to all `computeEtaMinutes` calls
  - [x] 3.3 — `stages.repository.ts`: add `findContaining(adventureId, endKm)` — find stage where `startKm < endKm < endKm` (Drizzle: `and(eq(adventureId), lt(startKm, endKm), gt(endKm, endKm))`)
  - [x] 3.4 — `stages.repository.ts`: add `incrementOrderIndexGt(adventureId, orderIndex)` — increment `order_index` for all stages with `order_index > orderIndex`
  - [x] 3.5 — `stages.repository.ts`: extend `update()` signature to include `startKm` and `orderIndex` fields
  - [x] 3.6 — `stages.service.ts` `createStage()`: add split detection before normal creation logic:
    ```
    1. Call repo.findContaining(adventureId, dto.endKm)
    2. If found (splitTarget):
       a. repo.incrementOrderIndexGt(adventureId, splitTarget.orderIndex)
       b. Compute D+/ETA for new stage [splitTarget.startKm, dto.endKm]
       c. repo.create({ orderIndex: splitTarget.orderIndex, startKm: splitTarget.startKm, endKm: dto.endKm, name: dto.name, color: dto.color, distanceKm, elevationGainM, etaMinutes })
       d. Update splitTarget: { orderIndex: splitTarget.orderIndex + 1, startKm: dto.endKm, distanceKm: splitTarget.endKm - dto.endKm, recomputed D+/ETA }
       e. Return the newly created stage
    3. If NOT found: existing normal creation logic
    ```
  - [x] 3.7 — `stages.service.ts`: add `recomputeAllEtasForAdventure(adventureId, speedKmh)` for use by AdventuresService when speed changes
  - [x] 3.8 — Update `stages.service.test.ts`: add tests for split logic (normal case + split case) and new speedKmh param in ETA computation

- [x] **Task 4 — Frontend `avgSpeedKmh` field** (AC: #4) *(placement révisé post-implémentation)*
  - [x] 4.1 — Champ "Vitesse moyenne" en haut de la sidebar planning (`map-view.tsx`) — inline edit avec pencil icon, `useMutation` → `updateAdventureAvgSpeedKmh`, invalidation `['adventures', id]` + `['stages', id]` + `['weather']`
  - [x] 4.2 — Champ "Vitesse moyenne" en première section du drawer live (`live-filters-drawer.tsx`) — `defaultSpeedKmh` prop depuis `adventure.avgSpeedKmh`, `localSpeed` initialisé à `defaultSpeedKmh ?? speedKmh`
  - [x] 4.3 — `updateAdventureAvgSpeedKmh` ajouté à `apps/web/src/lib/api-client.ts`
  - [x] 4.4 — Champ supprimé de `WeatherControls` / `SidebarWeatherSection` (vitesse disponible via la sidebar, pas dans la météo)
  - [x] 4.5 — Champ supprimé de `adventure-detail.tsx` (déplacé vers la carte)

- [x] **Task 5 — Frontend ElevationProfile: click support** (AC: #2)
  - [x] 5.1 — `elevation-profile.tsx`: add props `isClickModeActive?: boolean` and `onClickKm?: (km: number) => void`
  - [x] 5.2 — Click intercepté sur le **div container** (pas sur `<AreaChart>`) — recharts `onClick` non fiable en v3 (`activePayload` peut être null). Le km vient de `lastKmRef` mis à jour via `wrappedOnHoverKm` (même mécanisme que la crosshair sur la carte).
  - [x] 5.3 — `cursor: crosshair` appliqué sur le div container quand `isClickModeActive`
  - [x] 5.4 — In `map-view.tsx`: pass `isClickModeActive={stageClickMode}` and `onClickKm={(km) => { setPendingEndKm(km); setShowNamingDialog(true) }}` to `<ElevationProfile />`
  - [x] 5.5 — `wrappedOnHoverKm` capture le km avant de le transmettre à `onHoverKm` → pas de conflit entre hover et click

- [x] **Task 6 — Frontend WeatherControls: default to `avgSpeedKmh`** (AC: #6)
  - [x] 6.1 — Champ vitesse supprimé de `WeatherControls` et `SidebarWeatherSection`. Les weather queries utilisent `adventure?.avgSpeedKmh ?? 15` directement dans la query key et queryFn.
  - [x] 6.2 — `SidebarStagesSection`: `speedKmh={stagePace.speedKmh ?? adventure?.avgSpeedKmh ?? 15}` — fallback sur `adventure.avgSpeedKmh`.

- [x] **Task 7 — Tests** (AC: all)
  - [x] 7.1 — `stages.service.test.ts`: test `computeEtaMinutes(10, null, 20)` ≠ `computeEtaMinutes(10, null, 15)` — speed param is used
  - [x] 7.2 — `stages.service.test.ts`: test `createStage` split case — mock `findContaining` returning a stage; assert `incrementOrderIndexGt` and two repo calls (create + update)
  - [x] 7.3 — `elevation-profile.test.tsx`: test that `onClick` fires `onClickKm` with the correct km value when `isClickModeActive=true`
  - [x] 7.4 — `adventure-detail.test.tsx` (if it exists): assert `avgSpeedKmh` field is rendered and mutation is triggered on change

## Dev Notes

### Stage Split Algorithm — Detailed Logic

The current `createStage` appends after the last stage. After this story, it first checks for a split target:

```typescript
// 1. Check if endKm falls INSIDE any existing stage
const splitTarget = await this.stagesRepo.findContaining(adventureId, dto.endKm)

if (splitTarget) {
  // SPLIT CASE
  // a. Free up orderIndex slot: increment all stages AFTER splitTarget
  await this.stagesRepo.incrementOrderIndexGt(adventureId, splitTarget.orderIndex)

  // b. Create user's new stage at splitTarget's orderIndex position
  const newDistKm = dto.endKm - splitTarget.startKm
  const newElevGain = computeElevationGainForRange(waypoints, splitTarget.startKm, dto.endKm)
  const newEta = computeEtaMinutes(newDistKm, newElevGain, speedKmh)
  const newStage = await this.stagesRepo.create({
    adventureId,
    name: dto.name,
    color: dto.color,
    orderIndex: splitTarget.orderIndex,   // same slot — others shifted up
    startKm: splitTarget.startKm,
    endKm: dto.endKm,
    distanceKm: newDistKm,
    elevationGainM: newElevGain,
    etaMinutes: newEta,
  })

  // c. Update split target to become the remainder
  const remDistKm = splitTarget.endKm - dto.endKm
  const remElevGain = computeElevationGainForRange(waypoints, dto.endKm, splitTarget.endKm)
  const remEta = computeEtaMinutes(remDistKm, remElevGain, speedKmh)
  await this.stagesRepo.update(splitTarget.id, {
    orderIndex: splitTarget.orderIndex + 1,
    startKm: dto.endKm,
    distanceKm: remDistKm,
    elevationGainM: remElevGain,
    etaMinutes: remEta,
  })

  return this.toResponse(newStage)
}

// NORMAL CASE — existing logic follows
```

**Boundary validation for split**: `dto.endKm` must be strictly inside `[splitTarget.startKm, splitTarget.endKm]`. The `findContaining` query uses `gt(adventureStages.startKm, dto.endKm)` is WRONG — see below:

```typescript
// stages.repository.ts — findContaining
async findContaining(adventureId: string, endKm: number): Promise<AdventureStage | undefined> {
  const [row] = await db
    .select()
    .from(adventureStages)
    .where(
      and(
        eq(adventureStages.adventureId, adventureId),
        lt(adventureStages.startKm, endKm),   // startKm < endKm (dto)
        gt(adventureStages.endKm, endKm),      // endKm (stage) > endKm (dto)
      ),
    )
    .limit(1)
  return row
}
```

**Note**: Import `lt` from `drizzle-orm` (already imported in repository: `eq, asc, desc, and, gt, sql` — add `lt`).

### `incrementOrderIndexGt` — Drizzle SQL

```typescript
async incrementOrderIndexGt(adventureId: string, orderIndex: number): Promise<void> {
  await db
    .update(adventureStages)
    .set({ orderIndex: sql`${adventureStages.orderIndex} + 1` })
    .where(
      and(
        eq(adventureStages.adventureId, adventureId),
        gt(adventureStages.orderIndex, orderIndex),
      ),
    )
}
```

### `computeEtaMinutes` — Updated Signature

```typescript
// stages.service.ts
export function computeEtaMinutes(
  distanceKm: number,
  elevationGainM: number | null,
  speedKmh = 15,         // NEW param — defaults to 15 for backward compat
): number {
  const flatMinutes = (distanceKm / speedKmh) * 60   // was (distanceKm / 15) * 60
  const climbMinutes = ((elevationGainM ?? 0) / 100) * 6
  return Math.round(flatMinutes + climbMinutes)
}
```

All existing tests pass since default is 15.

### Elevation Profile Click — Recharts API

`<AreaChart onClick>` fires with `CategoricalChartState`:
```typescript
interface CategoricalChartState {
  activePayload?: Array<{ payload: ElevationPoint }>
  // ...
}
```
Handler:
```typescript
// elevation-profile.tsx
const handleChartClick = (state: CategoricalChartState) => {
  if (!isClickModeActive || !onClickKm) return
  const km = state?.activePayload?.[0]?.payload?.distKm
  if (km !== undefined && km !== null) {
    onClickKm(km)
  }
}

// In JSX:
<AreaChart
  data={points}
  onClick={handleChartClick}
  style={isClickModeActive ? { cursor: 'crosshair' } : undefined}
  // existing props...
>
```

**Important**: The `onClick` of recharts AreaChart fires when `activePayload` is available (i.e., when the pointer is over a data point). If user clicks outside the chart area, `activePayload` is null → guard with `km !== undefined`.

### `AdventureResponse` — `avgSpeedKmh` field

```typescript
// packages/shared/src/types/adventure.types.ts
export interface AdventureResponse {
  // ...existing fields...
  avgSpeedKmh: number   // NEW — default 15 from DB
}
```

### `UpdateAdventureDto` — `avgSpeedKmh`

```typescript
// apps/api/src/adventures/dto/update-adventure.dto.ts
@IsOptional()
@IsNumber()
@Min(5, { message: 'avgSpeedKmh must be at least 5 km/h' })
@Max(50, { message: 'avgSpeedKmh must be at most 50 km/h' })
avgSpeedKmh?: number
```

Import `IsNumber, Min, Max` from `class-validator`.

### AdventuresService — handling `avgSpeedKmh` update with ETA recompute

When `PATCH /adventures/:id` receives `avgSpeedKmh`:

```typescript
// adventures.service.ts
if (dto.avgSpeedKmh !== undefined) {
  adventure = await this.adventuresRepo.updateAvgSpeedKmh(id, dto.avgSpeedKmh)
  // Recompute all stage ETAs with new speed
  await this.stagesService.recomputeAllEtasForAdventure(id, dto.avgSpeedKmh)
}
```

**Circular dependency risk**: `AdventuresService` → `StagesService` → `AdventuresService`. Avoid by injecting `StagesRepository` directly into `AdventuresService` and duplicating the recompute logic there, OR by extracting to a `StagesComputeService` used by both. Simplest: inject `StagesRepository` + `getAdventureWaypoints()` directly in `AdventuresService` for this one operation, bypassing the circular dependency.

**Alternative (recommended)**: Create `StagesService.recomputeAllEtasForAdventure(adventureId, speedKmh)` but call it from the controller layer (not the service):

```typescript
// adventures.controller.ts — PATCH /:id handler
@Patch(':id')
async update(...) {
  const adventure = await this.adventuresService.updateAdventure(id, user.id, dto)
  if (dto.avgSpeedKmh !== undefined) {
    await this.stagesService.recomputeAllEtasForAdventure(id, dto.avgSpeedKmh)
  }
  return adventure
}
```

This keeps both services independent. The controller is already where cross-service coordination happens when needed. **This is the recommended pattern** for this project.

### `recomputeAllEtasForAdventure` in StagesService

```typescript
async recomputeAllEtasForAdventure(adventureId: string, speedKmh: number): Promise<void> {
  const stages = await this.stagesRepo.findByAdventureId(adventureId)
  if (stages.length === 0) return
  const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
  const updates = stages.map((s) => ({
    id: s.id,
    startKm: s.startKm,
    distanceKm: s.distanceKm,
    orderIndex: s.orderIndex,
    elevationGainM: s.elevationGainM ?? null,
    etaMinutes: computeEtaMinutes(s.distanceKm, s.elevationGainM ?? null, speedKmh),
  }))
  await this.stagesRepo.updateMany(updates)
}
```

**Note**: `StagesService` already has `adventuresService` injected — no new injection needed.

### Adventures Controller — `StagesService` injection

`AdventuresController` currently only injects `AdventuresService`. To call `stagesService.recomputeAllEtasForAdventure()`, inject `StagesService` into `AdventuresController`:

```typescript
constructor(
  private readonly adventuresService: AdventuresService,
  private readonly stagesService: StagesService,
) {}
```

Add `StagesModule` to `AdventuresModule` imports (or ensure they're both in the shared root module). Check `app.module.ts` for the current module registration structure.

### Frontend: `avgSpeedKmh` in adventure detail

The adventure detail page uses `useAdventure(id)` (TanStack Query) to get `AdventureResponse`. The field is now available as `adventure.avgSpeedKmh`.

Add an inline-edit numeric field following the same pattern as the adventure name edit:
- Display: `{adventure.avgSpeedKmh} km/h`
- Edit trigger: pencil icon button
- Input: `<Input type="number" min="5" max="50" step="1" />`
- Save: `PATCH /adventures/:id` with `{ avgSpeedKmh: value }`
- Invalidation:
  ```typescript
  queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
  queryClient.invalidateQueries({ queryKey: ['stages', adventureId] })
  queryClient.invalidateQueries({ queryKey: ['weather'] })
  ```

### Frontend: WeatherControls default speed

In `map-view.tsx`, the weather controls `initialSpeedKmh` is currently:
```typescript
initialSpeedKmh={savedPace.speedKmh}
```

After this story:
```typescript
initialSpeedKmh={savedPace.speedKmh || String(adventure?.avgSpeedKmh ?? 15)}
```

Where `adventure` comes from an `useAdventure(adventureId)` hook (uses `['adventures', adventureId]` query key). **Check if this is already available in `map-view.tsx`** — if not, add a `useAdventure` hook call.

Similarly for stage weather badges, the fallback `speedKmh` prop:
```typescript
speedKmh={stagePace.speedKmh ?? adventure?.avgSpeedKmh ?? 15}
```

### TanStack Query key for stages

The `useStages` hook presumably uses key `['stages', adventureId]`. **Verify in `apps/web/src/hooks/use-stages.ts`** before implementing frontend invalidation.

### Project Structure Notes

| File | Action |
|---|---|
| `packages/database/src/schema/adventures.ts` | Add `avgSpeedKmh` column |
| `packages/database/migrations/000X_avg_speed.sql` | New migration (auto-generated) |
| `packages/shared/src/types/adventure.types.ts` | Add `avgSpeedKmh: number` to `AdventureResponse` |
| `apps/api/src/adventures/dto/update-adventure.dto.ts` | Add `avgSpeedKmh` optional field |
| `apps/api/src/adventures/adventures.repository.ts` | Add `updateAvgSpeedKmh()` method |
| `apps/api/src/adventures/adventures.service.ts` | Include `avgSpeedKmh` in `toResponse()` |
| `apps/api/src/adventures/adventures.controller.ts` | Inject `StagesService`, call `recomputeAllEtasForAdventure` on speed change |
| `apps/api/src/stages/stages.service.ts` | `computeEtaMinutes` gets `speedKmh` param; all operations use `getAdventure` for speed; add `recomputeAllEtasForAdventure`; add split logic in `createStage` |
| `apps/api/src/stages/stages.repository.ts` | Add `findContaining`, `incrementOrderIndexGt`; extend `update()` with `startKm|orderIndex` |
| `apps/api/src/stages/stages.service.test.ts` | Tests for split + speedKmh ETA |
| `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` | Add `avgSpeedKmh` editable field |
| `apps/web/src/lib/api-client.ts` | Add/update `updateAdventure()` with `avgSpeedKmh` |
| `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` | Add `isClickModeActive`, `onClickKm` props + click handler |
| `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` | Test click fires `onClickKm` |
| `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` | Pass click props to ElevationProfile; default speed from adventure |

### References

- Epic 16 Story 16.8: `_bmad-output/planning-artifacts/epics.md#Story-16.8`
- `StagesService` current implementation: `apps/api/src/stages/stages.service.ts`
- `StagesRepository` current methods: `apps/api/src/stages/stages.repository.ts`
- `computeEtaMinutes` current location: `apps/api/src/stages/stages.service.ts:40`
- `ElevationProfile` component: `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx`
- `map-view.tsx` stageClickMode state management: `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:42-43`
- `adventures.ts` schema: `packages/database/src/schema/adventures.ts`
- `AdventureResponse` type: `packages/shared/src/types/adventure.types.ts:35`
- `UpdateAdventureDto`: `apps/api/src/adventures/dto/update-adventure.dto.ts`
- DB conventions: `packages/database/` — `snake_case` columns, Drizzle `real()` for km/float values [project-context.md]
- ResponseInterceptor: return raw data from controllers — NEVER wrap [project-context.md]
- Error handling: services throw `HttpException`; controllers have NO try/catch [project-context.md]
- TanStack Query key convention: `['adventures', id]`, `['stages', adventureId]`, `['weather', ...]` [project-context.md]
- WCAG button sizes: `size="lg"` (h-11) in all dialogs [story 16.6, project-context.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- **Circular dependency** (AdventuresModule ↔ StagesModule): resolved with `forwardRef()` in both module imports. ETA recompute on speed change is coordinated at the controller layer (AdventuresController calls `stagesService.recomputeAllEtasForAdventure`) to keep services independent.
- **Drizzle migration integrity**: `feedbacks` table was in DB (migration 0008) but had no schema file. Created `packages/database/src/schema/feedbacks.ts` to prevent drizzle-kit from generating a destructive `DROP TABLE feedbacks`. Migration 0009 only adds `avg_speed_kmh`.
- **recharts onClick non fiable (v3)**: `AreaChart.onClick` peut retourner `activePayload: null`. Solution finale : `onClick` sur le div container de `ElevationProfile`, km récupéré depuis `lastKmRef` mis à jour via `wrappedOnHoverKm` (même pipeline que la crosshair carte — fiable). Suppression de `recharts.onClick` et `recharts.onMouseMove`.
- **Placement du champ vitesse révisé post-implémentation** : déplacé de `adventure-detail.tsx` vers le haut de la sidebar planning (`map-view.tsx`) et le haut du drawer live. Champ vitesse supprimé de `WeatherControls` / `SidebarWeatherSection`. Les weather queries utilisent `adventure.avgSpeedKmh` directement.
- **Adventure detail test**: `adventure-detail.test.tsx` does not exist in the codebase; skipped (7.4 N/A).
- All API tests: **218 tests, 20 suites — all passing**.
- All Web tests: **679 tests, 65 files — all passing** (1 test supprimé : champ vitesse retiré de WeatherControls).

### File List

- `packages/database/src/schema/adventures.ts` — added `avgSpeedKmh` column
- `packages/database/src/schema/feedbacks.ts` — NEW: created missing schema file to prevent DROP TABLE in migrations
- `packages/database/src/index.ts` — export feedbacks schema
- `packages/database/migrations/0009_add_avg_speed_adventures.sql` — NEW: migration adding avg_speed_kmh
- `packages/database/migrations/meta/_journal.json` — updated with entry 0009
- `packages/database/migrations/meta/0009_snapshot.json` — NEW: snapshot including feedbacks table
- `packages/shared/src/types/adventure.types.ts` — added `avgSpeedKmh: number` to AdventureResponse
- `apps/api/src/adventures/dto/update-adventure.dto.ts` — added `avgSpeedKmh` with validators
- `apps/api/src/adventures/adventures.repository.ts` — added `updateAvgSpeedKmh()` method
- `apps/api/src/adventures/adventures.service.ts` — toResponse + updateAdventure handle avgSpeedKmh
- `apps/api/src/adventures/adventures.controller.ts` — inject StagesService, call recomputeAllEtasForAdventure on speed change
- `apps/api/src/adventures/adventures.module.ts` — forwardRef(() => StagesModule)
- `apps/api/src/stages/stages.module.ts` — forwardRef(() => AdventuresModule)
- `apps/api/src/stages/stages.service.ts` — computeEtaMinutes speedKmh param; split logic in createStage; recomputeAllEtasForAdventure; all ops use getAdventure for avgSpeedKmh
- `apps/api/src/stages/stages.repository.ts` — findContaining, incrementOrderIndexGt, extended update() signature
- `apps/api/src/stages/stages.service.test.ts` — rewritten: split tests, speedKmh ETA tests, all 30 passing
- `apps/web/src/lib/api-client.ts` — added updateAdventureAvgSpeedKmh
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — supprimé: avgSpeedKmh field (déplacé vers map sidebar)
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — isClickModeActive + onClickKm; click via div container + lastKmRef/wrappedOnHoverKm (fix recharts onClick unreliable)
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` — click mode tests mis à jour (div container, km=42 depuis Tooltip mock)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — vitesse en haut sidebar (useMutation); click props ElevationProfile; weather queries utilisent adventure.avgSpeedKmh
- `apps/web/src/app/(app)/map/[id]/_components/weather-controls.tsx` — supprimé: champ vitesse + prop initialSpeedKmh
- `apps/web/src/app/(app)/map/[id]/_components/weather-controls.test.tsx` — tests mis à jour
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx` — supprimé: prop initialSpeedKmh
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — vitesse en première section; prop defaultSpeedKmh
- `apps/web/src/app/(app)/live/[id]/page.tsx` — ajout useQuery adventure; passe defaultSpeedKmh à LiveFiltersDrawer
- `apps/web/src/app/(app)/adventures/_components/adventure-card.test.tsx` — added avgSpeedKmh: 15 to mock
- `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx` — added avgSpeedKmh: 15 to mock
- `apps/web/src/components/layout/app-header.test.tsx` — added avgSpeedKmh: 15 to mock
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx` — null as unknown as string cast fix
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — added elevationGainM/etaMinutes to stage mocks

### Senior Developer Review (AI) — 2026-04-01

**Reviewer:** claude-sonnet-4-6
**Outcome:** Changes Requested → 2 HIGH fixed, 4 MEDIUM fixed, 1 MEDIUM action item, 3 LOW action items

#### Fixed in code

- **[HIGH-1]** Split logic wrapped in `db.transaction()` via new `StagesRepository.createWithSplit()` — the 3 DB ops (increment, insert, update) are now atomic. `stages.service.ts` updated to call `createWithSplit`; `stages.service.test.ts` updated to mock `createWithSplit` with `newStageData`/`remainderUpdate` assertions including `elevationGainM`/`etaMinutes`.
- **[HIGH-2]** `ElevationProfile.onClickKm` handler in `map-view.tsx` now calls `setStageClickMode(false)` — consistent with `MapCanvas.onStageClick` behavior (AC #2 "same flow as map trace click").
- **[MED-3]** `queryClient = useQueryClient()` moved before `useMutation` in `map-view.tsx` — eliminates temporal dead zone risk and clarifies reading order.
- **[MED-4]** Added `recomputeAllEtasForAdventure` tests to `stages.service.test.ts`: verifies ETA recompute uses stored `elevationGainM` and new `speedKmh`, and early-returns without DB call when no stages.
- **[MED-5]** Split case test now asserts `elevationGainM` and `etaMinutes` for both new stage and remainder (verified values: new stage `elevationGainM=300, etaMinutes=178`; remainder `elevationGainM=null, etaMinutes=240`).
- **[MED-7]** `WeatherControls.onPaceSubmit` signature simplified to `(departureTime: string | null)` — removed always-null `speedKmh` parameter; updated `SidebarWeatherSection`, `map-view.tsx`, and `weather-controls.test.tsx`.

#### Review Follow-ups (AI) — all fixed

- [x] [AI-Review][MEDIUM] ETA recompute atomique : recompute déplacé dans `AdventuresService.updateAdventure()` via `@Inject(forwardRef(() => StagesService))`. Controller simplifié (plus de coordination cross-service). Si le recompute fail, le PATCH échoue entièrement — pas d'état partiel.
- [x] [AI-Review][LOW] Appel `getAdventureWaypoints()` supprimé de `recomputeAllEtasForAdventure` — la méthode utilise le `elevationGainM` stocké sur chaque stage, pas les waypoints bruts.
- [x] [AI-Review][LOW] `paceParams.speedKmh` supprimé — state simplifié en `{ departureTime: string | null }` uniquement.
- [x] [AI-Review][LOW] Cast `savedPace` corrigé en `{ departureTime: string }` — correspond à ce qui est réellement dans localStorage.
