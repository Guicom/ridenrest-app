# Story 16.2: Adventures List & Timeline UX

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist managing multiple adventures**,
I want richer information on my adventures list and better chronological management,
So that I can quickly identify upcoming trips and archive past ones.

## Acceptance Criteria

1. **D+ on adventure card** — When an adventure card renders, the total elevation gain (`totalElevationGainM`) is displayed below the distance in the format "↑ 4 200 m" (French locale, no decimals). If `totalElevationGainM` is `null` or `0`, the field is hidden (not displayed).

2. **Start date field on adventure detail** — On the adventure detail page (`/adventures/:id`), a date input is available to set the start date of the adventure. The date is stored as `start_date` (DATE column, `YYYY-MM-DD` ISO date) on the `adventures` table. The field can be cleared (set to `null`). When the user changes the date, it is saved immediately on change (no separate Save button needed).

3. **Sorted list — upcoming first** — Adventures with a start date on or after today, or with no start date, or with `status === 'active'`, appear in the main list. Order: active first, then future-dated ascending, then undated.

4. **"Aventures passées" collapsible section** — Adventures whose start date is strictly in the past AND whose `status !== 'active'` are removed from the main list and placed in a collapsible "Aventures passées" section at the bottom. This section is collapsed by default. Adventures with `status === 'active'` always stay in the main list regardless of start date.

## Tasks / Subtasks

- [x] **Task 1 — DB: add `start_date` column** (AC: #2)
  - [x] 1.1 — In `packages/database/src/schema/adventures.ts`: import `date` from `drizzle-orm/pg-core` and add `startDate: date('start_date')` (nullable, no default) to the `adventures` table definition.
  - [x] 1.2 — Create `packages/database/migrations/0009_add_start_date_adventures.sql`:
    ```sql
    ALTER TABLE "adventures" ADD COLUMN "start_date" date;
    ```

- [x] **Task 2 — Shared types: add `startDate` to `AdventureResponse`** (AC: #2, #3, #4)
  - [x] 2.1 — In `packages/shared/src/types/adventure.types.ts`, add `startDate?: string | null` to the `AdventureResponse` interface (ISO date `YYYY-MM-DD`, NOT a full timestamp). Place it after `totalElevationGainM`.

- [x] **Task 3 — API: extend PATCH /adventures/:id to support `startDate`** (AC: #2)
  - [x] 3.1 — Create `apps/api/src/adventures/dto/update-adventure.dto.ts`:
    ```typescript
    import { IsString, IsNotEmpty, MaxLength, IsOptional, IsDateString } from 'class-validator'
    import { Transform } from 'class-transformer'

    export class UpdateAdventureDto {
      @IsOptional()
      @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
      @IsString()
      @IsNotEmpty()
      @MaxLength(100)
      name?: string

      @IsOptional()
      @IsDateString()  // validates YYYY-MM-DD or null
      startDate?: string | null
    }
    ```
  - [x] 3.2 — In `adventures.repository.ts`, add `updateStartDate(id: string, startDate: string | null): Promise<Adventure>`:
    ```typescript
    async updateStartDate(id: string, startDate: string | null): Promise<Adventure> {
      const [row] = await db
        .update(adventures)
        .set({ startDate, updatedAt: new Date() })
        .where(eq(adventures.id, id))
        .returning()
      return row as Adventure
    }
    ```
  - [x] 3.3 — In `adventures.service.ts`:
    - Add `updateAdventure(id, userId, dto: { name?: string; startDate?: string | null })` method that applies each provided field (partial update — call `updateName` or `updateStartDate` from the repository as needed, or create a single `update()` repo method).
    - Update `toResponse()` to include `startDate: a.startDate ?? null`.
  - [x] 3.4 — In `adventures.controller.ts`, update the `@Patch(':id')` endpoint:
    - Change `@Body() dto: RenameAdventureDto` to `@Body() dto: UpdateAdventureDto`
    - Call `adventuresService.updateAdventure(id, user.id, dto)` instead of `renameAdventure`
    - The existing frontend `renameAdventure()` call (which sends `{ name: "..." }`) remains valid — backward compatible since `name` is now optional but the DTO still validates it when present.

- [x] **Task 4 — Frontend: D+ display on adventure card** (AC: #1)
  - [x] 4.1 — In `adventure-card.tsx`, add the D+ line in the top-right area, below the distance:
    ```tsx
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-text-secondary text-sm">
        {adventure.totalDistanceKm > 0 ? `${adventure.totalDistanceKm.toFixed(1)} km` : '—'}
      </span>
      {adventure.totalElevationGainM != null && adventure.totalElevationGainM > 0 && (
        <span className="text-text-secondary text-sm">
          ↑ {Math.round(adventure.totalElevationGainM).toLocaleString('fr-FR')} m
        </span>
      )}
    </div>
    ```
    (Replace the current single `<span>` for distance with this block.)
  - [x] 4.2 — Also display the start date in the card header below the adventure name (replacing the current `createdAt` display, OR add `startDate` when present and fall back to `createdAt` when not):
    ```tsx
    <div className="text-text-muted text-sm mt-1">
      {adventure.startDate
        ? new Date(adventure.startDate).toLocaleDateString('fr-FR')
        : new Date(adventure.createdAt).toLocaleDateString('fr-FR')}
    </div>
    ```

- [x] **Task 5 — Frontend: date picker on adventure detail page** (AC: #2)
  - [x] 5.1 — In `apps/web/src/lib/api-client.ts`, add:
    ```typescript
    export async function updateAdventureStartDate(id: string, startDate: string | null): Promise<AdventureResponse> {
      const res = await apiFetch(`/adventures/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ startDate }),
      })
      return res.data
    }
    ```
    (Use the project's existing `apiFetch` helper pattern used in the file — inspect `api-client.ts` to use the same fetch wrapper.)
  - [x] 5.2 — In `adventure-detail.tsx`, add a `useMutation` for `updateAdventureStartDate`:
    ```typescript
    const startDateMutation = useMutation({
      mutationFn: (date: string | null) => updateAdventureStartDate(adventureId, date),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['adventures'] })
        queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
      },
    })
    ```
  - [x] 5.3 — Add the date input in the adventure header section (near the rename input):
    ```tsx
    <div className="flex items-center gap-2 mt-1">
      <label className="text-sm text-text-muted whitespace-nowrap">Date de départ :</label>
      <input
        type="date"
        className="text-sm border border-[--border] rounded-lg px-3 py-1.5 bg-white text-text-primary"
        value={adventure.startDate ?? ''}
        onChange={(e) => {
          const val = e.target.value || null
          startDateMutation.mutate(val)
        }}
      />
    </div>
    ```

- [x] **Task 6 — Frontend: sorting and "Aventures passées" section** (AC: #3, #4)
  - [x] 6.1 — In `adventure-list.tsx`, add `isPastExpanded` state (default `false`) and `ChevronDown` import from `lucide-react`.
  - [x] 6.2 — Replace the flat `adventures.map()` with a sorted+grouped computation:
    ```typescript
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const upcoming = adventures
      .filter(a =>
        a.status === 'active' ||
        !a.startDate ||
        new Date(a.startDate) >= today
      )
      .sort((a, b) => {
        if (a.status === 'active' && b.status !== 'active') return -1
        if (b.status === 'active' && a.status !== 'active') return 1
        if (!a.startDate && !b.startDate) return 0
        if (!a.startDate) return 1   // undated after dated
        if (!b.startDate) return -1
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
      })

    const past = adventures
      .filter(a =>
        a.status !== 'active' &&
        !!a.startDate &&
        new Date(a.startDate) < today
      )
      .sort((a, b) =>
        new Date(b.startDate!).getTime() - new Date(a.startDate!).getTime() // most recent past first
      )
    ```
  - [x] 6.3 — Render the two sections:
    ```tsx
    <div className="space-y-3">
      {upcoming.map(adventure => (
        <AdventureCard key={adventure.id} ... />
      ))}
    </div>
    {past.length > 0 && (
      <div className="mt-4">
        <button
          type="button"
          className="flex items-center gap-2 text-sm text-text-muted mb-2 w-full"
          onClick={() => setIsPastExpanded(v => !v)}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isPastExpanded ? 'rotate-180' : ''}`} />
          Aventures passées ({past.length})
        </button>
        {isPastExpanded && (
          <div className="space-y-3 opacity-75">
            {past.map(adventure => (
              <AdventureCard key={adventure.id} ... />
            ))}
          </div>
        )}
      </div>
    )}
    ```

- [x] **Task 7 — Tests** (AC: all)
  - [x] 7.1 — Update `makeAdventure()` factory in `adventure-list.test.tsx` to include `startDate: null` (default). Add test cases:
    - Adventures with future `startDate` appear before undated adventures in the main list
    - Adventure with past `startDate` + `status !== 'active'` does NOT appear in the main list, and the "Aventures passées" section button renders
    - Clicking "Aventures passées" toggle expands the section and shows the past adventure
    - Adventure with past `startDate` + `status === 'active'` stays in the main list
  - [x] 7.2 — Add test for D+ display in adventure card: when `totalElevationGainM = 4200`, the card shows "↑ 4 200 m". When `totalElevationGainM = null`, no "↑" text is rendered.
  - [x] 7.3 — In `adventures.service.test.ts`: add test for `updateAdventure` / `updateStartDate` — verifies ownership check and that `toResponse()` includes `startDate`.
  - [x] 7.4 — Run `pnpm turbo test` — all tests must pass.

### Review Follow-ups (AI) — LOW severity

- [ ] [AI-Review][LOW] Add `onSuccess` toast to `startDateMutation` and `endDateMutation` for consistency with `renameAdventureMutation` — `adventure-detail.tsx:155-171`
- [ ] [AI-Review][LOW] Fix stale mock key: `mockRepo.updateTotalDistance` → `mockRepo.updateTotals` in service test — `adventures.service.test.ts:16`

## Dev Notes

### D+ — Field Already Exists, Display-Only Change

`totalElevationGainM` is already in the full stack:
- DB column: `total_elevation_gain_m` (nullable real) — `packages/database/src/schema/adventures.ts:12`
- Shared type: `AdventureResponse.totalElevationGainM?: number | null` — `packages/shared/src/types/adventure.types.ts:42`
- API `toResponse()`: `totalElevationGainM: a.totalElevationGainM ?? null` — `apps/api/src/adventures/adventures.service.ts:66`

**No backend changes needed for AC #1.** The card just needs to read and display the field.

**French number formatting:** `Math.round(4200).toLocaleString('fr-FR')` → `"4 200"` (thin space as thousands separator). Always use `Math.round()` — no decimals for elevation.

### Start Date — Drizzle `date` Column Type

The `date` type from `drizzle-orm/pg-core` stores a PostgreSQL `DATE` column. In Drizzle's TypeScript types, it maps to `string` (not `Date`) when using the default mode. The stored and returned value is `YYYY-MM-DD`.

**Critical:** Do NOT confuse with `timestamp`. The `date` type is the right choice here — we only need the calendar date, not a time component.

```typescript
// packages/database/src/schema/adventures.ts
import { pgTable, text, timestamp, real, integer, pgEnum, index, date } from 'drizzle-orm/pg-core'

export const adventures = pgTable('adventures', {
  // ... existing columns ...
  startDate: date('start_date'),  // nullable, YYYY-MM-DD string
})
```

The next migration number is `0009` (last used: `0008_add_overpass_enabled.sql`).

### PATCH Endpoint — Backward Compatibility

The existing frontend `renameAdventure(id, name)` function in `api-client.ts` sends:
```typescript
PATCH /adventures/:id  body: { name: "New name" }
```

The new `UpdateAdventureDto` makes both `name` and `startDate` optional. When the frontend sends only `{ name: "..." }`, the DTO receives `name = "New name"`, `startDate = undefined`. The service should only update fields that are explicitly provided (not undefined).

**Pattern for partial update in service:**
```typescript
async updateAdventure(id: string, userId: string, dto: UpdateAdventureDto): Promise<AdventureResponse> {
  await this.verifyOwnership(id, userId)
  let adventure: Adventure | undefined

  if (dto.name !== undefined) {
    adventure = await this.adventuresRepo.updateName(id, dto.name)
  }
  if ('startDate' in dto) {  // explicit check — allows null (clearing)
    adventure = await this.adventuresRepo.updateStartDate(id, dto.startDate ?? null)
  }

  // Re-fetch if no update was made (shouldn't happen, but safe fallback)
  if (!adventure) {
    adventure = (await this.adventuresRepo.findByIdAndUserId(id, userId))!
  }

  return this.toResponse(adventure)
}
```

Note: `'startDate' in dto` vs `dto.startDate !== undefined` — use `in` operator to distinguish "not sent" (undefined, key absent) from "send null" (explicitly cleared).

### Sorting Logic Edge Cases

| Case | Group |
|---|---|
| `status === 'active'`, any date | Main list (first) |
| `startDate` in the future, `status !== 'active'` | Main list, sorted ascending |
| No `startDate`, any non-active status | Main list, after dated upcoming |
| `startDate` = today, `status !== 'active'` | Main list (not past) |
| `startDate` in the past, `status !== 'active'` | "Aventures passées" section |
| `status === 'active'`, `startDate` in the past | Main list (always) |

"Today" is computed at component render time using `new Date()` with `setHours(0,0,0,0)` to get midnight local time. This means adventures starting today are NOT in the past section.

### Date Picker — Native `<input type="date">`

No new library needed. The native HTML date input:
- Returns `YYYY-MM-DD` string when set
- Returns `""` (empty string) when cleared
- Shows a native date picker on mobile (iOS/Android), which is a good UX pattern for this use case

Map `""` → `null` before sending to the API (the API accepts `null` to clear the field).

The input placement in `adventure-detail.tsx` should be near the adventure name rename input — both are adventure-level properties that users edit in the detail view.

### api-client.ts — Check Existing Pattern

Before implementing `updateAdventureStartDate`, read `apps/web/src/lib/api-client.ts` to use the correct internal fetch helper. In story 16.1, the profile update used a direct `fetch()` call with `credentials: 'include'`. Use the same pattern as existing adventure mutations in the file (e.g., `renameAdventure`).

### Previous Story (16.1) — Patterns Established

From 16.1 completion notes:
- `adventure-card.tsx` mobile buttons: already unconditional (no `isSelected` guard) — do NOT re-add it when modifying the card for D+.
- `useMutation` + `queryClient.invalidateQueries` pattern: well-established in `adventure-detail.tsx` — follow the same pattern for `startDateMutation`.
- `makeAdventure()` factory in tests: already set up — just add `startDate: null` to the factory default.
- Tests run via: `pnpm turbo test` — 202 API + 618 web tests currently passing.

### Project Structure Notes

| File | Path |
|---|---|
| Drizzle schema (adventures) | `packages/database/src/schema/adventures.ts` |
| DB migration | `packages/database/migrations/0009_add_start_date_adventures.sql` |
| Shared adventure types | `packages/shared/src/types/adventure.types.ts` |
| NestJS service | `apps/api/src/adventures/adventures.service.ts` |
| NestJS repository | `apps/api/src/adventures/adventures.repository.ts` |
| NestJS controller | `apps/api/src/adventures/adventures.controller.ts` |
| UpdateAdventureDto (NEW) | `apps/api/src/adventures/dto/update-adventure.dto.ts` |
| API client (web) | `apps/web/src/lib/api-client.ts` |
| Adventure card | `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` |
| Adventure list | `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` |
| Adventure list test | `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx` |
| Adventure detail | `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` |

### References

- Story 16.2 requirements: `_bmad-output/planning-artifacts/epics.md` (line ~1816)
- User acceptance feedback original: `_bmad-output/implementation-artifacts/user-acceptance-feedback.md`
- `AdventureResponse` type: `packages/shared/src/types/adventure.types.ts:35`
- `adventures` Drizzle schema: `packages/database/src/schema/adventures.ts`
- `AdventureCard` component: `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx`
- `AdventureList` component: `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx`
- NestJS architecture rules: `_bmad-output/project-context.md#NestJS Architecture Rules`
- Story 16.1 (patterns & context): `_bmad-output/implementation-artifacts/16-1-critical-bug-fixes.md`
- Last migration: `packages/database/migrations/0008_add_overpass_enabled.sql`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Implemented full-stack `start_date` + `end_date` support: DB schema (`date` columns), SQL migrations `0009`/`0010`, shared type, NestJS DTO/repo/service/controller.
- `UpdateAdventureDto` replaces `RenameAdventureDto` on `PATCH /adventures/:id` — backward compatible (existing `{ name }` calls still work via optional fields).
- `@IsDateString()` replaced by `@ValidateIf((_, value) => value !== null) + @Matches(/^\d{4}-\d{2}-\d{2}$/)` — `IsDateString` rejected `null` values causing 400 errors.
- **Bug fix (post-review):** `'startDate' in dto` pattern does NOT work with TypeScript ES2023 (`useDefineForClassFields: true`) — class properties are always defined on the instance (as `undefined`) regardless of the request body. Fixed by using `dto.startDate !== undefined` to distinguish "not sent" from "sent as null" (clearing).
- **Bug fix (post-review):** DB migration not applied to Docker container — `start_date` / `end_date` columns were missing, causing 500 errors. Applied via `docker exec` directly.
- Adventure card now shows D+ (↑ X XXX m, `toLocaleString('fr-FR')`) when `totalElevationGainM > 0`, and shows date range (`startDate → endDate`) falling back to `startDate` alone or `createdAt`.
- Adventure detail page has native `<input type="date">` for both start and end dates, auto-saving on change via `startDateMutation` / `endDateMutation`.
- Button nesting hydration error fixed: removed `TooltipProvider/Tooltip/TooltipTrigger` wrapper around `DensityTriggerButton`; replaced with inline `<Info>` icon + text "Segments en cours d'analyse".
- Adventure list now splits adventures into "upcoming/undated" (main) and past (collapsed "Aventures passées" section). Sort order: active first → future-dated ascending → undated.
- Created new `adventure-card.test.tsx` (7 tests) covering D+ display, date range, startDate/createdAt fallback logic.
- All 629 web + API tests pass (pnpm turbo test).
- **Code review fixes (2026-03-31):** Added `disabled={startDateMutation.isPending}` and `disabled={endDateMutation.isPending}` to date inputs (race condition fix). Added `htmlFor`/`id` to date labels/inputs (accessibility). Removed dead `renameAdventure()` method from service + its test block. Fixed UTC vs local midnight timezone bug in `adventure-list.tsx` and `adventure-card.tsx` (`new Date(d + 'T00:00:00')` instead of `new Date(d)`). Added `@IsISO8601({ strict: true })` to DTO date fields to reject invalid calendar dates. Added 5 date-picker tests to `adventure-detail.test.tsx`.

### File List

- `packages/database/src/schema/adventures.ts` — added `date` import + `startDate` + `endDate` columns
- `packages/database/migrations/0009_add_start_date_adventures.sql` — NEW: ALTER TABLE start_date
- `packages/database/migrations/0010_add_end_date_adventures.sql` — NEW: ALTER TABLE end_date
- `packages/shared/src/types/adventure.types.ts` — added `startDate?: string | null` + `endDate?: string | null` to `AdventureResponse`
- `apps/api/src/adventures/dto/update-adventure.dto.ts` — NEW: UpdateAdventureDto (name + startDate + endDate)
- `apps/api/src/adventures/adventures.repository.ts` — added `updateStartDate()` + `updateEndDate()`
- `apps/api/src/adventures/adventures.service.ts` — added `updateAdventure()`, updated `toResponse()` with startDate/endDate
- `apps/api/src/adventures/adventures.controller.ts` — replaced `RenameAdventureDto` with `UpdateAdventureDto` on PATCH endpoint
- `apps/web/src/lib/api-client.ts` — added `updateAdventureStartDate()` + `updateAdventureEndDate()`
- `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` — D+ display + startDate/endDate/createdAt fallback
- `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` — sorting + "Aventures passées" collapsible section
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — `startDateMutation` + `endDateMutation` + date inputs + button nesting fix
- `apps/api/src/adventures/adventures.service.test.ts` — added `updateStartDate`/`updateEndDate` mocks, `updateAdventure` tests, startDate/endDate in factory
- `apps/web/src/app/(app)/adventures/_components/adventure-list.test.tsx` — updated factory + 4 new sorting/grouping tests
- `apps/web/src/app/(app)/adventures/_components/adventure-card.test.tsx` — NEW: 7 tests for D+ and date range display
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` — updated tooltip text assertion
