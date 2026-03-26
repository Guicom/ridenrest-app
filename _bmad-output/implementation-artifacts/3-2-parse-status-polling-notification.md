# Story 3.2: Parse Status Polling & Notification

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to be notified when my GPX segment finishes parsing,
So that I know when the map and distance calculations are ready without refreshing the page.

## Acceptance Criteria

1. **Given** a segment has `parseStatus: 'pending'` and the user is on the adventure detail page,
   **When** TanStack Query polls every 3s (`refetchInterval: 3000` active while at least one segment is `'pending'` or `'processing'`),
   **Then** as soon as the BullMQ processor sets `parseStatus: 'done'` in DB, the next polling request returns the updated status — without page reload (FR-019).

   > ⚠️ **Discrepancy note**: `epics.md` writes `parse_status: 'success'` but the actual DB `parseStatusEnum` uses `'done'` (implemented in story 3.1). Use `'done'` throughout.

2. **Given** TanStack Query detects a transition from `'pending'`/`'processing'` → `'done'` for a segment,
   **When** the updated data arrives,
   **Then** the segment card updates from a loading skeleton to show `distanceKm` and `elevationGainM` (or "N/A") plus an **"Afficher sur la carte"** button (`disabled`, enabled in story 4.1) — without page reload.
   **And** a success toast "Segment analysé avec succès !" is shown.

3. **Given** TanStack Query detects a transition from `'pending'`/`'processing'` → `'error'`,
   **When** the updated data arrives,
   **Then** the segment card shows an error state with "Parsing échoué — vérifiez le format du fichier GPX" and a **"Réessayer"** button.
   **And** a destructive toast "Parsing échoué pour [segment name]" is shown.

4. **Given** all segments have `parseStatus` of `'done'` or `'error'` (none are `'pending'` or `'processing'`),
   **When** TanStack Query receives the updated data,
   **Then** `refetchInterval` returns `false` — polling stops, no additional requests are emitted.

5. **Given** the user navigates away from the adventure detail page during parsing and returns later,
   **When** the adventure detail page loads,
   **Then** the current `parseStatus` from DB is correctly reflected immediately — no infinite loading state (segments query must use `staleTime: 0`).

## Tasks / Subtasks

- [x] Task 1 — Setup/verify shadcn/ui toast system (AC: #2, #3)
  - [x] 1.1 In `apps/web/src/app/(app)/layout.tsx`, check if `<Toaster />` from `@/components/ui/toaster` is already present — add if missing
  - [x] 1.2 Verify `useToast` exists at `apps/web/src/components/ui/use-toast.ts` — if missing, run `pnpm dlx shadcn@latest add toast` from `apps/web`
  - [x] 1.3 No component-level `<Toaster />` instances — only ONE global Toaster in `(app)/layout.tsx`

- [x] Task 2 — Enhance `adventure-detail.tsx` — transition detection + toasts + staleTime (AC: #1, #2, #3, #4, #5)
  - [x] 2.1 Add `useRef<AdventureSegmentResponse[] | undefined>` to track previous segment statuses across polls
  - [x] 2.2 Add `staleTime: 0` to the `['adventures', id, 'segments']` query options (AC #5 — forces fresh fetch on every mount)
  - [x] 2.3 Verify `refetchInterval` logic: `query.state.data?.some(s => s.parseStatus === 'pending' || s.parseStatus === 'processing') ? 3000 : false` — correct, no change needed if already present
  - [x] 2.4 Add `useEffect` for transition detection (see Dev Notes for exact pattern)
  - [x] 2.5 Add `onRetry` handler: pass `() => window.scrollTo({ top: 0, behavior: 'smooth' })` OR show a targeted upload prompt (see Task 4)

- [x] Task 3 — Replace `segment-card.tsx` — 4-state UI (AC: #2, #3)
  - [x] 3.1 `pending` state: `<Skeleton>` for name/distance/elevation + label "En attente d'analyse..."
  - [x] 3.2 `processing` state: same `<Skeleton>` pattern + label "Analyse en cours..."
  - [x] 3.3 `done` state: segment name, `{distanceKm.toFixed(1)} km`, elevation (`{Math.round(elevationGainM)}m D+` or "N/A"), disabled **"Afficher sur la carte"** button with `title="Disponible dans la version carte"`
  - [x] 3.4 `error` state: `AlertCircle` icon, "Parsing échoué — vérifiez le format du fichier GPX", **"Réessayer"** button calls `onRetry()` prop
  - [x] 3.5 Export `SegmentCardProps` with `segment: AdventureSegmentResponse` and `onRetry: () => void`

- [x] Task 4 — Wire retry flow in `adventure-detail.tsx` (AC: #3)
  - [x] 4.1 Add `showUploadForm` state (`useState(false)`) if not already present
  - [x] 4.2 Pass `onRetry={() => setShowUploadForm(true)}` to `<SegmentCard>` for every segment (it only triggers in error state via the button)
  - [x] 4.3 Render `<GpxUploadForm>` conditionally when `showUploadForm` is true — hide after `onSuccess` callback fires (which already invalidates `['adventures', id, 'segments']`)

- [x] Task 5 — Tests (Vitest)
  - [x] 5.1 `segment-card.test.tsx` — test all 4 parse states: skeleton for pending, skeleton for processing, full card for done, error card for error + `onRetry` called on button click
  - [x] 5.2 `adventure-detail.test.tsx` (or util test) — test `refetchInterval` returns `3000` when `pending` present, `false` when all `done`/`error`

### Review Follow-ups (AI) — LOW severity, address if time permits

- [ ] [AI-Review][LOW] `prevSegmentsRef` update condition skips reset when `segments = []` — if all segments are deleted, stale ref persists until new segments arrive. [adventure-detail.tsx:74]
- [ ] [AI-Review][LOW] Inconsistent null labels between distance (`'— km'`) and elevation (`'N/A'`) in the same card — minor UX inconsistency. [segment-card.tsx:46-47]
- [ ] [AI-Review][LOW] No `aria-live` or `role="status"` on segment cards for screen reader announcements when status transitions occur. [segment-card.tsx]
- [ ] [AI-Review][LOW] `apps/api/uploads/gpx/*.gpx` test artifacts are untracked — add to `.gitignore` to prevent accidental commits.

- [ ] Task 6 — Manual integration validation (AC: #1–#5)
  - [ ] 6.1 Upload valid GPX → skeleton appears → transitions to done card with distance ✅
  - [ ] 6.2 Upload malformed GPX → skeleton → error card + "Parsing échoué" destructive toast ✅
  - [ ] 6.3 When all done/error → Network tab shows no more polling requests ✅
  - [ ] 6.4 Navigate away during parse → return → correct status shown, no infinite skeleton ✅
  - [ ] 6.5 Click "Réessayer" on error segment → upload form appears ✅

## Dev Notes

### CRITICAL: What's Already Done (Story 3.1) — Do NOT Redo

**`apps/api` — NO CHANGES NEEDED for this story:**
- ✅ `GET /adventures/:adventureId/segments` returns full `AdventureSegmentResponse[]` including `parseStatus`
- ✅ BullMQ `gpx-parse.processor.ts` sets `parseStatus = 'processing'` on job start (via `SegmentsRepository.setProcessingStatus()`), `'done'` via `updateAfterParse()`, `'error'` via `updateParseError()`
- ✅ `parseStatusEnum` in `packages/database`: `'pending' | 'processing' | 'done' | 'error'`
- ✅ `AdventureSegmentResponse` in `packages/shared` includes: `parseStatus: ParseStatus`, `distanceKm: number | null`, `elevationGainM: number | null`, `name: string | null`

**`apps/web` — files from story 3.1 that WILL BE MODIFIED:**
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — already has `useQuery(['adventures', id, 'segments'])` with basic `refetchInterval` polling. **Modify to add:** transition detection + toasts + `staleTime: 0`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — already has a basic parse status indicator. **Replace with** 4-state UI (skeleton/done/error)
- `apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx` — already exists. **No changes** needed to this file

**This story adds:** Toast notifications on parse transitions + 4-state segment card UI + retry UX for error segments

---

### Architecture: Parse Status State Machine

```
'pending'     ← created by SegmentsService.createSegment()
    ↓ job picked up by BullMQ worker (setProcessingStatus)
'processing'
    ↓ parse succeeds (updateAfterParse)       ↓ parse fails (updateParseError)
'done'                                         'error'
```

**UI State Machine (`segment-card.tsx`):**
```
'pending'    → <Skeleton> + "En attente d'analyse..."
'processing' → <Skeleton> + "Analyse en cours..."
'done'       → Full card: name, distanceKm, elevationGainM, disabled "Afficher sur la carte"
'error'      → Error card: AlertCircle, error message, "Réessayer" button
```

---

### Task 1: Toast System — Shadcn/ui Setup

**Verify in `apps/web/src/app/(app)/layout.tsx`:**
```tsx
import { Toaster } from '@/components/ui/toaster'

// Inside layout component:
<>
  {children}
  <Toaster />
</>
```

If `Toaster` component files are missing:
```bash
# Run from apps/web directory
pnpm dlx shadcn@latest add toast
```

**⚠️ CRITICAL**: Only ONE `<Toaster />` in the entire app — in the `(app)/layout.tsx` root. Never add it inside individual components.

**Usage pattern (in any client component):**
```typescript
import { useToast } from '@/components/ui/use-toast'

const { toast } = useToast()

// Success
toast({ title: 'Segment "Étape 1" analysé avec succès !' })

// Error
toast({
  title: 'Parsing échoué pour "Étape 1"',
  description: 'Vérifiez le format du fichier GPX',
  variant: 'destructive',
})
```

---

### Task 2: Transition Detection in `adventure-detail.tsx`

**⚠️ Import rule** (from story 3.1 dev notes): `AdventureSegmentResponse` MUST be imported from `@ridenrest/shared` (root import only — NOT `@ridenrest/shared/types`).

**Key additions to the existing client component:**

```typescript
'use client'
import { useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useToast } from '@/components/ui/use-toast'
import { listSegments } from '@/lib/api-client'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

// Inside component:
const { toast } = useToast()
const prevSegmentsRef = useRef<AdventureSegmentResponse[] | undefined>(undefined)
const [showUploadForm, setShowUploadForm] = useState(false)

const { data: segments } = useQuery({
  queryKey: ['adventures', id, 'segments'],
  queryFn: () => listSegments(id),
  refetchInterval: (query) =>
    query.state.data?.some(s => s.parseStatus === 'pending' || s.parseStatus === 'processing')
      ? 3000
      : false,
  staleTime: 0, // CRITICAL (AC #5): prevents stale 'pending' state on navigate-back/remount
})

// Transition detection — runs after every segments update
useEffect(() => {
  if (!segments) {
    prevSegmentsRef.current = segments
    return
  }

  const prev = prevSegmentsRef.current
  if (prev) {
    for (const seg of segments) {
      const prevSeg = prev.find(s => s.id === seg.id)
      if (!prevSeg) continue

      const wasPending = prevSeg.parseStatus === 'pending' || prevSeg.parseStatus === 'processing'
      if (!wasPending) continue

      if (seg.parseStatus === 'done') {
        toast({ title: `Segment "${seg.name ?? 'Sans nom'}" analysé avec succès !` })
      } else if (seg.parseStatus === 'error') {
        toast({
          title: `Parsing échoué pour "${seg.name ?? 'Sans nom'}"`,
          description: 'Vérifiez le format du fichier GPX',
          variant: 'destructive',
        })
      }
    }
  }

  prevSegmentsRef.current = segments
}, [segments, toast])
```

**`staleTime: 0` rationale (AC #5):** Without this, TanStack Query may serve cached data showing `'pending'` when a user navigates back to the page. `staleTime: 0` forces a background refetch immediately on mount so the true current DB state is shown.

**⚠️ Do NOT use `useState` for previous values** — would cause extra renders. `useRef` is the correct pattern here.

**`toast` stability**: shadcn's `useToast` returns a stable `toast` function (memoized). Safe to include in the `useEffect` dependency array.

---

### Task 3: Segment Card Implementation

```typescript
// apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx
'use client'
import { AlertCircle, MapPin } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

export interface SegmentCardProps {
  segment: AdventureSegmentResponse
  onRetry: () => void
}

export function SegmentCard({ segment, onRetry }: SegmentCardProps) {
  const { parseStatus, name, distanceKm, elevationGainM } = segment

  if (parseStatus === 'pending' || parseStatus === 'processing') {
    return (
      <div className="rounded-lg border p-4 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-1/3" />
        <p className="text-xs text-muted-foreground">
          {parseStatus === 'pending' ? "En attente d'analyse..." : 'Analyse en cours...'}
        </p>
      </div>
    )
  }

  if (parseStatus === 'error') {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-2">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-medium">{name ?? 'Segment sans nom'}</span>
        </div>
        <p className="text-xs text-destructive">
          Parsing échoué — vérifiez le format du fichier GPX
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      </div>
    )
  }

  // parseStatus === 'done'
  const distanceLabel = distanceKm != null ? `${distanceKm.toFixed(1)} km` : '— km'
  const elevationLabel = elevationGainM != null ? `${Math.round(elevationGainM)}m D+` : 'N/A'

  return (
    <div className="rounded-lg border p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{name ?? 'Segment sans nom'}</span>
        <Badge variant="secondary">Analysé</Badge>
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>{distanceLabel}</span>
        <span>{elevationLabel}</span>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled
        title="Disponible dans la version carte"
      >
        <MapPin className="h-3 w-3 mr-1" />
        Afficher sur la carte
      </Button>
    </div>
  )
}
```

**Notes:**
- `distanceKm` is `number | null` in `AdventureSegmentResponse` — handle null defensively even in `done` state
- `elevationGainM` can be null when GPX has no `<ele>` tags — show "N/A" (not an error)
- `MapPin`, `AlertCircle` are from `lucide-react` (already a transitive dep via shadcn/ui)
- `Skeleton`, `Button`, `Badge` are from `@/components/ui/*` (shadcn/ui components — add via CLI if missing)
- **"Afficher sur la carte"** button is intentionally `disabled` — Story 4.1 will enable it

---

### Task 4: Retry Flow in `adventure-detail.tsx`

The `showUploadForm` state controls visibility of `<GpxUploadForm>`. Pass `onRetry` to every `<SegmentCard>` — only the error state renders the button, so it doesn't matter that all cards receive the prop.

```tsx
// Render segments
{segments?.map(segment => (
  <SegmentCard
    key={segment.id}
    segment={segment}
    onRetry={() => setShowUploadForm(true)}
  />
))}

// Upload form — shown on initial load (no segments yet) OR on retry
{(!segments?.length || showUploadForm) && (
  <GpxUploadForm
    adventureId={id}
    onSuccess={() => setShowUploadForm(false)}
  />
)}
```

**Note on failed segments**: After retry, the user uploads a new segment. The original failed segment remains in the list (still in `error` state) until story 3.3 adds delete functionality. This is intentional — the UX is acceptable for MVP and avoids premature scope expansion.

---

### Testing Requirements

**`segment-card.test.tsx`** (Vitest + @testing-library/react):

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { SegmentCard } from './segment-card'

const makeSegment = (overrides = {}) => ({
  id: 'seg-1',
  adventureId: 'adv-1',
  name: 'Étape 1',
  parseStatus: 'done' as const,
  distanceKm: 42.5,
  elevationGainM: 1200,
  orderIndex: 0,
  cumulativeStartKm: 0,
  storageUrl: '/data/gpx/seg-1.gpx',
  createdAt: '2026-03-15T00:00:00.000Z',
  updatedAt: '2026-03-15T00:00:00.000Z',
  ...overrides,
})

describe('SegmentCard', () => {
  it('renders skeleton for pending state', () => {
    render(<SegmentCard segment={makeSegment({ parseStatus: 'pending' })} onRetry={vi.fn()} />)
    expect(screen.getByText("En attente d'analyse...")).toBeInTheDocument()
  })

  it('renders skeleton for processing state', () => {
    render(<SegmentCard segment={makeSegment({ parseStatus: 'processing' })} onRetry={vi.fn()} />)
    expect(screen.getByText('Analyse en cours...')).toBeInTheDocument()
  })

  it('renders full card for done state', () => {
    render(<SegmentCard segment={makeSegment({ parseStatus: 'done', distanceKm: 42.5, elevationGainM: 1200 })} onRetry={vi.fn()} />)
    expect(screen.getByText('42.5 km')).toBeInTheDocument()
    expect(screen.getByText('1200m D+')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /afficher sur la carte/i })).toBeDisabled()
  })

  it('renders N/A elevation when elevationGainM is null', () => {
    render(<SegmentCard segment={makeSegment({ parseStatus: 'done', elevationGainM: null })} onRetry={vi.fn()} />)
    expect(screen.getByText('N/A')).toBeInTheDocument()
  })

  it('renders error state and calls onRetry', () => {
    const onRetry = vi.fn()
    render(<SegmentCard segment={makeSegment({ parseStatus: 'error' })} onRetry={onRetry} />)
    expect(screen.getByText('Parsing échoué — vérifiez le format du fichier GPX')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
```

**`refetchInterval` test** (pure logic, no React needed):

```typescript
// Extract refetchInterval logic to a pure util for easy testing
// OR test via the component with mock queries
const shouldPoll = (statuses: string[]) =>
  statuses.some(s => s === 'pending' || s === 'processing')

describe('shouldPoll', () => {
  it('returns true when any segment is pending', () => expect(shouldPoll(['pending', 'done'])).toBe(true))
  it('returns true when any segment is processing', () => expect(shouldPoll(['processing'])).toBe(true))
  it('returns false when all done', () => expect(shouldPoll(['done', 'done'])).toBe(false))
  it('returns false when all error', () => expect(shouldPoll(['error'])).toBe(false))
  it('returns false when mix of done and error', () => expect(shouldPoll(['done', 'error'])).toBe(false))
  it('returns false when no segments', () => expect(shouldPoll([])).toBe(false))
})
```

---

### Project Structure Notes

**Files to MODIFY** (already exist from story 3.1):
```
apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx  ← add transition detection + staleTime:0 + showUploadForm state
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx       ← replace with 4-state UI
```

**Files to CHECK/UPDATE**:
```
apps/web/src/app/(app)/layout.tsx   ← verify <Toaster /> present
```

**Files to ADD** (only if toast not installed):
```
apps/web/src/components/ui/toaster.tsx
apps/web/src/components/ui/use-toast.ts
apps/web/src/components/ui/toast.tsx
```

**Files to CREATE** (new test files):
```
apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx
```

**⚠️ NOT creating any new NestJS files** — no API changes needed for this story.

---

### Anti-Patterns to Avoid

```typescript
// ❌ useState for previous values (causes extra renders)
const [prevSegments, setPrevSegments] = useState(...)
// ✅ useRef (no re-render on write)
const prevSegmentsRef = useRef(...)

// ❌ Multiple <Toaster /> instances
// ✅ One <Toaster /> in (app)/layout.tsx only

// ❌ Missing staleTime:0 — users see stale 'pending' on navigate-back
// ✅ staleTime: 0 on segments query

// ❌ Import from subpath
import type { AdventureSegmentResponse } from '@ridenrest/shared/types'
// ✅ Root import only (story 3.1 confirmed pattern)
import type { AdventureSegmentResponse } from '@ridenrest/shared'

// ❌ re-throw check confusion in processor (already fixed in 3.1 code review)
// The processor already handles 'processing' → 'done'/'error' correctly — do NOT touch it
```

---

### References

- [Source: _bmad-output/implementation-artifacts/3-1-create-adventure-upload-gpx-segment.md — File list, dev notes, parseStatus enum, code review fixes, import rules]
- [Source: _bmad-output/planning-artifacts/epics.md — Story 3.2 ACs (note: 'success' discrepancy → use 'done')]
- [Source: _bmad-output/project-context.md — TanStack Query query keys, refetchInterval pattern, shadcn/ui, loading state rules]
- [Source: packages/shared/src/types/adventure.types.ts — AdventureSegmentResponse, ParseStatus]
- [Source: packages/database/src/schema/adventure-segments.ts — parseStatusEnum: 'pending' | 'processing' | 'done' | 'error']

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Used Sonner (`sonner` package) instead of classic shadcn toast (`use-toast.ts`) because the project uses `style: "base-nova"` in components.json, which doesn't have a `toast` component in its registry. Sonner is the modern equivalent and was installed via `pnpm dlx shadcn@latest add sonner`. API: `toast.success()` / `toast.error()` directly (no `useToast` hook needed).
- Added optional `onSuccess?: () => void` prop to `GpxUploadForm` — required for retry flow. Called from `adventure-detail.tsx` to reset `showUploadForm` to `false` after a successful upload.
- Fixed `makeSegment` test helper to use actual `AdventureSegmentResponse` shape: `boundingBox: null` instead of non-existent `storageUrl`. Also installed `@testing-library/jest-dom` and set up vitest `setupFiles` + tsconfig `types` for `toBeInTheDocument()` matchers.
- **Code review fixes (claude-sonnet-4-6):** Implemented `showUploadForm` state + conditional `GpxUploadForm` rendering (was missing from initial dev). Exported `shouldPoll` from `adventure-detail.tsx` and updated `poll-logic.test.ts` to import it (was testing a local copy). Added `adventure-detail.test.tsx` with 5 tests covering `useEffect` transition detection (success/error/no-toast paths).
- All 57 tests pass across 10 test files. TypeScript: exit 0. ESLint: no errors.

### File List

- `apps/web/src/components/ui/sonner.tsx` — NEW (installed via shadcn CLI)
- `apps/web/src/app/(app)/layout.tsx` — MODIFIED (added `<Toaster />`)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — MODIFIED (staleTime:0, useRef transition detection, useEffect toasts, showUploadForm state, conditional GpxUploadForm, exported shouldPoll utility)
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — MODIFIED (replaced with 4-state UI: pending/processing/done/error, `SegmentCardProps` exported)
- `apps/web/src/app/(app)/adventures/[id]/_components/gpx-upload-form.tsx` — MODIFIED (added optional `onSuccess?: () => void` prop)
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx` — NEW (5 test cases for all 4 parse states + onRetry)
- `apps/web/src/app/(app)/adventures/[id]/_components/poll-logic.test.ts` — NEW (6 test cases for shouldPoll, imported from production code)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` — NEW (5 tests for useEffect parse status transition detection)
- `apps/web/src/test-setup.ts` — NEW (Vitest setup file for @testing-library/jest-dom matchers)
- `apps/web/vitest.config.ts` — MODIFIED (added `setupFiles`)
- `apps/web/tsconfig.json` — MODIFIED (added `types: ["@testing-library/jest-dom"]`)
- `apps/web/package.json` — MODIFIED (added `@testing-library/jest-dom`, `sonner` dependencies)
