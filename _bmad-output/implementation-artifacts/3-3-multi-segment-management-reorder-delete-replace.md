# Story 3.3: Multi-Segment Management (Reorder, Delete, Replace)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to reorder, delete, and replace GPX segments in my adventure,
So that I can adjust my route incrementally as my plans evolve.

## Acceptance Criteria

1. **Given** an adventure has multiple segments and a user drags a segment to a new position,
   **When** the reorder mutation completes,
   **Then** `order_index` values are updated for all affected segments, `cumulative_start_km` is recomputed for the full adventure, and the new order is reflected in the UI — no page reload (FR-012, FR-015).

2. **Given** a user clicks "Supprimer" on a segment and confirms via a dialog,
   **When** the delete request completes,
   **Then** the segment record and its associated GPX file on Fly.io volume (`/data/gpx/{segmentId}.gpx`) are deleted, cumulative distances are recomputed, and the segment disappears from the list (FR-013, FR-015).

3. **Given** a user clicks "Remplacer" on a segment and uploads a new GPX file,
   **When** the new file is uploaded via `POST /adventures/:id/segments` (new segment appended),
   **Then** the old GPX file is deleted from Fly.io volume, a new segment job is enqueued with `parse_status: 'pending'`, and the UI shows a loading skeleton for that segment (FR-014).

4. **Given** a user deletes the last segment of an adventure,
   **When** deletion completes,
   **Then** the adventure record remains (`total_distance_km: 0`), `total_distance_km` is updated to 0, and the "Ajouter un segment GPX" upload form appears automatically.

5. **Given** the reorder operation encounters a network error,
   **When** the mutation fails,
   **Then** the optimistic UI update is rolled back (original order restored) and a destructive toast "Erreur lors du réordonnancement" is shown.

6. **Given** a segment has `parse_status: 'pending'` or `'processing'`,
   **When** the user drags it,
   **Then** the segment card is still draggable — reorder works regardless of parse status.

## Tasks / Subtasks

### Backend — NestJS API

- [x] Task 1 — Add `reorderSegments` endpoint (AC: #1, #5)
  - [x] 1.1 Create `apps/api/src/segments/dto/reorder-segments.dto.ts` — `{ orderedIds: string[] }` with `@IsArray()`, `@IsUUID('4', { each: true })`, `@ArrayNotEmpty()`
  - [x] 1.2 Add `PATCH /adventures/:adventureId/segments/reorder` in `segments.controller.ts` — calls `segmentsService.reorderSegments(adventureId, userId, dto.orderedIds)`
  - [x] 1.3 Implement `SegmentsService.reorderSegments(adventureId, userId, orderedIds)`:
    - Call `adventuresService.verifyOwnership(adventureId, userId)`
    - Fetch all segments for the adventure
    - Validate that `orderedIds` contains exactly the same segment IDs as existing segments (same count, no extras, no missing) — throw `BadRequestException` if mismatch
    - Assign new `orderIndex` based on position in `orderedIds` array (index 0, 1, 2...)
    - Call `segmentsRepo.updateOrderIndexes(updates)` in a single batch
    - Call `this.recomputeCumulativeDistances(adventureId)`
    - Return `listSegments(adventureId, userId)` — full updated segment list
  - [x] 1.4 Implement `SegmentsRepository.updateOrderIndexes(updates: Array<{ id: string; orderIndex: number }>)` — batch update using `Promise.all`

- [x] Task 2 — Add `deleteSegment` endpoint (AC: #2, #4)
  - [x] 2.1 Add `DELETE /adventures/:adventureId/segments/:segmentId` in `segments.controller.ts` — calls `segmentsService.deleteSegment(adventureId, segmentId, userId)`
  - [x] 2.2 Implement `SegmentsService.deleteSegment(adventureId, segmentId, userId)`:
    - Call `segmentsRepo.findByIdAndUserId(segmentId, userId)` — throw `NotFoundException` if null
    - Call `segmentsRepo.delete(segmentId)`
    - Delete file: `fs.unlink(segment.storageUrl).catch(() => undefined)` — silent on missing file
    - Call `this.recomputeCumulativeDistances(adventureId)` — handles 0 segments (sets `totalDistanceKm: 0`)
    - Return `{ deleted: true }`
  - [x] 2.3 Implement `SegmentsRepository.delete(segmentId: string)` — `db.delete(adventureSegments).where(eq(adventureSegments.id, segmentId))`
  - [x] 2.4 Ensure `recomputeCumulativeDistances` handles empty segments array correctly — cumulative = 0, total = 0

- [x] Task 3 — Add `replaceSegment` endpoint (AC: #3)
  - [x] 3.1 Add `DELETE /adventures/:adventureId/segments/:segmentId` already covers "delete old segment" — replace is implemented as: DELETE old + POST new (two separate client calls, NOT a special replace endpoint)
  - [x] **Implementation note**: The "replace" UX is handled client-side: user clicks "Remplacer" → existing DELETE is called → upload form appears → POST new segment. No dedicated replace endpoint needed (simpler, already covered by existing endpoints).

- [x] Task 4 — Backend tests (Jest)
  - [x] 4.1 `segments.service.test.ts` — add tests:
    - `reorderSegments`: validates orderedIds mismatch throws BadRequestException
    - `reorderSegments`: correctly assigns new order_index and calls recomputeCumulative
    - `deleteSegment`: throws NotFoundException when segment not found
    - `deleteSegment`: calls fs.unlink + repo.delete + recomputeCumulative
  - [x] 4.2 Follow existing test patterns in `segments.service.test.ts`

### Frontend — Next.js Web

- [x] Task 5 — Install `@dnd-kit` packages (AC: #1, #6)
  - [x] 5.1 From `apps/web`: `pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
  - [x] 5.2 Verify install: `@dnd-kit/core` ≥ 6.3, `@dnd-kit/sortable` ≥ 8.0 (React 19 compatible)

- [x] Task 6 — Add API client functions (AC: #1, #2)
  - [x] 6.1 In `apps/web/src/lib/api-client.ts`, add:
    ```typescript
    export async function reorderSegments(adventureId: string, orderedIds: string[]): Promise<AdventureSegmentResponse[]> {
      return apiFetch<AdventureSegmentResponse[]>(`/api/adventures/${adventureId}/segments/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ orderedIds }),
      })
    }

    export async function deleteSegment(adventureId: string, segmentId: string): Promise<void> {
      await apiFetch<{ deleted: boolean }>(`/api/adventures/${adventureId}/segments/${segmentId}`, {
        method: 'DELETE',
      })
    }
    ```

- [x] Task 7 — Create `sortable-segment-card.tsx` — drag handle wrapper (AC: #1, #6)
  - [x] 7.1 Create `apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.tsx`:
    - Uses `useSortable` from `@dnd-kit/sortable`
    - Renders a drag handle (`GripVertical` icon from lucide-react) + existing `<SegmentCard>`
    - Applies `transform` and `transition` styles from `CSS.Transform.toString(transform)`
    - Passes `onDelete` and `onReplace` props down to `<SegmentCard>`

- [x] Task 8 — Update `segment-card.tsx` — add Delete + Replace actions (AC: #2, #3)
  - [x] 8.1 Add `onDelete: () => void` and `onReplace: () => void` to `SegmentCardProps`
  - [x] 8.2 In `done` state: add a "..." menu (shadcn `DropdownMenu`) with two items: "Remplacer" (calls `onReplace`) and "Supprimer" (calls `onDelete`)
  - [x] 8.3 In `error` state: keep "Réessayer" button; also add "Supprimer" button calling `onDelete`
  - [x] 8.4 In `pending`/`processing` state: no delete/replace actions (segment is being processed)
  - [x] 8.5 Confirm delete via `AlertDialog` (shadcn) — show segment name — "Supprimer" + "Annuler"

- [x] Task 9 — Update `adventure-detail.tsx` — sortable list + mutations (AC: #1–#6)
  - [x] 9.1 Wrap segment list with `<DndContext>` + `<SortableContext>` from `@dnd-kit`
  - [x] 9.2 Add `useMutation` for `reorderSegments`:
    - `onMutate`: optimistic update — snapshot current segments, update queryClient cache with reordered list
    - `onError`: rollback via `queryClient.setQueryData`
    - `onSettled`: `queryClient.invalidateQueries(['adventures', adventureId, 'segments'])`
    - On mutation error: `toast.error('Erreur lors du réordonnancement')`
  - [x] 9.3 Add `useMutation` for `deleteSegment`:
    - `onSuccess`: `queryClient.invalidateQueries` on segments + adventure (total distance updates)
    - On success: `toast.success('Segment supprimé')`
    - On error: `toast.error('Erreur lors de la suppression')`
  - [x] 9.4 Handle replace flow: `onReplace` → set `replacingSegmentId` state → call `deleteSegment` mutation → on success, `setShowUploadForm(true)`
  - [x] 9.5 `handleDragEnd` callback: extract new order from `DragEndEvent`, call `reorderSegments` mutation
  - [x] 9.6 Render `<SortableSegmentCard>` for each segment passing `onDelete` and `onReplace` handlers

- [x] Task 10 — Frontend tests (Vitest)
  - [x] 10.1 `segment-card.test.tsx` — add tests for delete/replace actions in `done` state (mock `onDelete`, `onReplace` props)
  - [x] 10.2 `adventure-detail.test.tsx` — add test: optimistic rollback on reorder mutation error

---

## Dev Notes

### CRITICAL: What's Already Done (Stories 3.1 + 3.2) — Do NOT Redo

**`apps/api` — existing infrastructure:**
- ✅ `SegmentsController` at `apps/api/src/segments/` — currently has `POST` + `GET` only. **Add** `PATCH reorder` + `DELETE :segmentId`
- ✅ `SegmentsService.recomputeCumulativeDistances(adventureId)` — already implemented, reuse as-is
- ✅ `SegmentsRepository.findByIdAndUserId(segmentId, userId)` — ownership check pattern, reuse
- ✅ `SegmentsRepository.updateCumulativeDistances()` — already implemented
- ✅ `AdventuresService.verifyOwnership(adventureId, userId)` — reuse pattern
- ✅ `GPX_STORAGE_PATH` const in `segments.service.ts` — use for delete: `path.join(GPX_STORAGE_PATH, \`${segmentId}.gpx\`)`

**`apps/web` — existing infrastructure:**
- ✅ `adventure-detail.tsx` — has `showUploadForm` state, `sonner` toast, `shouldPoll`, polling query
- ✅ `segment-card.tsx` — has 4-state UI (pending/processing/done/error). **Extend** with delete/replace actions
- ✅ `gpx-upload-form.tsx` — has `onSuccess?: () => void` prop (added in 3.2). Reuse for "replace" flow
- ✅ `api-client.ts` — has `apiFetch`, `createSegment`, `listSegments`. **Add** `reorderSegments`, `deleteSegment`
- ✅ `sonner` package installed (`^2.0.7`). API: `toast.success()` / `toast.error()` — NOT `useToast`

---

### Architecture: API Endpoints to Add

```
PATCH /api/adventures/:adventureId/segments/reorder
  Body: { orderedIds: string[] }          ← array of all segment IDs in new order
  Response: AdventureSegmentResponse[]    ← full updated list
  Auth: JwtAuthGuard (global)
  Validates: orderedIds must match exactly all segment IDs for this adventure

DELETE /api/adventures/:adventureId/segments/:segmentId
  Response: { deleted: true }
  Auth: JwtAuthGuard (global)
  Side effects: unlink Fly.io file, recompute cumulative distances
```

**⚠️ Route order in NestJS matters**: `PATCH .../reorder` must be registered BEFORE any `PATCH .../:segmentId` (if added later). Since we only add `PATCH` for reorder (no generic `PATCH /:id`), no conflict for this story.

**Replace = Delete + New Upload** (no dedicated endpoint): The UX flow is:
1. User clicks "Remplacer" on a segment
2. Client calls `DELETE /segments/:segmentId` (deletes old file + DB record)
3. Upload form appears → user uploads new GPX → `POST /segments` (existing endpoint)
4. New segment appended at end (orderIndex = count after deletion)

---

### Architecture: Drag-and-Drop with @dnd-kit

**Why @dnd-kit** (not react-beautiful-dnd or HTML5): React 19 compatible, no deprecated `findDOMNode`, accessibility-first, composable.

**Pattern for `adventure-detail.tsx`:**

```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'

// In component:
const sensors = useSensors(
  useSensor(PointerSensor),
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
)

function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event
  if (!over || active.id === over.id) return

  const oldIndex = segments.findIndex((s) => s.id === active.id)
  const newIndex = segments.findIndex((s) => s.id === over.id)
  const reordered = arrayMove(segments, oldIndex, newIndex)
  const orderedIds = reordered.map((s) => s.id)

  reorderMutation.mutate({ adventureId, orderedIds })
}

// In JSX:
<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
  <SortableContext items={segments.map(s => s.id)} strategy={verticalListSortingStrategy}>
    {segments.map((segment) => (
      <SortableSegmentCard
        key={segment.id}
        segment={segment}
        onDelete={() => handleDelete(segment.id)}
        onReplace={() => handleReplace(segment.id)}
      />
    ))}
  </SortableContext>
</DndContext>
```

**Pattern for `sortable-segment-card.tsx`:**

```typescript
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { SegmentCard } from './segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

interface SortableSegmentCardProps {
  segment: AdventureSegmentResponse
  onDelete: () => void
  onReplace: () => void
}

export function SortableSegmentCard({ segment, onDelete, onReplace }: SortableSegmentCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: segment.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      <button
        className="mt-3 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
        aria-label="Réordonner le segment"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <SegmentCard segment={segment} onDelete={onDelete} onReplace={onReplace} onRetry={onReplace} />
      </div>
    </div>
  )
}
```

---

### Architecture: Optimistic Update Pattern (TanStack Query v5)

```typescript
const queryClient = useQueryClient()
const segmentsQueryKey = ['adventures', adventureId, 'segments'] as const

const reorderMutation = useMutation({
  mutationFn: ({ orderedIds }: { orderedIds: string[] }) =>
    reorderSegments(adventureId, orderedIds),

  onMutate: async ({ orderedIds }) => {
    // Cancel in-flight queries to prevent overwriting optimistic update
    await queryClient.cancelQueries({ queryKey: segmentsQueryKey })

    // Snapshot for rollback
    const previousSegments = queryClient.getQueryData<AdventureSegmentResponse[]>(segmentsQueryKey)

    // Optimistic update — reorder in cache
    if (previousSegments) {
      const reordered = orderedIds
        .map((id) => previousSegments.find((s) => s.id === id))
        .filter(Boolean) as AdventureSegmentResponse[]
      queryClient.setQueryData(segmentsQueryKey, reordered)
    }

    return { previousSegments }
  },

  onError: (_err, _vars, context) => {
    // Rollback
    if (context?.previousSegments) {
      queryClient.setQueryData(segmentsQueryKey, context.previousSegments)
    }
    toast.error('Erreur lors du réordonnancement')
  },

  onSettled: () => {
    // Always sync with server
    queryClient.invalidateQueries({ queryKey: segmentsQueryKey })
  },
})
```

---

### Architecture: Delete Confirmation Dialog

Use shadcn `AlertDialog` (install via `pnpm dlx shadcn@latest add alert-dialog` from `apps/web` if missing).

```typescript
// In segment-card.tsx:
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

// Usage inside DropdownMenu 'done' state:
<AlertDialog>
  <AlertDialogTrigger asChild>
    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
      Supprimer
    </DropdownMenuItem>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Supprimer "{name ?? 'ce segment'}" ?</AlertDialogTitle>
      <AlertDialogDescription>
        Cette action est irréversible. Le fichier GPX sera définitivement supprimé.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Annuler</AlertDialogCancel>
      <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
        Supprimer
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**⚠️ `onSelect={(e) => e.preventDefault()}`**: Required on `DropdownMenuItem` wrapping the `AlertDialogTrigger` — prevents the dropdown from closing before the dialog opens.

---

### Architecture: Replace Flow in `adventure-detail.tsx`

```typescript
// State for replace flow
const [replacingSegmentId, setReplacingSegmentId] = useState<string | null>(null)

const deleteMutation = useMutation({
  mutationFn: (segmentId: string) => deleteSegment(adventureId, segmentId),
  onSuccess: (_data, segmentId) => {
    queryClient.invalidateQueries({ queryKey: segmentsQueryKey })
    queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] }) // refresh totalDistanceKm
    toast.success('Segment supprimé')
    // If this was a replace flow, show upload form
    if (replacingSegmentId === segmentId) {
      setShowUploadForm(true)
      setReplacingSegmentId(null)
    }
  },
  onError: () => toast.error('Erreur lors de la suppression'),
})

function handleDelete(segmentId: string) {
  setReplacingSegmentId(null)
  deleteMutation.mutate(segmentId)
}

function handleReplace(segmentId: string) {
  setReplacingSegmentId(segmentId)
  deleteMutation.mutate(segmentId)
}
```

---

### Architecture: ReorderSegments DTO (NestJS)

```typescript
// apps/api/src/segments/dto/reorder-segments.dto.ts
import { IsArray, IsUUID, ArrayNotEmpty } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class ReorderSegmentsDto {
  @ApiProperty({ type: [String], example: ['uuid-1', 'uuid-2'] })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  orderedIds!: string[]
}
```

---

### Architecture: `recomputeCumulativeDistances` — Edge Case: 0 Segments

The existing implementation in `segments.service.ts` already handles 0 segments:
```typescript
const segments = await this.segmentsRepo.findAllByAdventureId(adventureId) // returns []
let cumulative = 0
const updates = segments.map(...) // returns [] — no-op
await this.segmentsRepo.updateCumulativeDistances([]) // early return if length=0
await this.adventuresService.updateTotalDistance(adventureId, 0) // sets totalDistanceKm = 0 ✅
```

**No changes needed** — AC #4 is handled automatically.

---

### Project Structure Notes

**Files to MODIFY (API):**
```
apps/api/src/segments/segments.controller.ts     ← add PATCH reorder + DELETE :segmentId
apps/api/src/segments/segments.service.ts        ← add reorderSegments(), deleteSegment()
apps/api/src/segments/segments.repository.ts     ← add updateOrderIndexes(), delete()
apps/api/src/segments/segments.service.test.ts   ← add tests for new methods
```

**Files to CREATE (API):**
```
apps/api/src/segments/dto/reorder-segments.dto.ts   ← already in architecture plan
```

**Files to MODIFY (Web):**
```
apps/web/src/lib/api-client.ts                          ← add reorderSegments(), deleteSegment()
apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx   ← DndContext, mutations
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx       ← add delete/replace actions
```

**Files to CREATE (Web):**
```
apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.tsx   ← new DnD wrapper
apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.test.tsx   ← tests
```

**No new NestJS modules** — `segments.module.ts` already exists and covers these endpoints.

---

### Anti-Patterns to Avoid

```typescript
// ❌ Custom replace endpoint on API
PUT /adventures/:id/segments/:segmentId/replace
// ✅ Replace = DELETE old + POST new (simpler, reuses existing infrastructure)

// ❌ Don't import from subpath
import type { AdventureSegmentResponse } from '@ridenrest/shared/types'
// ✅ Root import only (story 3.1 confirmed pattern)
import type { AdventureSegmentResponse } from '@ridenrest/shared'

// ❌ Using shadcn useToast / Toaster
import { useToast } from '@/components/ui/use-toast'
// ✅ Sonner (installed since story 3.2)
import { toast } from 'sonner'
toast.success('...')
toast.error('...')

// ❌ Drizzle query in service
const segments = await db.select().from(adventureSegments)...
// ✅ Always via repository
this.segmentsRepo.findAllByAdventureId(adventureId)

// ❌ Controller try/catch
try { ... } catch { throw new ... }
// ✅ Service throws HttpException → HttpExceptionFilter handles globally

// ❌ Return { success: true, data: ... } from controller
return { success: true, segments }
// ✅ Return raw data — ResponseInterceptor wraps automatically
return segments

// ❌ react-beautiful-dnd (deprecated, doesn't support React 19, uses findDOMNode)
// ✅ @dnd-kit/core + @dnd-kit/sortable (React 19 compatible, accessible)

// ❌ Forgetting to prevent DropdownMenu close when opening AlertDialog
<DropdownMenuItem onClick={() => setDialogOpen(true)}>Supprimer</DropdownMenuItem>
// ✅ Use AlertDialogTrigger inside DropdownMenuItem with onSelect preventDefault
<AlertDialogTrigger asChild>
  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>Supprimer</DropdownMenuItem>
</AlertDialogTrigger>

// ❌ Forgetting to invalidate adventure query after delete (total distance won't update)
queryClient.invalidateQueries({ queryKey: segmentsQueryKey })
// ✅ Also invalidate adventure itself
queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
```

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.3 ACs, FR-012/013/014/015 definitions]
- [Source: _bmad-output/implementation-artifacts/3-2-parse-status-polling-notification.md — Sonner pattern, import rules, test setup, segment-card props, showUploadForm pattern]
- [Source: _bmad-output/implementation-artifacts/3-1-create-adventure-upload-gpx-segment.md — SegmentsService, GPX_STORAGE_PATH, ownership pattern, recomputeCumulativeDistances]
- [Source: apps/api/src/segments/segments.service.ts — recomputeCumulativeDistances impl, toResponse shape]
- [Source: apps/api/src/segments/segments.repository.ts — findByIdAndUserId, updateCumulativeDistances patterns]
- [Source: apps/api/src/segments/segments.controller.ts — existing PATCH/GET endpoints]
- [Source: apps/web/src/lib/api-client.ts — apiFetch pattern, existing API functions]
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx — showUploadForm state, shouldPoll, TanStack Query pattern]
- [Source: _bmad-output/project-context.md — NestJS module structure, TanStack query key convention, ResponseInterceptor rule, anti-patterns]
- [Source: _bmad-output/planning-artifacts/architecture.md — reorder-segments.dto.ts path, replace-segment.dto.ts path, Fly.io file access control pattern]

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `handleDragEnd` has no guard when `deleteMutation.isPending` — concurrent reorder+delete mutations possible [`adventure-detail.tsx:108`]
- [ ] [AI-Review][LOW] `DropdownMenuTrigger` not disabled during active delete — user can re-open menu while deletion is in progress [`segment-card.tsx:85`]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed nested `<button>` issue: `DropdownMenuTrigger` from base-ui renders its own `<button>`, so wrapping with `<Button asChild>` creates invalid HTML. Removed `asChild` + `Button` wrapper, applied classNames directly to `DropdownMenuTrigger`.
- Fixed `AlertDialog asChild` TS error: base-ui `AlertDialogPrimitive.Trigger` does not accept `asChild` prop (unlike Radix). Replaced with controlled state (`showDeleteDialog` useState) + `<AlertDialog open={...}>`.
- Fixed `distanceKm: null` TS error in test: `AdventureSegmentResponse.distanceKm` is `number` not `number | null`. Updated test template to use `distanceKm: 0` for pending segments.
- Fixed adventure-detail test for optimistic rollback: DnD drag events can't be simulated directly in tests. Mocked `DndContext` to expose a `data-testid="simulate-drag-end"` button that fires `onDragEnd`. Also added `fireEvent` to imports.

### Completion Notes List

- All 10 tasks and subtasks implemented and tested.
- Backend: `PATCH /adventures/:id/segments/reorder` and `DELETE /adventures/:id/segments/:id` added with ownership verification, file deletion, and cumulative distance recomputation.
- Frontend: `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` installed (React 19 compatible). New `SortableSegmentCard` wrapper with drag handle. `segment-card.tsx` extended with DropdownMenu (done state) and Supprimer button (error state). `adventure-detail.tsx` wraps list in DndContext with optimistic reorder mutation and delete mutation with replace flow.
- AC #4 (last segment deleted → adventure stays with `totalDistanceKm: 0`) confirmed handled by existing `recomputeCumulativeDistances` — no change needed.
- AC #6 (pending/processing segments draggable) confirmed: `SortableSegmentCard` wraps all parse states without restriction.
- `alert-dialog` shadcn component installed via `pnpm dlx shadcn@latest add alert-dialog`.

### File List

**API — Modified:**
- `apps/api/src/segments/segments.controller.ts`
- `apps/api/src/segments/segments.service.ts`
- `apps/api/src/segments/segments.repository.ts`
- `apps/api/src/segments/segments.service.test.ts`

**API — Created:**
- `apps/api/src/segments/dto/reorder-segments.dto.ts`

**Web — Modified:**
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx`

**Web — Created:**
- `apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.test.tsx`
- `apps/web/src/components/ui/alert-dialog.tsx`
