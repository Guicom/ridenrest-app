# Story 16.20: Live Mode Slider — Dynamic Max Based on Remaining Distance

Status: done

## Story

As a **cyclist in Live mode**,
I want the "Mon hôtel dans X km" slider to go up to the remaining distance of my adventure (not a fixed 100 km),
So that I can search for accommodations along the entire remaining route, not just the next 100 km.

## Bug Description

In `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` (line 73), the slider has a hardcoded `max={100}`. This means:
- On a 300 km adventure at km 50, the user can only look ahead 100 km (to km 150) instead of the remaining 250 km
- On a 40 km segment, the slider still shows 100 km which is misleading — the user can set a target beyond the end of the trace

The max should be the remaining distance: `totalDistanceKm - currentKmOnRoute`.

## Acceptance Criteria

1. **Dynamic slider max** — Given the user is at km X on a trace of total distance D, when the slider renders, then `max` equals `Math.ceil(D - X)` rounded down to the nearest multiple of 5 (consistent with `step={5}`).

2. **Clamp targetAheadKm when max shrinks** — Given the slider max decreases (user moves forward on the trace), when `targetAheadKm > newMax`, then `targetAheadKm` is automatically clamped to the new max value.

3. **Minimum max value** — Given the user is very close to the end of the trace (remaining < 5 km), when the slider renders, then `max` is at least 5 (the step value) to avoid an unusable slider.

4. **Fallback to 100 km** — Given `currentKmOnRoute` is null (GPS not yet snapped) or total distance is unknown, when the slider renders, then `max` defaults to 100 (current behavior preserved).

5. **No regression** — Given the slider max changes dynamically, when the user interacts with the slider, then all dependent features (ETA, D+, search, auto-zoom) continue working correctly.

## Tasks / Subtasks

- [x] Task 1: Pass remaining distance to `LiveControls` (AC: #1, #4)
  - [x] 1.1 — In `live/[id]/page.tsx`, compute `remainingKm` from `allCumulativeWaypoints` and `currentKmOnRoute`
  - [x] 1.2 — Pass `remainingKm` (or `maxAheadKm`) as prop to `LiveControls`
  - [x] 1.3 — When `currentKmOnRoute` is null or waypoints are empty, pass `undefined` (component uses 100 as default)

- [x] Task 2: Update `LiveControls` slider max (AC: #1, #2, #3)
  - [x] 2.1 — Add `maxAheadKm?: number` prop to `LiveControlsProps`
  - [x] 2.2 — Compute effective max: `Math.max(5, roundToStep(maxAheadKm ?? 100, 5))` where `roundToStep` rounds down to nearest multiple of step
  - [x] 2.3 — Set `max={effectiveMax}` on the Slider
  - [x] 2.4 — When `effectiveMax` changes and `targetAheadKm > effectiveMax`, call `setTargetAheadKm(effectiveMax)` (clamp)

- [x] Task 3: Unit tests (AC: #1–#5)
  - [x] 3.1 — Test: slider max reflects remaining distance (e.g. total 200km, currentKm 50 → max 150)
  - [x] 3.2 — Test: slider max rounds down to step=5 (e.g. remaining 143km → max 140)
  - [x] 3.3 — Test: slider max minimum is 5 even when remaining < 5
  - [x] 3.4 — Test: slider max defaults to 100 when `maxAheadKm` is undefined
  - [x] 3.5 — Test: targetAheadKm is clamped when max shrinks below current value

## Dev Notes

### Current Code

```tsx
// live-controls.tsx:66-78
<Slider
  value={[targetAheadKm]}
  onValueChange={(v) => { ... setTargetAheadKm(val) }}
  min={5}
  max={100}  // ← hardcoded
  step={5}
/>
```

### Computing remainingKm in page.tsx

```tsx
// In LivePage, near line 188
const totalDistKm = allCumulativeWaypoints.length > 0
  ? allCumulativeWaypoints[allCumulativeWaypoints.length - 1].distKm
  : null
const maxAheadKm = (currentKmOnRoute !== null && totalDistKm !== null)
  ? Math.max(5, totalDistKm - currentKmOnRoute)
  : undefined
```

### Files to Modify

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Compute `maxAheadKm` from waypoints + currentKm, pass to `LiveControls` |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` | Accept `maxAheadKm` prop, use as dynamic slider max, clamp targetAheadKm |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` (or new) | Unit tests for dynamic max behavior |

### Architecture Compliance

- No new dependencies
- `currentKmOnRoute` already in `useLiveStore`, `allCumulativeWaypoints` already computed in `page.tsx`
- Step rounding ensures slider ticks stay aligned (multiple of 5)

## Dev Agent Record

### Implementation Plan

- Task 1: Compute `maxAheadKm` in `page.tsx` using `allCumulativeWaypoints` (last waypoint's `distKm`) minus `currentKmOnRoute`. Returns `undefined` when either value is null/empty → LiveControls defaults to 100.
- Task 2: Added `maxAheadKm` prop to `LiveControls`. Exported `roundDownToStep()` helper. Effective max = `Math.max(5, roundDownToStep(maxAheadKm ?? 100, 5))`. Added `useEffect` to clamp `targetAheadKm` when `effectiveMax` shrinks below it.
- Task 3: Extended existing `live-controls.test.tsx` with 6 new tests (dynamic max behavior) + 4 `roundDownToStep` unit tests. All 28 tests pass. Full live test suite (137 tests) passes with zero regressions.

### Completion Notes

- ✅ All 5 ACs satisfied: dynamic max (#1), clamp (#2), min 5 (#3), fallback 100 (#4), no regression (#5)
- No new dependencies added
- Pre-existing TS errors in `map-canvas.test.tsx` and `weather-layer.test.tsx` are unrelated

## File List

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Added `maxAheadKm` useMemo + pass as prop to LiveControls |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` | Added `maxAheadKm` prop, `roundDownToStep` helper, `effectiveMax` computation, clamp useEffect |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` | Added 10 tests for dynamic max behavior + roundDownToStep |

## Senior Developer Review (AI)

**Reviewer:** Guillaume — 2026-04-05
**Verdict:** Approved with fixes applied

### Findings (3 fixed, 1 informational)

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| H1 | HIGH | Missing `Math.ceil` on remaining distance in page.tsx — lost up to ~5km of searchable range at trace end | ✅ Fixed |
| M1 | MEDIUM | Redundant `Math.max(5, ...)` guard in page.tsx (LiveControls already handles it) | ✅ Fixed |
| L1 | LOW | Slider `value` briefly exceeded `max` for 1 render frame before useEffect clamp | ✅ Fixed (inline `Math.min` clamp) |
| L2 | LOW | AC #1 wording said "rounded to nearest" but code rounds down (correct behavior) | ✅ AC text updated |

### Fixes Applied
- `page.tsx:198`: `Math.max(5, remaining)` → `Math.ceil(remaining)` — applies ceil per AC, removes redundant min guard
- `live-controls.tsx:88`: `value={[targetAheadKm]}` → `value={[Math.min(targetAheadKm, effectiveMax)]}` — eliminates stale-frame glitch

## Change Log

- 2026-04-05: Implemented dynamic slider max based on remaining distance (Story 16.20)
- 2026-04-05: Code review — fixed 3 issues (H1: Math.ceil, M1: redundant guard, L1: inline clamp)
