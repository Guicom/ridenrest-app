# Story 16.9: Live Mode Stage Layer

Status: done

## Story

As a **cyclist in Live mode**,
I want to see my planning stages on the map and update them dynamically as I ride,
So that I can track progress against my planned day stages in real time.

## Acceptance Criteria

1. **Stages toggle in Filters panel** — When Live mode is active, an "Étapes" toggle is present in `LiveFiltersDrawer`. When enabled, stage endpoint markers appear on the `LiveMapCanvas` at each stage's `end_km` position, rendered with the stage's assigned `color` and `name` label.

2. **"Passed" stage visual state** — When the user's GPS `currentKm` passes a stage `end_km`, that stage marker is visually marked as "passed": the marker uses a muted/desaturated version of its color and displays a checkmark (✓) overlay icon.

3. **Long-press context menu for position update** — When the stages layer is active, long-pressing a stage marker in Live mode opens a small context menu with one action: "Mettre à jour avec ma position". On tap, a confirmation modal appears: "Mettre à jour la fin de l'Étape [name] à votre position actuelle ?". On confirm, `PATCH /adventures/:id/stages/:stageId` is called with the current `currentKm` as the new `endKm`; all affected data is invalidated.

4. **`activeFilterCount` accounts for stages toggle** — When stages are visible, `activeFilterCount` in `live/[id]/page.tsx` increments by 1.

## Tasks / Subtasks

- [x] **Task 1 — Zustand store: `stageLayerActive` in `useLiveStore`** (AC: #1, #2, #4)
  - [x] 1.1 — Add `stageLayerActive: boolean` (default `false`) to `apps/web/src/stores/live.store.ts`
  - [x] 1.2 — Add action `setStageLayerActive: (active: boolean) => void`

- [x] **Task 2 — `LiveFiltersDrawer`: "Étapes" toggle** (AC: #1, #4)
  - [x] 2.1 — Add `stageLayerActive` from `useLiveStore` to `LiveFiltersDrawer`
  - [x] 2.2 — Add a new section (above weather accordion) with label "Étapes" and a `<Switch>` that directly toggles `stageLayerActive` in the store (no Apply needed — immediate like weather/density toggles)
  - [x] 2.3 — In `live/[id]/page.tsx`, add `stageLayerActive` to `activeFilterCount` computation: increment if `stageLayerActive === true`

- [x] **Task 3 — `useStages` call in `live/[id]/page.tsx`** (AC: #1, #3)
  - [x] 3.1 — Add `const { stages } = useStages(adventureId)` in `live/[id]/page.tsx` (hook already exists, no new API client function needed — TQ key `['adventures', adventureId, 'stages']`)
  - [x] 3.2 — Pass `stages` and `stageLayerActive` and `currentKmOnRoute` as props to `<LiveMapCanvas />`

- [x] **Task 4 — `LiveMapCanvas`: stage markers layer** (AC: #1, #2)
  - [x] 4.1 — Add props to `LiveMapCanvasProps`:
    ```typescript
    stages?: AdventureStageResponse[]
    stageLayerActive?: boolean
    currentKmOnRoute?: number | null
    ```
  - [x] 4.2 — Add refs: `stagesRef`, `stageLayerActiveRef`, `currentKmOnRouteRef` — keep in sync with `useEffect`
  - [x] 4.3 — Add source + layer setup in `addStageLayers(map)` — called on map `load` and on `styledata` (style switch), guards with `if (map.getSource('live-stages')) return`
  - [x] 4.4 — Implement `updateStageLayers(map, stages, currentKmOnRoute, layerActive)`:
    - When `!layerActive || stages.length === 0` → setData to empty FeatureCollection
    - When active: build GeoJSON FeatureCollection with one Point per stage; each feature has properties: `{ stageId, name, color, isPassed: endKm <= currentKmOnRoute }`
    - Use `findPointAtKm(kmWaypoints, stage.endKm)` to resolve lat/lng (same as `targetKm` resolution already in the canvas)
  - [x] 4.5 — MapLibre layers: use `symbol` type for label + `circle` type for dot — OR use custom HTML markers (same approach as `renderStageMarkers` in `map-canvas.tsx`). **Prefer the HTML marker approach** for easier styling and long-press support (see Task 5):
    - Marker dot: 16px circle, `background: stage.color`, white border
    - Passed state: `opacity: 0.4`, add a `✓` text inside the dot
    - Label: stage name, rendered as a small tooltip below the marker (`<span>` inside marker element, `position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%)`)
  - [x] 4.6 — Add effect `[stages, stageLayerActive, currentKmOnRoute, mapReady]` → call `updateStageLayers()`; on style switch (`styledata`), re-call `addStageLayers` + `updateStageLayers`
  - [x] 4.7 — Cleanup: remove all live stage markers on component unmount (store in a `liveStageMarkerMap WeakMap` following the same `stageMarkerMap` pattern from `map-canvas.tsx`)

- [x] **Task 5 — Long-press context menu + confirmation modal** (AC: #3)
  - [x] 5.1 — On marker: add `pointerdown` event listener; if `pointerType === 'touch'` start a 500ms timer → show context menu. On `pointerup`/`pointermove`, cancel timer. For desktop: `contextmenu` event.
  - [x] 5.2 — Context menu: small floating `<div>` with one item: "Mettre à jour avec ma position". Position using `getBoundingClientRect()` of the marker element → render as a portal or inline absolute div.
  - [x] 5.3 — On menu item tap → close menu, show confirmation modal via `useState` in `live/[id]/page.tsx`:
    ```
    "Mettre à jour la fin de « [stage.name] » à votre position actuelle ([currentKm] km) ?"
    ```
    Buttons: "Annuler" | "Mettre à jour" (size="lg", WCAG 44px).
  - [x] 5.4 — On confirm: call `updateStage(stageId, { endKm: currentKmOnRoute })` from `useStages` — this triggers TQ invalidation of `['adventures', adventureId, 'stages']` and chain-updates `startKm`/`distanceKm`/`etaMinutes` on the backend (already handled by the stage service's `updateStage` method).
  - [x] 5.5 — Context menu and confirmation modal state managed in `live/[id]/page.tsx` (not inside `LiveMapCanvas`) to keep the canvas free of dialog concerns — canvas calls a callback `onStageLongPress(stageId)` passed as prop.

- [x] **Task 6 — API: `updateStage` with `endKm`** (AC: #3)
  - [x] 6.1 — Verify `UpdateStageInput` in `packages/shared/src/types/` includes `endKm?: number` — if not, add it.
  - [x] 6.2 — Verify `apps/api/src/stages/stages.service.ts` `updateStage()` re-derives `startKm`, `distanceKm`, `elevationGainM`, `etaMinutes` when `endKm` changes (check existing story 11.2 implementation) — if it does, no backend change needed.

- [x] **Task 7 — Tests** (AC: all)
  - [x] 7.1 — `live-map-canvas.test.tsx`: test that stage markers are rendered when `stageLayerActive=true` and `stages` provided; test that passed stage has `opacity: 0.4` style when `currentKmOnRoute` exceeds `endKm`.
  - [x] 7.2 — `live-filters-drawer.test.tsx` (if it exists): test that "Étapes" Switch toggles `stageLayerActive` in store.
  - [x] 7.3 — `live/[id]/page.test.tsx` (if it exists): test that `activeFilterCount` increments when `stageLayerActive = true`.

## Dev Notes

### Architecture — How Stages Are Rendered in Planning Mode (Reference)

In `map-canvas.tsx` (planning mode), stages are rendered as **custom HTML markers** via `renderStageMarkers()`:

```typescript
// map-canvas.tsx — pattern to follow for live mode
for (const stage of stages) {
  const el = document.createElement('div')
  el.className = 'stage-marker'
  el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${stage.color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);cursor:grab`
  const marker = new maplibreglModule.Marker({ element: el, anchor: 'center' })
    .setLngLat([point.lng, point.lat])
    .addTo(map)
}
// Stored in stageMarkerMap WeakMap for cleanup
```

In Live mode, we follow the **same HTML marker pattern** (not GeoJSON layers) because:
1. Custom styling is easier (passed state, checkmark overlay)
2. Long-press events are straightforward on DOM elements
3. Labels as child `<span>` elements are trivial

**IMPORTANT**: Do NOT use `document.createElement` with Tailwind classes on the marker element — use inline `style` strings only, following the existing `map-canvas.tsx` pattern. [project-context.md feedback: never use Tailwind on DOM-created elements]

### Stage Marker HTML Structure (Live mode)

```html
<!-- Normal stage marker -->
<div style="
  position: relative;
  width: 20px; height: 20px; border-radius: 50%;
  background: {stage.color}; border: 2px solid white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.3); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
">
  <!-- Stage name label -->
  <span style="
    position: absolute; bottom: -18px; left: 50%; transform: translateX(-50%);
    font-size: 10px; font-weight: 600; white-space: nowrap;
    color: {stage.color}; text-shadow: 0 1px 2px rgba(255,255,255,0.9);
  ">{stage.name}</span>
</div>

<!-- Passed stage: same + opacity 0.4 + checkmark -->
<div style="...; opacity: 0.4;">
  <span style="font-size: 10px; color: white;">✓</span>
  ...
</div>
```

### `findPointAtKm` — Already Imported in `live-map-canvas.tsx`

```typescript
import { findPointAtKm } from '@ridenrest/gpx'
// Usage:
const point = findPointAtKm(kmWaypointsRef.current, stage.endKm)
if (!point) continue  // stage outside current segment range
```

### Live Stage Marker Cleanup — WeakMap Pattern

Follow the exact pattern from `map-canvas.tsx:stageMarkerMap`:

```typescript
// live-map-canvas.tsx
const liveStageMarkerMap = new WeakMap<object, maplibregl.Marker[]>()

function updateLiveStageMarkers(
  map: maplibregl.Map,
  stages: AdventureStageResponse[],
  kmWaypoints: KmWaypoint[],
  currentKmOnRoute: number | null,
  active: boolean,
  onStageLongPress: (stageId: string) => void,
) {
  // Remove previous markers
  const prev = liveStageMarkerMap.get(map) ?? []
  prev.forEach((m) => m.remove())
  liveStageMarkerMap.set(map, [])

  if (!active || stages.length === 0 || kmWaypoints.length === 0) return

  // Add new markers
  const newMarkers: maplibregl.Marker[] = []
  for (const stage of stages) {
    const point = findPointAtKm(kmWaypoints, stage.endKm)
    if (!point) continue
    const isPassed = currentKmOnRoute !== null && stage.endKm <= currentKmOnRoute
    // create el with inline styles...
    // attach long-press listener...
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([point.lng, point.lat])
      .addTo(map)
    newMarkers.push(marker)
  }
  liveStageMarkerMap.set(map, newMarkers)
}
```

### Long-press Implementation — Mobile (touch)

```typescript
// On the marker element
let longPressTimer: ReturnType<typeof setTimeout> | null = null

el.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return
  longPressTimer = setTimeout(() => {
    onStageLongPress(stageId)
  }, 500)
})
el.addEventListener('pointerup', () => { if (longPressTimer) clearTimeout(longPressTimer) })
el.addEventListener('pointermove', () => { if (longPressTimer) clearTimeout(longPressTimer) })

// Desktop: right-click context menu
el.addEventListener('contextmenu', (e) => {
  e.preventDefault()
  onStageLongPress(stageId)
})
```

### `UpdateStageInput` — Verify Before Implementing

Check `packages/shared/src/types/`:
```typescript
// Expected (from story 11.2):
export interface UpdateStageInput {
  name?: string
  color?: string
  endKm?: number
}
```

If `endKm` is missing, add it. Backend `StagesService.updateStage()` must already handle `endKm` change (recomputes `distanceKm`, `elevationGainM`, `etaMinutes`) — this was implemented in Epic 11.

### TanStack Query Key for Stages

```typescript
// use-stages.ts uses:
['adventures', adventureId, 'stages']
// Invalidation after updateStage is already handled by useStages hook's onSuccess
```

### `activeFilterCount` in `live/[id]/page.tsx`

Current computation (line ~123):
```typescript
const activeFilterCount = useMemo(() => {
  let count = 0
  if (!mapVisibleLayers.has('accommodations')) count++
  if (mapVisibleLayers.has('restaurants')) count++
  if (mapVisibleLayers.has('supplies')) count++
  if (mapVisibleLayers.has('bike')) count++
  if (mapWeatherActive) count++
  if (mapDensityColorEnabled) count++
  if (liveSearchRadiusKm !== DEFAULT_RADIUS) count++
  return count
}, [mapVisibleLayers, mapWeatherActive, mapDensityColorEnabled, liveSearchRadiusKm])
```

Add:
```typescript
const stageLayerActive = useLiveStore((s) => s.stageLayerActive)
// ...in useMemo:
if (stageLayerActive) count++
// ...in dependency array:
}, [..., stageLayerActive])
```

### RGPD Rule — `currentKmOnRoute` is client-side only

`currentKmOnRoute` is computed client-side by `snapToTrace()` and stored in `useLiveStore`. It is NEVER sent to the backend. When the user confirms "Mettre à jour avec ma position", the `endKm` sent to `PATCH /adventures/:id/stages/:stageId` is `currentKmOnRoute` — a distance-along-route km, NOT a GPS coordinate. This complies with the RGPD rule. [project-context.md: GPS position is NEVER sent to or stored on the server]

### Confirmation Modal UX

```
┌──────────────────────────────────────────────────┐
│  Mettre à jour l'étape                           │
│                                                  │
│  Mettre à jour la fin de « Étape 1 » à votre    │
│  position actuelle (23.4 km) ?                   │
│                                                  │
│  ┌────────────────┐  ┌───────────────────────┐  │
│  │    Annuler     │  │   Mettre à jour       │  │
│  └────────────────┘  └───────────────────────┘  │
└──────────────────────────────────────────────────┘
```

Use `shadcn/ui Dialog` (`@/components/ui/dialog`) — consistent with all other modals. Buttons in `DialogFooter` must use `size="lg"` (h-11, WCAG 44px touch target). [project-context.md: Button sizes section]

### Z-index in Live Mode

Context menu / confirmation modal: use `Dialog` → it handles `z-index` via `Radix Portal` (above z-50 drawer). Context menu floating div: `z-[60]` (above drawer at z-50).

### `live.store.ts` — Current Structure

From 16.8 implementation, `live.store.ts` already has `avgSpeedKmh` related state. Adding `stageLayerActive` follows the flat Zustand store pattern:

```typescript
// apps/web/src/stores/live.store.ts — additions
stageLayerActive: boolean         // NEW — default false
setStageLayerActive: (active: boolean) => void  // NEW
```

### Project Structure Notes

| File | Action |
|---|---|
| `apps/web/src/stores/live.store.ts` | Add `stageLayerActive` + `setStageLayerActive` |
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` | Add `stages`, `stageLayerActive`, `currentKmOnRoute`, `onStageLongPress` props; add `updateLiveStageMarkers`; call on stage/currentKm/active changes |
| `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` | Add "Étapes" Switch toggle (immediate, no Apply) |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Add `useStages(adventureId)`; pass stage props to canvas; handle `onStageLongPress` → confirmation modal; update `activeFilterCount` |
| `packages/shared/src/types/adventure.types.ts` | Verify `UpdateStageInput.endKm?: number` exists |

### References

- Story 11.2: drag stage markers on map — same `renderStageMarkers` pattern reused here [map-canvas.tsx:864-984]
- Story 16.3: `stageClickModeRef` + WeakMap cleanup pattern [project-context.md#Map-Interaction-UX-Story-16.3]
- `useLiveStore` current state: `apps/web/src/stores/live.store.ts`
- `LiveMapCanvas` current implementation: `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx`
- `useStages` hook: `apps/web/src/hooks/use-stages.ts` — TQ key `['adventures', adventureId, 'stages']`
- `AdventureStageResponse` type: `packages/shared/src/types/adventure.types.ts:66`
- Button WCAG sizes: `size="lg"` (h-11) for all dialog buttons [project-context.md#Button-Component]
- Long-press pattern: same as `SectionTooltip` (500ms, pointerType touch) [project-context.md#SectionTooltip]
- RGPD GPS rule: km distance sent (not GPS coords) [project-context.md#RGPD-Geolocation-Rule]
- No Tailwind on DOM-created elements [project-context.md feedback]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ Task 1: `stageLayerActive` + `setStageLayerActive` ajoutés au store Zustand `useLiveStore`
- ✅ Task 2: Section "Étapes" avec `<Switch>` immédiat ajoutée dans `LiveFiltersDrawer` au-dessus du bloc météo; `activeFilterCount` mis à jour dans `page.tsx`
- ✅ Task 3: `useStages(adventureId)` appelé dans `live/[id]/page.tsx`; `stages`, `stageLayerActive`, `currentKmOnRoute`, `onStageLongPress` passés à `<LiveMapCanvas />`
- ✅ Task 4: `updateLiveStageMarkers` implémenté avec pattern HTML markers (inline styles, no Tailwind), `liveStageMarkerMap WeakMap`, `MarkerClassRef` pour la classe Marker, cleanup complet au unmount et sur styledata
- ✅ Task 5: Long-press (500ms touch + contextmenu desktop) déclenche `onStageLongPress(stageId)` → `Dialog` shadcn/ui dans `page.tsx` pour confirmation; `updateStageMutation` appelé sur confirm avec `endKm: currentKmOnRoute` (RGPD compliant — km distance, pas GPS)
- ✅ Task 6: `UpdateStageInput.endKm` déjà présent dans zod schema; backend `updateStage` déjà recompute `distanceKm/elevationGainM/etaMinutes` — aucun changement backend nécessaire
- ✅ Task 7: 3 tests live-map-canvas (markers rendus, non rendus quand inactif, opacity 0.4 pour passed); 4 tests live-filters-drawer (label+switch, état store, toggle); 1 test page (activeFilterCount increment)
- Note technique: `el.style.opacity = '0.4'` défini séparément du `cssText` pour éviter le problème de parsing JSDOM

### Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] Marqueurs stage reconstruits entièrement à chaque update GPS — séparer l'effet structural `[stages, stageLayerActive, kmWaypoints]` de la mise à jour d'opacité `[currentKmOnRoute]` pour éviter scintillement mobile [live-map-canvas.tsx:221-231]
- [ ] [AI-Review][LOW] Ajouter `display:flex;align-items:center;justify-content:center` sur `el.style.cssText` pour être conforme à la spec du story [live-map-canvas.tsx:376]
- [ ] [AI-Review][LOW] `_cachedMarker` module-level peut masquer un `MarkerClassRef` null dans les tests — surveiller si tests de régression apparaissent [live-map-canvas.tsx:18]
- [ ] [AI-Review][LOW] Documenter les 3 fichiers modifiés hors scope (`layout.tsx`, `map/[id]/page.tsx`, `vitest.config.ts`) ou révertir si changements purement cosmétiques

### File List

- `apps/web/src/stores/live.store.ts` — ajout `stageLayerActive` + `setStageLayerActive`
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — ajout section "Étapes" Switch
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — ajout props stages/stageLayerActive/currentKmOnRoute/onStageLongPress, `updateLiveStageMarkers`, `liveStageMarkerMap`, `MarkerClassRef`; fix `position:relative` sur élément marqueur
- `apps/web/src/app/(app)/live/[id]/page.tsx` — ajout `useStages`, `stageLayerActive` dans activeFilterCount, `Dialog` confirmation modal, `stageLongPressStageId` state; fix bouton confirm désactivé quand GPS null
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` — 3 nouveaux tests stage markers
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx` — 4 nouveaux tests Étapes toggle
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` — mock useStages + Dialog, tests dialog flow (AC #3), confirm disabled quand GPS null, `stageLayerActive` dans le mock store
