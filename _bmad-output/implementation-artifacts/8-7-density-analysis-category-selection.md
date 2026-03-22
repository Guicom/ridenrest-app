# Story 8.7: Density Analysis Category Selection

Status: done

## Story

As a **cyclist user triggering a density analysis**,
I want to choose which accommodation categories are included in the analysis,
So that the density colorization reflects only the types I plan to use (e.g. no camping if I always sleep in hotels).

## Acceptance Criteria

**AC1 — Pre-analysis modal on trigger**

**Given** a user clicks "Calculer la densité" on the adventure detail page,
**When** the button is clicked,
**Then** a modal dialog appears with 5 category chips: Hôtel, Camping, Refuge/Abri, Auberge de jeunesse, Chambre d'hôte — all selected by default; a "Lancer l'analyse" CTA and a "Annuler" button are visible.

**AC2 — Category selection before launch**

**Given** the pre-analysis modal is open,
**When** the user deselects one or more chips (e.g. Camping, Refuge/Abri),
**Then** the deselected chips render in inactive style (muted); the "Lancer l'analyse" button remains enabled as long as at least 1 category is selected; if all are deselected the button is disabled.

**AC3 — Analysis runs with selected categories only**

**Given** the user confirms with a subset of categories (e.g. Hôtel, Auberge),
**When** the POST /density/analyze request is sent,
**Then** the request body includes `{ adventureId, categories: ["hotel", "hostel"] }`; the density job queries Overpass only for those categories; `adventure.density_categories` is persisted in the DB.

**AC4 — Active categories label on density legend**

**Given** the density analysis has completed (`densityStatus === 'success'`),
**When** the DensityLegend popover renders on the map,
**Then** a small label shows the active categories below the legend items — e.g. "Analysé : Hôtels + Auberges" — derived from `densityCategories` returned by `GET /density/:adventureId/status`.

**AC5 — Default: all 5 categories when re-running**

**Given** an analysis was previously run with a specific category selection,
**When** the user opens the modal again to re-run,
**Then** the chips default to all 5 selected (not the previous selection) — each run is a fresh choice.

**AC6 — "Densité calculée" label when analysis is done**

**Given** a density analysis has previously completed for an adventure (`densityStatus === 'success'`),
**When** the `DensityTriggerButton` renders on the adventure detail page,
**Then** the button label displays "Densité calculée" instead of "Calculer la densité"; clicking it still opens the category dialog to re-run the analysis.

**AC7 — Adventure detail page header redesign**

**Given** a user navigates to the adventure detail page,
**When** the page renders with at least one parsed segment,
**Then** the layout matches the design:
- Title (h1) and stats row (distance + D+) are left-aligned in the header
- Stats row shows: `🔄 {totalDistanceKm} km` and `⛰️ {totalElevationGainM} m D+` (using `Route` and `TrendingUp` icons from lucide-react), displayed only when > 0
- "Calculer la densité" and "Voir la carte" buttons are in the top-right of the header (flex justify-between between title block and button group)
- Both buttons are pill-shaped (`rounded-full`)
- "Calculer la densité": `variant="outline"`, `LayoutGrid` icon before text, primary green border/text
- "Voir la carte": `variant="default"` (solid primary green), `Map` icon before text
- "Supprimer l'aventure" is a standalone centered pill button at the bottom of the page (`variant="ghost"`, destructive red text, `Trash2` icon before text) — no longer an icon button inline with the title

## Tasks / Subtasks

### Phase 1 — Backend: DB + Shared types

- [x] Task 1: Add `densityCategories` column to `adventures` schema (AC3)
  - [x] 1.1 In `packages/database/src/schema/adventures.ts`: add `densityCategories: text('density_categories').array().notNull().default([])` after `densityProgress`
  - [x] 1.2 Create migration `packages/database/migrations/0005_add_density_categories.sql`:
        `ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "density_categories" text[] NOT NULL DEFAULT '{}';`
  - [x] 1.3 Run `pnpm --filter @ridenrest/database db:migrate` to apply migration

- [x] Task 2: Update shared types (AC3, AC4)
  - [x] 2.1 In `packages/shared/src/types/adventure.types.ts`: add `densityCategories: string[]` to `DensityStatusResponse` interface
  - [x] 2.2 Add constant: `export const DENSITY_ACCOMMODATION_CATEGORIES = ['hotel', 'camp_site', 'shelter', 'hostel', 'guesthouse'] as const`
  - [x] 2.3 Export the constant from `packages/shared/src/index.ts`

### Phase 2 — Backend: API changes

- [x] Task 3: Update `TriggerDensityDto` (AC3)
  - [x] 3.1 In `apps/api/src/density/dto/trigger-density.dto.ts`: add `@IsArray() @IsString({ each: true }) @IsIn(['hotel', 'camp_site', 'shelter', 'hostel', 'guesthouse'], { each: true }) categories!: string[]`
  - [x] 3.2 Import `IsArray`, `IsString`, `IsIn` from `class-validator`

- [x] Task 4: Update `DensityRepository` (AC3, AC4)
  - [x] 4.1 Add method `saveDensityCategories(adventureId: string, categories: string[]): Promise<void>` — updates `adventures.densityCategories` + `updatedAt`
  - [x] 4.2 Update `findByAdventureId` return to include `densityCategories` (already included via `SELECT *`)
  - [x] 4.3 In `getStatus()` flow: include `adventure.densityCategories` in the returned `DensityStatusResponse`

- [x] Task 5: Update `DensityService` (AC3)
  - [x] 5.1 Add `categories: string[]` parameter to `triggerAnalysis(adventureId, userId, categories)`
  - [x] 5.2 Call `this.densityRepo.saveDensityCategories(adventureId, categories)` BEFORE enqueuing the job
  - [x] 5.3 Pass `categories` in the BullMQ job payload: `this.queue.add('analyze-density', { adventureId, segmentIds, categories })`
  - [x] 5.4 In `getStatus()`: include `densityCategories: adventure.densityCategories` in return value

- [x] Task 6: Update `DensityController` (AC3)
  - [x] 6.1 Pass `dto.categories` to `densityService.triggerAnalysis(dto.adventureId, user.id, dto.categories)`

- [x] Task 7: Update `DensityAnalyzeProcessor` (AC3)
  - [x] 7.1 Update `AnalyzeDensityJob` interface: add `categories: string[]`
  - [x] 7.2 Extract `categories` from `job.data` instead of using hardcoded `ACCOMMODATION_CATEGORIES`
  - [x] 7.3 Pass `categories` to `this.overpassProvider.queryPois(troncon.bbox, categories)` (already works — same string values)
  - [x] 7.4 Update `cacheKey` to include categories for cache differentiation: `density:troncon:${segmentId}:${troncon.fromKm}:${troncon.toKm}:${categories.sort().join(',')}`

### Phase 3 — Frontend

- [x] Task 8: Update `api-client.ts` (AC3)
  - [x] 8.1 Update `triggerDensityAnalysis(adventureId: string, categories: string[])` signature
  - [x] 8.2 Pass `categories` in the JSON body: `body: JSON.stringify({ adventureId, categories })`

- [x] Task 9: Update `useDensity` hook (AC4)
  - [x] 9.1 Expose `densityCategories: string[]` in `UseDensityResult` interface
  - [x] 9.2 Return `densityCategories: data?.densityCategories ?? []` from the hook

- [x] Task 10: Create `DensityCategoryDialog` component (AC1, AC2)
  - [x] 10.1 Create `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx`
  - [x] 10.2 Props: `open: boolean`, `onOpenChange: (open: boolean) => void`, `onConfirm: (categories: string[]) => void`, `isLoading?: boolean`
  - [x] 10.3 Use shadcn/ui `<Dialog>`, `<DialogContent>`, `<DialogHeader>`, `<DialogTitle>`, `<DialogFooter>`
  - [x] 10.4 Import `ACCOMMODATION_SUB_TYPES` from `@/app/(app)/map/[id]/_components/accommodation-sub-types` (reuse existing constant — already exported in 8.6)
  - [x] 10.5 Local state: `selectedCategories: Set<string>` initialized to all 5 types on each open (reset on `open` change via `useEffect`)
  - [x] 10.6 Chip styles: active = `bg-primary text-primary-foreground`, inactive = `bg-muted text-muted-foreground opacity-60`
  - [x] 10.7 "Lancer l'analyse" button: disabled when `selectedCategories.size === 0 || isLoading`; on click calls `onConfirm([...selectedCategories])`
  - [x] 10.8 "Annuler" button: calls `onOpenChange(false)`, variant="outline"

- [x] Task 11: Update `DensityTriggerButton` to use dialog (AC1, AC2, AC3)
  - [x] 11.1 Add `dialogOpen: boolean` local state
  - [x] 11.2 Replace direct `onClick={() => triggerMutation.mutate()}` with `onClick={() => setDialogOpen(true)}`
  - [x] 11.3 Render `<DensityCategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} onConfirm={handleConfirm} isLoading={triggerMutation.isPending} />`
  - [x] 11.4 `handleConfirm(categories: string[])`: calls `triggerMutation.mutate(categories)` then closes dialog `setDialogOpen(false)`
  - [x] 11.5 Update `triggerMutation.mutationFn` to `(categories: string[]) => triggerDensityAnalysis(adventureId, categories)`
  - [x] 11.6 When `densityStatus?.densityStatus === 'success'`: button label is `'Densité calculée'` instead of `'Analyser la densité'` — clicking still opens dialog (AC6)

- [x] Task 12: Update `DensityLegend` to show active categories (AC4)
  - [x] 12.1 Add props: `densityCategories?: string[]`
  - [x] 12.2 Import `ACCOMMODATION_SUB_TYPES` from the accommodation component (for label lookup)
  - [x] 12.3 Compute `categoriesLabel`: map category strings to icons+labels (e.g. `hotel` → `🏨 Hôtels`), join with ` + ` — only show when `densityCategories` is defined and has length > 0
  - [x] 12.4 Render below the `<Separator>` in the popover: `<p className="text-xs text-muted-foreground mt-1">Analysé : {categoriesLabel}</p>` — only when `categoriesLabel` is truthy
  - [x] 12.5 In `map-view.tsx`: expose `densityCategories` from `useDensity()` and pass to `<DensityLegend densityCategories={densityCategories} />`

### Phase 4 — Tests

- [x] Task 13: Tests for `DensityCategoryDialog` (AC1, AC2)
  - [x] 13.1 Create `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.test.tsx`
  - [x] 13.2 Test: all 5 chips rendered when dialog opens
  - [x] 13.3 Test: all chips are active by default
  - [x] 13.4 Test: clicking a chip toggles it inactive (opacity-60 class or aria-pressed=false)
  - [x] 13.5 Test: "Lancer l'analyse" disabled when 0 categories selected
  - [x] 13.6 Test: `onConfirm` called with correct string array when "Lancer l'analyse" clicked
  - [x] 13.7 Test: dialog resets to all-selected on re-open (useEffect reset)

- [x] Task 14: Tests for `DensityTriggerButton` (AC1, AC3)
  - [x] 14.1 Update `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.test.tsx`
  - [x] 14.2 Test: clicking button opens the DensityCategoryDialog (not directly triggers mutation)
  - [x] 14.3 Test: confirming in dialog with categories calls `triggerDensityAnalysis` with correct body

- [x] Task 15: Tests for `DensityLegend` (AC4)
  - [x] 15.1 Update `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx`
  - [x] 15.2 Test: categories label rendered when `densityCategories=['hotel','hostel']` → shows "Analysé : 🏨 Hôtels + 🛏️ Auberges" (or similar)
  - [x] 15.3 Test: categories label absent when `densityCategories` is empty or not provided

- [x] Task 16: Update `DensityService` tests (AC3)
  - [x] 16.1 Update `apps/api/src/density/density.service.test.ts`: pass `categories` arg to `triggerAnalysis()` calls
  - [x] 16.2 Verify `saveDensityCategories` is called with the categories

### Phase 5 — Adventure detail page redesign

- [x] Task 17: Redesign `adventure-detail.tsx` header layout (AC7)
  - [x] 17.1 Replace current title+trash-icon-inline layout with a flex header: title block (h1 + stats) on the left, buttons group on the right
  - [x] 17.2 Add stats row below the title: distance (`Route` icon + `{totalDistanceKm.toFixed(1)} km`) and D+ (`TrendingUp` icon + `{totalElevationGainM.toFixed(0)} m D+`) — render only when `totalDistanceKm > 0`; D+ only when `adventure.totalElevationGainM` is defined and > 0
  - [x] 17.3 Move "Voir la carte" and "Calculer la densité" buttons to the top-right button group — `rounded-full` style, always visible when all segments are parsed
  - [x] 17.4 "Calculer la densité" button: add `LayoutGrid` icon before text (`LayoutGrid` already imported in `sidebar-density-section.tsx` — available in lucide-react, no new dep)
  - [x] 17.5 Update button label: "Analyser la densité" → "Calculer la densité" (also update the label in `density-trigger-button.tsx` lines matching that string)
  - [x] 17.6 "Voir la carte" button: add `Map` icon before text (already imported in `density-legend.tsx`), `variant="default"`, `rounded-full`
  - [x] 17.7 Move "Supprimer l'aventure" action to a standalone centered section at the bottom of the page: `<Button variant="ghost" className="text-destructive rounded-full ..."><Trash2 /> Supprimer l'aventure</Button>` — remove the `Trash2` ghost icon button that was inline with the title
  - [x] 17.8 Update `adventure-detail.test.tsx` to reflect new layout (button positions, stats row, delete placement)

## Dev Notes

### UX Design Reference — Adventure Detail Page

The design below is the reference for `adventure-detail.tsx` (Task 17 / AC7).

**Header layout (flex row, justify-between):**
```
[h1: Adventure name]                    [📊 Calculer la densité] [📖 Voir la carte]
[🔄 1,323.5 km]  [⛰️ 18,450 m D+]
```

**Button specs:**
- **"Calculer la densité"**: `variant="outline"`, `rounded-full`, `LayoutGrid` icon (h-4 w-4, already in lucide-react), primary green border+text; after analysis done → label "Densité calculée"
- **"Voir la carte"**: `variant="default"` (solid primary green), `rounded-full`, `Map` icon (h-4 w-4)

**Stats row:** displayed below the title, only when data is available:
- Distance: `<Route className="h-4 w-4" />` + `{totalDistanceKm.toFixed(1)} km`
- Elevation gain: `<TrendingUp className="h-4 w-4" />` + `{totalElevationGainM.toFixed(0)} m D+` — only when `adventure.totalElevationGainM > 0`
- Both items inline, `text-sm text-muted-foreground`, gap between them

**Segments section header (unchanged behavior, visual update):**
- "Importer depuis Strava" — `variant="ghost"` plain text link style (or `<button>` with underline)
- "+ Ajouter un segment" — `variant="outline"`, `rounded-full`

**Delete adventure (moved to bottom):**
```tsx
<div className="flex justify-center pt-4">
  <Button
    variant="ghost"
    className="text-destructive hover:text-destructive rounded-full"
    onClick={() => setDeleteAdventureDialogOpen(true)}
  >
    <Trash2 className="h-4 w-4 mr-2" />
    Supprimer l'aventure
  </Button>
</div>
```
Remove the current inline `<Button variant="ghost" size="icon">` trash button next to the title.

**Icons used in Task 17** — all from `lucide-react` (already a dependency):
- `LayoutGrid` — density button (already used in `sidebar-density-section.tsx`)
- `Map` — map button (already used in `density-legend.tsx`)
- `Route` — distance stat (new usage, no new dependency)
- `TrendingUp` — elevation stat (new usage, no new dependency)
- `Trash2` — already imported in `adventure-detail.tsx`

### Critical Context: What Already Exists

Story 5.1 built the **complete density trigger flow** (button → API → BullMQ → processor). Story 8.7 is a **targeted enhancement** inserting a category selection modal BEFORE the API call. Do NOT redesign the existing flow.

**Already in place — do NOT change:**
- `DensityTriggerButton` at `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx` — button + mutation + status polling ✅
- `triggerDensityAnalysis()` in `apps/web/src/lib/api-client.ts` — POST /density/analyze ✅
- `DensityAnalyzeProcessor` — BullMQ worker, hardcoded `ACCOMMODATION_CATEGORIES = ['hotel', 'hostel', 'camp_site', 'shelter']` → **CHANGE TO DYNAMIC** ✅
- `ACCOMMODATION_SUB_TYPES` exported from `accommodation-sub-types.tsx` (5 types, with icons/labels) — **REUSE, DO NOT REDUPLICATE** ✅
- `DENSITY_ACCOMMODATION_CATEGORIES` does NOT yet exist → create in `packages/shared`

### Reuse ACCOMMODATION_SUB_TYPES from Story 8.6

The `ACCOMMODATION_SUB_TYPES` constant (already exported from `accommodation-sub-types.tsx`) contains all needed data:
```typescript
// Already exists, already exported — DO NOT DUPLICATE:
export const ACCOMMODATION_SUB_TYPES = [
  { type: 'hotel',      label: 'Hôtel',               icon: '🏨' },
  { type: 'camp_site',  label: 'Camping',              icon: '⛺' },
  { type: 'shelter',    label: 'Refuge / Abri',        icon: '🏠' },
  { type: 'hostel',     label: 'Auberge de jeunesse',  icon: '🛏️' },
  { type: 'guesthouse', label: 'Chambre d\'hôte',      icon: '🏡' },
]
```

Import it in `DensityCategoryDialog` and `DensityLegend` from its existing path:
```typescript
import { ACCOMMODATION_SUB_TYPES } from '@/app/(app)/map/[id]/_components/accommodation-sub-types'
```

### DB Schema Change

```typescript
// packages/database/src/schema/adventures.ts — ADD after densityProgress:
densityCategories: text('density_categories').array().notNull().default([]),
```

```sql
-- packages/database/migrations/0005_add_density_categories.sql
ALTER TABLE "adventures" ADD COLUMN IF NOT EXISTS "density_categories" text[] NOT NULL DEFAULT '{}';
```

### Cache Key Update in Processor (IMPORTANT)

The existing Redis cache key (`density:troncon:${segmentId}:${fromKm}:${toKm}`) does NOT include categories. If a user runs the analysis twice with different categories, the old cached count (from different categories) would be returned incorrectly.

**New cache key format:**
```typescript
const sortedCategories = [...categories].sort().join(',')
const cacheKey = `density:troncon:${segmentId}:${troncon.fromKm}:${troncon.toKm}:${sortedCategories}`
```

Sort is required to normalize order (e.g. `['hostel','hotel']` === `['hotel','hostel']`).

### Shared Types Update

```typescript
// packages/shared/src/types/adventure.types.ts

// ADD constant:
export const DENSITY_ACCOMMODATION_CATEGORIES = ['hotel', 'camp_site', 'shelter', 'hostel', 'guesthouse'] as const
export type DensityAccommodationCategory = typeof DENSITY_ACCOMMODATION_CATEGORIES[number]

// UPDATE DensityStatusResponse:
export interface DensityStatusResponse {
  densityStatus: DensityStatus
  densityProgress: number  // 0–100
  coverageGaps: CoverageGapSummary[]
  densityCategories: string[]  // ADD THIS — empty array when no analysis run yet
}
```

Export `DENSITY_ACCOMMODATION_CATEGORIES` from `packages/shared/src/index.ts`.

### DTO Validation

```typescript
// apps/api/src/density/dto/trigger-density.dto.ts
import { IsUUID, IsArray, IsString, IsIn } from 'class-validator'
import { DENSITY_ACCOMMODATION_CATEGORIES } from '@ridenrest/shared'

export class TriggerDensityDto {
  @IsUUID()
  adventureId!: string

  @IsArray()
  @IsString({ each: true })
  @IsIn([...DENSITY_ACCOMMODATION_CATEGORIES], { each: true })
  categories!: string[]
}
```

### DensityService changes

```typescript
// apps/api/src/density/density.service.ts
async triggerAnalysis(adventureId: string, userId: string, categories: string[]): Promise<{ message: string }> {
  // ... existing validation ...
  await this.densityRepo.saveDensityCategories(adventureId, categories)  // BEFORE queue.add
  await this.densityRepo.setDensityStatus(adventureId, 'pending')
  await this.densityRepo.setDensityProgress(adventureId, 0)
  await this.queue.add('analyze-density', { adventureId, segmentIds, categories })
  return { message: 'Density analysis started' }
}

async getStatus(adventureId: string, userId: string): Promise<DensityStatusResponse> {
  const adventure = await this.densityRepo.findByAdventureId(adventureId, userId)
  // ...
  return {
    densityStatus: adventure.densityStatus,
    densityProgress: adventure.densityProgress,
    coverageGaps,
    densityCategories: adventure.densityCategories,  // ADD
  }
}
```

### DensityCategoryDialog Component Design

```tsx
// apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx
'use client'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ACCOMMODATION_SUB_TYPES } from '@/app/(app)/map/[id]/_components/accommodation-sub-types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (categories: string[]) => void
  isLoading?: boolean
}

export function DensityCategoryDialog({ open, onOpenChange, onConfirm, isLoading }: Props) {
  const allTypes = ACCOMMODATION_SUB_TYPES.map(({ type }) => type)
  const [selected, setSelected] = useState<Set<string>>(new Set(allTypes))

  // Reset to all-selected whenever dialog opens
  useEffect(() => {
    if (open) setSelected(new Set(allTypes))
  }, [open])  // allTypes is stable (module-level constant) — safe to omit from deps

  const toggle = (type: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Catégories à analyser</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Sélectionne les types d&apos;hébergements à inclure dans l&apos;analyse de densité.
        </p>
        <div className="flex flex-wrap gap-2 py-2">
          {ACCOMMODATION_SUB_TYPES.map(({ type, label, icon }) => {
            const isActive = selected.has(type)
            return (
              <button
                key={type}
                onClick={() => toggle(type)}
                aria-pressed={isActive}
                className={[
                  'text-sm px-3 py-1.5 rounded-full font-medium border',
                  isActive
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-muted text-muted-foreground border-[--border] opacity-60',
                ].join(' ')}
              >
                {icon} {label}
              </button>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button
            disabled={selected.size === 0 || isLoading}
            onClick={() => onConfirm([...selected])}
          >
            {isLoading ? 'Lancement…' : 'Lancer l\'analyse'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

### DensityTriggerButton — "Densité calculée" label (AC6)

When `densityStatus?.densityStatus === 'success'`, the button label changes to `'Densité calculée'`. The button remains clickable to open the dialog and re-run the analysis.

```tsx
const isDone = densityStatus?.densityStatus === 'success'

// Button label:
{isAnalyzing ? `Analyse en cours… ${progress}%` : isDone ? 'Densité calculée' : 'Calculer la densité'}
```

### DensityTriggerButton Update

```tsx
// apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx
// Key changes:
const [dialogOpen, setDialogOpen] = useState(false)

const triggerMutation = useMutation({
  mutationFn: (categories: string[]) => triggerDensityAnalysis(adventureId, categories),
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ['density', adventureId] })
    toast.success('Analyse de densité démarrée')
    setDialogOpen(false)
  },
  // onError unchanged
})

const handleConfirm = (categories: string[]) => {
  triggerMutation.mutate(categories)
}

// Button onClick:
onClick={() => setDialogOpen(true)}

// Render dialog:
<DensityCategoryDialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  onConfirm={handleConfirm}
  isLoading={triggerMutation.isPending}
/>
```

### DensityLegend Categories Label

```tsx
// In DensityLegend, add after the Separator:
{densityCategories && densityCategories.length > 0 && (
  <div className="mt-1">
    <p className="text-xs text-muted-foreground">
      Analysé : {
        densityCategories
          .map(cat => ACCOMMODATION_SUB_TYPES.find(t => t.type === cat))
          .filter(Boolean)
          .map(t => `${t!.icon} ${t!.label}`)
          .join(' + ')
      }
    </p>
  </div>
)}
```

### api-client.ts Signature Update

```typescript
export async function triggerDensityAnalysis(adventureId: string, categories: string[]): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/api/density/analyze', {
    method: 'POST',
    body: JSON.stringify({ adventureId, categories }),
  })
}
```

### useDensity Hook Update

```typescript
interface UseDensityResult {
  coverageGaps: CoverageGapSummary[]
  densityStatus: DensityStatus
  densityCategories: string[]  // ADD
  isPending: boolean
}

// In return:
return {
  coverageGaps: data?.coverageGaps ?? [],
  densityStatus: data?.densityStatus ?? 'idle',
  densityCategories: data?.densityCategories ?? [],  // ADD
  isPending,
}
```

### map-view.tsx Update

```tsx
const { coverageGaps, densityStatus, densityCategories } = useDensity(adventureId)

// Pass to DensityLegend:
{densityStatus === 'success' && (
  <div className="absolute bottom-16 right-4 z-10">
    <DensityLegend densityCategories={densityCategories} />
  </div>
)}
```

### Project Structure Notes

**Files to CREATE:**
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` — NEW modal component
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.test.tsx` — NEW tests
- `packages/database/migrations/0005_add_density_categories.sql` — NEW migration

**Files to MODIFY:**
- `packages/database/src/schema/adventures.ts` — add `densityCategories` column
- `packages/shared/src/types/adventure.types.ts` — add constant + update `DensityStatusResponse`
- `packages/shared/src/index.ts` — export `DENSITY_ACCOMMODATION_CATEGORIES`
- `apps/api/src/density/dto/trigger-density.dto.ts` — add `categories` field
- `apps/api/src/density/density.repository.ts` — add `saveDensityCategories()`, include `densityCategories` in status
- `apps/api/src/density/density.service.ts` — pass categories through + include in status response
- `apps/api/src/density/density.controller.ts` — pass `dto.categories` to service
- `apps/api/src/density/jobs/density-analyze.processor.ts` — dynamic categories + updated cache key
- `apps/api/src/density/density.service.test.ts` — update tests with categories arg
- `apps/web/src/lib/api-client.ts` — add `categories` param to `triggerDensityAnalysis`
- `apps/web/src/hooks/use-density.ts` — expose `densityCategories`
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx` — dialog integration
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.test.tsx` — update tests
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx` — add categories label
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx` — add categories tests
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — pass `densityCategories` to `DensityLegend`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — header redesign (Task 17)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` — update tests for new layout

### Key Conventions from project-context.md

- **Import shared constants** from `@ridenrest/shared` — never duplicate in app code
- **Zustand store** naming: `use{Domain}Store` — no store change needed for this story (modal state is local)
- **TanStack Query keys**: `['density', adventureId]` — already correct, no change
- **NestJS**: service throws `HttpExceptions`, controller has NO try/catch
- **Testing**: Vitest for `apps/web`, Jest for `apps/api` — co-located `.test.ts` files
- **shadcn/ui Dialog**: use existing Dialog primitives from `@/components/ui/dialog`
- **Tailwind classes**: `bg-primary text-primary-foreground` for active chips, `bg-muted text-muted-foreground opacity-60` for inactive

### Dependency Chain

```
packages/database (schema + migration)
  → packages/shared (types + constant)
    → apps/api (DTO → repository → service → controller → processor)
      → apps/web (api-client → hook → dialog component → trigger button → legend)
```

Implement in this order to avoid TS compilation errors mid-development.

### Previous Story Intelligence (8.6)

- `ACCOMMODATION_SUB_TYPES` is **exported** from `accommodation-sub-types.tsx` — just import it, no copy-paste
- `computeAccCountByType` helper is also exported but NOT needed in this story
- Code review from 8.6 extracted shared helpers to avoid duplication — same principle applies here: one source of truth for sub-type labels/icons

### References

- Story 5.1 (density trigger): `_bmad-output/implementation-artifacts/5-1-trigger-density-analysis-async-job-processing.md`
- DB schema: `packages/database/src/schema/adventures.ts` — current columns
- Processor: `apps/api/src/density/jobs/density-analyze.processor.ts` — hardcoded ACCOMMODATION_CATEGORIES on line 29
- Shared types: `packages/shared/src/types/adventure.types.ts` — DensityStatusResponse (line ~45)
- Trigger button: `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx`
- Density legend: `apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx`
- ACCOMMODATION_SUB_TYPES: `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx:5`
- Migration pattern: `packages/database/migrations/0004_add_density_progress.sql`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented full dependency chain: DB schema → shared types → NestJS backend → Next.js frontend → tests
- Migration applied via custom `migrate-density-categories.mjs` script (no db:migrate script in package.json — consistent with existing pattern `migrate-progress.mjs`)
- `DENSITY_ACCOMMODATION_CATEGORIES` constant in `@ridenrest/shared` drives validation in DTO and serves as single source of truth — frontend imports `ACCOMMODATION_SUB_TYPES` from accommodation-sub-types.tsx (5th category `guesthouse` added vs old hardcoded 4-item list)
- Cache key updated to include sorted categories: old keys invalidated naturally (cache miss = fresh Overpass query)
- Dialog resets to all-5-selected on every open (AC5) via `useEffect` dependency on `open`
- "Densité calculée" label implemented (AC6): button still clickable to re-run analysis
- Processor test updated to include `categories` in job payload fixture
- **Task 17 / AC7**: Adventure detail page redesigned — flex header with title+stats left, action buttons right; "Supprimer l'aventure" moved to bottom pill button; label renamed "Calculer la densité" + LayoutGrid icon on DensityTriggerButton; "Voir la carte" gets Map icon + solid primary style; stats row shows Route+distance and TrendingUp+D+ only when > 0
- `totalElevationGainM` added to `AdventureResponse` shared type and `adventures.service.ts#toResponse()` to expose it to the frontend
- **UI Polish (post-review)**: All pill CTA buttons standardized to `size="lg" rounded-full px-6 py-6` — applies to DensityTriggerButton, "Voir la carte", "+ Ajouter un segment", "Nouvelle aventure" (create-adventure-dialog), and DensityCategoryDialog footer buttons ("Annuler" + "Lancer l'analyse")
- Adventure detail page: `space-y-6` → `space-y-10` for better section breathing room
- Segment card: "Afficher sur la carte" button removed (was disabled/placeholder); grip icon moved inside the card (left side, vertically centered) via `dragHandle` prop on SegmentCard; entire card is now the drag target (listeners on outer div) with `activationConstraint: { distance: 8 }` on PointerSensor to preserve click interactions on dropdown/buttons

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Add `@ArrayMinSize(1)` to `TriggerDensityDto.categories` — API accepted `categories: []`, enqueuing a job with no categories [apps/api/src/density/dto/trigger-density.dto.ts:8]
- [x] [AI-Review][MEDIUM] Add test verifying job categories are passed to `queryPois` (dynamic extraction from job.data not covered) [apps/api/src/density/jobs/density-analyze.processor.test.ts]
- [x] [AI-Review][MEDIUM] Fix `density-legend.test.tsx` mock labels diverging from real `ACCOMMODATION_SUB_TYPES` ('Hôtels'/'Auberges' → 'Hôtel'/'Auberge de jeunesse') [apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx:17-20]
- [x] [AI-Review][MEDIUM] Move `allTypes` outside `DensityCategoryDialog` component to fix `useEffect` exhaustive-deps ESLint warning [apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx:15]
- [x] [AI-Review][MEDIUM] Add `size="lg"` and `py-6` to `+ Ajouter un segment` button for consistent pill style [apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx:359]
- [x] [AI-Review][LOW] Add `apps/api/uploads/` to root `.gitignore` to prevent user GPX files from being accidentally committed [.gitignore]
- [ ] [AI-Review][LOW] `DensityTriggerButton` uses `variant="ghost"` vs AC7-specified `variant="outline"` — deliberate post-review polish, but diverges from spec; confirm with design if this is the final intent [apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx:58]

### File List

**Created:**
- `packages/database/migrations/0005_add_density_categories.sql`
- `packages/database/migrate-density-categories.mjs`
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.test.tsx`

**Modified:**
- `packages/database/src/schema/adventures.ts`
- `packages/shared/src/types/adventure.types.ts`
- `packages/shared/src/index.ts`
- `apps/api/src/density/dto/trigger-density.dto.ts`
- `apps/api/src/density/density.repository.ts`
- `apps/api/src/density/density.service.ts`
- `apps/api/src/density/density.controller.ts`
- `apps/api/src/density/jobs/density-analyze.processor.ts`
- `apps/api/src/density/jobs/density-analyze.processor.test.ts`
- `apps/api/src/density/density.service.test.ts`
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/hooks/use-density.ts`
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/api/src/adventures/adventures.service.ts` — add `totalElevationGainM` to `toResponse()`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — header redesign (Task 17) + space-y-10 + PointerSensor activationConstraint
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` — update tests for new layout
- `apps/web/src/app/(app)/adventures/_components/create-adventure-dialog.tsx` — pill button style (size="lg" rounded-full px-6 py-6)
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` — footer buttons pill style (size="lg" rounded-full px-6 py-6)
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — removed "Afficher sur la carte", added dragHandle prop
- `apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.tsx` — grip moved inside card, listeners on full card div

**Modified by code review:**
- `apps/api/src/density/dto/trigger-density.dto.ts` — add `@ArrayMinSize(1)` (H1)
- `apps/api/src/density/jobs/density-analyze.processor.test.ts` — add test verifying categories passed to queryPois (M1)
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx` — align mock labels with real ACCOMMODATION_SUB_TYPES (M2)
- `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` — move allTypes outside component (M3)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — add size="lg" py-6 to "+ Ajouter un segment" (M4)
- `.gitignore` — add apps/api/uploads/ (L1)
