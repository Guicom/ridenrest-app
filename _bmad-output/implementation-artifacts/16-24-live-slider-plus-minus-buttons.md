# Story 16.24: Live Mode Slider — Boutons − / + pour Ajustement Precis

Status: done

## Story

As a **cyclist in Live mode on mobile**,
I want − and + buttons on either side of the distance slider,
so that I can precisely adjust the "Mon hotel dans X km" value without struggling with the slider thumb on a small screen.

## Acceptance Criteria

1. **Given** l'utilisateur est en mode Live et le panneau de controle s'affiche,
   **When** le composant `LiveControls` est rendu,
   **Then** un bouton `−` est visible a gauche du slider et un bouton `+` a droite, alignes verticalement au centre du slider.

2. **Given** le slider affiche une valeur de `targetAheadKm` superieure au minimum (5 km),
   **When** l'utilisateur tape le bouton `−`,
   **Then** `targetAheadKm` diminue de `SLIDER_STEP` (5 km), et la valeur affichee ainsi que la position du thumb se mettent a jour immediatement.

3. **Given** le slider affiche une valeur de `targetAheadKm` inferieure a `effectiveMax`,
   **When** l'utilisateur tape le bouton `+`,
   **Then** `targetAheadKm` augmente de `SLIDER_STEP` (5 km), et la valeur affichee ainsi que la position du thumb se mettent a jour immediatement.

4. **Given** `targetAheadKm` est deja au minimum (5 km),
   **When** l'utilisateur tape `−`,
   **Then** le bouton est visuellement desactive (`opacity-50`, `cursor-not-allowed`) et aucune action ne se produit.

5. **Given** `targetAheadKm` est deja a `effectiveMax`,
   **When** l'utilisateur tape `+`,
   **Then** le bouton est visuellement desactive (`opacity-50`, `cursor-not-allowed`) et aucune action ne se produit.

## Tasks / Subtasks

- [x] Task 1: Add − / + buttons around the slider (AC: #1)
  - [x] 1.1 Import `Minus` and `Plus` icons from `lucide-react` in `live-controls.tsx`
  - [x] 1.2 Wrap the existing `<Slider>` in a flex row: `<div className="flex items-center gap-2 mb-8">`
  - [x] 1.3 Add `−` button before the Slider: `<button data-testid="btn-minus">` with `<Minus>` icon
  - [x] 1.4 Add `+` button after the Slider: `<button data-testid="btn-plus">` with `<Plus>` icon
  - [x] 1.5 Move `mb-8` from `<Slider>` to the wrapper `<div>` (Slider no longer needs its own bottom margin)
  - [x] 1.6 Add `flex-1` to `<Slider>` so it fills remaining space between buttons

- [x] Task 2: Wire button logic (AC: #2, #3, #4, #5)
  - [x] 2.1 `−` onClick: `setTargetAheadKm(Math.max(5, targetAheadKm - SLIDER_STEP))`
  - [x] 2.2 `+` onClick: `setTargetAheadKm(Math.min(effectiveMax, targetAheadKm + SLIDER_STEP))`
  - [x] 2.3 Compute `atMin = targetAheadKm <= 5` and `atMax = targetAheadKm >= effectiveMax`
  - [x] 2.4 Apply disabled style: `${atMin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10 active:scale-95'}`
  - [x] 2.5 Add `disabled={atMin}` / `disabled={atMax}` HTML attribute for accessibility
  - [x] 2.6 Add `aria-label="Diminuer de 5 km"` / `aria-label="Augmenter de 5 km"`

- [x] Task 3: Unit tests (AC: #1–#5)
  - [x] 3.1 Test: `btn-minus` and `btn-plus` are rendered in the DOM
  - [x] 3.2 Test: clicking `btn-minus` decreases `targetAheadKm` by 5
  - [x] 3.3 Test: clicking `btn-plus` increases `targetAheadKm` by 5
  - [x] 3.4 Test: `btn-minus` is disabled when `targetAheadKm` is 5
  - [x] 3.5 Test: `btn-plus` is disabled when `targetAheadKm` equals `effectiveMax`
  - [x] 3.6 Test: clicking disabled `btn-minus` does not change `targetAheadKm`
  - [x] 3.7 Test: clicking disabled `btn-plus` does not change `targetAheadKm`

### Review Findings

- [x] [Review][Patch] Hardcoded `5` instead of `SLIDER_STEP` in atMin check and Math.max guard [live-controls.tsx:93,98] — fixed
- [x] [Review][Defer] First-render visual inconsistency: header shows raw targetAheadKm before useEffect clamp [live-controls.tsx:58] — deferred, pre-existing (story 16.20)
- [x] [Review][Defer] Negative maxAheadKm possible from page.tsx when GPS overshoots trace end [page.tsx:198] — deferred, pre-existing, guarded by Math.max
- [x] [Review][Defer] One-frame window where store targetAheadKm exceeds effectiveMax after max shrinks [live-controls.tsx:44-48] — deferred, pre-existing (story 16.20)

## Dev Notes

### Key File to Modify

| File | Change |
|------|--------|
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` | Add − / + buttons around slider, wire click handlers |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` | Add 7 tests for button behavior |

### Current Slider Code (lines 91–104)

```tsx
{/* Distance cible slider */}
<Slider
  value={[Math.min(targetAheadKm, effectiveMax)]}
  onValueChange={(v: number | readonly number[]) => {
    const val = typeof v === 'number' ? v : v[0]
    setTargetAheadKm(val)
  }}
  min={5}
  max={effectiveMax}
  step={SLIDER_STEP}
  data-testid="slider-target"
  className="mb-8"
  thumbClassName="size-6 border-2 after:-inset-1"
/>
```

### Target Layout After Modification

```tsx
{/* Distance cible slider with +/- buttons */}
<div className="flex items-center gap-2 mb-8">
  <button
    onClick={() => !atMin && setTargetAheadKm(Math.max(5, targetAheadKm - SLIDER_STEP))}
    disabled={atMin}
    data-testid="btn-minus"
    aria-label="Diminuer de 5 km"
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary text-primary transition-all duration-75 ${atMin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10 active:scale-95'}`}
  >
    <Minus className="h-4 w-4" />
  </button>
  <Slider
    value={[Math.min(targetAheadKm, effectiveMax)]}
    onValueChange={(v: number | readonly number[]) => {
      const val = typeof v === 'number' ? v : v[0]
      setTargetAheadKm(val)
    }}
    min={5}
    max={effectiveMax}
    step={SLIDER_STEP}
    data-testid="slider-target"
    className="flex-1"
    thumbClassName="size-6 border-2 after:-inset-1"
  />
  <button
    onClick={() => !atMax && setTargetAheadKm(Math.min(effectiveMax, targetAheadKm + SLIDER_STEP))}
    disabled={atMax}
    data-testid="btn-plus"
    aria-label="Augmenter de 5 km"
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary text-primary transition-all duration-75 ${atMax ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10 active:scale-95'}`}
  >
    <Plus className="h-4 w-4" />
  </button>
</div>
```

### Existing Constants & State (already available, no changes needed)

- `SLIDER_STEP = 5` (line 31)
- `DEFAULT_MAX = 100` (line 32)
- `effectiveMax` computed at line 41
- `targetAheadKm` from `useLiveStore` (line 36)
- `setTargetAheadKm` from `useLiveStore` (line 38)

### Icons

`Minus` and `Plus` are standard lucide-react icons — already a project dependency, just add to the import on line 4:
```tsx
import { Search, SlidersHorizontal, MountainSnow, Clock, Minus, Plus } from 'lucide-react'
```

### Button Styling Rationale

- `h-8 w-8 rounded-full border border-primary text-primary` — matches the project's circular button pattern (similar to filter badge buttons)
- `shrink-0` — prevents buttons from shrinking on narrow mobile screens
- `hover:bg-primary/10 active:scale-95` — consistent micro-interaction with existing buttons
- No `bg-*` on default state — ghost style keeps focus on the slider and the km value

### Anti-Patterns to Avoid

- **DO NOT** create a separate component for the buttons — they are 2 inline `<button>` elements, no abstraction needed
- **DO NOT** add debounce/throttle — the step is discrete (5km), rapid taps are fine
- **DO NOT** change the Slider component itself (`components/ui/slider.tsx`) — only modify `live-controls.tsx`
- **DO NOT** add long-press/hold-to-repeat behavior — step buttons are sufficient for MVP

### Test Mock Note

The existing test file mocks `<Slider>` as an `<input type="range">` (lines 15–30). The new `btn-minus` and `btn-plus` tests do NOT need the Slider mock — they interact directly with the buttons and check `useLiveStore.getState().targetAheadKm`.

### Previous Story Intelligence (16.20)

Story 16.20 introduced `effectiveMax`, `roundDownToStep()`, and the clamp `useEffect`. The + button must respect `effectiveMax` (not `maxAheadKm` raw). The inline `Math.min(targetAheadKm, effectiveMax)` on the Slider value (fix L1) remains as-is.

### Architecture Compliance

- No new dependencies (lucide-react already installed)
- No store changes (uses existing `setTargetAheadKm`)
- No API changes
- Single file modification + test extension
- Co-located tests in same `_components/` folder

### References

- [Source: _bmad-output/implementation-artifacts/16-20-live-slider-dynamic-max-remaining-km.md] — effectiveMax, roundDownToStep, clamp logic
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx] — current slider code (lines 91–104)
- [Source: apps/web/src/stores/live.store.ts] — targetAheadKm state + setTargetAheadKm action
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx] — existing test patterns and mocks

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Aucun problème rencontré. Implémentation directe conforme au spec.

### Completion Notes List

- Importé `Minus` et `Plus` depuis `lucide-react` (ligne 4)
- Encapsulé le `<Slider>` dans un flex row avec boutons `−` et `+` de chaque côté
- Utilisé un IIFE pour calculer `atMin`/`atMax` localement dans le JSX (pas de variable supplémentaire au niveau du composant)
- Boutons : `h-8 w-8 rounded-full border border-primary`, ghost style, `shrink-0`
- Disabled : `opacity-50 cursor-not-allowed` + attribut HTML `disabled` + garde `!atMin`/`!atMax` dans onClick
- Aria-labels en français conformes au spec
- 7 tests unitaires ajoutés couvrant rendu, incrémentation, décrémentation, et états disabled
- 893/893 tests passent, 0 régression

### File List

| File | Action |
|------|--------|
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` | Modified — added − / + buttons around slider |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` | Modified — added 7 unit tests for +/- buttons |
