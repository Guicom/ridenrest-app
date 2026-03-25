# Story 9.5: Adventure Detail Page Design

Status: done

## Story

As a **cyclist managing their adventure**,
I want the adventure detail page to be well-designed,
So that managing GPX segments feels as polished as the map experience.

## Acceptance Criteria

1. ~~**Given** a user navigates to `/adventures/:id`, **When** the page renders, **Then** background is `--background-page`; content centered `max-w-3xl mx-auto`; adventure name `text-2xl font-bold text-[--text-primary]`.~~ **[ALREADY IMPLEMENTED]**

2. ~~**Given** the segment list renders, **When** displayed, **Then** each segment is a white card (`--surface`, `rounded-xl`, `border border-[--border]`) showing: drag handle, name, distance (`font-mono`), parse status badge, and actions menu.~~ **[ALREADY IMPLEMENTED]**

3. **Given** `parse_status: 'pending'` (or `'processing'`), **When** badge renders, **Then** amber pulsing "En cours..." badge (`bg-[--density-medium] text-white text-xs font-medium px-2 py-0.5 rounded-full animate-pulse`) is shown inline in the card alongside the segment name.

4. **Given** `parse_status: 'done'`, **When** badge renders, **Then** green "Prêt" badge (`bg-[--density-high] text-white text-xs font-medium px-2 py-0.5 rounded-full`) replaces the current `<Badge variant="secondary">Analysé</Badge>`.

5. **Given** `parse_status: 'error'`, **When** badge renders, **Then** red "Erreur" badge (`bg-[--density-low] text-white text-xs font-medium px-2 py-0.5 rounded-full`) is shown inline in the card alongside the segment name, with a ghost "Réessayer" button.

6. **Given** the "Analyser la densité" (density) CTA and at least one segment exists, **When** any segment is `pending`/`processing`, **Then** it appears as a disabled secondary button with a tooltip "En attente de l'analyse des segments". **When** all segments are `done`, the button is active.

7. **Given** the user opens the Strava import modal, **When** the modal opens, **Then** the Strava route list is always fetched fresh (no client-side cache) so new routes created on Strava since the last open are visible immediately.

8. **Given** the Strava route list is loaded in the modal, **When** the user types in a search field, **Then** the list is filtered client-side by route name (case-insensitive, partial match) in real time.

## Tasks / Subtasks

- [x] Task 1: Replace pending/processing skeleton with badge in `segment-card.tsx` (AC: #3)
  - [x] 1.1 Remove the Skeleton-based early-return block for `pending`/`processing`
  - [x] 1.2 In the main card layout, render an amber badge `bg-[--density-medium] text-white text-xs font-medium px-2 py-0.5 rounded-full animate-pulse` with label "En cours..." next to the segment name
  - [x] 1.3 Keep distance/elevation row hidden (or `—`) while pending (data not available yet)
  - [x] 1.4 Keep drag handle and actions menu (MoreHorizontal) in pending card (consistent layout)

- [x] Task 2: Page layout + card structure (AC: #1, #2) — **ALREADY IMPLEMENTED**

- [x] Task 3: Update done badge in `segment-card.tsx` (AC: #4)
  - [x] 3.1 Replace `<Badge variant="secondary">Analysé</Badge>` with `<span className="bg-[--density-high] text-white text-xs font-medium px-2 py-0.5 rounded-full">Prêt</span>`

- [x] Task 4: Update error state in `segment-card.tsx` (AC: #5)
  - [x] 4.1 Remove the early-return error block (AlertCircle icon + full error card)
  - [x] 4.2 In the main card layout, render red badge `bg-[--density-low] text-white text-xs font-medium px-2 py-0.5 rounded-full` with label "Erreur"
  - [x] 4.3 Add ghost "Réessayer" button inline: `<Button variant="ghost" size="sm" onClick={onRetry}>Réessayer</Button>`
  - [x] 4.4 Show segment name even in error state (use `name ?? 'Segment sans nom'`)

- [x] Task 5: Show density CTA regardless of parse status (AC: #6)
  - [x] 5.1 In `adventure-detail.tsx`, remove the `segments.every(s => s.parseStatus === 'done')` gate that hides the entire button group
  - [x] 5.2 Show the action button group whenever `segments.length > 0`
  - [x] 5.3 Wrap `<DensityTriggerButton>` in a `<Tooltip>` from shadcn/ui: when any segment is not done, show tooltip "En attente de l'analyse des segments"
  - [x] 5.4 `DensityTriggerButton` already disables itself via `disabled={isAnalyzing || !allSegmentsParsed}` — no change needed inside that component
  - [x] 5.5 Keep "Voir la carte" button gated to all-done (unchanged)

- [x] Task 7: Remove Strava route cache — always fresh on modal open (AC: #7)
  - [x] 7.1 In `strava-import-modal.tsx`, change `staleTime: 1000 * 60 * 60` → `staleTime: 0`
  - [x] 7.2 Keep `enabled: stravaConnected && open` — the query refetches every time the modal opens since data is immediately stale
  - [x] 7.3 No backend change needed — NestJS already fetches fresh from Strava API on each request (the 1h cache was client-side only)

- [x] Task 8: Add full-text search in Strava import modal (AC: #8)
  - [x] 8.1 Add `searchQuery` state (`useState<string>('')`) in `StravaImportModal`
  - [x] 8.2 Add `<Input placeholder="Rechercher une route..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />` above the route list
  - [x] 8.3 Filter routes client-side: `const filteredRoutes = routes?.filter(r => r.name.toLowerCase().includes(searchQuery.toLowerCase())) ?? []`
  - [x] 8.4 Reset `searchQuery` to `''` when modal closes (in `onOpenChange` handler or `useEffect` on `open`)
  - [x] 8.5 Show "Aucune route trouvée pour «{searchQuery}»" when `filteredRoutes.length === 0` and `searchQuery` is non-empty (distinct from the "Aucune route Strava" empty state)
  - [x] 8.6 Import `Input` from `@/components/ui/input` (already in project)

- [x] Task 6: Update tests (AC: #3, #4, #5, #6, #7, #8)
  - [x] 6.1 `segment-card.test.tsx`: pending state — assert amber badge "En cours..." is present, assert Skeleton is NOT rendered
  - [x] 6.2 `segment-card.test.tsx`: done state — assert "Prêt" badge, assert "Analysé" is NOT present
  - [x] 6.3 `segment-card.test.tsx`: error state — assert "Erreur" badge + "Réessayer" button inline in card (not a separate early-return card)
  - [x] 6.4 `adventure-detail.test.tsx`: density button visible when segments are pending (not hidden)
  - [x] 6.5 `adventure-detail.test.tsx`: density button disabled + tooltip shown when any segment pending
  - [x] 6.6 `strava-import-modal.test.tsx`: assert `staleTime` is `0` (or that query is called on each `open=true`)
  - [x] 6.7 `strava-import-modal.test.tsx`: search input renders when routes are loaded
  - [x] 6.8 `strava-import-modal.test.tsx`: typing in search filters the route list
  - [x] 6.9 `strava-import-modal.test.tsx`: empty search state shows correct "Aucune route trouvée pour..." message

## Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `adventure-detail.tsx:312` — IIFE `(() => {...})()` in JSX non-idiomatique pour calculer `hasPendingSegments`/`allDone` ; extraire en variables avant le `return` ou en sous-composant
- [ ] [AI-Review][LOW] `segment-card.test.tsx:57-62` — Test d'absence de Skeleton fragile (détection par `[class*="animate-pulse"]` + tagName) ; utiliser `queryByTestId` ou mocker le composant Skeleton
- [ ] [AI-Review][LOW] `segment-card.test.tsx` — Pas de test vérifiant que les trois badges (pending/done/error) sont mutuellement exclusifs

## Dev Notes

### What's Already Implemented (Skip These)

**AC 1 — Page layout (`adventure-detail.tsx:250-251`):**
```tsx
<main className="min-h-screen bg-background-page pt-10">
  <div className="max-w-3xl mx-auto px-4 py-6 ...">
    <h1 className="text-2xl font-bold cursor-pointer ...">
```
✅ Background, centering, title style — all in place.

**AC 2 — Segment card structure (`segment-card.tsx:83`):**
```tsx
<div className="rounded-lg border p-4 flex items-center gap-3">
```
✅ Cards with drag handle, name, distance, actions — implemented. Minor deviation from spec (`rounded-lg` vs `rounded-xl`, Tailwind border vs `border-[--border]`) — Guillaume confirmed done, no change needed.

---

### Current State — What to Change

**`segment-card.tsx`** has three render paths currently:
1. **pending/processing**: Early return → `<div>` with two `<Skeleton>` + text (lines 42-52) → **REPLACE with badge inline in unified card**
2. **error**: Early return → separate error card with AlertCircle + buttons (lines 54-76) → **REPLACE with badge + Réessayer inline in unified card**
3. **done**: Main card (lines 78-186) — badge currently `<Badge variant="secondary">Analysé</Badge>` → **update to green "Prêt" span**

Target: a **single unified card layout** for all three states, just the badge and available actions change.

**`adventure-detail.tsx`** (lines 306-317):
```tsx
{segments.every((s) => s.parseStatus === 'done') && segments.length > 0 && (
  <div className="flex items-center gap-2 shrink-0">
    <DensityTriggerButton ... />
    ...
  </div>
)}
```
→ Change condition to `segments.length > 0` and wrap `<DensityTriggerButton>` with tooltip when not all done.

---

### Badge Token Reference

```css
--density-high:   #16a34a  /* green  — "Prêt" badge */
--density-medium: #d97706  /* amber  — "En cours..." badge */
--density-low:    #dc2626  /* red    — "Erreur" badge */
```

Tailwind utility classes (registered in `globals.css` via `@theme`):
```
bg-density-high, bg-density-medium, bg-density-low
text-density-high, text-density-medium, text-density-low
```

**Badge markup pattern (consistent across all states):**
```tsx
<span className="bg-density-medium text-white text-xs font-medium px-2 py-0.5 rounded-full animate-pulse">
  En cours...
</span>

<span className="bg-density-high text-white text-xs font-medium px-2 py-0.5 rounded-full">
  Prêt
</span>

<span className="bg-density-low text-white text-xs font-medium px-2 py-0.5 rounded-full">
  Erreur
</span>
```

---

### Tooltip for Density CTA

Use shadcn/ui `Tooltip` (already in project, used in `map-view.tsx`):

```tsx
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

const hasPendingSegments = segments.some(
  (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing'
)

// In JSX:
<TooltipProvider>
  <Tooltip>
    <TooltipTrigger asChild>
      {/* Wrap in span when disabled — disabled elements don't fire mouse events */}
      <span>
        <DensityTriggerButton adventureId={adventureId} segments={segments} />
      </span>
    </TooltipTrigger>
    {hasPendingSegments && (
      <TooltipContent>
        <p>En attente de l&apos;analyse des segments</p>
      </TooltipContent>
    )}
  </Tooltip>
</TooltipProvider>
```

Note: `DensityTriggerButton` already handles its own `disabled` state via `!allSegmentsParsed`. The tooltip wrapping is purely cosmetic UX.

---

---

### Strava Cache Fix — Why `staleTime: 0`

**Current problem** (`strava-import-modal.tsx:37`):
```typescript
staleTime: 1000 * 60 * 60,  // 1h — mirrors Redis TTL
```
TanStack Query considers the data fresh for 1 hour. Even if the user opens and closes the modal multiple times, it won't refetch until the TTL expires. New Strava routes created in the meantime are invisible.

**Fix:**
```typescript
staleTime: 0,  // always stale → refetch on every modal open
```

With `enabled: stravaConnected && open`, the query fires every time `open` becomes `true`. `staleTime: 0` ensures data is always considered stale, so a refetch always happens. The NestJS backend already calls Strava API fresh on each request (the 1h TTL was a client-only optimization that caused this UX bug).

---

### Full-Text Search in Strava Modal — Implementation Sketch

```tsx
const [searchQuery, setSearchQuery] = useState('')

// Reset on close
useEffect(() => {
  if (!open) setSearchQuery('')
}, [open])

const filteredRoutes = routes?.filter((r) =>
  r.name.toLowerCase().includes(searchQuery.toLowerCase())
) ?? []

// In JSX, after <DialogHeader>:
<Input
  placeholder="Rechercher une route..."
  value={searchQuery}
  onChange={(e) => setSearchQuery(e.target.value)}
  className="mb-2"
/>

// Then render filteredRoutes instead of routes:
{filteredRoutes.length === 0 && searchQuery ? (
  <p className="py-4 text-sm text-muted-foreground">
    Aucune route trouvée pour &laquo;{searchQuery}&raquo;.
  </p>
) : (
  <div className="space-y-2 py-2 max-h-80 overflow-y-auto">
    {filteredRoutes.map((route) => (...))}
  </div>
)}
```

The search is purely client-side — no new API calls.

---

### Files to Modify

- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` — badge redesign (AC 3, 4, 5)
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — density CTA visibility (AC 6)
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx` — staleTime fix + search (AC 7, 8)
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx` — test updates
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx` — test updates
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.test.tsx` — test updates

**No changes needed:**
- NestJS API — frontend-only story (Strava routes are always fetched fresh server-side)
- Database — no schema changes
- `density-trigger-button.tsx` — already has correct disabled logic

---

### Previous Story Learnings (9.4)

Key patterns from 9.4 applicable here:
- **Design tokens via Tailwind**: Use `bg-density-high` / `bg-density-medium` / `bg-density-low` (registered in `@theme` in `globals.css`) — no `bg-[--density-high]` bracket notation needed (the color is registered as a Tailwind color).
- **Inline badge pattern**: Established in `poi-popup.tsx` — small `<span>` with `rounded-full px-2 py-0.5 text-xs font-medium`.
- **`PoiDetailSheet` dead code note (from 9.4 review)**: Still present, candidate for removal. Do NOT remove in this story — defer to post-Epic 9 cleanup.

---

### Project Structure Notes

- All files co-located in `apps/web/src/app/(app)/adventures/[id]/_components/`
- `segment-card.tsx` is rendered via `sortable-segment-card.tsx` (DnD wrapper) — no interface change needed, `onRetry` prop already exists
- Tests use Vitest (not Jest) — `apps/web/` is Vitest territory
- `TooltipProvider` wrapping: check if `adventure-detail.tsx` parent already has one; if so, no need to add another

### References

- [Source: `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx`] — current implementation
- [Source: `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`] — current density CTA gating
- [Source: `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx`] — disabled logic already correct
- [Source: `apps/web/src/app/globals.css#L131-133`] — density color tokens
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.5`] — ACs source of truth

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-03-25) — SM story preparation
claude-sonnet-4-6 (2026-03-25) — Dev implementation

### Debug Log References

### Completion Notes List

- Unified `segment-card.tsx` into single card layout: removed 3 early-return paths (pending skeleton, error card, done card) → single `<div>` with conditional badge/button rendering based on `parseStatus`.
- Created `apps/web/src/components/ui/tooltip.tsx` using `@base-ui/react/tooltip` (shadcn tooltip was not installed; project uses base-ui, not @radix-ui directly).
- `adventure-detail.tsx`: density CTA now visible whenever `segments.length > 0`; tooltip with "En attente de l'analyse des segments" shown when `hasPendingSegments`; "Voir la carte" button remains gated to `allDone`.
- `strava-import-modal.tsx`: `staleTime: 0` ensures refetch on every modal open; added client-side search with `useEffect` reset on close.
- All 544 tests pass with 0 regressions. ESLint: 0 errors, 1 pre-existing `<img>` warning (was in original code).

### File List

- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx`
- `apps/web/src/components/ui/tooltip.tsx` (new)
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
