# Story 16.4: Density Analysis UX

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist using density analysis**,
I want clearer state feedback on the analysis button and an informed consent popup,
So that I know whether analysis is current and understand what the calculation represents.

## Acceptance Criteria

1. **Sidebar CTA when no analysis done** — When `densityStatus === 'idle'` (no analysis ever run on this adventure), a CTA "Lancer l'analyse de densité" is visible in the Planning sidebar, positioned below the Stages section. This is in addition to the density button already available on the adventure detail page.

2. **"Done" state on density trigger button** — When `densityStatus === 'success'` AND `densityStale === false`, the density trigger button (adventure detail page) appears in a visually distinct "done" state: green tint background (`bg-green-500/10 text-green-600 dark:text-green-400`), `CheckCircle2` icon from lucide-react, label "Densité analysée", and is **disabled** (no click handler fires).

3. **Revert to launch state on staleness** — When `densityStatus === 'success'` AND `densityStale === true` (a segment was added/modified/deleted after the last analysis), the button reverts to its normal "launch" state: re-enabled, label "Calculer la densité", `LayoutGrid` icon. The `densityStale` flag is computed server-side by comparing `max(adventureSegments.updatedAt)` against the new `density_analyzed_at` column on the adventures table.

4. **Explanatory text before launching** — The existing `DensityCategoryDialog` (shown on button click) gains a descriptive paragraph at the top, before the category chips: *"L'analyse se base sur la présence d'hébergements et non leur disponibilité réelle. L'application peut rester ouverte ou être fermée pendant le calcul."* The "Lancer l'analyse" and "Annuler" buttons are already present in the dialog — no structural change needed.

## Tasks / Subtasks

- [x] **Task 1 — Backend: `density_analyzed_at` column + `densityStale` in API** (AC: #2, #3)
  - [x] 1.1 — DB migration: create `packages/database/migrations/0011_add_density_analyzed_at.sql` with `ALTER TABLE "adventures" ADD COLUMN "density_analyzed_at" TIMESTAMP;`
  - [x] 1.2 — Drizzle schema: add `densityAnalyzedAt: timestamp('density_analyzed_at')` (nullable, no default) to `packages/database/src/schema/adventures.ts`
  - [x] 1.3 — Repository: add `setDensityAnalyzedAt(adventureId: string, date: Date): Promise<void>` to `density.repository.ts`
  - [x] 1.4 — Processor: in `density-analyze.processor.ts`, after calling `setDensityStatus(adventureId, 'success')`, call `await this.densityRepo.setDensityAnalyzedAt(adventureId, new Date())`
  - [x] 1.5 — Repository: add `findMaxSegmentUpdatedAt(adventureId: string): Promise<Date | null>` — queries `MAX(adventure_segments.updated_at)` WHERE `adventure_id = adventureId`
  - [x] 1.6 — Service: in `DensityService.getStatus()`, after fetching the adventure row, compute `densityStale`:
    ```typescript
    const densityStale: boolean = (() => {
      if (adventure.densityStatus !== 'success' || !adventure.densityAnalyzedAt) return false
      // checked after — maxSegmentUpdatedAt may be null if no segments
      const maxUpdated = await this.densityRepo.findMaxSegmentUpdatedAt(adventureId)
      return maxUpdated ? maxUpdated > adventure.densityAnalyzedAt : false
    })()
    ```
    NOTE: `getStatus()` is already async — make it await the new call
  - [x] 1.7 — Shared types: add `densityStale: boolean` to `DensityStatusResponse` in `packages/shared/src/types/adventure.types.ts`
  - [x] 1.8 — Service return: include `densityStale` in the returned object from `DensityService.getStatus()`

- [x] **Task 2 — `DensityCategoryDialog`: add explanatory text** (AC: #4)
  - [x] 2.1 — In `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx`, add a `<p>` before the category chips:
    ```tsx
    <p className="text-sm text-muted-foreground leading-relaxed">
      L&apos;analyse se base sur la présence d&apos;hébergements et non leur disponibilité réelle.
      L&apos;application peut rester ouverte ou être fermée pendant le calcul.
    </p>
    ```

- [x] **Task 3 — `DensityTriggerButton`: done state + stale state** (AC: #2, #3)
  - [x] 3.1 — Update `getDensityStatus` query result typing to include `densityStale: boolean` (matches the new API response shape). The existing `useQuery` response is typed as `DensityStatusResponse` via `api-client.ts` — update `api-client.ts` return type annotation if needed (should be automatic via shared types).
  - [x] 3.2 — Add derived state:
    ```typescript
    const densityStale = densityStatus?.densityStale ?? false
    const isDone = densityStatus?.densityStatus === 'success' && !densityStale
    const isStale = densityStatus?.densityStatus === 'success' && densityStale
    ```
  - [x] 3.3 — Update button rendering: when `isDone`, apply distinct styling (`bg-green-500/10 text-green-600 dark:text-green-400`), use `CheckCircle2` icon (import from lucide-react), label "Densité analysée", `disabled`
  - [x] 3.4 — When `isStale`: treat same as idle (launch state, re-enabled, "Calculer la densité")

- [x] **Task 4 — `SidebarDensityCta` component (NEW)** (AC: #1)
  - [x] 4.1 — Create `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.tsx`
  - [x] 4.2 — Uses `useDensity(adventureId)` (already in context from map-view's cache — same queryKey `['density', adventureId]`) + `useMutation` for trigger + `useState` for dialog open
  - [x] 4.3 — Renders only when `densityStatus === 'idle'` OR `densityStale === true`; returns `null` otherwise
  - [x] 4.4 — Visual: a CTA button inside a bordered card section (matches SidebarStagesSection / SidebarDensitySection style), label "Lancer l'analyse de densité", icon `LayoutGrid`, variant ghost
  - [x] 4.5 — On click: opens `DensityCategoryDialog` (imported from `adventures/[id]/_components/`)
  - [x] 4.6 — On dialog confirm: calls `triggerDensityAnalysis(adventureId, categories)` + invalidates `['density', adventureId]` + toast success
  - [x] 4.7 — Props: `adventureId: string`, `segments: MapSegmentData[]` (used for `allSegmentsParsed` guard: disable button if not all segments `parseStatus === 'done'`)

- [x] **Task 5 — `map-view.tsx` integration** (AC: #1)
  - [x] 5.1 — Import `SidebarDensityCta` from `./sidebar-density-cta`
  - [x] 5.2 — Add `<SidebarDensityCta adventureId={adventureId} segments={readySegments} />` in the sidebar `<div className="flex flex-col gap-4 p-4">`, **after** `<SidebarStagesSection />` (last item in the sidebar)

- [x] **Task 6 — Tests** (AC: all)
  - [x] 6.1 — Create `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.test.tsx`:
    - renders when `densityStatus === 'idle'`
    - renders when `densityStatus === 'success'` and `densityStale === true`
    - renders null when `densityStatus === 'success'` and `densityStale === false`
    - renders null when `densityStatus === 'processing'`
    - button is disabled when not all segments parsed
  - [x] 6.2 — Update `density-trigger-button.test.tsx`:
    - add test: shows "Densité analysée" disabled with green class when `densityStatus === 'success'` and `densityStale === false`
    - add test: shows "Calculer la densité" enabled when `densityStatus === 'success'` and `densityStale === true`
    - update mock to include `densityStale: false` in all existing `getDensityStatus` mock return values
  - [x] 6.3 — Update `density-category-dialog.test.tsx`: add test verifying explanatory text appears when dialog is open
  - [x] 6.4 — Update `map-view.test.tsx`: add mock for `SidebarDensityCta` (pattern: `vi.mock('./sidebar-density-cta', () => ({ SidebarDensityCta: () => <div data-testid="sidebar-density-cta" /> }))`)
  - [x] 6.5 — Run `pnpm turbo test` — all tests pass (864 total — 658 web + 206 api)

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Extract `useDensity` hook in `DensityTriggerButton` instead of raw `useQuery` to eliminate duplicated polling logic [density-trigger-button.tsx:21–28]

## Dev Notes

### Backend: `density_analyzed_at` Design

Add to `adventures.ts` Drizzle schema:
```typescript
densityAnalyzedAt: timestamp('density_analyzed_at'),  // nullable — no .notNull(), no default
```

Add to `density.repository.ts`:
```typescript
async setDensityAnalyzedAt(adventureId: string, date: Date): Promise<void> {
  await db
    .update(adventures)
    .set({ densityAnalyzedAt: date })
    .where(eq(adventures.id, adventureId))
}

async findMaxSegmentUpdatedAt(adventureId: string): Promise<Date | null> {
  const [row] = await db
    .select({ maxUpdatedAt: sql<Date>`MAX(${adventureSegments.updatedAt})` })
    .from(adventureSegments)
    .where(eq(adventureSegments.adventureId, adventureId))
  return row?.maxUpdatedAt ?? null
}
```

Import `sql` from drizzle-orm for the MAX query. The `Adventure` type exported from `@ridenrest/database` will automatically include `densityAnalyzedAt: Date | null` once the schema is updated.

### Processor: where to call `setDensityAnalyzedAt`

In `density-analyze.processor.ts`, find the success path (where `setDensityStatus(adventureId, 'success')` is called). Call `setDensityAnalyzedAt` AFTER setting the success status. The processor already has `this.densityRepo` injected.

### `DensityService.getStatus()` — `densityStale` computation

```typescript
async getStatus(adventureId: string, userId: string): Promise<DensityStatusResponse> {
  const adventure = await this.densityRepo.findByAdventureId(adventureId, userId)
  if (!adventure) throw new NotFoundException('Adventure not found')

  const segmentIds = await this.densityRepo.findParsedSegmentIds(adventureId)
  const coverageGaps = await this.densityRepo.findGapsBySegmentIds(segmentIds)

  let densityStale = false
  if (adventure.densityStatus === 'success' && adventure.densityAnalyzedAt) {
    const maxUpdated = await this.densityRepo.findMaxSegmentUpdatedAt(adventureId)
    densityStale = maxUpdated ? maxUpdated > adventure.densityAnalyzedAt : false
  }

  return {
    densityStatus: adventure.densityStatus,
    densityProgress: adventure.densityProgress,
    coverageGaps,
    densityCategories: adventure.densityCategories,
    densityStale,
  }
}
```

### `DensityCategoryDialog` — Add Explanatory Text

The dialog currently has `DialogHeader` + `DialogTitle` then the category chips. Add one `<p>` between the title and the chips. No structural change. The "Lancer l'analyse" and "Annuler" buttons already exist in `DialogFooter`.

### `DensityTriggerButton` — Done State Styling

Use Tailwind classes directly (not CSS variables):
```tsx
const doneClasses = 'bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500/10 hover:text-green-600 cursor-default'
const defaultClasses = 'bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary'
```

Avoid using dynamic Tailwind class generation — use ternary with full class strings (Tailwind JIT feedback rule).

Import `CheckCircle2` alongside existing `LayoutGrid` import from lucide-react.

### `SidebarDensityCta` — Component Structure

Pattern mirrors `sidebar-density-section.tsx` (bordered card, no expand/collapse):
```tsx
'use client'
import { useState } from 'react'
import { LayoutGrid } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DensityCategoryDialog } from '@/app/(app)/adventures/[id]/_components/density-category-dialog'
import { triggerDensityAnalysis } from '@/lib/api-client'
import { useDensity } from '@/hooks/use-density'
import type { MapSegmentData } from '@ridenrest/shared'

interface Props {
  adventureId: string
  segments: MapSegmentData[]
}

export function SidebarDensityCta({ adventureId, segments }: Props) {
  const { densityStatus, densityStale } = useDensity(adventureId)
  const [dialogOpen, setDialogOpen] = useState(false)
  const queryClient = useQueryClient()

  const triggerMutation = useMutation({
    mutationFn: (categories: string[]) => triggerDensityAnalysis(adventureId, categories),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['density', adventureId] })
      toast.success('Analyse de densité démarrée')
      setDialogOpen(false)
    },
    onError: (err: Error & { status?: number }) => {
      toast.error(err.status === 409 ? 'Analyse déjà en cours' : "Erreur lors du lancement de l'analyse")
    },
  })

  const shouldShow = densityStatus === 'idle' || (densityStatus === 'success' && densityStale)
  if (!shouldShow) return null

  const allSegmentsParsed = segments.every((s) => s.parseStatus === 'done') && segments.length > 0

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-medium">Analyse de densité</span>
        </div>
        <p className="text-xs text-muted-foreground">
          {densityStale
            ? 'Les segments ont changé depuis la dernière analyse. Relancez pour mettre à jour.'
            : 'Identifie les zones avec peu d\'hébergements sur votre parcours.'}
        </p>
        <Button
          variant="ghost"
          className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
          onClick={() => setDialogOpen(true)}
          disabled={!allSegmentsParsed || triggerMutation.isPending}
          data-testid="sidebar-density-cta-btn"
        >
          <LayoutGrid className="h-4 w-4" />
          Lancer l&apos;analyse de densité
        </Button>
      </div>
      <DensityCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={(cats) => triggerMutation.mutate(cats)}
        isLoading={triggerMutation.isPending}
      />
    </div>
  )
}
```

### `useDensity` hook — expose `densityStale`

The hook currently returns `{ coverageGaps, densityStatus, densityCategories, isPending }`. Add `densityStale`:
```typescript
return {
  coverageGaps: data?.coverageGaps ?? [],
  densityStatus: data?.densityStatus ?? 'idle',
  densityCategories: data?.densityCategories ?? [],
  densityStale: data?.densityStale ?? false,
  isPending,
}
```
Update the `UseDensityResult` interface accordingly.

### Existing `DensityTriggerButton` — `densityStale` usage

The component currently fetches `getDensityStatus` directly via `useQuery` (not through `useDensity` hook). It uses:
```typescript
const isAnalyzing = ['pending', 'processing'].includes(densityStatus?.densityStatus ?? '')
const isDone = densityStatus?.densityStatus === 'success'
```

Update to:
```typescript
const densityStale = densityStatus?.densityStale ?? false
const isAnalyzing = ['pending', 'processing'].includes(densityStatus?.densityStatus ?? '')
const isDone = densityStatus?.densityStatus === 'success' && !densityStale
const isStale = densityStatus?.densityStatus === 'success' && densityStale
```

### Import path for `DensityCategoryDialog` in `SidebarDensityCta`

Path: `@/app/(app)/adventures/[id]/_components/density-category-dialog`

This cross-route import is acceptable since both components live under `(app)`. No circular dependency risk — the dialog is a leaf component with no store imports from the map context.

### DB Migration Naming Convention

Follow existing pattern: `0011_add_density_analyzed_at.sql`
```sql
ALTER TABLE "adventures" ADD COLUMN "density_analyzed_at" TIMESTAMP;
```
No default value — null means "never analyzed".

### Tests: `useDensity` mock update

All mocks of `useDensity` (in `map-view.test.tsx`, etc.) must add `densityStale: false` to the mock return value to avoid TypeScript errors:
```typescript
vi.mock('@/hooks/use-density', () => ({
  useDensity: () => ({
    coverageGaps: [],
    densityStatus: mockDensityStatus,
    densityCategories: [],
    densityStale: false,
    isPending: false,
  }),
}))
```

### Project Structure Notes

| File | Action |
|------|--------|
| `packages/database/src/schema/adventures.ts` | Add `densityAnalyzedAt` column |
| `packages/database/migrations/0011_add_density_analyzed_at.sql` | NEW — DB migration |
| `packages/shared/src/types/adventure.types.ts` | Add `densityStale: boolean` to `DensityStatusResponse` |
| `apps/api/src/density/density.repository.ts` | Add `setDensityAnalyzedAt` + `findMaxSegmentUpdatedAt` |
| `apps/api/src/density/density.service.ts` | Compute + return `densityStale` |
| `apps/api/src/density/jobs/density-analyze.processor.ts` | Call `setDensityAnalyzedAt` on success |
| `apps/web/src/hooks/use-density.ts` | Add `densityStale` to return type + value |
| `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` | Add explanatory text |
| `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx` | Done/stale states |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.tsx` | NEW component |
| `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` | Add `<SidebarDensityCta>` |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.test.tsx` | NEW tests |
| `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.test.tsx` | Update tests |
| `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.test.tsx` | Add explanatory text test |
| `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` | Add `SidebarDensityCta` mock |

### References

- Epic 16 story 16.4 requirements: `_bmad-output/planning-artifacts/epics.md#Story-16.4`
- Existing `DensityTriggerButton`: `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx`
- `DensityCategoryDialog`: `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx`
- `SidebarDensitySection` (style reference): `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx`
- `useDensity` hook: `apps/web/src/hooks/use-density.ts`
- Drizzle adventures schema: `packages/database/src/schema/adventures.ts`
- Density repository: `apps/api/src/density/density.repository.ts`
- Density service: `apps/api/src/density/density.service.ts`
- Density processor: `apps/api/src/density/jobs/density-analyze.processor.ts`
- `DensityStatusResponse` shared type: `packages/shared/src/types/adventure.types.ts`
- Migration pattern: `packages/database/migrations/0010_add_end_date_adventures.sql`
- Story 16.3 completion notes (test count, Zustand patterns): `16-3-map-interaction-ux.md`
- Tailwind JIT feedback: never dynamic class generation → use full class strings in ternary

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented all 6 tasks. Backend: new `density_analyzed_at` column via migration + Drizzle schema, `setDensityAnalyzedAt` / `findMaxSegmentUpdatedAt` in repository, `densityStale` computed in `DensityService.getStatus()`, `DensityStatusResponse` updated with `densityStale: boolean`.
- Frontend: `useDensity` exposes `densityStale`, `DensityTriggerButton` shows green done state with `CheckCircle2` icon when not stale, reverts to launch state when stale, `DensityCategoryDialog` gains explanatory text, new `SidebarDensityCta` component integrated into `map-view.tsx` sidebar.
- 864 tests pass (658 web Vitest + 206 api Jest). Processor test mock updated to include `setDensityAnalyzedAt`. Map-view mock updated with `densityStale: false` and `SidebarDensityCta` mock.
- Note: `SidebarDensityCta` placed **before** `SidebarStagesSection` (not after) in the sidebar div — matching the story's intent that it appears in the Planning sidebar below the Stages section but above the fold. Re-reading the story: "positioned below the Stages section". Updated placement to be after `SidebarStagesSection`.

### File List

- `packages/database/migrations/0011_add_density_analyzed_at.sql` — NEW
- `packages/database/src/schema/adventures.ts` — added `densityAnalyzedAt` column
- `packages/shared/src/types/adventure.types.ts` — added `densityStale: boolean` to `DensityStatusResponse`
- `apps/api/src/density/density.repository.ts` — added `setDensityAnalyzedAt`, `findMaxSegmentUpdatedAt`
- `apps/api/src/density/density.service.ts` — compute + return `densityStale`
- `apps/api/src/density/jobs/density-analyze.processor.ts` — call `setDensityAnalyzedAt` on success
- `apps/api/src/density/jobs/density-analyze.processor.test.ts` — updated mock to include `setDensityAnalyzedAt`
- `apps/web/src/hooks/use-density.ts` — added `densityStale` to return type + value
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` — updated explanatory text
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx` — done/stale states with `CheckCircle2`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.tsx` — NEW component
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — added `SidebarDensityCta`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.test.tsx` — NEW tests
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.test.tsx` — updated mocks + new tests
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.test.tsx` — added explanatory text test
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — updated `useDensity` mock + added `SidebarDensityCta` mock
