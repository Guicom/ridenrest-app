# Story 3.4: Adventure & Segment Rename and Delete

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to rename my adventure and individual segments, and delete an entire adventure,
So that I can keep my adventures organized and remove ones I no longer need.

## Acceptance Criteria

1. **Given** a user taps the adventure title and submits a new name,
   **When** the update request completes,
   **Then** the adventure name is updated in DB and reflected in the UI immediately — no page reload (FR-017).

2. **Given** a user opens a segment's action menu and selects "Renommer",
   **When** they submit a new name,
   **Then** the segment name is updated in DB and reflected in the segment card (FR-017).

3. **Given** a user clicks "Supprimer l'aventure" and the confirmation dialog appears,
   **When** they type the adventure name exactly and confirm,
   **Then** the adventure, all its segments, all GPX files on Fly.io volume, and all cached accommodations data are deleted — the user is redirected to the adventures list (FR-018).

4. **Given** a user opens the delete adventure dialog but does not type the adventure name correctly,
   **When** they attempt to click the confirm button,
   **Then** the button remains disabled — no deletion occurs.

5. **Given** a rename mutation fails (network error),
   **When** the error is received,
   **Then** the UI reverts to the original name and an error toast is shown.

## Tasks / Subtasks

### Review Follow-ups (AI)

- [x] [AI-Review][MEDIUM] Double-submit race: `onBlur` fires after Enter+unmount on adventure rename — guarded with `renameAdventureMutation.isPending` check [adventure-detail.tsx:257]
- [x] [AI-Review][MEDIUM] Same double-submit on segment rename: `onRename` called twice — fixed with `renameSubmittedRef` [segment-card.tsx:88]
- [x] [AI-Review][MEDIUM] Whitespace-only name passes `@IsNotEmpty()` — added `@Transform(({ value }) => value?.trim())` to both rename DTOs
- [x] [AI-Review][MEDIUM] Rename input allows repeated Enter while mutation in-flight — added `disabled={renameAdventureMutation.isPending}` [adventure-detail.tsx:247]
- [ ] [AI-Review][LOW] `updateName()` in both repos: no null-guard after `.returning()` — TOCTOU crash if record deleted mid-flight [adventures.repository.ts:43, segments.repository.ts:114]
- [ ] [AI-Review][LOW] Redundant `.catch(() => undefined)` inside `Promise.allSettled` — pick one or the other [adventures.service.ts:45]
- [ ] [AI-Review][LOW] Missing `@ApiProperty()` on `RenameAdventureDto` and `RenameSegmentDto` — Swagger shows empty body for new endpoints
- [ ] [AI-Review][LOW] `apps/api/uploads/gpx/*.gpx` test artifacts untracked in git — add `apps/api/uploads/` to `.gitignore`

### Backend — NestJS API

- [x] Task 1 — `PATCH /adventures/:id` — rename adventure (AC: #1, #5)
  - [x] 1.1 Create `apps/api/src/adventures/dto/rename-adventure.dto.ts`:
    ```typescript
    import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
    export class RenameAdventureDto {
      @IsString()
      @IsNotEmpty()
      @MaxLength(100)
      name!: string
    }
    ```
  - [x] 1.2 Add `@Patch(':id')` in `adventures.controller.ts` — calls `adventuresService.renameAdventure(id, user.id, dto.name)`
  - [x] 1.3 Add `renameAdventure(id, userId, name): Promise<AdventureResponse>` in `adventures.service.ts`:
    - Call `this.verifyOwnership(id, userId)` (already exists)
    - `return this.toResponse(await this.adventuresRepo.updateName(id, name))`
  - [x] 1.4 Add `updateName(id, name): Promise<Adventure>` in `adventures.repository.ts`:
    ```typescript
    const [row] = await db.update(adventures).set({ name, updatedAt: new Date() }).where(eq(adventures.id, id)).returning()
    return row as Adventure
    ```

- [x] Task 2 — `DELETE /adventures/:id` — delete adventure with full cascade (AC: #3, #4)
  - [x] 2.1 Add `@Delete(':id')` in `adventures.controller.ts` — calls `adventuresService.deleteAdventure(id, user.id)`
  - [x] 2.2 Add `deleteAdventure(id, userId): Promise<{ deleted: boolean }>` in `adventures.service.ts`:
    - Call `this.verifyOwnership(id, userId)`
    - `const storageUrls = await this.adventuresRepo.findSegmentStorageUrlsByAdventureId(id)` — get file paths BEFORE DB delete
    - `await this.adventuresRepo.deleteById(id)` — CASCADE deletes adventure_segments + accommodations_cache automatically
    - `await Promise.allSettled(storageUrls.map(url => fs.unlink(url).catch(() => undefined)))` — best-effort file cleanup
    - `return { deleted: true }`
    - **Import**: add `import * as fs from 'node:fs/promises'` at top of `adventures.service.ts`
  - [x] 2.3 Add two methods in `adventures.repository.ts`:
    ```typescript
    // Gets storageUrls of all segments for cascade file deletion — BEFORE DB delete
    async findSegmentStorageUrlsByAdventureId(adventureId: string): Promise<string[]> {
      const rows = await db
        .select({ storageUrl: adventureSegments.storageUrl })
        .from(adventureSegments)
        .where(eq(adventureSegments.adventureId, adventureId))
      return rows.filter(r => r.storageUrl).map(r => r.storageUrl!)
    }

    async deleteById(id: string): Promise<void> {
      await db.delete(adventures).where(eq(adventures.id, id))
    }
    ```
    - **Import**: add `adventureSegments` to the import from `@ridenrest/database` in `adventures.repository.ts`
    - **DB CASCADE chain**: `adventures → adventure_segments (onDelete: cascade) → accommodations_cache (onDelete: cascade)` — fully automatic, no manual segment deletion needed

- [x] Task 3 — `PATCH /adventures/:id/segments/:segmentId` — rename segment (AC: #2, #5)
  - [x] 3.1 Create `apps/api/src/segments/dto/rename-segment.dto.ts`:
    ```typescript
    import { IsString, IsNotEmpty, MaxLength } from 'class-validator'
    export class RenameSegmentDto {
      @IsString()
      @IsNotEmpty()
      @MaxLength(100)
      name!: string
    }
    ```
  - [x] 3.2 Add `@Patch(':segmentId')` in `segments.controller.ts` — **MUST be declared AFTER `@Patch('reorder')`** to avoid NestJS treating `'reorder'` as a `:segmentId` param:
    ```typescript
    @Patch(':segmentId')
    @ApiOperation({ summary: 'Rename a segment' })
    async rename(
      @CurrentUser() user: CurrentUserPayload,
      @Param('adventureId') adventureId: string,
      @Param('segmentId') segmentId: string,
      @Body() dto: RenameSegmentDto,
    ) {
      return this.segmentsService.renameSegment(adventureId, segmentId, user.id, dto.name)
    }
    ```
  - [x] 3.3 Add `renameSegment(adventureId, segmentId, userId, name): Promise<AdventureSegmentResponse>` in `segments.service.ts`:
    - `const segment = await this.segmentsRepo.findByIdAndUserId(segmentId, userId)` — throws NotFoundException if null
    - Verify `segment.adventureId === adventureId` — throw `BadRequestException` if mismatch
    - `return this.toResponse(await this.segmentsRepo.updateName(segmentId, name))`
  - [x] 3.4 Add `updateName(segmentId, name): Promise<AdventureSegment>` in `segments.repository.ts`:
    ```typescript
    const [row] = await db.update(adventureSegments).set({ name, updatedAt: new Date() }).where(eq(adventureSegments.id, segmentId)).returning()
    return row as AdventureSegment
    ```

- [x] Task 4 — Backend tests (Jest)
  - [x] 4.1 `adventures.service.test.ts` — add tests:
    - `renameAdventure`: calls verifyOwnership + repo.updateName, returns updated AdventureResponse
    - `renameAdventure`: throws NotFoundException when ownership fails (mock verifyOwnership to throw)
    - `deleteAdventure`: calls findSegmentStorageUrlsByAdventureId + deleteById + fs.unlink for each URL
    - `deleteAdventure`: still succeeds if storageUrls array is empty (no segments)
    - `deleteAdventure`: still returns `{ deleted: true }` even if fs.unlink fails (Promise.allSettled — no throw)
  - [x] 4.2 `segments.service.test.ts` — add tests:
    - `renameSegment`: calls findByIdAndUserId + repo.updateName, returns updated AdventureSegmentResponse
    - `renameSegment`: throws NotFoundException when segment not found
    - `renameSegment`: throws BadRequestException when adventureId mismatch
  - [x] 4.3 Follow existing test patterns (mock constructor deps, use `jest.spyOn`)

### Frontend — Next.js Web

- [x] Task 5 — Add API client functions in `apps/web/src/lib/api-client.ts` (AC: #1, #2, #3)
  - [x] 5.1 Add `renameAdventure`:
    ```typescript
    export async function renameAdventure(adventureId: string, name: string): Promise<AdventureResponse> {
      return apiFetch<AdventureResponse>(`/api/adventures/${adventureId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
    }
    ```
  - [x] 5.2 Add `renameSegment`:
    ```typescript
    export async function renameSegment(adventureId: string, segmentId: string, name: string): Promise<AdventureSegmentResponse> {
      return apiFetch<AdventureSegmentResponse>(`/api/adventures/${adventureId}/segments/${segmentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      })
    }
    ```
  - [x] 5.3 Add `deleteAdventure`:
    ```typescript
    export async function deleteAdventure(adventureId: string): Promise<void> {
      await apiFetch<{ deleted: boolean }>(`/api/adventures/${adventureId}`, {
        method: 'DELETE',
      })
    }
    ```

- [x] Task 6 — Inline adventure title rename in `adventure-detail.tsx` (AC: #1, #5)
  - [x] 6.1 Add state:
    ```typescript
    const [isRenamingAdventure, setIsRenamingAdventure] = useState(false)
    const [adventureNameInput, setAdventureNameInput] = useState('')
    ```
  - [x] 6.2 Add `useMutation` for `renameAdventure`:
    ```typescript
    const renameAdventureMutation = useMutation({
      mutationFn: (name: string) => renameAdventure(adventureId, name),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
        queryClient.invalidateQueries({ queryKey: ['adventures'] })
        setIsRenamingAdventure(false)
        toast.success('Aventure renommée')
      },
      onError: () => {
        setIsRenamingAdventure(false) // revert to display mode — shows original name from query cache
        toast.error('Erreur lors du renommage')
      },
    })
    ```
  - [x] 6.3 Replace the `<h1>` in the adventure header with conditional inline edit:
    ```tsx
    {isRenamingAdventure ? (
      <input
        className="text-2xl font-bold bg-transparent border-b border-primary outline-none w-full"
        value={adventureNameInput}
        onChange={(e) => setAdventureNameInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && adventureNameInput.trim()) {
            renameAdventureMutation.mutate(adventureNameInput.trim())
          }
          if (e.key === 'Escape') setIsRenamingAdventure(false)
        }}
        onBlur={() => {
          if (adventureNameInput.trim() && adventureNameInput.trim() !== adventure.name) {
            renameAdventureMutation.mutate(adventureNameInput.trim())
          } else {
            setIsRenamingAdventure(false)
          }
        }}
        autoFocus
      />
    ) : (
      <h1
        className="text-2xl font-bold cursor-pointer hover:text-muted-foreground transition-colors"
        title="Cliquer pour renommer"
        onClick={() => {
          setAdventureNameInput(adventure.name)
          setIsRenamingAdventure(true)
        }}
      >
        {adventure.name}
      </h1>
    )}
    ```

- [x] Task 7 — Delete adventure button in `adventure-detail.tsx` (AC: #3, #4)
  - [x] 7.1 Add imports: `useRouter` from `'next/navigation'`, `deleteAdventure` from api-client, `Trash2` from `lucide-react`, plus shadcn `AlertDialog*` components, `Input` component
  - [x] 7.2 Add state:
    ```typescript
    const router = useRouter()
    const [deleteAdventureDialogOpen, setDeleteAdventureDialogOpen] = useState(false)
    const [deleteConfirmName, setDeleteConfirmName] = useState('')
    ```
  - [x] 7.3 Add `useMutation` for `deleteAdventure`:
    ```typescript
    const deleteAdventureMutation = useMutation({
      mutationFn: () => deleteAdventure(adventureId),
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: ['adventures', adventureId] })
        queryClient.invalidateQueries({ queryKey: ['adventures'] })
        router.push('/adventures')
      },
      onError: () => toast.error("Erreur lors de la suppression de l'aventure"),
    })
    ```
  - [x] 7.4 Add "Supprimer l'aventure" button (e.g., small destructive icon button next to the title or at bottom of page) — opens the AlertDialog via controlled state:
    ```tsx
    <Button
      variant="ghost"
      size="icon"
      className="text-destructive hover:text-destructive"
      onClick={() => { setDeleteConfirmName(''); setDeleteAdventureDialogOpen(true) }}
      title="Supprimer l'aventure"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
    ```
  - [x] 7.5 Add controlled `AlertDialog` (NOT using `AlertDialogTrigger` — see 3.3 debug note):
    ```tsx
    <AlertDialog open={deleteAdventureDialogOpen} onOpenChange={setDeleteAdventureDialogOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer "{adventure.name}" ?</AlertDialogTitle>
          <AlertDialogDescription>
            Cette action est irréversible. Tous les segments GPX et données associées seront définitivement supprimés.
            Tapez le nom de l'aventure pour confirmer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Input
          value={deleteConfirmName}
          onChange={(e) => setDeleteConfirmName(e.target.value)}
          placeholder={adventure.name}
          className="mt-2"
        />
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setDeleteConfirmName('')}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteAdventureMutation.mutate()}
            disabled={deleteConfirmName !== adventure.name || deleteAdventureMutation.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteAdventureMutation.isPending ? 'Suppression...' : 'Supprimer définitivement'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    ```

- [x] Task 8 — Add "Renommer" to segment card in `segment-card.tsx` (AC: #2)
  - [x] 8.1 Add new prop to `SegmentCardProps`: `onRename?: (name: string) => void`
  - [x] 8.2 Add state:
    ```typescript
    const [isRenaming, setIsRenaming] = useState(false)
    const [nameInput, setNameInput] = useState('')
    ```
  - [x] 8.3 In the `done` state DropdownMenu, add "Renommer" item BEFORE "Remplacer":
    ```tsx
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault()
        setNameInput(segment.name ?? '')
        setIsRenaming(true)
      }}
    >
      Renommer
    </DropdownMenuItem>
    ```
  - [x] 8.4 When `isRenaming`, show inline input instead of segment name (only in `done` state, since `pending`/`processing`/`error` don't have rename):
    ```tsx
    {isRenaming ? (
      <input
        className="font-medium text-sm bg-transparent border-b border-primary outline-none"
        value={nameInput}
        onChange={(e) => setNameInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && nameInput.trim()) {
            onRename?.(nameInput.trim())
            setIsRenaming(false)
          }
          if (e.key === 'Escape') setIsRenaming(false)
        }}
        onBlur={() => {
          if (nameInput.trim() && nameInput.trim() !== segment.name) {
            onRename?.(nameInput.trim())
          }
          setIsRenaming(false)
        }}
        autoFocus
      />
    ) : (
      <p className="font-medium text-sm">{segment.name}</p>
    )}
    ```

- [x] Task 9 — Update `SortableSegmentCard` to pass `onRename` prop through
  - [x] 9.1 Add `onRename?: (name: string) => void` to `SortableSegmentCardProps`
  - [x] 9.2 Pass `onRename` down to `<SegmentCard>`

- [x] Task 10 — Wire `renameSegment` mutation in `adventure-detail.tsx`
  - [x] 10.1 Add `renameSegment` to imports from `api-client`
  - [x] 10.2 Add `useMutation` for segment rename:
    ```typescript
    const renameSegmentMutation = useMutation({
      mutationFn: ({ segmentId, name }: { segmentId: string; name: string }) =>
        renameSegment(adventureId, segmentId, name),
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: segmentsQueryKey })
        toast.success('Segment renommé')
      },
      onError: () => toast.error('Erreur lors du renommage du segment'),
    })
    ```
  - [x] 10.3 Pass `onRename` to `<SortableSegmentCard>`:
    ```tsx
    onRename={(name) => renameSegmentMutation.mutate({ segmentId: segment.id, name })}
    ```

- [x] Task 11 — Frontend tests (Vitest)
  - [x] 11.1 `adventure-detail.test.tsx` — add tests:
    - Clicking adventure title enters rename mode (shows input)
    - Pressing Escape cancels rename (restores title display)
    - Successful rename mutation: invalidates queries, shows success toast
    - Delete adventure: dialog appears when trash button clicked
    - Delete adventure button disabled until adventure name typed correctly
  - [x] 11.2 `segment-card.test.tsx` — add tests:
    - "Renommer" item in DropdownMenu triggers rename mode
    - Enter key submits rename and calls `onRename` prop
    - Escape cancels rename
  - [x] 11.3 Follow existing test patterns (mock API functions with `vi.mock`, use `userEvent`)

---

## Dev Notes

### CRITICAL: What's Already Done (Stories 3.1–3.3) — Do NOT Redo

**`apps/api` — existing infrastructure:**
- ✅ `AdventuresController` at `apps/api/src/adventures/adventures.controller.ts` — has `POST`, `GET`, `GET :id`. **Add** `PATCH :id` + `DELETE :id`
- ✅ `AdventuresService.verifyOwnership(id, userId)` — reuse, already handles NotFoundException
- ✅ `AdventuresService.toResponse(a)` — reuse for rename return value
- ✅ `SegmentsController` at `apps/api/src/segments/segments.controller.ts` — has `POST`, `PATCH reorder`, `DELETE :segmentId`, `GET`. **Add** `PATCH :segmentId` (AFTER reorder declaration)
- ✅ `SegmentsRepository.findByIdAndUserId(segmentId, userId)` — reuse for ownership check in renameSegment
- ✅ `SegmentsRepository.delete(segmentId)` — DO NOT use for adventure delete (cascade handles it)
- ✅ `SegmentsService.toResponse(s)` — reuse for renameSegment return

**`apps/web` — existing infrastructure:**
- ✅ `adventure-detail.tsx` — has `showUploadForm`, `replacingSegmentId`, DnD, polling. **Add** `isRenamingAdventure`, `deleteAdventureDialogOpen`, `deleteConfirmName` states
- ✅ `segment-card.tsx` — has DropdownMenu with "Remplacer" + "Supprimer" in `done` state. **Add** "Renommer" item
- ✅ `sortable-segment-card.tsx` — passes `onDelete`, `onReplace` to `SegmentCard`. **Add** `onRename` pass-through
- ✅ `api-client.ts` — has `apiFetch`, all existing functions. **Add** `renameAdventure`, `renameSegment`, `deleteAdventure`
- ✅ `sonner` package — `toast.success()` / `toast.error()` — NOT `useToast`
- ✅ `alert-dialog` shadcn component — already installed (story 3.3)
- ✅ `input` shadcn component — check with `ls apps/web/src/components/ui/input.tsx`; if missing, `pnpm dlx shadcn@latest add input` from `apps/web`

---

### Architecture: DB Cascade Chain (Critical for deleteAdventure)

When `DELETE FROM adventures WHERE id = $1` executes:
```
adventures (deleted)
  └── adventure_segments (CASCADE onDelete) → auto-deleted
        └── accommodations_cache (CASCADE onDelete) → auto-deleted
```
Schema evidence:
- `adventure_segments.adventureId` → `references(() => adventures.id, { onDelete: 'cascade' })` ✅
- `accommodations_cache.segmentId` → `references(() => adventureSegments.id, { onDelete: 'cascade' })` ✅

**GPX files on Fly.io are NOT in DB** — must be manually deleted. Pattern: fetch storageUrls → DB delete → `Promise.allSettled` file cleanup.

---

### Architecture: Why `findSegmentStorageUrlsByAdventureId` Goes in `AdventuresRepository`

The `AdventuresService.deleteAdventure()` needs segment storageUrls BEFORE deleting the adventure record (the cascade would destroy segment rows). Two options considered:
1. Inject `SegmentsService` into `AdventuresService` → **circular dependency** (SegmentsService already imports AdventuresService)
2. ✅ **Add method to `AdventuresRepository`** that queries `adventureSegments` table directly — repositories CAN reference any table without module-level circular deps

```typescript
// adventures.repository.ts — add import:
import { adventures, adventureSegments } from '@ridenrest/database'  // add adventureSegments
```

---

### Architecture: Route Order in SegmentsController — Critical NestJS Rule

```typescript
// segments.controller.ts — current order:
@Post()           // POST /adventures/:id/segments
@Patch('reorder') // PATCH /adventures/:id/segments/reorder  ← MUST stay BEFORE :segmentId
@Delete(':segmentId') // DELETE /adventures/:id/segments/:segmentId
@Get()            // GET /adventures/:id/segments

// ADD after reorder:
@Patch(':segmentId') // PATCH /adventures/:id/segments/:segmentId  ← rename
```

If `@Patch(':segmentId')` is declared BEFORE `@Patch('reorder')`, NestJS would match `PATCH .../reorder` as `:segmentId = 'reorder'` and never reach the reorder handler. **Never reorder these routes.**

---

### Architecture: AlertDialog Controlled State Pattern (from 3.3 debug log)

**CRITICAL**: base-ui `AlertDialogPrimitive.Trigger` does NOT accept `asChild` prop (unlike Radix UI). Always use controlled state:
```typescript
// ✅ CORRECT — controlled state
const [open, setOpen] = useState(false)
<AlertDialog open={open} onOpenChange={setOpen}>
  {/* No AlertDialogTrigger needed */}
</AlertDialog>

// ❌ WRONG — will cause TypeScript error
<AlertDialogTrigger asChild>...</AlertDialogTrigger>
```

For the `deleteAdventureDialog`, trigger is a separate `<Button>` that calls `setDeleteAdventureDialogOpen(true)`.

---

### Architecture: Inline Edit Pattern — Input Styling

The inline input should visually blend with the existing title/text it replaces:
```tsx
// For adventure title (h1 level):
<input className="text-2xl font-bold bg-transparent border-b border-primary outline-none w-full" />

// For segment name (card body):
<input className="font-medium text-sm bg-transparent border-b border-primary outline-none" />
```

Use `autoFocus` to focus the input when entering rename mode. The `onBlur` handler should save if the name changed (avoids requiring Enter key).

---

### Architecture: Delete Adventure — Redirect After Success

After successful adventure deletion, redirect using Next.js `useRouter`:
```typescript
import { useRouter } from 'next/navigation'  // NOT from 'next/router'

// In mutation onSuccess:
queryClient.removeQueries({ queryKey: ['adventures', adventureId] })  // clean up stale data
queryClient.invalidateQueries({ queryKey: ['adventures'] })  // refresh list
router.push('/adventures')
```

Use `removeQueries` (not just `invalidateQueries`) to prevent the adventure detail page from showing stale data if user navigates back before cache expires.

---

### Architecture: Imports to Add in `adventures.service.ts`

```typescript
import * as fs from 'node:fs/promises'  // for file deletion in deleteAdventure
```

This matches the pattern already in `segments.service.ts` (line 9).

---

### Project Structure Notes

**Files to MODIFY (API):**
```
apps/api/src/adventures/adventures.controller.ts   ← add PATCH :id + DELETE :id
apps/api/src/adventures/adventures.service.ts       ← add renameAdventure(), deleteAdventure() + import fs
apps/api/src/adventures/adventures.repository.ts   ← add updateName(), deleteById(), findSegmentStorageUrlsByAdventureId()
apps/api/src/adventures/adventures.service.test.ts ← add tests
apps/api/src/segments/segments.controller.ts       ← add PATCH :segmentId (after reorder)
apps/api/src/segments/segments.service.ts          ← add renameSegment()
apps/api/src/segments/segments.repository.ts       ← add updateName()
apps/api/src/segments/segments.service.test.ts     ← add tests
```

**Files to CREATE (API):**
```
apps/api/src/adventures/dto/rename-adventure.dto.ts
apps/api/src/segments/dto/rename-segment.dto.ts
```

**Files to MODIFY (Web):**
```
apps/web/src/lib/api-client.ts                                                         ← add 3 new functions
apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx               ← rename + delete adventure
apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx          ← add tests
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx                   ← add Renommer + isRenaming state
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx             ← add tests
apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.tsx         ← add onRename prop pass-through
```

**No new NestJS modules** — `adventures.module.ts` and `segments.module.ts` already cover all new endpoints.

---

### Anti-Patterns to Avoid

```typescript
// ❌ Drizzle query in service (project-context.md rule)
const segments = await db.select().from(adventureSegments).where(...)  // in adventures.service.ts
// ✅ In adventures.repository.ts:
async findSegmentStorageUrlsByAdventureId(adventureId: string): Promise<string[]> { ... }

// ❌ Using AlertDialogTrigger asChild (base-ui doesn't support it — 3.3 debug note)
<AlertDialogTrigger asChild><Button>Delete</Button></AlertDialogTrigger>
// ✅ Controlled state:
const [open, setOpen] = useState(false)
<Button onClick={() => setOpen(true)}>Delete</Button>
<AlertDialog open={open} onOpenChange={setOpen}>...</AlertDialog>

// ❌ Importing Sonner via useToast
import { useToast } from '@/components/ui/use-toast'
// ✅ Sonner directly
import { toast } from 'sonner'

// ❌ Subpath import from shared
import type { AdventureResponse } from '@ridenrest/shared/types'
// ✅ Root import
import type { AdventureResponse } from '@ridenrest/shared'

// ❌ Declaring PATCH :segmentId before PATCH reorder in SegmentsController
@Patch(':segmentId') ... // this would swallow reorder requests!
@Patch('reorder') ...
// ✅ reorder FIRST, then :segmentId

// ❌ Trying to inject SegmentsService into AdventuresService (circular dependency)
// ✅ Add findSegmentStorageUrlsByAdventureId() directly to AdventuresRepository

// ❌ Deleting adventure without capturing storageUrls first
await this.adventuresRepo.deleteById(id)  // CASCADE destroys segment records
const storageUrls = await this.adventuresRepo.findSegmentStorageUrlsByAdventureId(id)  // now empty!
// ✅ Capture THEN delete:
const storageUrls = await this.adventuresRepo.findSegmentStorageUrlsByAdventureId(id)
await this.adventuresRepo.deleteById(id)
await Promise.allSettled(storageUrls.map(url => fs.unlink(url).catch(() => undefined)))

// ❌ useRouter from 'next/router' (Pages Router)
import { useRouter } from 'next/router'
// ✅ App Router
import { useRouter } from 'next/navigation'

// ❌ Return { success: true, data: ... } from controller
return { success: true, deleted: true }
// ✅ Return raw data — ResponseInterceptor wraps automatically
return { deleted: true }
```

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.4 ACs, FR-017, FR-018]
- [Source: _bmad-output/implementation-artifacts/3-3-multi-segment-management-reorder-delete-replace.md — AlertDialog controlled state pattern (debug note), anti-patterns list, DropdownMenu patterns]
- [Source: apps/api/src/adventures/adventures.controller.ts — existing GET/POST endpoints, CurrentUser decorator usage]
- [Source: apps/api/src/adventures/adventures.service.ts — verifyOwnership, toResponse, existing constructor pattern]
- [Source: apps/api/src/adventures/adventures.repository.ts — existing Drizzle patterns, update/returning pattern]
- [Source: apps/api/src/segments/segments.controller.ts — PATCH reorder location (line 46) — new PATCH :segmentId must go after line 57]
- [Source: apps/api/src/segments/segments.service.ts — deleteSegment fs.unlink pattern, toResponse, findByIdAndUserId ownership pattern]
- [Source: apps/api/src/segments/segments.repository.ts — updateOrderIndexes batch update pattern, delete pattern]
- [Source: packages/database/src/schema/adventures.ts — adventures table schema]
- [Source: packages/database/src/schema/adventure-segments.ts — adventureSegments table, onDelete: cascade confirmed]
- [Source: packages/database/src/schema/accommodations-cache.ts — accommodationsCache FK onDelete: cascade confirmed]
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx — all existing state, mutations, DnD patterns, query keys]
- [Source: apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx — DropdownMenu structure, done/error states, AlertDialog usage]
- [Source: _bmad-output/project-context.md — NestJS module structure, TanStack query key convention, ResponseInterceptor rule, import rules]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Used `onClick` instead of `onSelect` on the "Renommer" DropdownMenuItem in `segment-card.tsx` — `fireEvent.click` in Vitest does not trigger Radix UI's `onSelect` handler, breaking tests. `onClick` behaves identically at runtime and passes tests.

### Completion Notes List

- ✅ Task 1: Added `PATCH /adventures/:id` (rename) — DTO, controller, service, repository
- ✅ Task 2: Added `DELETE /adventures/:id` (delete) — controller, service, repository (storageUrls fetch before cascade delete, Promise.allSettled cleanup)
- ✅ Task 3: Added `PATCH /adventures/:id/segments/:segmentId` (rename segment) — DTO, controller (after reorder!), service, repository
- ✅ Task 4: 8 new Jest tests (adventures.service: 5, segments.service: 3). Total API: 53 tests passing.
- ✅ Tasks 5-10: Frontend — api-client (3 new functions), adventure-detail (rename title inline, delete dialog, renameSegment mutation), segment-card (Renommer item + inline input), sortable-segment-card (onRename pass-through)
- ✅ Task 11: 8 new Vitest tests (adventure-detail: 5, segment-card: 3). Total Web: 73 tests passing.
- All 53 API + 73 Web tests green, zero regressions.
- ✅ Code Review (AI): 4 MEDIUM fixed (double-submit race x2, whitespace validation, disabled input); 4 LOW action items logged above.

### File List

**Modified (API):**
- `apps/api/src/adventures/adventures.controller.ts`
- `apps/api/src/adventures/adventures.service.ts`
- `apps/api/src/adventures/adventures.repository.ts`
- `apps/api/src/adventures/adventures.service.test.ts`
- `apps/api/src/segments/segments.controller.ts`
- `apps/api/src/segments/segments.service.ts`
- `apps/api/src/segments/segments.repository.ts`
- `apps/api/src/segments/segments.service.test.ts`

**Created (API):**
- `apps/api/src/adventures/dto/rename-adventure.dto.ts`
- `apps/api/src/segments/dto/rename-segment.dto.ts`

**Modified (Web):**
- `apps/web/src/lib/api-client.ts`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/sortable-segment-card.tsx`

**Modified (Sprint):**
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
