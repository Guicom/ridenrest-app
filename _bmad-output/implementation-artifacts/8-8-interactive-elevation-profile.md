# Story 8.8: Interactive Elevation Profile

Status: done

## Story

As a **cyclist planning a multi-day route**,
I want an interactive elevation profile below the map,
So that I can visualize the terrain, understand cumulative D+, and identify where steep sections align with accommodation scarcity.

> **Note:** This story is a prerequisite for Epic 11 (Stage Planning) — stages will be created by clicking on the elevation profile in a future story.

## Acceptance Criteria

**AC1 — Elevation profile renders in Planning mode (desktop)**

**Given** a user is in Planning mode on desktop,
**When** the map view renders with at least one parsed segment that has elevation data,
**Then** an elevation profile chart (Recharts `<AreaChart>`) appears below the map — height `180px` (with collapse toggle button), Y-axis = elevation (m), X-axis = distance (km).

**AC2 — Hover interaction: tooltip + map crosshair**

**Given** the user hovers over the elevation profile,
**When** the cursor moves along the chart,
**Then** a Recharts tooltip shows: elevation at that point (m), cumulative distance (km), cumulative D+ from start (m) — AND a crosshair marker (pulsing green dot) appears at the corresponding position on the GPX trace on the MapLibre map.

**AC3 — Segment boundaries on elevation profile**

**Given** the adventure has multiple segments,
**When** the profile renders,
**Then** segment boundaries are marked with a `<ReferenceLine>` (vertical dashed line, muted color) and a small label showing the segment name — visible without cluttering the chart.

**AC4 — Live mode: compact elevation strip**

**Given** the user is in Live mode,
**When** the LiveControls bottom sheet is visible,
**Then** a compact elevation strip (height `60px`, no hover interaction) is shown above the controls panel — displaying the full route elevation profile with: (1) current GPS position marked as a green filled dot, (2) target search point marked as a white filled dot with dark border.

**AC5 — Graceful fallback when no elevation data**

**Given** the adventure has no elevation data in waypoints (all `ele` values are `null` or `undefined`),
**When** the profile would render,
**Then** a muted placeholder message "Données d'élévation non disponibles" appears in the profile area instead of the chart — no crash, no blank space.

**AC6 — No elevation profile on mobile (Planning mode)**

**Given** a user is in Planning mode on mobile (< 1024px),
**When** the map view renders,
**Then** the elevation profile is NOT shown (mobile Planning mode already shows a reduced UI — profile deferred to desktop only, consistent with sidebar behavior).

## Tasks / Subtasks

### Phase 1 — Install Recharts

- [x] Task 1: Add Recharts dependency (AC1)
  - [x] 1.1 Run `pnpm --filter @ridenrest/web add recharts` in the monorepo
  - [x] 1.2 Verify `recharts` appears in `apps/web/package.json` dependencies

### Phase 2 — useElevationProfile hook

- [x] Task 2: Create `useElevationProfile` hook (AC1, AC2, AC3, AC5)
  - [x] 2.1 Create `apps/web/src/hooks/use-elevation-profile.ts`
  - [x] 2.2 Accept: `waypoints: MapWaypoint[]`, `segments: MapSegmentData[]`
  - [x] 2.3 Return interface:
    ```typescript
    interface ElevationPoint {
      distKm: number
      ele: number          // elevation in metres
      cumulativeDPlus: number  // cumulative positive gain from start
    }
    interface SegmentBoundary {
      distKm: number
      name: string
    }
    interface UseElevationProfileResult {
      points: ElevationPoint[]
      boundaries: SegmentBoundary[]
      hasElevationData: boolean  // true when at least 1 point has ele !== null
      totalDPlus: number
    }
    ```
  - [x] 2.4 Filter out waypoints with `null`/`undefined` `ele` — only include those with valid elevation
  - [x] 2.5 Compute `cumulativeDPlus`: iterate points in order, add `max(0, ele[i] - ele[i-1])` — only count positive gains
  - [x] 2.6 Compute `boundaries`: for each segment except the first, `distKm = seg.cumulativeStartKm`, `name = seg.name`
  - [x] 2.7 `hasElevationData`: `points.length > 0`
  - [x] 2.8 `totalDPlus`: last point's `cumulativeDPlus` value
  - [x] 2.9 Wrap in `useMemo` — no re-compute unless `waypoints` or `segments` change
  - [x] 2.10 Write tests: `apps/web/src/hooks/use-elevation-profile.test.ts`
    - Test: D+ accumulates only on positive gains (ignores descents)
    - Test: boundaries computed correctly for multi-segment adventure
    - Test: `hasElevationData = false` when all `ele` are null
    - Test: empty waypoints → empty points, `hasElevationData = false`

### Phase 3 — ElevationProfile component (Planning mode)

- [x] Task 3: Create `ElevationProfile` component (AC1, AC2, AC3, AC5)
  - [x] 3.1 Create `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx`
  - [x] 3.2 Props interface:
    ```typescript
    interface ElevationProfileProps {
      waypoints: MapWaypoint[]
      segments: MapSegmentData[]
      onHoverKm?: (distKm: number | null) => void  // null = mouse left chart
      className?: string
    }
    ```
  - [x] 3.3 Call `useElevationProfile(waypoints, segments)` internally
  - [x] 3.4 If `!hasElevationData`: render fallback `<div className="flex h-full items-center justify-center"><p className="text-xs text-muted-foreground">Données d&apos;élévation non disponibles</p></div>`
  - [x] 3.5 Render Recharts `<ResponsiveContainer width="100%" height="100%">` with `<AreaChart>`
  - [x] 3.6 Chart config:
    ```
    - data: points (ElevationPoint[])
    - margin: { top: 4, right: 8, bottom: 16, left: 32 }
    - XAxis: dataKey="distKm", type="number", domain=['auto','auto'],
      tickFormatter={(v) => `${v.toFixed(0)}`}, unit=" km",
      tick={{ fontSize: 10 }}, tickLine={false}
    - YAxis: dataKey="ele", tick={{ fontSize: 10 }}, tickLine={false},
      width={28}, tickFormatter={(v) => `${v.toFixed(0)}`}
    - Area: dataKey="ele", fill="var(--primary-light)", stroke="var(--primary)", strokeWidth=1.5, dot={false}
    - Tooltip: custom (see 3.7)
    - ReferenceLine per boundary: x={b.distKm}, stroke="var(--border)", strokeDasharray="3 3",
      label={{ value: b.name, position: 'insideTopRight', fontSize: 9, fill: 'var(--text-muted)' }}
    ```
  - [x] 3.7 Custom Tooltip component (inline):
    ```tsx
    const ElevationTooltip = ({ active, payload }: TooltipProps<...>) => {
      if (!active || !payload?.length) return null
      const { distKm, ele, cumulativeDPlus } = payload[0].payload as ElevationPoint
      return (
        <div className="rounded border border-[--border] bg-background px-2 py-1 text-xs shadow-sm">
          <p><span className="text-muted-foreground">km </span><span className="font-mono font-medium">{distKm.toFixed(1)}</span></p>
          <p><span className="text-muted-foreground">alt </span><span className="font-mono font-medium">{ele.toFixed(0)} m</span></p>
          <p><span className="text-muted-foreground">D+ </span><span className="font-mono font-medium">{cumulativeDPlus.toFixed(0)} m</span></p>
        </div>
      )
    }
    ```
  - [x] 3.8 `onMouseMove` on `<AreaChart>`: extract `activePayload[0].payload.distKm` → call `onHoverKm(distKm)`
  - [x] 3.9 `onMouseLeave` on `<AreaChart>`: call `onHoverKm(null)`
  - [x] 3.10 Write tests: `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx`
    - Test: renders chart when valid elevation data present
    - Test: renders fallback when no elevation data (all ele null)
    - Test: segment boundaries render as `<ReferenceLine>` (check data attribute or label text)
    - Test: `onHoverKm(null)` called on mouse leave

### Phase 4 — MapCanvas crosshair marker

- [x] Task 4: Add `hoveredKm` prop to MapCanvas (AC2)
  - [x] 4.1 In `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`:
    - Add `hoveredKm?: number | null` to `MapCanvasProps`
  - [x] 4.2 When `hoveredKm` is non-null: find the nearest waypoint from `allWaypoints` (already available in MapCanvas) — pick the waypoint with smallest `|wp.distKm - hoveredKm|`
  - [x] 4.3 Render a MapLibre `<Marker>` at that waypoint's `{ lat, lng }`:
    ```tsx
    // Crosshair marker — small pulsing green dot
    <Marker latitude={nearestWp.lat} longitude={nearestWp.lng} anchor="center">
      <div className="h-3 w-3 rounded-full bg-primary border-2 border-white shadow-md
                      ring-2 ring-primary/30 animate-ping absolute" />
      <div className="h-3 w-3 rounded-full bg-primary border-2 border-white shadow-md relative" />
    </Marker>
    ```
    Use a wrapper `<div className="relative h-3 w-3">` to layer the two divs.
  - [x] 4.4 When `hoveredKm` is null: do not render the marker
  - [x] 4.5 Note: `MapCanvas` uses `react-map-gl` — `<Marker>` is from `react-map-gl`; it's already a dependency (Story 4.1)

### Phase 5 — map-view.tsx layout update

- [x] Task 5: Integrate ElevationProfile in Planning mode layout (AC1, AC2, AC3, AC6)
  - [x] 5.1 In `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`:
    - Add state: `const [hoveredKm, setHoveredKm] = useState<number | null>(null)`
    - Import `ElevationProfile` from `./elevation-profile`
  - [x] 5.2 Change the right column div from:
    ```tsx
    <div className="flex-1 relative min-w-0">
    ```
    to:
    ```tsx
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
    ```
  - [x] 5.3 Wrap the existing map content (everything except elevation profile) in:
    ```tsx
    <div className="relative flex-1 min-h-0">
      {/* existing map content: back button, status banners, MapCanvas, DensityLegend, etc. */}
    </div>
    ```
  - [x] 5.4 After the map div, add the elevation profile — **desktop only** (`hidden lg:block`):
    ```tsx
    <div className="hidden lg:block h-[120px] shrink-0 border-t border-[--border] bg-background">
      <ElevationProfile
        waypoints={allCumulativeWaypoints}
        segments={readySegments}
        onHoverKm={setHoveredKm}
        className="h-full w-full"
      />
    </div>
    ```
  - [x] 5.5 Pass `hoveredKm` to `<MapCanvas>`:
    ```tsx
    <MapCanvas
      ...existing props...
      hoveredKm={hoveredKm}
    />
    ```
  - [x] 5.6 Ensure `allCumulativeWaypoints` is already computed (it is — `useAdventureWaypoints(readySegments)`)

### Phase 6 — ElevationStrip component (Live mode)

- [x] Task 6: Create `ElevationStrip` component (AC4, AC5)
  - [x] 6.1 Create `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.tsx`
  - [x] 6.2 Props interface:
    ```typescript
    interface ElevationStripProps {
      waypoints: MapWaypoint[]       // cumulative, from useAdventureWaypoints
      segments: MapSegmentData[]
      currentDistKm: number | null   // GPS position along route — null if not yet snapped
      targetDistKm: number | null    // target ahead km position — null if unknown
    }
    ```
  - [x] 6.3 Call `useElevationProfile(waypoints, segments)` internally
  - [x] 6.4 If `!hasElevationData`: render `<div className="h-full flex items-center justify-center"><p className="text-xs text-muted-foreground">Élévation non disponible</p></div>`
  - [x] 6.5 Render `<ResponsiveContainer width="100%" height="100%">` with `<AreaChart>` — NO `<Tooltip>`, no hover interaction, `isAnimationActive={false}` for performance
  - [x] 6.6 Chart config (compact, no labels):
    ```
    - margin: { top: 2, right: 4, bottom: 2, left: 0 }
    - XAxis: hide (hide={true})
    - YAxis: hide (hide={true})
    - Area: same as ElevationProfile (var(--primary-light) fill, var(--primary) stroke)
    - NO Tooltip, NO ReferenceLine (too cluttered at 60px)
    ```
  - [x] 6.7 Render position dots as Recharts `<ReferenceLine>` overlays:
    - Current GPS position: `<ReferenceLine x={currentDistKm} stroke="#16a34a" strokeWidth={2} />` — only when `currentDistKm !== null`
    - Target search point: `<ReferenceLine x={targetDistKm} stroke="white" strokeWidth={2} strokeDasharray="2 2" />` — only when `targetDistKm !== null`
    > Note: ReferenceLine uses the same distKm domain as the XAxis data — this is the simplest approach without custom rendering
  - [x] 6.8 Write tests: `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.test.tsx`
    - Test: renders without crash with valid data
    - Test: renders fallback when no elevation data
    - Test: `data-testid` attributes for assertion (add `data-testid="elevation-strip"` to root div)

### Phase 7 — Integrate ElevationStrip in Live page

- [x] Task 7: Add ElevationStrip above LiveControls (AC4)
  - [x] 7.1 In `apps/web/src/app/(app)/live/[id]/page.tsx`:
    - Import `ElevationStrip`
    - Import `useAdventureWaypoints` from `@/hooks/use-adventure-waypoints`
  - [x] 7.2 Compute `allCumulativeWaypoints` in live page:
    ```typescript
    const readySegments = adventureData?.segments.filter(s => s.parseStatus === 'done') ?? []
    const allCumulativeWaypoints = useAdventureWaypoints(readySegments)
    ```
    Note: check if `adventureData` is already available in the live page (it is — `useQuery` on `getAdventureMapData`)
  - [x] 7.3 Get `currentDistKm` from GPS position snapped to trace:
    - `snapToTrace` is already called in the live page to get `snappedPoint`
    - Use `snappedPoint?.distKm ?? null` as `currentDistKm`
  - [x] 7.4 Get `targetDistKm`:
    - `targetAheadKm` is available from `useLiveStore`
    - `targetDistKm = snappedPoint ? snappedPoint.distKm + targetAheadKm : null`
  - [x] 7.5 Render `<ElevationStrip>` above the `<LiveControls>` bottom sheet:
    ```tsx
    {/* Elevation strip — above live controls bottom sheet */}
    {allCumulativeWaypoints.length > 0 && (
      <div className="absolute bottom-[88px] left-0 right-0 z-20 h-[60px] bg-background/80 backdrop-blur-sm border-t border-[--border]">
        <ElevationStrip
          waypoints={allCumulativeWaypoints}
          segments={readySegments}
          currentDistKm={currentDistKm}
          targetDistKm={targetDistKm}
        />
      </div>
    )}
    ```
    Note: `88px` is approximate height of collapsed LiveControls — adjust if needed after visual check.

## Dev Notes

### Data Flow Summary

```
MapWaypoint[] (from API)
  → useAdventureWaypoints()   → cumulative distKm
  → useElevationProfile()     → ElevationPoint[], SegmentBoundary[], hasElevationData

ElevationProfile (planning)
  → onHoverKm callback → hoveredKm state in map-view.tsx
  → passed as prop to MapCanvas → renders pulsing dot on map

ElevationStrip (live)
  → currentDistKm from snapToTrace(gpsPosition, kmWaypoints)
  → targetDistKm = currentDistKm + targetAheadKm
```

### Recharts — Key Details

- Package: `recharts` v2.x (stable, React 18/19 compatible, tree-shakeable)
- Installation: `pnpm --filter @ridenrest/web add recharts`
- Import pattern: named imports → `import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip, ReferenceLine } from 'recharts'`
- Recharts v2 uses SVG — no canvas issues with SSR; but wrap in `'use client'` components (already the case for map pages)
- `<ResponsiveContainer>` requires the parent to have a defined height (not `height: auto`) — the `h-[120px]` and `h-[60px]` wrappers satisfy this

### Crosshair Marker on MapCanvas

The `allWaypoints` prop is already passed to `MapCanvas` as `allWaypoints?: MapWaypoint[] | null`. Use this array to find the nearest waypoint:

```typescript
const crosshairWp = useMemo(() => {
  if (hoveredKm === null || !allWaypoints?.length) return null
  return allWaypoints.reduce((nearest, wp) => {
    return Math.abs(wp.distKm - hoveredKm) < Math.abs(nearest.distKm - hoveredKm) ? wp : nearest
  })
}, [hoveredKm, allWaypoints])
```

Then render the marker only when `crosshairWp` is non-null.

### MapCanvas File Location

Current file: `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
It uses `react-map-gl` with `<Map>`, `<Source>`, `<Layer>`, `<Marker>` — `<Marker>` is already imported for the back button or may need to be added. Check imports.

### Live Page: snapToTrace Usage

`snapToTrace` is already called in `apps/web/src/app/(app)/live/[id]/page.tsx`:
```typescript
const snapped = useMemo(() => {
  if (!gpsPosition || !kmWaypoints.length) return null
  return snapToTrace(gpsPosition, kmWaypoints)  // returns { lat, lng, distKm }
}, [gpsPosition, kmWaypoints])
```
Use `snapped?.distKm ?? null` for `currentDistKm`.

Check the actual variable name in the live page — it may differ from `snapped`.

### Layout: map-view.tsx Right Column

The current structure is:
```
<div className="flex-1 relative min-w-0">
  {back button, status banners, MapCanvas, DensityLegend, ...}
</div>
```

After change:
```
<div className="flex-1 flex flex-col min-w-0 min-h-0">
  <div className="relative flex-1 min-h-0">
    {back button, status banners, MapCanvas, DensityLegend, ...}
  </div>
  <div className="hidden lg:block h-[120px] shrink-0 border-t border-[--border] bg-background">
    <ElevationProfile ... />
  </div>
</div>
```

`min-h-0` on both the outer and inner div is **critical** for flex children to shrink correctly. Without it, the map can overflow and push the elevation profile out of view.

### Elevation D+ Computation

```typescript
function computeDPlus(points: { ele: number }[]): number[] {
  const dPlus: number[] = [0]
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].ele - points[i - 1].ele
    dPlus.push(dPlus[i - 1] + Math.max(0, delta))
  }
  return dPlus
}
```

Only count positive elevation gains — this is the standard cycling D+ metric.

### Testing with Recharts (Vitest)

Recharts renders SVG — use `screen.getByRole` or `data-testid` on wrapper divs for assertions. Don't try to assert on SVG elements directly — use container-level assertions:

```typescript
// Good — assert on wrapper, not SVG internals
expect(screen.getByTestId('elevation-profile')).toBeInTheDocument()
expect(screen.queryByText('Données d\'élévation non disponibles')).toBeInTheDocument()
```

Mock `recharts` if needed for simpler tests (to avoid SVG rendering issues in jsdom):
```typescript
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children, onMouseMove, onMouseLeave }: any) => (
    <div data-testid="area-chart" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>{children}</div>
  ),
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: ({ x, label }: any) => <div data-testid={`ref-line-${x}`}>{label?.value}</div>,
}))
```

### Project Structure: New Files

**Files to CREATE:**
- `apps/web/src/hooks/use-elevation-profile.ts` — shared hook
- `apps/web/src/hooks/use-elevation-profile.test.ts` — hook tests
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — Planning chart
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` — chart tests
- `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.tsx` — Live compact strip
- `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.test.tsx` — strip tests

**Files to MODIFY:**
- `apps/web/package.json` — add `recharts` dependency
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — add `hoveredKm` prop + crosshair marker
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — layout update + ElevationProfile integration
- `apps/web/src/app/(app)/live/[id]/page.tsx` — ElevationStrip integration
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — update 8-8 status to `ready-for-dev`

### Previous Story Intelligence (8.7)

From 8.7 implementation learnings:
- `ACCOMMODATION_SUB_TYPES` → same principle: use `useElevationProfile` hook as single source of truth for D+ computation, import it in both components
- UI Polish: pill buttons `size="lg" rounded-full px-6 py-6` — the elevation profile area does not have buttons, so this doesn't apply
- `useAdventureWaypoints` already exists and produces cumulative distKm — **reuse it, do not recompute**
- Live page uses `snapToTrace` from `@ridenrest/gpx` to get `distKm` — check actual variable name before implementing Task 7.3

### Git Intelligence (recent commits)

Recent pattern: `feat(story-X.Y): description` commit convention. Tests co-located. Story 8.6 added `accommodation-sub-types.tsx` with shared constants — follow same pattern for `useElevationProfile`.

Story 8.5 was cancelled (merged into 8.4). Story 8.7 added density category dialog. Story 8.8 is the next in the queue.

### References

- `MapWaypoint` interface: `packages/shared/src/types/adventure.types.ts:8` — has `ele?: number | null`, `distKm: number`
- `useAdventureWaypoints`: `apps/web/src/hooks/use-adventure-waypoints.ts` — already produces cumulative distKm
- `MapView`: `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — shows current layout structure
- `MapCanvas`: `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — where `hoveredKm` prop goes
- Live page: `apps/web/src/app/(app)/live/[id]/page.tsx` — where ElevationStrip is integrated
- `LiveControls`: `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — bottom sheet; absolute position at `bottom-0`
- `snapToTrace` usage: `apps/web/src/app/(app)/live/[id]/page.tsx` — check variable name of snapped result

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- ✅ Task 1: Installed `recharts@^3.8.0` via `pnpm --filter @ridenrest/web add recharts`
- ✅ Task 2: Created `useElevationProfile` hook with useMemo, D+ computation, segment boundaries. 5 tests passing.
- ✅ Task 3: Created `ElevationProfile` component. Recharts v3 removed `activePayload` from `onMouseMove` — adapted by using Tooltip `content` prop as side-effect messenger for `onHoverKm`. 5 tests passing.
- ✅ Task 4: MapCanvas refactoré en `forwardRef` + `useImperativeHandle` → `updateCrosshair()` impératif (zéro re-render). Crosshair via maplibre-gl Marker, classe cachée après premier import. Pulsing animation via keyframes injectées.
- ✅ Task 5: Updated map-view.tsx layout — right column `flex flex-col min-h-0`, map en `flex-1 min-h-0`, elevation profile `hidden lg:block h-[180px]` avec bouton collapse cercle (style identique sidebar toggle). DensityLegend bottom-right supprimée (obsolète).
- ✅ Task 6: Created `ElevationStrip` component — 60px compact chart, GPS + target ReferenceLine overlays. 5 tests passing.
- ✅ Task 7: ElevationStrip integrated in live page above LiveControls at `bottom-[88px]`. Uses `currentKmOnRoute` + `targetAheadKm` from store.
- ✅ Post-implémentation — performances crosshair : `useEffect` supprimé du chemin critique, appel synchrone direct → latence éliminée. `isAnimationActive={false}` sur Tooltip.
- ✅ Post-implémentation — ajout pente (%) dans tooltip : `slope` field dans `ElevationPoint`, coloré selon intensité (vert/orange/rouge). 1 test ajouté.
- ✅ Post-implémentation — hauteur profil 120px → 180px, collapse button style sidebar (cercle `-top-3 left-1/2`), DensityLegend map bottom-right retirée.
- ✅ Final : 50 fichiers de tests, 434 tests passing, 0 régression. TypeScript clean.

### File List

**Created:**
- `apps/web/src/hooks/use-elevation-profile.ts`
- `apps/web/src/hooks/use-elevation-profile.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/elevation-strip.test.tsx`

**Modified:**
- `apps/web/package.json` — added `recharts@^3.8.0`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — `forwardRef` + `useImperativeHandle` (updateCrosshair), suppression hoveredKm prop, `createCrosshairMarker` helper
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — ajout mock `Marker` maplibre
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — layout update + ElevationProfile (h-180px, collapse button, DensityLegend supprimée)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — ajout mock ElevationProfile, searchRangeInteracted, tests collapse élévation (Story 8.8 code review)
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.tsx` — fix: ElevationTooltip side-effect via useEffect (Concurrent Mode safety)
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` — fix: onHoverKm test updated to waitFor (async useEffect)
- `apps/web/src/app/(app)/map/[id]/_components/density-legend.tsx` — plus importé (orphelin, à supprimer ultérieurement)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — ElevationStrip integration
- `pnpm-lock.yaml` — updated for recharts dependency
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 8-8 status → done
- `_bmad-output/implementation-artifacts/8-8-interactive-elevation-profile.md` — tasks checked, status → done

### Review Follow-ups (AI)
- [ ] [AI-Review][MEDIUM] `createCrosshairMarker` injecte `@keyframes ping` dans `document.head` dynamiquement (`map-canvas.tsx:490-494`). Migrer vers Tailwind `animate-ping` (déjà disponible) pour éviter l'injection globale de style non-nettoyable entre tests.
- [ ] [AI-Review][MEDIUM] Live mode : GPS snap uniquement sur `firstSegment` (`live/[id]/page.tsx:143-146`). `currentKmOnRoute` est en km local au segment 1, pas en km cumulatif. Pour aventures multi-segments, le marker de position sur l'ElevationStrip sera incorrect dès que l'utilisateur entre en segment 2+. Fix: utiliser `allCumulativeWaypoints` pour le snap (impact sur `currentKmOnRoute` dans tout le live store → à analyser avant de changer).
- [ ] [AI-Review][LOW] `density-legend.tsx` est orphelin (plus importé nulle part). Supprimer le fichier pour éviter confusion future.
- [ ] [AI-Review][LOW] `5-2-colorized-trace-density-legend.md` a des modifications non commitées non liées à la story 8.8. À vérifier et exclure du commit 8.8 si involontaire.
