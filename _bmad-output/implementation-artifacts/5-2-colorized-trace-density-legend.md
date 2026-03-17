# Story 5.2: Colorized Trace & Density Legend

Status: done

## Story

As a **cyclist user**,
I want to see my trace colorized by accommodation density after analysis completes,
So that I can immediately identify critical zones (red) and plan around them without further interaction.

## Acceptance Criteria

1. **Given** TanStack Query polling détecte `density_status: 'success'` sur l'adventure (via `GET /density/:adventureId/status`),
   **When** the map is open,
   **Then** the trace re-renders with color segments: green `#22c55e` (≥2 accommodations/10km tronçon → no coverage_gap row), orange `#f59e0b` (1 → severity `medium`), red `#ef4444` (0 → severity `critical`) — without page reload (FR-022).

2. **Given** the user is not on the map page when `density_status` transitions to `success`,
   **When** they navigate to the map page,
   **Then** the colorized trace loads immediately from `coverage_gaps` data returned by `GET /density/:adventureId/status` — no realtime event required, the query result alone drives colorization.

3. **Given** the colorized trace is displayed,
   **When** the user taps the legend icon (`<DensityLegend>` floating button, bottom-right of map, z-10),
   **Then** a popover opens showing:
   - 🟢 **Bonne disponibilité** — 2+ hébergements / 10km
   - 🟠 **Disponibilité limitée** — 1 hébergement / 10km
   - 🔴 **Zone critique** — Aucun hébergement / 10km
   With textual severity labels alongside each color (accessibility — daltonism support) (FR-027).

4. **Given** the colorized trace is displayed,
   **When** a user taps a colored tronçon on the map (any severity),
   **Then** the `useMapStore.setSearchRange(fromKm, toKm)` is called with the tronçon's absolute `fromKm`/`toKm` (relative to start of adventure, not segment), and the corridor search is triggered (the `<SearchRangeSlider>` and `usePois` already react to `useMapStore` changes).

5. **Given** the density analysis has not been triggered or is not yet `success`,
   **When** the map is open,
   **Then** the trace displays with the default grey-blue color (`--trace-default: #94a3b8`) with no density legend icon visible — existing `SEGMENT_COLORS` behavior is preserved for adventures without density data.

6. **Given** the density analysis completes while the user is on the map page,
   **When** the TanStack Query polling (every 3s on `['density', adventureId]`) detects `success`,
   **Then** the trace colorizes with a CSS transition animation (300ms ease-out on opacity, `prefers-reduced-motion` respected → no animation).

7. **Given** a `density_status: 'error'` response,
   **When** the map renders,
   **Then** the trace displays in default grey-blue, no legend icon, and no error is thrown — density failure is silent on the map (the adventure-detail page already shows the error state via `density-trigger-button.tsx`).

8. **Given** `density_status === 'success'` and the colorized trace is active,
   **When** the user toggles the density colorization off (via a toggle button in the legend panel or as a standalone control),
   **Then** the trace reverts to the default `SEGMENT_COLORS` rendering, the toggle persists in `useMapStore` (client state only — no API call), and the `<DensityLegend>` icon remains visible so the user can re-enable.

9. **Given** the density colorization toggle is off,
   **When** the user toggles it back on,
   **Then** the density-colored trace re-renders with the 300ms opacity transition (same as initial colorization, `prefers-reduced-motion` respected).

## Tasks / Subtasks

- [x] Task 1: Create `use-density.ts` hook — TanStack Query with polling (AC: #1, #2, #6)
  - [x] 1.1 Create `apps/web/src/hooks/use-density.ts`
  - [x] 1.2 Implement: `useQuery({ queryKey: ['density', adventureId], queryFn: () => getDensityStatus(adventureId), refetchInterval: (q) => ['pending','processing'].includes(q.state.data?.densityStatus ?? '') ? 3000 : false, enabled: !!adventureId })`
  - [x] 1.3 Return: `{ coverageGaps, densityStatus, isPending }` — typed with `DensityStatusResponse` from `@ridenrest/shared`
  - [x] 1.4 Export hook from `apps/web/src/hooks/index.ts` (if barrel exists) or keep standalone

- [x] Task 2: Integrate density polling into `map-view.tsx` (AC: #1, #2, #5, #6, #7)
  - [x] 2.1 Import `useDensity` hook in `map-view.tsx`
  - [x] 2.2 Call `useDensity(adventureId)` — unconditionally (Rules of Hooks)
  - [x] 2.3 Pass `coverageGaps` and `densityStatus` props to `<MapCanvas>`
  - [x] 2.4 Show `<DensityLegend>` overlay only when `densityStatus === 'success'` (positioned absolute bottom-right z-10, inside the map container div)

- [x] Task 3: Add density coloring to `map-canvas.tsx` (AC: #1, #4, #5, #6)
  - [x] 3.1 Add `coverageGaps?: CoverageGapSummary[]` and `densityStatus?: DensityStatus` props to `MapCanvasProps`
  - [x] 3.2 Create `buildDensityColoredFeatures(segments, coverageGaps)` pure function (exported for testing):
    - For each segment → compute tronçons (same 10km logic as processor): `fromKm = i * 10`, `toKm = Math.min(fromKm + 10, segment.distanceKm)`
    - For each tronçon → filter segment waypoints where `wp.distKm >= fromKm && wp.distKm <= toKm`
    - Skip tronçon if `< 2 waypoints`
    - Lookup coverage_gap: `coverageGaps.find(g => g.segmentId === segment.id && Math.abs(g.fromKm - tronconFromKm) < 0.01 && Math.abs(g.toKm - tronconToKm) < 0.01)`
    - Assign color: `critical → #ef4444`, `medium → #f59e0b`, no gap → `#22c55e`
    - Store `tronconFromKmAbsolute = segment.cumulativeStartKm + fromKm`, `tronconToKmAbsolute = segment.cumulativeStartKm + toKm` in feature properties (for click-to-search)
    - Return `GeoJSON.Feature[]` with properties: `{ color, severity, fromKmAbsolute, toKmAbsolute }`
  - [x] 3.3 Add `useEffect` triggered by `[coverageGaps, densityStatus]`:
    - If `densityStatus === 'success' && coverageGaps && coverageGaps.length >= 0`: compute density features, update `'trace'` source via `source.setData()` with density features OR add a new `'trace-density'` source/layer (see note below)
    - Else: restore default segment-colored features (`buildGeoJsonFeatures(segments)`)
  - [x] 3.4 Add click handler on `'trace-density-line'` layer (via `map.on('click', 'trace-density-line', handler)`):
    - Extract `fromKmAbsolute` and `toKmAbsolute` from clicked feature properties
    - Call `useMapStore.getState().setSearchRange(fromKmAbsolute, toKmAbsolute)` — use `getState()` inside event handler to avoid stale closure
  - [x] 3.5 Add pointer cursor on hover: `map.on('mouseenter', 'trace-density-line', () => map.getCanvas().style.cursor = 'pointer')` + mouseleave reset
  - [x] 3.6 **CSS transition**: when switching from grey to density colors, add a brief opacity transition — implement via MapLibre paint property `transition: { 'line-color': { duration: 300 } }` OR via a React state fade (opacity 0 → 1 over 300ms). Respect `prefers-reduced-motion` media query.
  - [x] 3.7 Ensure density layer is cleaned up on theme switch (existing `map.once('style.load', ...)` in theme effect must also re-add density layer if `densityStatus === 'success'`)

- [x] Task 4: Create `density-legend.tsx` component (AC: #3, #5)
  - [x] 4.1 Create `apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx`
  - [x] 4.2 Render a floating button (bottom-right of map, `position: absolute`, `z-10` per z-index stack) using shadcn `<Popover>` trigger
  - [x] 4.3 Button icon: a colored circle / gradient dot or a simple legend icon (`<Map>` or custom SVG)
  - [x] 4.4 Popover content: 3 rows with colored swatch + label:
    ```
    🟢 #22c55e  |  Bonne disponibilité (2+ hébergements / 10km)
    🟠 #f59e0b  |  Disponibilité limitée (1 hébergement / 10km)
    🔴 #ef4444  |  Zone critique (aucun hébergement / 10km)
    ```
  - [x] 4.5 Swatches: `<div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />` + `<span>` label for screen readers
  - [x] 4.6 Add ARIA: `aria-label="Légende de densité"` on trigger button; popover role `region`
  - [x] 4.7 Use CSS variable `--density-high`, `--density-medium`, `--density-low` from design system if already defined in `globals.css`, else inline hex values as fallback

- [x] Task 5: Add `densityColorEnabled` toggle to `useMapStore` + wire to `DensityLegend` (AC: #8, #9)
  - [x] 5.1 Add `densityColorEnabled: boolean` (default `true`) and `toggleDensityColor: () => void` action to `apps/web/src/stores/map.store.ts`
  - [x] 5.2 In `map-canvas.tsx`, read `densityColorEnabled` from `useMapStore` — include in `useEffect` deps: show density layer only when `densityStatus === 'success' && densityColorEnabled`, revert to `trace-line` otherwise
  - [x] 5.3 Add a toggle button inside `<DensityLegend>` popover (bottom of panel): label "Afficher la colorisation" / "Masquer la colorisation" — use shadcn `<Switch>` or a simple `<button>` with `aria-pressed`
  - [x] 5.4 Wire toggle: `onClick={() => useMapStore.getState().toggleDensityColor()}` inside the popover handler — `<DensityLegend>` icon remains visible regardless of toggle state (AC: #8)

- [x] Task 6: Tests (AC: all)
  - [x] Add to `apps/web/src/stores/map.store.test.ts`: `toggleDensityColor` flips `densityColorEnabled`, default is `true`
  - [x] Add to `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx`: toggle Switch renders checked when store `densityColorEnabled=true`, calls `toggleDensityColor` on click
  - [x] 5.1 `apps/web/src/hooks/use-density.test.ts` — unit test: returns coverageGaps, polling stops at success, stays polling at pending
  - [x] 5.2 `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` (existing file) — add tests for `buildDensityColoredFeatures()`:
    - Empty coverageGaps → all tronçons green
    - Critical gap → red feature for that tronçon
    - Medium gap → orange feature
    - Segment shorter than 10km → single partial tronçon, colored correctly
    - Floating point matching: `fromKm=9.999999` matches `10.0` within epsilon
  - [x] 5.3 `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx` — renders legend icon, opens popover on click, shows all 3 severity rows with labels
  - [x] 5.4 `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` (existing) — add: when `densityStatus === 'success'`, `<DensityLegend>` is rendered; when `'idle'`, it is not

## Dev Notes

### Toggle Density Colorization — State in `useMapStore`

Le toggle est un état purement UI (pas persisté côté serveur). Il vit dans `useMapStore` pour être accessible depuis `map-canvas.tsx` (qui l'utilise dans un `useEffect` MapLibre) et depuis `<DensityLegend>` (qui affiche le contrôle).

```typescript
// map.store.ts — ajout :
densityColorEnabled: boolean  // default: true
toggleDensityColor: () => void
```

```typescript
// Dans map-canvas.tsx — useEffect dépendant de densityColorEnabled :
useEffect(() => {
  const map = mapRef.current
  if (!map || !map.isStyleLoaded()) return

  const showDensity = densityStatus === 'success' && densityColorEnabled && coverageGaps

  if (showDensity) {
    // addDensityLayer ou show 'trace-density-line' + hide 'trace-line'
  } else {
    // hide 'trace-density-line' + show 'trace-line'
  }
}, [densityStatus, densityColorEnabled, coverageGaps, styleVersion])
```

**Comportement attendu :**
- Density `success` + toggle ON → trace colorisée (défaut)
- Density `success` + toggle OFF → trace grise `SEGMENT_COLORS`
- Density non-`success` → trace `SEGMENT_COLORS`, toggle non visible (mais son état reste en store pour si l'utilisateur recharge)
- `<DensityLegend>` reste visible quand toggle OFF — c'est via la légende que l'user peut re-activer

**Emplacement du toggle dans `<DensityLegend>` :** en bas du popover, après les 3 rows de couleurs :
```tsx
<Separator className="my-2" />
<div className="flex items-center justify-between gap-3">
  <span className="text-sm text-muted-foreground">Colorisation active</span>
  <Switch
    checked={densityColorEnabled}
    onCheckedChange={() => useMapStore.getState().toggleDensityColor()}
    aria-label="Activer/désactiver la colorisation de densité"
  />
</div>
```

---

### Architecture Decision: Separate `trace-density` source (do NOT overwrite `trace`)

**Problem:** `map-canvas.tsx` currently uses a single `'trace'` GeoJSON source colored per segment. When density is active, we need to switch to tronçon-level coloring.

**Decision:** Add a **separate** MapLibre source `'trace-density'` and layer `'trace-density-line'`. When `densityStatus === 'success'`:
1. Hide the original `'trace-line'` layer: `map.setLayoutProperty('trace-line', 'visibility', 'none')`
2. Show (or add) `'trace-density-line'` layer with tronçon features

When reverting (status not success):
1. Show `'trace-line'` again
2. Remove or hide `'trace-density-line'`

This avoids mutating the existing trace source, preserving the corridor highlight behavior which depends on a separate `'corridor'` source.

**Layer order:**
```
corridor-highlight   (below trace — added with beforeId='trace-line')
trace-line           (default segment colors — hides when density active)
trace-density-line   (density colors — shows when density active)
trace-joins-circle   (above trace lines always)
poi layers           (above trace)
```

### Tronçon-to-Coverage-Gap Matching: Floating Point Precision

The processor computes tronçons as:
```typescript
for (let fromKm = 0; fromKm < totalKm; fromKm += 10) {
  const toKm = Math.min(fromKm + 10, totalKm)
}
```

The `coverage_gaps` table stores `from_km` and `to_km` as PostgreSQL `real` (32-bit float). JavaScript uses 64-bit doubles. The stored values may not exactly match `0, 10, 20...` due to float representation.

**Matching strategy:** use epsilon comparison `< 0.01` km (= 10m) when looking up gaps:
```typescript
const gap = coverageGaps.find(
  g => g.segmentId === segmentId
    && Math.abs(g.fromKm - tronconFromKm) < 0.01
    && Math.abs(g.toKm - tronconToKm) < 0.01
)
```

### `MapSegmentData` Interface (verify from api-client.ts)

```typescript
// Expected shape — verify against actual type in api-client.ts:
interface MapSegmentData {
  id: string
  name: string
  orderIndex: number
  distanceKm: number
  cumulativeStartKm: number
  parseStatus: 'pending' | 'processing' | 'done' | 'error'
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  waypoints: Array<{ lat: number; lng: number; distKm: number }> | null
}
```

The `distKm` field on waypoints is the distance **from the start of this segment** (not from the adventure start). Add `segment.cumulativeStartKm` to get absolute km for `setSearchRange()`.

### No New API Endpoint Required

`GET /density/:adventureId/status` **already returns** `coverageGaps: CoverageGapSummary[]` (implemented in story 5.1). The `CoverageGapSummary` type has `{ segmentId, fromKm, toKm, severity }` — sufficient for frontend colorization.

Do NOT add a new endpoint. The `useDensity` hook reuses `getDensityStatus()` from `api-client.ts`.

### Click-to-Search: Absolute vs Relative km

The `useMapStore.setSearchRange(fromKm, toKm)` expects **adventure-absolute km** (cumulative from adventure start), not segment-relative km.

The tronçon's waypoints use segment-relative `distKm`. Convert when storing in GeoJSON feature properties:
```typescript
properties: {
  fromKmAbsolute: segment.cumulativeStartKm + tronconFromKm,
  toKmAbsolute: segment.cumulativeStartKm + tronconToKm,
  severity: gap?.severity ?? 'none',
  color: gapColor,
}
```

### MapLibre Event Handler: Avoid Stale Closures

Inside `map.on('click', ...)` event handlers, React state is stale. Use Zustand's `getState()`:
```typescript
map.on('click', 'trace-density-line', (e) => {
  const feature = e.features?.[0]
  if (!feature?.properties) return
  const { fromKmAbsolute, toKmAbsolute } = feature.properties
  // Direct store access avoids stale closure:
  useMapStore.getState().setSearchRange(fromKmAbsolute, toKmAbsolute)
})
```

This pattern is already used for `setViewport` in the existing map.on('moveend') handler approach — consistent.

### Theme Switch: Density Layer Must Be Re-Added

The existing theme switch effect (`map.once('style.load', ...)`) calls `addTraceLayers(map, segments)`. After story 5.2, this effect must also re-add the density layer if active:

```typescript
// In theme switch effect:
map.once('style.load', () => {
  addTraceLayers(map, segments)
  if (densityStatus === 'success' && coverageGaps) {
    addDensityLayer(map, segments, coverageGaps)  // New helper function
    map.setLayoutProperty('trace-line', 'visibility', 'none')
  }
  setStyleVersion((v) => v + 1)
})
```

`densityStatus` and `coverageGaps` are accessed via `useRef` to avoid stale closure:
```typescript
const densityStatusRef = useRef(densityStatus)
useEffect(() => { densityStatusRef.current = densityStatus }, [densityStatus])
```

### CSS Animation (prefers-reduced-motion)

When density colors first appear, animate via MapLibre paint transitions:
```typescript
map.addLayer({
  id: 'trace-density-line',
  type: 'line',
  source: 'trace-density',
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: {
    'line-color': ['get', 'color'],
    'line-width': 4,  // Slightly thicker than default trace (3px) for visual emphasis
    'line-opacity': 0,  // Start transparent
    'line-opacity-transition': { duration: 300, delay: 0 },
  },
})
// Trigger transition after add:
requestAnimationFrame(() => {
  map.setPaintProperty('trace-density-line', 'line-opacity', 0.9)
})
```

For `prefers-reduced-motion`, check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and skip the opacity transition (start at 0.9 directly).

### Z-Index Stack (per UX spec)

```
z-0   MapLibre canvas
z-10  DensityLegend floating button (bottom-right), OsmAttribution, StatusBanner overlays
z-20  LayerToggles (bottom-center)
z-30  SearchRangeSlider (top-right)
```

`<DensityLegend>` uses `className="absolute bottom-16 right-4 z-10"` (above OsmAttribution at bottom-right, below slider).

### Design Tokens (from ux-design-specification.md)

Colors to use — map to CSS vars from `globals.css` (or inline if not yet defined):
```
--density-high:   #22c55e   (green  — ≥2 accommodations, no coverage_gap)
--density-medium: #f59e0b   (amber  — 1 accommodation, severity: 'medium')
--density-low:    #ef4444   (red    — 0 accommodations, severity: 'critical')
--trace-default:  #94a3b8   (grey-blue — before density analysis)
```

**NEVER use density colors for anything other than the trace.** Per UX spec: "Les 3 couleurs de densité sont réservées à la trace."

### Project Structure Notes

**New files:**
```
apps/web/src/hooks/use-density.ts                              ← new hook
apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx ← new component
apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx ← new test
apps/web/src/hooks/use-density.test.ts                         ← new test
```

**Modified files:**
```
apps/web/src/app/(app)/map/[id]/_components/map-view.tsx       ← add useDensity + DensityLegend
apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx     ← add density layer logic + click handler
apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx ← add buildDensityColoredFeatures tests
apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx  ← add density legend render test
```

**No changes needed:**
- `packages/database/` — no new schema
- `apps/api/` — no new endpoint
- `packages/shared/` — types already exist (`DensityStatusResponse`, `CoverageGapSummary`, `DensityStatus`)
- `apps/web/src/lib/api-client.ts` — `getDensityStatus()` already exists
- `apps/web/src/stores/map.store.ts` — `setSearchRange()` already exists

### References

- Coverage gaps schema: [Source: packages/database/src/schema/coverage-gaps.ts]
- DensityStatusResponse type: [Source: packages/shared/src/types/adventure.types.ts#L43-54]
- getDensityStatus() API client fn: [Source: apps/web/src/lib/api-client.ts#L240-241]
- Existing map-canvas.tsx trace layer patterns: [Source: apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx#L148-186]
- Corridor highlight layer (reference for beforeId layer ordering): [Source: apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx#L255-290]
- TanStack Query polling pattern (refetchInterval): [Source: project-context.md#BullMQ Job Queues]
- Query key `['density', adventureId]`: [Source: project-context.md#TanStack Query] — already used in density-trigger-button.tsx
- Density colors + trace-default design token: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Color System Foundation]
- Z-index stack for map overlays: [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Z-Index Stack]
- MapLibre paint transitions API: [MapLibre GL JS docs — setPaintProperty + transition]
- Story 5.1 learnings (BullMQ processor, density patterns): [Source: _bmad-output/implementation-artifacts/5-1-trigger-density-analysis-async-job-processing.md]
- Density data flow: `Browser → TanStack Query polling ['density', adventureId] → coverageGaps → MapCanvas density layer` [Source: architecture.md#Data Flow]
- Open issues from story 5.1: density-trigger-button.tsx missing guard on undefined densityStatus [Source: 5-1-trigger-density-analysis-async-job-processing.md#Review Follow-ups — LOW priority, do NOT fix in this story]

## Review Follow-ups (AI)

- [x] [AI-Review][HIGH] Event listener accumulation — `addDensityLayer` enregistrait `click`/`mouseenter`/`mouseleave` sans jamais les supprimer via `map.off()`. Chaque thème switch ou toggle ajoutait de nouveaux handlers. **Fixed**: WeakMap `densityEventHandlers` stocke les références; `removeDensityLayer` appelle `map.off()` avant de retirer le layer. [map-canvas.tsx:11-21, 461-476]
- [x] [AI-Review][MEDIUM] Layer ordering violation — `trace-density-line` ajouté sans `beforeId`, il se retrouvait au-dessus de `trace-joins-circle` (markers de jonction entre segments cachés). **Fixed**: `map.addLayer({...}, beforeId)` avec `beforeId = 'trace-joins-circle'` si existant. [map-canvas.tsx:426]
- [x] [AI-Review][MEDIUM] Condition vacuouse `coverageGaps.length >= 0` — toujours true, trompeuse. **Fixed**: condition simplifiée à `coverageGaps`. [map-canvas.tsx:117]
- [x] [AI-Review][MEDIUM] Test fragile `aria-checked ?? data-checked` — string `"false"` est truthy, le test passait même si le Switch était unchecked. **Fixed**: `expect(toggle.getAttribute('aria-checked')).toBe('true')`. [density-legend.test.tsx:97]
- [ ] [AI-Review][LOW] Completion notes inexactes — notes mentionnent "shadcn add popover" mais `popover.tsx` utilise `@base-ui/react/popover` (non-Radix). Documentation cosmétique à corriger si besoin. [story:388]
- [ ] [AI-Review][LOW] Task 1.4 — barrel hooks/index.ts inexistant → hook standalone, task marquée [x] sans justification explicite. Acceptable mais une note aurait clarifié. [story:59]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ Task 1: `use-density.ts` hook créé avec TanStack Query polling (3s pour pending/processing, stop sur success/error/idle). Query key `['density', adventureId]` conforme à la convention projet. Types `DensityStatusResponse` importés depuis `@ridenrest/shared`.
- ✅ Task 2: `map-view.tsx` mis à jour — `useDensity` appelé unconditionally (Rules of Hooks), props `coverageGaps` et `densityStatus` passés à `<MapCanvas>`, `<DensityLegend>` affiché conditionnellement (densityStatus === 'success') positionné `absolute bottom-16 right-4 z-10`.
- ✅ Task 3: `map-canvas.tsx` — architecture séparée `trace-density` / `trace-density-line` respectée. `buildDensityColoredFeatures()` exportée (pure function, testable). Epsilon comparison < 0.01km pour float32 DB. CSS transition opacity 0→0.9 sur 300ms, `prefers-reduced-motion` respecté. Refs pour éviter stale closures dans theme effect. Click handler via `useMapStore.getState()` pour éviter stale closure.
- ✅ Task 4: `density-legend.tsx` — `@base-ui/react/popover` (pas Radix, pas d'`asChild`). 3 rows avec swatches `aria-hidden` + labels textuels. `aria-label="Légende de densité"` sur trigger. Shadcn Popover installé via `pnpm dlx shadcn add popover`.
- ✅ Task 5: `useMapStore` étendu avec `densityColorEnabled` (default `true`) + `toggleDensityColor()`. `map-canvas.tsx` lit `densityColorEnabled` via ref (`densityColorEnabledRef`) pour éviter stale closure, inclus dans `useEffect` deps. `density-legend.tsx` affiche `<Switch>` + `<Separator>` en bas du popover, câblé via `useMapStore.getState().toggleDensityColor()`. Shadcn Switch installé.
- ✅ Task 6 (toggle tests): 3 nouveaux tests store (`toggleDensityColor` flip true→false→true, default true), 2 nouveaux tests `density-legend` (Switch checked quand `densityColorEnabled=true`, appel `toggleDensityColor` au clic). 185 tests passent au total.

### File List

**New files:**
- `apps/web/src/hooks/use-density.ts`
- `apps/web/src/hooks/use-density.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.test.tsx`
- `apps/web/src/components/ui/popover.tsx`
- `apps/web/src/components/ui/switch.tsx`

**Modified files:**
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx`
- `apps/web/src/stores/map.store.ts`
- `apps/web/src/stores/map.store.test.ts`
- `apps/api/src/adventures/adventures.repository.ts`

### Change Log

- 2026-03-17: Implemented Story 5.2 — Colorized Trace & Density Legend. Added `useDensity` hook with TanStack Query polling, integrated density layer into MapCanvas using separate `trace-density` MapLibre source, created `DensityLegend` popover component, added 23 new tests (all passing).
- 2026-03-17: Added density colorization toggle (AC #8, #9) — `densityColorEnabled` + `toggleDensityColor` dans `useMapStore`, Switch UI dans `DensityLegend`. Bug fix: `adventures.repository.ts` mapping snake_case `dist_km` → camelCase `distKm` (trace disparue quand DB retournait `undefined`). 185 tests passent au total.
- 2026-03-17: Code review fixes — H1: WeakMap `densityEventHandlers` pour cleanup propre des listeners MapLibre dans `removeDensityLayer` (évite accumulation sur thème switch/density toggle). M1: `trace-density-line` ajouté avec `beforeId='trace-joins-circle'` (layer ordering conforme au spec). M2: condition `coverageGaps.length >= 0` supprimée (vacuouse). M3: test `density-legend.test.tsx:97` corrigé (`aria-checked === 'true'` au lieu du double-attribut fragile).
