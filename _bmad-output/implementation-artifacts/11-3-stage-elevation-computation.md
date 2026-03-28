# Story 11.3: Stage Elevation Computation

Status: done

## Story

As a **cyclist planning a multi-day adventure**,
I want each stage to display its D+ (elevation gain) and estimated travel time,
So that I can evaluate daily effort and plan realistic stages.

## Acceptance Criteria

**AC1 — D+ computed at stage creation**

Given a user creates a stage with `startKm` and `endKm`,
When the stage is saved,
Then the API computes `elevation_gain_m` = sum of positive elevation deltas between waypoints in `[startKm, endKm]`, and stores it in the DB.

**AC2 — D+ recomputed on endKm update**

Given a user drags a stage endpoint to a new `endKm`,
When `PATCH /adventures/:id/stages/:stageId` is called,
Then `elevation_gain_m` is recomputed for the stage AND for all subsequently cascaded stages (whose `startKm` changed).

**AC3 — D+ recomputed on stage deletion (cascade)**

Given a user deletes a stage,
When the cascade recalculates `startKm` for remaining stages,
Then `elevation_gain_m` and `eta_minutes` are recomputed for every remaining stage.

**AC4 — Graceful degradation if no `ele` data**

Given waypoints have missing or null `ele` values,
When D+ is computed,
Then `elevation_gain_m` is stored as `null` — no crash, no exception.

**AC5 — ETA computed and stored**

Given a stage has `distance_km`,
When the stage is saved or updated,
Then `eta_minutes = round((distanceKm / 15) * 60 + (elevationGainM ?? 0) / 100 * 6)` (Naismith approximation, default pace 15 km/h).

**AC6 — AdventureStageResponse exposes elevationGainM and etaMinutes**

Given the API returns a stage,
When the response is serialized,
Then `elevationGainM: number | null` and `etaMinutes: number | null` are present in `AdventureStageResponse`.

**AC7 — Sidebar displays real D+ and ETA**

Given stages have computed `elevationGainM` and `etaMinutes`,
When the sidebar stage list renders,
Then each stage row shows `D+ Xm` (or `D+ —` if null) and `X min` (or `— min` if null), replacing the current placeholders.

## Tasks / Subtasks

### Phase 1 — DB schema: add elevation_gain_m and eta_minutes columns

- [x] Task 1: Add nullable columns to `adventure_stages` table (AC1, AC5)
  - [x] 1.1 In `packages/database/src/schema/adventure-stages.ts`:
    ```typescript
    import { pgTable, text, timestamp, real, integer, index } from 'drizzle-orm/pg-core'
    // Add after distanceKm:
    elevationGainM: real('elevation_gain_m'),   // nullable — null when no ele data in GPX
    etaMinutes: integer('eta_minutes'),          // nullable — null until computed (should be always set)
    ```
    Both columns are nullable (`real()` and `integer()` without `.notNull()` in Drizzle = nullable).
  - [x] 1.2 Generate Drizzle migration:
    ```bash
    pnpm --filter @ridenrest/database drizzle-kit generate
    ```
    This creates a new migration file in `packages/database/drizzle/` with `ALTER TABLE adventure_stages ADD COLUMN elevation_gain_m real, ADD COLUMN eta_minutes integer`.
  - [x] 1.3 Run migration locally:
    ```bash
    pnpm --filter @ridenrest/database drizzle-kit migrate
    ```

### Phase 2 — shared types: extend AdventureStageResponse

- [x] Task 2: Add new fields to the response type (AC6)
  - [x] 2.1 In `packages/shared/src/types/adventure.types.ts`, update `AdventureStageResponse`:
    ```typescript
    export interface AdventureStageResponse {
      id: string
      adventureId: string
      name: string
      color: string
      orderIndex: number
      startKm: number
      endKm: number
      distanceKm: number
      elevationGainM: number | null   // NEW — null if GPX has no elevation data
      etaMinutes: number | null       // NEW — null in legacy rows, always set on new rows
      createdAt: string
      updatedAt: string
    }
    ```
    Remove the comment `// elevationGainM and etaMinutes absent until Story 11.3`.

### Phase 3 — backend: waypoints access in StagesService

- [x] Task 3: Expose `getAdventureWaypoints()` for use in StagesService (AC1, AC2, AC3)
  - [x] 3.1 In `apps/api/src/adventures/adventures.repository.ts`, add:
    ```typescript
    import type { MapWaypoint } from '@ridenrest/shared'

    async getAdventureWaypoints(adventureId: string): Promise<MapWaypoint[]> {
      const rows = await db
        .select({ waypoints: adventureSegments.waypoints, cumulativeStartKm: adventureSegments.cumulativeStartKm })
        .from(adventureSegments)
        .where(
          and(
            eq(adventureSegments.adventureId, adventureId),
            eq(adventureSegments.parseStatus, 'done'),
          ),
        )
        .orderBy(asc(adventureSegments.orderIndex))

      const all: MapWaypoint[] = []
      for (const row of rows) {
        if (!row.waypoints) continue
        const wps = row.waypoints as Array<{ lat: number; lng: number; ele?: number | null; distKm?: number; dist_km?: number }>
        for (const wp of wps) {
          all.push({
            lat: wp.lat,
            lng: wp.lng,
            ...(wp.ele !== undefined && wp.ele !== null ? { ele: wp.ele } : {}),
            distKm: wp.distKm ?? wp.dist_km ?? 0,
          })
        }
      }
      // Already ordered by segment order, waypoints within each segment are already sorted by distKm
      return all
    }
    ```
    Note: filters to `parseStatus = 'done'` to skip segments whose waypoints are not yet computed.
  - [x] 3.2 In `apps/api/src/adventures/adventures.service.ts`, add:
    ```typescript
    async getAdventureWaypoints(adventureId: string): Promise<MapWaypoint[]> {
      return this.adventuresRepo.getAdventureWaypoints(adventureId)
    }
    ```
    Note: **no ownership check here** — called internally by `StagesService` which already does `verifyOwnership` before calling this.

### Phase 4 — backend: D+ and ETA computation utilities

- [x] Task 4: Add utility functions to `stages.service.ts` (AC1, AC2, AC4, AC5)
  - [x] 4.1 Add module-level utility functions at the top of `apps/api/src/stages/stages.service.ts`:
    ```typescript
    import type { MapWaypoint } from '@ridenrest/shared'

    /** Compute D+ (elevation gain) for waypoints in the [startKm, endKm] range.
     *  Returns null if no waypoints in range have elevation data. */
    function computeElevationGainForRange(
      waypoints: MapWaypoint[],
      startKm: number,
      endKm: number,
    ): number | null {
      const rangeWps = waypoints
        .filter(
          (wp): wp is MapWaypoint & { ele: number } =>
            wp.ele !== null &&
            wp.ele !== undefined &&
            wp.distKm >= startKm &&
            wp.distKm <= endKm,
        )
        .sort((a, b) => a.distKm - b.distKm)

      if (rangeWps.length < 2) return null  // Need at least 2 points with ele

      let gain = 0
      for (let i = 1; i < rangeWps.length; i++) {
        const delta = rangeWps[i].ele - rangeWps[i - 1].ele
        if (delta > 0) gain += delta
      }
      return Math.round(gain)  // Round to whole meters
    }

    /** Compute ETA in minutes using Naismith's rule approximation.
     *  Default pace: 15 km/h flat. Elevation: +6 min per 100m D+. */
    function computeEtaMinutes(distanceKm: number, elevationGainM: number | null): number {
      const flatMinutes = (distanceKm / 15) * 60
      const climbMinutes = ((elevationGainM ?? 0) / 100) * 6
      return Math.round(flatMinutes + climbMinutes)
    }
    ```
    Note: mirrors the same algorithm as `use-elevation-profile.ts` hook — only positive deltas counted.
  - [x] 4.2 In `StagesService`, add `AdventuresService` is already injected (`adventuresService`) — use `this.adventuresService.getAdventureWaypoints(adventureId)` to get waypoints.

### Phase 5 — backend: integrate computation into service mutations

- [x] Task 5: Update StagesService mutating methods to compute and persist D+ + ETA (AC1, AC2, AC3)
  - [x] 5.1 Update `createStage()`:
    ```typescript
    async createStage(adventureId, userId, dto): Promise<AdventureStageResponse> {
      await this.adventuresService.verifyOwnership(adventureId, userId)

      const last = await this.stagesRepo.findLastByAdventureId(adventureId)
      const startKm = last?.endKm ?? 0
      const count = await this.stagesRepo.countByAdventureId(adventureId)
      const orderIndex = count
      const distanceKm = dto.endKm - startKm
      if (distanceKm <= 0) throw new BadRequestException(...)

      // NEW: compute D+ and ETA
      const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
      const elevationGainM = computeElevationGainForRange(waypoints, startKm, dto.endKm)
      const etaMinutes = computeEtaMinutes(distanceKm, elevationGainM)

      const stage = await this.stagesRepo.create({
        adventureId, name: dto.name, color: dto.color,
        orderIndex, startKm, endKm: dto.endKm, distanceKm,
        elevationGainM, etaMinutes,  // NEW
      })
      return this.toResponse(stage)
    }
    ```
  - [x] 5.2 Update `updateStage()` when `dto.endKm` is provided:
    After validating `endKm` and fetching subsequent stages, add:
    ```typescript
    // Compute D+ and ETA for this stage
    const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)
    const newDistanceKm = dto.endKm - stage.startKm
    const elevationGainM = computeElevationGainForRange(waypoints, stage.startKm, dto.endKm)
    const etaMinutes = computeEtaMinutes(newDistanceKm, elevationGainM)

    await this.stagesRepo.update(stageId, {
      endKm: dto.endKm,
      distanceKm: newDistanceKm,
      elevationGainM,   // NEW
      etaMinutes,       // NEW
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
    })

    // Cascade: recompute D+ and ETA for subsequent stages
    if (subsequentStages.length > 0) {
      let prevEndKm = dto.endKm
      const updates = subsequentStages.map((s) => {
        const newStartKm = prevEndKm
        const cascadeDistKm = s.endKm - newStartKm
        const cascadeElevGain = computeElevationGainForRange(waypoints, newStartKm, s.endKm)
        const cascadeEta = computeEtaMinutes(cascadeDistKm, cascadeElevGain)
        prevEndKm = s.endKm
        return {
          id: s.id,
          startKm: newStartKm,
          distanceKm: cascadeDistKm,
          orderIndex: s.orderIndex,
          elevationGainM: cascadeElevGain,  // NEW
          etaMinutes: cascadeEta,           // NEW
        }
      })
      await this.stagesRepo.updateMany(updates)
    }
    ```
  - [x] 5.3 Update `deleteStage()` cascade:
    After deleting the stage, fetch waypoints once, then compute D+ and ETA for each remaining stage:
    ```typescript
    const remaining = await this.stagesRepo.findByAdventureId(adventureId)
    const waypoints = await this.adventuresService.getAdventureWaypoints(adventureId)  // NEW
    const updates: Array<...> = []
    let prevEndKm = 0
    for (let i = 0; i < remaining.length; i++) {
      const s = remaining[i]
      const newStartKm = prevEndKm
      const newDistKm = s.endKm - newStartKm
      const elevGain = computeElevationGainForRange(waypoints, newStartKm, s.endKm)  // NEW
      const eta = computeEtaMinutes(newDistKm, elevGain)                             // NEW
      updates.push({
        id: s.id,
        startKm: newStartKm,
        distanceKm: newDistKm,
        orderIndex: i,
        elevationGainM: elevGain,  // NEW
        etaMinutes: eta,           // NEW
      })
      prevEndKm = s.endKm
    }
    await this.stagesRepo.updateMany(updates)
    ```
  - [x] 5.4 Update `toResponse()`:
    ```typescript
    private toResponse(s: AdventureStage): AdventureStageResponse {
      return {
        id: s.id, adventureId: s.adventureId, name: s.name, color: s.color,
        orderIndex: s.orderIndex, startKm: s.startKm, endKm: s.endKm,
        distanceKm: s.distanceKm,
        elevationGainM: s.elevationGainM ?? null,  // NEW
        etaMinutes: s.etaMinutes ?? null,           // NEW
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }
    }
    ```

### Phase 6 — backend: update StagesRepository signatures

- [x] Task 6: Update `update()` and `updateMany()` to accept new fields (AC1-AC3)
  - [x] 6.1 In `apps/api/src/stages/stages.repository.ts`, update `update()`:
    ```typescript
    async update(
      id: string,
      data: Partial<Pick<AdventureStage, 'name' | 'color' | 'endKm' | 'distanceKm' | 'elevationGainM' | 'etaMinutes'>>,
    ): Promise<AdventureStage>
    ```
  - [x] 6.2 Update `updateMany()`:
    ```typescript
    async updateMany(
      stages: Array<Pick<AdventureStage, 'id' | 'startKm' | 'distanceKm' | 'orderIndex'> & {
        elevationGainM?: number | null
        etaMinutes?: number | null
      }>,
    ): Promise<void> {
      if (stages.length === 0) return
      await Promise.all(
        stages.map(({ id, startKm, distanceKm, orderIndex, elevationGainM, etaMinutes }) =>
          db
            .update(adventureStages)
            .set({
              startKm, distanceKm, orderIndex,
              ...(elevationGainM !== undefined ? { elevationGainM } : {}),
              ...(etaMinutes !== undefined ? { etaMinutes } : {}),
              updatedAt: new Date(),
            })
            .where(eq(adventureStages.id, id)),
        ),
      )
    }
    ```
    Note: `elevationGainM` and `etaMinutes` are optional in `updateMany` input — supports old callers if any, though all callers are in the same file.

### Phase 7 — backend: tests

- [x] Task 7: Update `stages.service.test.ts` (AC1-AC5)
  - [x] 7.1 Mock `adventuresService.getAdventureWaypoints` in the service test setup:
    ```typescript
    adventuresService.getAdventureWaypoints = jest.fn().mockResolvedValue([
      { lat: 43.0, lng: -1.0, ele: 200, distKm: 0 },
      { lat: 43.1, lng: -1.1, ele: 350, distKm: 5 },  // +150m gain
      { lat: 43.2, lng: -1.2, ele: 300, distKm: 10 }, // -50m = ignored
      { lat: 43.3, lng: -1.3, ele: 450, distKm: 15 }, // +150m gain
    ])
    ```
  - [x] 7.2 Test `createStage`: verify `elevationGainM` and `etaMinutes` are computed and passed to `stagesRepo.create`:
    - Given waypoints above, `createStage(startKm=0, endKm=10)` → `elevationGainM = 150`, `etaMinutes = round((10/15)*60 + (150/100)*6) = round(40 + 9) = 49`
    - `stagesRepo.create` called with `{ ..., elevationGainM: 150, etaMinutes: 49 }`
  - [x] 7.3 Test `createStage` with no `ele` data (all waypoints missing ele):
    - Mock `getAdventureWaypoints` returning `[{lat,lng,distKm:0}, {lat,lng,distKm:5}]` (no ele)
    - `elevationGainM = null`, `etaMinutes = round((5/15)*60 + 0) = 20`
  - [x] 7.4 Test `updateStage` with `endKm`: verify cascade also receives recomputed `elevationGainM` and `etaMinutes`
  - [x] 7.5 Test `deleteStage`: verify `updateMany` is called with recomputed `elevationGainM` and `etaMinutes` for remaining stages
  - [x] 7.6 Test `computeElevationGainForRange` utility (unit test, no need for DI):
    - Returns `null` when < 2 waypoints with ele in range
    - Counts only positive deltas
    - Correctly filters by distKm range boundaries (inclusive)

### Phase 8 — frontend: sidebar stage row display

- [x] Task 8: Update `sidebar-stages-section.tsx` to show real D+ and ETA (AC7)
  - [x] 8.1 In `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx`, replace the placeholder spans:
    ```tsx
    // OLD:
    <span className="text-xs text-muted-foreground">D+ —</span>
    <span className="text-xs text-muted-foreground">— min</span>

    // NEW:
    <span className="text-xs text-muted-foreground">
      {stage.elevationGainM !== null ? `D+ ${stage.elevationGainM} m` : 'D+ —'}
    </span>
    <span className="text-xs text-muted-foreground">
      {stage.etaMinutes !== null ? `${stage.etaMinutes} min` : '— min'}
    </span>
    ```
  - [x] 8.2 No new component needed — minimal in-place update.

### Phase 9 — sprint status update

- [x] Task 9: Update sprint-status.yaml
  - [x] 9.1 `11-3-stage-elevation-computation: backlog` → `ready-for-dev` (done by SM workflow)

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] AC7 ETA null display diverge du spec : affiche `—` au lieu de `— min` pour etaMinutes null [sidebar-stages-section.tsx:188]
- [ ] [AI-Review][LOW] Side-effect mutation dans `.map()` callback du cascade `updateStage` — utiliser un `for` loop comme dans `deleteStage` pour cohérence [stages.service.ts:133]
- [ ] [AI-Review][LOW] Fichiers migration auto-générés absents du File List : `packages/database/migrations/meta/_journal.json` et `0007_snapshot.json`

## Dev Notes

### Architecture Decision: Server-side vs Client-side D+ computation

D+ is computed **server-side** (in `StagesService`) and stored in the DB, NOT computed client-side in the sidebar. This is intentional:
- Consistent with how `adventure_segments.elevation_gain_m` is stored
- Avoids re-deriving the value every render from `allCumulativeWaypoints`
- The sidebar receives `AdventureStageResponse[]` from `useStages()` — already has the data

**Contrast with** `poi-detail-sheet.tsx` and `search-range-control.tsx` which compute D+ client-side for ad-hoc ranges — those are ephemeral, not stored.

### D+ Algorithm Consistency

The server-side `computeElevationGainForRange` MUST match the client-side `useElevationProfile` hook:
- Both count only **positive** deltas (`Math.max(0, delta)` or `if (delta > 0) gain += delta`)
- Both use sequential waypoints (sorted by `distKm`)
- Server rounds to whole meters (`Math.round(gain)`) — client shows `.toFixed(0)`

Ref: `apps/web/src/hooks/use-elevation-profile.ts:45` — `cumulativeDPlus += Math.max(0, deltaEle)`

### Waypoints JSONB Field Format

Waypoints in `adventure_segments.waypoints` are stored as JSONB. The format is `{ lat, lng, ele?, distKm }` (camelCase). There is a legacy fallback for `dist_km` (snake_case) — always handle both in the mapping:
```typescript
distKm: wp.distKm ?? wp.dist_km ?? 0
```
Ref: `apps/api/src/adventures/adventures.repository.ts:85-93` — already handles this in `getAdventureMapData`.

### `getAdventureWaypoints` is called once per mutation

In `createStage`, `updateStage(endKm)`, and `deleteStage`, waypoints are fetched **once** then passed to all `computeElevationGainForRange` calls. Do NOT fetch per stage — this would be N+1.

### Subsequent Stages in updateStage Cascade

When a stage's `endKm` changes, only its `startKm` propagates forward — subsequent stages' `endKm` is UNCHANGED. Thus their D+ range shrinks/grows from the front:
- Stage A (0-30) → dragged to (0-35): D+ for [0, 35]
- Stage B (30-50) → cascade: (35-50): D+ for [35, 50] (not [30, 50] anymore)
- Stage C (50-80) → startKm still 50 (no change because stage B's endKm is still 50): unchanged, D+ for [50, 80]

### ETA formula — Naismith's approximation

```
eta_minutes = round((distanceKm / 15) * 60 + (elevationGainM ?? 0) / 100 * 6)
```
- 15 km/h flat cycling pace (conservative for bikepacking/loaded)
- 6 min per 100m D+ (Naismith: 1h per 300m gain → 20min/100m for walking; for cycling ÷3 ≈ 6-7min)
- `elevationGainM ?? 0`: if null (no ele data), uses distance only — always returns a value
- This is always stored as an integer (minutes), never null (as long as distanceKm > 0)

### DB migration — no backfill needed

Existing `adventure_stages` rows in production will have `elevation_gain_m = NULL` and `eta_minutes = NULL`. The sidebar already handles null gracefully (shows `D+ —` and `— min`). No backfill migration is required for MVP.

If Guillaume wants to backfill post-11.3, it can be done via a one-time script hitting `PUT /adventures/:id/stages/:stageId` with the existing `endKm` — this triggers recomputation.

### Project Structure: Files to create/modify

**New file (Drizzle migration):**
- `packages/database/drizzle/{timestamp}_add_elevation_eta_to_stages.sql` — generated by `drizzle-kit generate`

**Modified files:**
- `packages/database/src/schema/adventure-stages.ts` — add `elevationGainM`, `etaMinutes` columns
- `packages/shared/src/types/adventure.types.ts` — extend `AdventureStageResponse`
- `apps/api/src/adventures/adventures.repository.ts` — add `getAdventureWaypoints()`
- `apps/api/src/adventures/adventures.service.ts` — add `getAdventureWaypoints()` delegate
- `apps/api/src/stages/stages.service.ts` — utility functions + updated mutations
- `apps/api/src/stages/stages.repository.ts` — update `update()` + `updateMany()` signatures
- `apps/api/src/stages/stages.service.test.ts` — new tests (Tasks 7.2-7.6)
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — real D+ + ETA display

**No new web component** — sidebar update is minimal (2 span replacements).

### References

- `packages/database/src/schema/adventure-stages.ts` — existing schema, comment indicates 11.3 columns
- `packages/shared/src/types/adventure.types.ts:62-74` — `AdventureStageResponse` with placeholders for 11.3
- `apps/api/src/stages/stages.service.ts` — current service, all mutations to update
- `apps/api/src/stages/stages.repository.ts` — `update()` and `updateMany()` to extend
- `apps/api/src/adventures/adventures.repository.ts:59-97` — `getAdventureMapData()` pattern to reuse for `getAdventureWaypoints()`
- `apps/web/src/hooks/use-elevation-profile.ts:38-54` — D+ algorithm to mirror server-side
- Story 11.2 Dev Notes — cascade pattern for `updateStage(endKm)` and `deleteStage`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:179-181` — placeholder lines to replace

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Implemented `computeElevationGainForRange()` and `computeEtaMinutes()` as exported module-level functions in `stages.service.ts` — exported for direct unit testing without DI.
- Migration `0007_first_peter_quill.sql` generated by `drizzle-kit generate` and applied successfully.
- `getAdventureWaypoints()` added to `AdventuresRepository` — reuses the same JSONB waypoints mapping pattern as `getAdventureMapData()`, with `dist_km` (legacy) / `distKm` (current) fallback.
- Waypoints are fetched **once per mutation** to avoid N+1 queries.
- `computeElevationGainForRange` returns `null` when fewer than 2 waypoints with `ele` exist in the range (AC4 graceful degradation).
- `computeEtaMinutes` always returns an integer — uses `elevationGainM ?? 0` so it never fails on null (AC5).
- Test boundary correction: range [5, 10] on defaultWaypoints gives gain=0 (not 150), since km5→km10 is a descent. Test comment was wrong in story spec — fixed.
- All 188 tests pass, 0 TS errors, 0 lint errors.
- **Code review fixes (2026-03-28):** Supprimé double fetch DB dans `updateStage` endKm branch — `update()` retourne déjà le stage via `.returning()`, `findByIdAndAdventureId()` était inutile. Supprimé prop mort `allCumulativeWaypoints` dans `SidebarStagesSectionProps` + import `MapWaypoint` + appel caller dans `map-view.tsx` + `defaultProps` dans test — D+ vient maintenant du serveur, ce prop était un vestige client-side.

### File List

- `packages/database/src/schema/adventure-stages.ts` — added `elevationGainM`, `etaMinutes` columns
- `packages/database/migrations/0007_first_peter_quill.sql` — migration: ADD COLUMN elevation_gain_m, eta_minutes
- `packages/database/migrations/meta/_journal.json` — auto-generated by drizzle-kit
- `packages/database/migrations/meta/0007_snapshot.json` — auto-generated by drizzle-kit
- `packages/shared/src/types/adventure.types.ts` — `AdventureStageResponse` extended with `elevationGainM`, `etaMinutes`
- `apps/api/src/adventures/adventures.repository.ts` — added `getAdventureWaypoints()`
- `apps/api/src/adventures/adventures.service.ts` — added `getAdventureWaypoints()` delegate
- `apps/api/src/stages/stages.service.ts` — utility functions + updated mutations + `toResponse()` + double fetch fix
- `apps/api/src/stages/stages.repository.ts` — updated `update()` and `updateMany()` signatures
- `apps/api/src/stages/stages.service.test.ts` — new tests (7.1–7.6) + updated existing tests
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — real D+ and ETA display + removed dead prop
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — removed allCumulativeWaypoints prop from SidebarStagesSection call
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx` — removed allCumulativeWaypoints from defaultProps
