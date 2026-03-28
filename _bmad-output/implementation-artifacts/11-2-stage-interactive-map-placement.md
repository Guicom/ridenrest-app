# Story 11.2: Stage Interactive Map & Profile Placement

Status: done

## Story

As a **cyclist creating stages**,
I want to place and adjust stage endpoints directly on the map or elevation profile,
So that I can visually fine-tune where each day ends based on terrain.

## Acceptance Criteria

**AC1 — Hover preview pendant le click mode**

**Given** the user has clicked "Ajouter une étape" (stageClickMode=true),
**When** they move the cursor over the map near the GPX trace,
**Then** a floating overlay shows in real-time: `+{deltaKm} km · D+ {dPlus} m` where deltaKm = cursor distKm − lastStage.endKm (or 0), dPlus = cumulative D+ between those two km positions — updated on every mouse move.

**AC2 — Drag marker pour repositionner l'endpoint**

**Given** a stage endpoint marker exists on the map,
**When** the user drags it to a new position on the trace,
**Then** the marker snaps to the nearest GPX waypoint; `end_km` is updated via API PATCH; subsequent stages' `start_km` and `distanceKm` are recalculated (server-side cascade, same logic as delete); the map and sidebar update immediately.

**AC3 — Lignes d'étape sur le profil d'élévation**

**Given** stages are defined and the elevation profile is visible,
**When** the elevation profile renders (Story 8.8 `ElevationProfile` component),
**Then** each stage boundary appears as a solid colored vertical `<ReferenceLine>` at `stage.endKm`, using `stage.color`; a small label shows `stage.name` — visually distinct from the segment boundary lines (which are dashed gray).

**AC4 — Toggle visibilité (déjà en 11.1 — validation)**

**Given** the user toggles "Afficher sur la carte" off in the stages section,
**When** the map and elevation profile render,
**Then** ALL stage markers, colored trace segments, AND elevation profile stage lines disappear — single toggle controls both map and profile visibility.

## Tasks / Subtasks

### Phase 1 — Backend: autoriser la mise à jour de endKm

- [x] Task 1: Extend `UpdateStageDto` + `StagesService` to handle `endKm` update (AC2)
  - [x] 1.1 In `apps/api/src/stages/dto/update-stage.dto.ts`, add:
    ```typescript
    @IsNumber() @IsOptional() @Min(0)
    endKm?: number
    ```
  - [x] 1.2 In `apps/api/src/stages/stages.service.ts`, update `updateStage()`:
    - If `dto.endKm` is provided:
      1. Find the current stage
      2. Compute `newStartKm` = unchanged (startKm stays — only endKm changes)
      3. Validate `dto.endKm > stage.startKm` → `BadRequestException` if not (distance must be > 0)
      4. Update `end_km` + `distance_km = dto.endKm - stage.startKm`
      5. Cascade: reload all subsequent stages (orderIndex > stage.orderIndex) and update each `start_km` = previous stage `end_km`, `distance_km = end_km - start_km`
      6. `updateMany()` for all affected stages
    - If `dto.endKm` is undefined: existing name/color-only update path unchanged
  - [x] 1.3 Update `apps/api/src/stages/stages.service.test.ts`, add tests:
    - Test: `updateStage` with `endKm` updates `distanceKm` correctly
    - Test: `updateStage` with `endKm` cascades `start_km` to subsequent stages
    - Test: `updateStage` throws `BadRequestException` if `endKm <= stage.startKm`

### Phase 2 — Frontend API client

- [x] Task 2: Update API client for `endKm` patch (AC2)
  - [x] 2.1 In `packages/shared/src/schemas/stage.schema.ts`, add `endKm` to `updateStageSchema`:
    ```typescript
    export const updateStageSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      endKm: z.number().min(0).optional(),
    })
    ```
    `UpdateStageInput` is inferred — no change needed to the type export.
  - [x] 2.2 No change needed to `updateStage()` in `api-client.ts` — it already passes the full `UpdateStageInput` body.
  - [x] 2.3 No change needed to `useStages` hook — `updateStage(stageId, data)` already accepts the full `UpdateStageInput`.

### Phase 3 — Drag markers sur MapCanvas

- [x] Task 3: Make stage markers draggable in `map-canvas.tsx` (AC2)
  - [x] 3.1 Add `onStageDragEnd` prop to `MapCanvasProps`:
    ```typescript
    onStageDragEnd?: (stageId: string, newEndKm: number) => void
    ```
  - [x] 3.2 In the stage markers render loop, add `draggable` and `onDragEnd` to each `<Marker>`:
    Note: implemented imperatively via MapLibre GL JS Marker API (not react-map-gl JSX), consistent with existing code
    ```tsx
    <Marker
      key={stage.id}
      latitude={wp.lat}
      longitude={wp.lng}
      anchor="center"
      draggable={true}
      onDragEnd={(e) => {
        // Find nearest waypoint to drop position
        const { lng, lat } = e.lngLat
        if (!allWaypoints?.length) return
        const nearest = allWaypoints.reduce((best, wp) => {
          const d = (wp.lat - lat) ** 2 + (wp.lng - lng) ** 2
          const dBest = (best.lat - lat) ** 2 + (best.lng - lng) ** 2
          return d < dBest ? wp : best
        })
        onStageDragEnd?.(stage.id, nearest.distKm)
      }}
    >
      <div
        className="h-4 w-4 rounded-full border-2 border-white shadow-md cursor-grab active:cursor-grabbing"
        style={{ backgroundColor: stage.color }}
      />
    </Marker>
    ```
    Note: same nearest-neighbor pattern as click handler in 11.1 — consistent, no external snap dependency.
  - [x] 3.3 In `map-view.tsx`, wire `onStageDragEnd`:
    ```typescript
    onStageDragEnd={async (stageId, newEndKm) => {
      await updateStage(stageId, { endKm: newEndKm })
      // useStages invalidates query on success → map re-renders with updated positions
    }}
    ```
    Note: `updateStage` is from `useStages(adventureId)` — already in `map-view.tsx`.
  - [x] 3.4 Update `map-canvas.test.tsx`:
    - Test: `onDragEnd` on a stage marker calls `onStageDragEnd` with the correct stageId and snapped `distKm`

### Phase 4 — Hover preview pendant click mode

- [x] Task 4: Add real-time preview overlay during `stageClickMode` (AC1)
  - [x] 4.1 Add `onStageHoverKm` prop to `MapCanvasProps`:
    ```typescript
    onStageHoverKm?: (distKm: number | null) => void  // null = cursor left trace
    ```
  - [x] 4.2 In `map-canvas.tsx`, in the `useEffect` that handles `stageClickMode`:
    - Also add `onMouseMove` handler on the map when `stageClickMode=true`:
      ```typescript
      const handleMouseMove = (e: maplibregl.MapMouseEvent) => {
        if (!allWaypoints?.length) return
        const { lng, lat } = e.lngLat
        const nearest = allWaypoints.reduce((best, wp) => {
          const d = (wp.lat - lat) ** 2 + (wp.lng - lng) ** 2
          const dBest = (best.lat - lat) ** 2 + (best.lng - lng) ** 2
          return d < dBest ? wp : best
        })
        onStageHoverKm?.(nearest.distKm)
      }
      const handleMouseLeave = () => onStageHoverKm?.(null)
      map.on('mousemove', handleMouseMove)
      map.on('mouseout', handleMouseLeave)
      // cleanup: map.off('mousemove', handleMouseMove); map.off('mouseout', handleMouseLeave)
      ```
  - [x] 4.3 In `map-view.tsx`:
    - Add state: `const [hoverKmPreview, setHoverKmPreview] = useState<number | null>(null)`
    - Wire: `onStageHoverKm={setHoverKmPreview}`
    - Pass `elevationPoints` from `useElevationProfile` (already computed via `allCumulativeWaypoints` + `readySegments`):
      ```typescript
      // useElevationProfile is already called indirectly via ElevationProfile component.
      // For the preview, call it directly in map-view.tsx:
      const { points: elevationPoints } = useElevationProfile(allCumulativeWaypoints, readySegments)
      ```
    - Compute preview values:
      ```typescript
      const lastStageEndKm = stages.length > 0 ? stages[stages.length - 1].endKm : 0
      const previewDeltaKm = hoverKmPreview !== null ? Math.max(0, hoverKmPreview - lastStageEndKm) : null
      const previewDPlus = useMemo(() => {
        if (hoverKmPreview === null || elevationPoints.length === 0) return null
        const fromPt = elevationPoints.find(p => p.distKm >= lastStageEndKm) ?? elevationPoints[0]
        const toPt = [...elevationPoints].reverse().find(p => p.distKm <= hoverKmPreview) ?? elevationPoints[0]
        return Math.max(0, toPt.cumulativeDPlus - fromPt.cumulativeDPlus)
      }, [hoverKmPreview, elevationPoints, lastStageEndKm])
      ```
    - Reset `hoverKmPreview` when `stageClickMode` becomes `false`
  - [x] 4.4 Render preview overlay in `map-view.tsx` (inside the map area `<div className="relative flex-1 min-h-0">`):
    ```tsx
    {stageClickMode && hoverKmPreview !== null && previewDeltaKm !== null && (
      <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-background/90 px-3 py-1.5 text-xs shadow-md backdrop-blur-sm border border-[--border]">
        <span className="font-mono font-medium">+{previewDeltaKm.toFixed(1)} km</span>
        {previewDPlus !== null && (
          <span className="ml-2 text-muted-foreground">D+ <span className="font-mono font-medium">{previewDPlus.toFixed(0)} m</span></span>
        )}
      </div>
    )}
    ```
  - [x] 4.5 Write test in `map-canvas.test.tsx`:
    - Test: when `stageClickMode=true`, `mousemove` event calls `onStageHoverKm` with nearest waypoint distKm
    - Test: when `stageClickMode=false`, `mousemove` handler is NOT registered

### Phase 5 — Lignes d'étape sur le profil d'élévation

- [x] Task 5: Add stage boundary lines to `ElevationProfile` component (AC3, AC4)
  - [x] 5.1 Add `stages` and `stagesVisible` props to `ElevationProfileProps`:
    ```typescript
    interface ElevationProfileProps {
      waypoints: MapWaypoint[]
      segments: MapSegmentData[]
      onHoverKm?: (distKm: number | null) => void
      className?: string
      stages?: AdventureStageResponse[]      // NEW
      stagesVisible?: boolean                // NEW — default false
    }
    ```
  - [x] 5.2 In the `<AreaChart>`, after the existing segment boundary `ReferenceLine` blocks, add stage lines:
    ```tsx
    {stagesVisible && stages?.map((stage) => (
      <ReferenceLine
        key={`stage-${stage.id}`}
        x={stage.endKm}
        stroke={stage.color}
        strokeWidth={1.5}
        // Solid line (no strokeDasharray) — visually distinct from dashed segment boundaries
        label={{
          value: stage.name,
          position: 'insideTopLeft',
          fontSize: 9,
          fill: stage.color,
        }}
      />
    ))}
    ```
    Note: `position: 'insideTopLeft'` vs `'insideTopRight'` for segment boundaries — avoids label overlap.
  - [x] 5.3 In `map-view.tsx`, pass props to `<ElevationProfile>`:
    ```tsx
    <ElevationProfile
      waypoints={allCumulativeWaypoints}
      segments={readySegments}
      onHoverKm={handleHoverKm}
      className="h-full w-full"
      stages={stages}
      stagesVisible={stagesVisible}  // from useStages or local state from SidebarStagesSection
    />
    ```
    Note: `stagesVisible` is managed in `map-view.tsx` (the same boolean that controls map markers + segments visibility).
  - [x] 5.4 Update `elevation-profile.test.tsx`:
    - Test: when `stagesVisible=true` and `stages` provided, stage ReferenceLine renders with stage color
    - Test: when `stagesVisible=false`, no stage ReferenceLine rendered
    - Test: stage label positioned differently from segment boundary label (check `position` attribute)

### Phase 6 — Vérification toggle (AC4)

- [x] Task 6: Verify `stagesVisible` controls map + profile consistently (AC4)
  - [x] 6.1 Confirm `stagesVisible` state lives in `map-view.tsx` (not inside `SidebarStagesSection`):
    - It should be passed DOWN to `SidebarStagesSection` as a prop (with `onToggle` callback) AND to `MapCanvas` (already done in 11.1) AND to `ElevationProfile` (new in this story)
    - `stagesVisible` was already in `map-view.tsx` — no refactor needed
  - [x] 6.2 Verify `map-canvas.tsx` already gates markers + segments behind `stagesVisible` prop (should be done in 11.1 per review notes)
    - Gating done via `stages={stagesVisible ? stages : []}` in `map-view.tsx` — equivalent effect, no prop needed in MapCanvas
  - [x] 6.3 `ElevationProfile` stage lines now also gated behind `stagesVisible` (done in Task 5.2)
  - [x] 6.4 Write `map-view.test.tsx` test:
    - Test: toggling `stagesVisible` off hides stage markers on map AND stage lines on profile (mock both components, check props)

### Phase 7 — Sprint status update

- [x] Task 7: Update sprint-status.yaml
  - [x] 7.1 `11-2-stage-interactive-map-placement: ready-for-dev` → `in-progress` → `review`
  - (Done automatically by SM workflow)

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `map-canvas.test.tsx:370` — Assertion `expect.any(Number)` trop faible pour `onStageHoverKm` ; préciser `expect(onStageHoverKm).toHaveBeenCalledWith(0)` (waypoint le plus proche à distKm=0)
- [ ] [AI-Review][LOW] `stages.service.ts` — Ajouter validation `dto.endKm <= totalRouteDistanceKm` pour éviter une étape hors-trace (requiert accès à la distance totale de l'aventure depuis le service)
- [ ] [AI-Review][LOW] `stages.repository.ts:70` — `updateMany` envoie N requêtes UPDATE en parallèle ; envisager un batch SQL `CASE WHEN` post-MVP si le nombre d'étapes dépasse ~10
- [ ] [AI-Review][LOW] `map-canvas.tsx:242` — L'effect `stageClickMode` retourne immédiatement si `mapRef.current` est null au moment du changement (carte pas encore chargée) ; ajouter `styleVersion` aux dépendances pour re-déclencher après init de la carte

## Dev Notes

### Ce que 11.2 NE change PAS

- La table `adventure_stages` et le module NestJS (créés en 11.1) — pas de nouvelle migration
- Le pattern CRUD de base (create par clic, renommage, suppression) — 11.2 ajoute uniquement le drag
- Le backend ajoute uniquement la gestion de `endKm` dans `UpdateStageDto` — très localisé

### Cascade endKm dans le service

La logique de cascade pour `updateStage(endKm)` est identique à `deleteStage` mais sans suppression :

```typescript
// stages.service.ts — updateStage avec endKm
async updateStage(adventureId, stageId, userId, dto) {
  const stage = await this.repo.findByIdAndAdventureId(stageId, adventureId)
  if (!stage) throw new NotFoundException()

  if (dto.endKm !== undefined) {
    if (dto.endKm <= stage.startKm) throw new BadRequestException('endKm must be > startKm')

    // Update this stage
    await this.repo.update(stageId, {
      endKm: dto.endKm,
      distanceKm: dto.endKm - stage.startKm,
      name: dto.name ?? stage.name,
      color: dto.color ?? stage.color,
    })

    // Cascade: update subsequent stages' startKm
    const subsequentStages = await this.repo.findSubsequent(adventureId, stage.orderIndex)
    let prevEndKm = dto.endKm
    const updates = subsequentStages.map(s => {
      const newStartKm = prevEndKm
      const updated = { ...s, startKm: newStartKm, distanceKm: s.endKm - newStartKm }
      prevEndKm = s.endKm
      return updated
    })
    if (updates.length) await this.repo.updateMany(updates)
  } else {
    // Name/color only update
    await this.repo.update(stageId, { name: dto.name, color: dto.color })
  }

  return this.repo.findByIdAndAdventureId(stageId, adventureId)
}
```

Ajouter `findSubsequent(adventureId, orderIndex)` au repository :
```typescript
// SELECT * FROM adventure_stages WHERE adventure_id = ? AND order_index > ? ORDER BY order_index ASC
```

### Hover preview — performances

Le `onMouseMove` sur la carte peut tirer vite (60fps). Pour éviter les re-renders excessifs :
- Le `setHoverKmPreview` avec le `distKm` du waypoint le plus proche peut être stable si la vitesse de déplacement est faible et les waypoints sont espacés (~10-50m)
- NE PAS utiliser `throttle` ou `debounce` — cela casse la fluidité du preview
- Les waypoints sont déjà en mémoire dans `allWaypoints` de `MapCanvas` → pas de fetch

### react-map-gl Marker draggable

La prop `draggable` est supportée par react-map-gl v7+ (déjà dans le projet depuis Story 4.1) :
```tsx
<Marker
  latitude={lat}
  longitude={lng}
  anchor="center"
  draggable
  onDragStart={() => { /* optionnel: curseur feedback */ }}
  onDragEnd={(e: MarkerDragEvent) => {
    const { lat, lng } = e.lngLat  // ou e.target.getLngLat()
    // ... nearest waypoint logic
  }}
>
```
`MarkerDragEvent` type vient de `react-map-gl` — vérifier le nom exact au moment de l'import.

Pendant le drag, react-map-gl déplace le marker visuellement en temps réel (DOM-based). L'API PATCH n'est appelé qu'au `onDragEnd` — pas de spam réseau.

### Snap identique au click mode (11.1)

Dans 11.1, le click handler utilise un nearest-neighbor loop sur `lat/lng` :
```typescript
const nearest = allWaypoints.reduce((best, wp) => {
  const d = (wp.lat - lat) ** 2 + (wp.lng - lng) ** 2
  const dBest = (best.lat - lat) ** 2 + (best.lng - lng) ** 2
  return d < dBest ? wp : best
})
```
Utiliser **exactement le même pattern** pour `onDragEnd` et `onMouseMove` — pas d'abstraction supplémentaire, cohérence maximale.

### useElevationProfile dans map-view.tsx

Le hook est actuellement appelé implicitement **à l'intérieur** du composant `ElevationProfile`. Pour la preview hover, il faut l'appeler **aussi** directement dans `map-view.tsx` pour accéder aux `ElevationPoint[]` sans dupliquer le calcul.

Importer et appeler directement :
```typescript
import { useElevationProfile } from '@/hooks/use-elevation-profile'
// ...
const { points: elevationPoints } = useElevationProfile(allCumulativeWaypoints, readySegments)
```
C'est un `useMemo` — l'appel est stable, le calcul est partagé (React ne re-calcule pas si les deps n'ont pas changé). Pas de double-calcul.

### Gestion du stagesVisible dans map-view.tsx

Vérifier que `stagesVisible` est bien dans `map-view.tsx` et non uniquement dans `SidebarStagesSection`. Si 11.1 a placé ce state à l'intérieur du composant `SidebarStagesSection`, le **lifter** dans `map-view.tsx` :

```typescript
// map-view.tsx
const [stagesVisible, setStagesVisible] = useState(false)

// Passer à SidebarStagesSection:
<SidebarStagesSection
  ...
  stagesVisible={stagesVisible}
  onStagesVisibilityChange={setStagesVisible}
/>

// Passer à MapCanvas (déjà en 11.1):
<MapCanvas
  ...
  stagesVisible={stagesVisible}
/>

// Nouveau — passer à ElevationProfile:
<ElevationProfile
  ...
  stages={stages}
  stagesVisible={stagesVisible}
/>
```

### Project Structure: Fichiers à modifier

**Aucun nouveau fichier à créer** — tout est en modification :

- `packages/shared/src/schemas/stage.schema.ts` — ajouter `endKm` dans `updateStageSchema`
- `apps/api/src/stages/dto/update-stage.dto.ts` — ajouter `endKm?: number`
- `apps/api/src/stages/stages.service.ts` — gérer `endKm` dans `updateStage`, `findSubsequent` cascade
- `apps/api/src/stages/stages.repository.ts` — ajouter `findSubsequent(adventureId, orderIndex)`
- `apps/api/src/stages/stages.service.test.ts` — 3 nouveaux tests pour `endKm`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — drag markers + mousemove preview handler
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — 2 nouveaux tests
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — props `stages` + `stagesVisible` + `ReferenceLine` colorées
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` — 3 nouveaux tests
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — `hoverKmPreview` state + `useElevationProfile` call + preview overlay + `stagesVisible` lift-up si nécessaire + wire `ElevationProfile` props
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 11-2 → done

### Références

- Story 11.1 file list: `_bmad-output/implementation-artifacts/11-1-stage-crud-km-input.md` — tous les fichiers créés en 11.1 sont les bases sur lesquelles ce story s'appuie
- `ElevationProfile` component: `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — props existantes + pattern `ReferenceLine`
- `useElevationProfile` hook: `apps/web/src/hooks/use-elevation-profile.ts` — `ElevationPoint.cumulativeDPlus` pour le calcul D+ hover
- `map-canvas.tsx` stage click handler (11.1): pattern nearest-neighbor à réutiliser pour drag + mousemove
- react-map-gl `Marker`: `draggable` + `onDragEnd` — voir doc react-map-gl v7
- `StagesService.deleteStage` cascade pattern: réutiliser pour `updateStage(endKm)` cascade

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None

### Completion Notes List

- **Phase 1**: `UpdateStageDto` extended with `endKm?: number`; `StagesRepository` extended with `update()` accepting `endKm`/`distanceKm` + new `findSubsequent()`; `StagesService.updateStage()` handles `endKm` with full cascade. 11 API tests pass.
- **Phase 2**: `updateStageSchema` in shared package extended with `endKm`. `UpdateStageInput` type auto-updates via Zod inference. No changes to `api-client.ts` or `useStages` hook needed.
- **Phase 3**: Stage markers in `renderStageMarkers()` use MapLibre GL `draggable: true` + `marker.on('dragend', ...)` (imperatively, not react-map-gl JSX). `onStageDragEnd` ref pattern used for stale-closure safety. `map-view.tsx` wires `onStageDragEnd` to `updateStage()`.
- **Phase 4**: `onStageHoverKm` prop + `mousemove`/`mouseout` handlers added to stageClickMode effect. `map-view.tsx` adds `hoverKmPreview` state, calls `useElevationProfile` directly, computes `previewDeltaKm` and `previewDPlus`, renders floating overlay. Resets on stageClickMode=false.
- **Phase 4 — extension drag overlay**: Ajout de `onStageDragHoverKm` prop + `marker.on('drag', ...)` dans `renderStageMarkers`. Pendant le drag, l'overlay affiche la nouvelle longueur de l'étape draggée (`hoverKm - stage.startKm`) — `fromKm` distinct du click mode. `dragHoverState` dans `map-view.tsx` dispatche l'affichage. `snapNearest` extrait en fonction locale pour éviter la duplication drag/dragend. Overlay effacé au dragend avant le PATCH API.
- **Overlay sizing**: Passage de `text-xs px-3 py-1.5` à `text-base px-9 py-4` (×3) + `font-semibold` + espacement `ml-6`.
- **Phase 5**: `ElevationProfile` extended with `stages?` and `stagesVisible?` props. Solid colored `ReferenceLine` per stage (no dasharray), label `insideTopLeft` vs segment boundary `insideTopRight`. `map-view.tsx` passes both props.
- **Phase 6**: `stagesVisible` was already in `map-view.tsx` from 11.1 — no lift-up needed. MapCanvas gating via `stages={stagesVisible ? stages : []}` (equivalent to prop gating). 3 new map-view tests verify the toggle behavior.
- **Hover UX sur markers d'étape**: Ajout d'un style `<style>` injecté une fois (id `stage-marker-hover-style`) avec `@keyframes stage-pulse` animant un `box-shadow` expansif (0→10px) teinté de la couleur de l'étape via variable CSS `--scr` (RGB). L'élément reste un **div flat unique** (même structure que l'original) pour ne pas interférer avec le positionnement MapLibre (`translate(-50%,-50%)`). La classe `.stage-marker:hover` déclenche l'animation. `mouseenter`/`mouseleave` changent également le cursor du canvas MapLibre (`grab`/reset). Approche choisie après avoir constaté qu'ajouter des éléments enfants (ring + dot) ou `position:relative` décalait les markers géographiquement — `box-shadow` n'affecte pas le layout.
- **Code review fixes (2026-03-28)**: H1 — added `endKm >= nextStage.endKm` validation in `StagesService.updateStage` + `findSubsequent` called before update; M1 — `try/catch` on `onStageDragEnd` to prevent unhandled promise rejection; M2 — Task 5.2 checkbox corrected; M3 — 2 new tests for `onStageDragHoverKm` drag/dragend callbacks; L2 — cascade test mock corrected (updated stage instead of stale).
- **Total tests added**: 3 backend + 3 elevation-profile + 5 map-canvas + 3 map-view + 1 backend (H1) + 2 web (M3) = 17 new tests. All 753 tests pass (575 web + 178 API).

### File List

- `packages/shared/src/schemas/stage.schema.ts`
- `apps/api/src/stages/dto/update-stage.dto.ts`
- `apps/api/src/stages/stages.repository.ts`
- `apps/api/src/stages/stages.service.ts`
- `apps/api/src/stages/stages.service.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` (nouveau)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/11-2-stage-interactive-map-placement.md`
