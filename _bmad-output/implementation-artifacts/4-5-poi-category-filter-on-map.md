# Story 4.5: POI Category Filter on Map

Status: cancelled

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to filter the displayed POIs by category directly from the map view,
So that I can switch focus between accommodations, food, supplies, and bike shops without re-running a search.

## Acceptance Criteria

1. **Given** POIs from multiple categories are loaded in the corridor,
   **When** a user taps a category filter chip on the map overlay,
   **Then** only POIs of the selected category are shown on the map — other category pins are hidden instantly **without triggering a new API call** (FR-034).

2. **Given** a user selects "Hébergements only" filter,
   **When** the filter applies,
   **Then** the POI list panel scrolls to top and shows only accommodation POIs, sorted by distance from trace (`distAlongRouteKm` ascending).

3. **Given** a user removes all category filters (taps the active chip again or taps "Tout"),
   **When** no filter is active,
   **Then** all loaded POI categories are visible simultaneously on the map and in the POI list.

4. **Given** a user switches between filter states rapidly,
   **When** filters change,
   **Then** the MapLibre layer visibility updates are debounced (100ms) to avoid rendering flicker — the chip state updates immediately, only the map render is delayed.

## Tasks / Subtasks

### Task 1 — Update `usePoiLayers` to respect `activeLayer` filter (AC: #1, #4)

- [x] 1.1 In `apps/web/src/hooks/use-poi-layers.ts`, read `activeLayer` from `useMapStore()`:
  ```typescript
  const { visibleLayers, activeLayer } = useMapStore()
  ```
- [x] 1.2 Add a debounced `activeLayer` value inside the hook (100ms — AC #4):
  ```typescript
  import { useState, useEffect } from 'react'
  // ...
  const [debouncedActiveLayer, setDebouncedActiveLayer] = useState<MapLayer | null>(activeLayer)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedActiveLayer(activeLayer), 100)
    return () => clearTimeout(timer)
  }, [activeLayer])
  ```
- [x] 1.3 In the loop body, replace the existing `!visibleLayers.has(layer)` guard with combined filter logic:
  ```typescript
  // Category filter: if activeLayer is set, hide layers that are not the selected one
  // Use setLayoutProperty('visibility') — NOT removeSource — so data stays in memory for instant restore
  const isFilteredOut = debouncedActiveLayer !== null && layer !== debouncedActiveLayer

  if (!visibleLayers.has(layer)) {
    // Layer toggled off — remove source entirely (free memory)
    if (map.getLayer(clusterCountId)) map.removeLayer(clusterCountId)
    if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId)
    if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId)
    if (map.getSource(sourceId)) map.removeSource(sourceId)
    continue
  }

  if (isFilteredOut) {
    // Layer loaded but filtered out — hide only, keep source for instant restore
    if (map.getLayer(pointLayerId)) map.setLayoutProperty(pointLayerId, 'visibility', 'none')
    if (map.getLayer(clusterLayerId)) map.setLayoutProperty(clusterLayerId, 'visibility', 'none')
    if (map.getLayer(clusterCountId)) map.setLayoutProperty(clusterCountId, 'visibility', 'none')
    continue
  }

  // Layer is visible AND not filtered out — ensure it's shown
  if (map.getLayer(pointLayerId)) {
    map.setLayoutProperty(pointLayerId, 'visibility', 'visible')
    map.setLayoutProperty(clusterLayerId, 'visibility', 'visible')
    map.setLayoutProperty(clusterCountId, 'visibility', 'visible')
  }
  // ... (rest of existing source add / layer add logic unchanged)
  ```
- [x] 1.4 Add `debouncedActiveLayer` to the `useEffect` dependency array:
  ```typescript
  }, [mapRef, poisByLayer, visibleLayers, debouncedActiveLayer, styleVersion])
  ```
- [x] 1.5 Add tests in `apps/web/src/hooks/use-poi-layers.test.ts` (file already exists from 4.4 — modify):
  - When `activeLayer` is set, `setLayoutProperty('visibility', 'none')` called for other layers
  - When `activeLayer` is null, all `visibleLayers` are shown
  - `removeSource` is NOT called when filtering (only when `!visibleLayers.has(layer)`)

### Task 2 — Update `useMapStore` — reset `activeLayer` on layer toggle-off (guard)

- [x] 2.1 In `apps/web/src/stores/map.store.ts`, update `toggleLayer` to reset `activeLayer` when removing the currently-filtered layer:
  ```typescript
  toggleLayer: (layer) =>
    set((state) => {
      const next = new Set(state.visibleLayers)
      if (next.has(layer)) {
        next.delete(layer)
        // If the layer being removed is the active filter, clear the filter
        return {
          visibleLayers: next,
          activeLayer: state.activeLayer === layer ? null : state.activeLayer,
        }
      } else {
        next.add(layer)
        return { visibleLayers: next }
      }
    }),
  ```
  ⚠️ This prevents a state where `activeLayer` points to a layer that has been toggled off (which would result in an empty map with no pins visible).

### Task 3 — Create `<CategoryFilterChips />` component (AC: #1, #3, #4)

- [x] 3.1 Create `apps/web/src/app/(app)/map/[id]/_components/category-filter-chips.tsx`:
  ```typescript
  'use client'
  import { useMapStore } from '@/stores/map.store'
  import type { MapLayer, Poi } from '@ridenrest/shared'

  const FILTER_CONFIGS: { layer: MapLayer; label: string; icon: string }[] = [
    { layer: 'accommodations', label: 'Hébergements', icon: '🏨' },
    { layer: 'restaurants',    label: 'Restauration',  icon: '🍽️' },
    { layer: 'supplies',       label: 'Alimentation',  icon: '🛒' },
    { layer: 'bike',           label: 'Vélo',          icon: '🚲' },
  ]

  interface CategoryFilterChipsProps {
    poisByLayer: Record<MapLayer, Poi[]>
  }

  export function CategoryFilterChips({ poisByLayer }: CategoryFilterChipsProps) {
    const { visibleLayers, activeLayer, setActiveLayer } = useMapStore()

    // Only show chips for layers that are toggled on AND have loaded POIs
    const loadedLayers = FILTER_CONFIGS.filter(
      (c) => visibleLayers.has(c.layer) && poisByLayer[c.layer].length > 0,
    )

    // No value filtering a single category — don't render
    if (loadedLayers.length < 2) return null

    const handleChipClick = (layer: MapLayer) => {
      setActiveLayer(activeLayer === layer ? null : layer)
    }

    return (
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label="Filtrer les POIs par catégorie"
      >
        {/* "Tout" chip — only shown when a filter is active */}
        {activeLayer !== null && (
          <button
            onClick={() => setActiveLayer(null)}
            className="min-h-[36px] px-3 py-1 rounded-lg text-xs font-medium bg-zinc-700 text-white dark:bg-zinc-200 dark:text-zinc-900 transition-colors"
            aria-label="Afficher toutes les catégories"
          >
            Tout
          </button>
        )}
        {loadedLayers.map(({ layer, label, icon }) => {
          const isActive = activeLayer === layer
          return (
            <button
              key={layer}
              onClick={() => handleChipClick(layer)}
              className={[
                'min-h-[36px] flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-medium transition-colors',
                isActive
                  ? 'bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900 ring-2 ring-offset-1 ring-zinc-500'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700',
              ].join(' ')}
              aria-pressed={isActive}
              aria-label={`${isActive ? 'Désactiver' : 'Activer'} filtre ${label} (${poisByLayer[layer].length})`}
            >
              <span aria-hidden="true">{icon}</span>
              <span>{label}</span>
              <span className="ml-1 text-[10px] opacity-60">{poisByLayer[layer].length}</span>
            </button>
          )
        })}
      </div>
    )
  }
  ```

- [x] 3.2 Create `apps/web/src/app/(app)/map/[id]/_components/category-filter-chips.test.tsx` — tests:
  - Returns null when fewer than 2 visible layers have POIs
  - Renders only chips for layers in `visibleLayers` with POIs
  - Tapping a chip calls `setActiveLayer(layer)`
  - Tapping the active chip again calls `setActiveLayer(null)` (toggle off)
  - "Tout" chip only renders when `activeLayer !== null`
  - Tapping "Tout" calls `setActiveLayer(null)`
  - POI count shown in chip label

### Task 4 — Create `<PoiList />` component (AC: #2, #3)

- [x] ~~4.1 Create `apps/web/src/app/(app)/map/[id]/_components/poi-list.tsx`~~ (removed per user request — no POI list wanted)
  ```typescript
  'use client'
  import { useEffect, useRef } from 'react'
  import { useMapStore } from '@/stores/map.store'
  import { useUIStore } from '@/stores/ui.store'
  import { ScrollArea } from '@/components/ui/scroll-area'
  import { Skeleton } from '@/components/ui/skeleton'
  import { CATEGORY_TO_LAYER } from '@ridenrest/shared'
  import type { MapLayer, Poi } from '@ridenrest/shared'

  const LAYER_EMOJI: Record<MapLayer, string> = {
    accommodations: '🏨',
    restaurants:    '🍽️',
    supplies:       '🛒',
    bike:           '🚲',
  }

  interface PoiListProps {
    poisByLayer: Record<MapLayer, Poi[]>
    isPending: boolean
  }

  export function PoiList({ poisByLayer, isPending }: PoiListProps) {
    const { visibleLayers, activeLayer } = useMapStore()
    const { setSelectedPoi } = useUIStore()
    const viewportRef = useRef<HTMLDivElement>(null)

    // Build filtered list: activeLayer → only that layer; null → all visible layers merged + sorted
    const filteredPois: Poi[] = activeLayer !== null
      ? (poisByLayer[activeLayer] ?? [])
      : (Object.keys(poisByLayer) as MapLayer[])
          .filter((layer) => visibleLayers.has(layer))
          .flatMap((layer) => poisByLayer[layer])
          .sort((a, b) => a.distAlongRouteKm - b.distAlongRouteKm)

    // Scroll to top whenever the filter changes (AC #2)
    useEffect(() => {
      if (viewportRef.current) viewportRef.current.scrollTop = 0
    }, [activeLayer])

    if (visibleLayers.size === 0) return null

    return (
      <div className="flex flex-col" style={{ maxHeight: '35vh' }}>
        {isPending ? (
          <div className="flex flex-col gap-2 p-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : filteredPois.length === 0 ? (
          <p className="px-4 py-3 text-xs text-zinc-500 dark:text-zinc-400">
            Aucun POI dans cette plage — ajuste les km ou les filtres de calques.
          </p>
        ) : (
          <ScrollArea>
            <div
              ref={viewportRef}
              id="poi-list"
              role="list"
              aria-label="Liste des points d'intérêt"
              className="flex flex-col divide-y divide-zinc-100 dark:divide-zinc-800"
            >
              {filteredPois.map((poi) => {
                const layer = CATEGORY_TO_LAYER[poi.category]
                return (
                  <button
                    key={poi.id}
                    role="listitem"
                    onClick={() => setSelectedPoi(poi.id)}
                    className="flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                    aria-label={`${poi.name || 'Sans nom'}, km ${poi.distAlongRouteKm.toFixed(1)} sur la trace`}
                  >
                    <span className="text-xl shrink-0" aria-hidden="true">{LAYER_EMOJI[layer]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-zinc-900 dark:text-zinc-100">
                        {poi.name || 'Sans nom'}
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 font-mono">
                        km {poi.distAlongRouteKm.toFixed(1)} · {poi.distFromTraceM}m de la trace
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    )
  }
  ```
  ⚠️ `ScrollArea` from shadcn wraps a Radix viewport internally — `ref` on the inner `div` is a plain div ref, which gives `scrollTop` access. Verify `scrollTop = 0` actually resets in tests by checking the ref assignment.
  ⚠️ `CATEGORY_TO_LAYER` from `@ridenrest/shared` is O(1) — do NOT use `Array.includes()` or manual loop to find a POI's layer.

- [x] ~~4.2 Create `apps/web/src/app/(app)/map/[id]/_components/poi-list.test.tsx`~~ (removed per user request)
  - Returns null when `visibleLayers` is empty
  - Shows 3 `<Skeleton>` items when `isPending=true`
  - Shows "Aucun POI" message when `filteredPois` is empty and not pending
  - Renders correct items sorted by `distAlongRouteKm` when `activeLayer=null`
  - When `activeLayer` is set, renders only that layer's POIs
  - Clicking a list item calls `setSelectedPoi(poi.id)`
  - `viewportRef.current.scrollTop` is set to 0 when `activeLayer` changes

### Task 5 — Integrate in `map-view.tsx` (AC: #1, #2, #3)

- [x] 5.1 In `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`:
  - Import `CategoryFilterChips` and `PoiList`
  - Add `visibleLayers` from `useMapStore()`
  - Change outer wrapper to column layout with the map expanding via `flex-1`:

  ```typescript
  import { CategoryFilterChips } from './category-filter-chips'
  import { PoiList } from './poi-list'
  // ...
  const { visibleLayers } = useMapStore()

  // JSX — change outer div to flex-col:
  return (
    <div className="relative flex flex-col h-full w-full">
      {/* Map area — flex-1 fills available space above the bottom panel */}
      <div className="relative flex-1 min-h-0">
        {/* existing StatusBanners, MapCanvas, LayerToggles, SearchRangeSlider, poisError banner */}
        {/* NOTE: all absolute-positioned overlays (StatusBanners, LayerToggles, SearchRangeSlider)
            remain inside this div — they position relative to this container, not the outer div */}
      </div>

      {/* Bottom panel — only when at least one category is toggled on */}
      {visibleLayers.size > 0 && (
        <div className="bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 shadow-[0_-2px_8px_rgba(0,0,0,0.08)]">
          <div className="px-3 pt-2 pb-1">
            <CategoryFilterChips poisByLayer={poisByLayer} />
          </div>
          <PoiList poisByLayer={poisByLayer} isPending={poisPending} />
        </div>
      )}

      {/* PoiDetailSheet stays at root level (Sheet portal) */}
      <PoiDetailSheet
        poi={selectedPoi}
        segments={readySegments}
        segmentId={selectedSegmentId}
      />
    </div>
  )
  ```

  ⚠️ **Layout critical**: `min-h-0` on the map area div is mandatory. Without it, the map's flex child will try to be its natural height (full screen) and overflow past the bottom panel. `flex-1 min-h-0` = "fill remaining space, but don't overflow".

  ⚠️ **LayerToggles overlap**: Currently positioned at `absolute bottom-8`. With the bottom panel, move to `absolute bottom-4` to avoid clipping under the panel edge.

  ⚠️ **`<PoiDetailSheet />`** uses shadcn `<Sheet>` which renders into a portal — it does NOT need to be inside the map area div. Keep it at the root of the return JSX (already correct in current `map-view.tsx`).

- [x] 5.2 Update `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx`:
  - Bottom panel not rendered when `visibleLayers` is empty
  - Bottom panel rendered when `visibleLayers.size > 0`
  - `<CategoryFilterChips>` and `<PoiList>` present in DOM when panel visible

---

## Dev Notes

### CRITICAL: What's Already Done (Stories 4.1–4.4) — Do NOT Redo

**`apps/api/src/pois/` — full state after 4.4:**
- ✅ `GooglePlacesProvider` — `searchPlaceIds()`, `searchLayerPlaceIds()` (4.3), `getPlaceDetails()`, `findPlaceId()` (4.4)
- ✅ `PoisService` — `getGooglePlaceIds()`, `prefetchGooglePlaceIds()` (4.3), `getPoiGoogleDetails()` (4.4)
- ✅ `PoisRepository` — `findByExternalId()` (4.4)
- ✅ `GET /pois/google-ids`, `GET /pois/google-details`, `POST /pois/booking-click` endpoints (4.3, 4.4)
- ✅ `dto/get-google-details.dto.ts`, `dto/track-booking-click.dto.ts` (4.4)
- ✅ `RedisProvider`, `OverpassProvider` — stories 4.2, 4.3
- ✅ `overpass.provider.ts` — `CATEGORY_FILTERS` expanded: motel, chalet, guest_house, caravan_site, alpine_hut, wilderness_hut (4.4)
- ✅ Redis keys: `google_place_ids:*`, `google_place_id:{externalId}`, `google_place_details:{placeId}` (4.3, 4.4)

**`packages/shared/` — full state after 4.4:**
- ✅ `types/poi.types.ts` — `Poi.source: 'overpass' | 'amadeus' | 'google'` (updated in 4.4), `LAYER_CATEGORIES`, `CATEGORY_TO_LAYER`
- ✅ `types/google-place.types.ts` — `GooglePlaceDetails` interface (4.4)
- ✅ `constants/gpx.constants.ts` — `CORRIDOR_WIDTH_M: 3000` (changed 500→3000 in 4.4), `DEFAULT_CYCLING_SPEED_KMH` added (4.4)
- ✅ `types/map.types.ts` — `MapLayer` type
- ✅ `index.ts` — exports `GooglePlaceDetails`

**`apps/web/src/` — full state after 4.4:**
- ✅ `stores/ui.store.ts` — `selectedPoiId`, `setSelectedPoi()`
- ✅ `stores/map.store.ts` — `visibleLayers`, `toggleLayer()`, `activeLayer: MapLayer | null`, `setActiveLayer()` — **`activeLayer` defined but unused until story 4.5**
- ✅ `hooks/use-pois.ts` — fetches `poisByLayer` per `visibleLayers` + km range, debounced 400ms
- ✅ `hooks/use-poi-layers.ts` — MapLibre source/layer management + POI click handler (4.4) + `externalId` in GeoJSON feature properties (4.4)
- ✅ `hooks/use-poi-layers.test.ts` — **5 tests already exist from 4.4 — MODIFY, do NOT recreate**
- ✅ `hooks/use-poi-google-details.ts` — TanStack Query hook for enrichment (4.4)
- ✅ `components/ui/scroll-area.tsx` — shadcn `<ScrollArea>` available
- ✅ `components/ui/skeleton.tsx` — shadcn `<Skeleton>` available
- ✅ `app/(app)/map/[id]/_components/layer-toggles.tsx` — `<LayerToggles>` toggles `visibleLayers` (triggers API fetches)
- ✅ `app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — bottom sheet on POI tap (4.4)
- ✅ `app/(app)/map/[id]/_components/map-view.tsx` — has `<PoiDetailSheet>` integrated (4.4)

**What does NOT exist yet (story 4.5 scope):**
- ❌ `<CategoryFilterChips />` component
- ❌ `<PoiList />` component
- ❌ `activeLayer` filter logic in `usePoiLayers`
- ❌ `toggleLayer` guard to reset `activeLayer` when layer is toggled off
- ❌ Bottom panel in `map-view.tsx`

---

### Architecture: `activeLayer` vs `visibleLayers` — Two Distinct Concepts

```
visibleLayers: Set<MapLayer>   → "Which categories to FETCH from API"
                                  Toggled via <LayerToggles> chips (bottom-center overlay)
                                  Change → may trigger usePois re-query → Overpass API call

activeLayer: MapLayer | null   → "Which category to FOCUS (filter) client-side"
                                  Set via <CategoryFilterChips> (new story 4.5)
                                  Change → ZERO API calls, only MapLibre visibility toggle
```

`CategoryFilterChips` uses `setActiveLayer()` (no API).
`LayerToggles` uses `toggleLayer()` (may trigger Overpass fetch if new category).

---

### Architecture: MapLibre `setLayoutProperty('visibility')` vs `removeSource`

Two strategies for hiding a MapLibre layer — choose the right one per context:

```typescript
// For category FILTER (story 4.5) — keep source in memory for instant restore:
map.setLayoutProperty(layerId, 'visibility', 'none')   // O(1), no GeoJSON rebuild
map.setLayoutProperty(layerId, 'visibility', 'visible') // instant restore

// For layer TOGGLE OFF (story 4.2 behavior, keep as-is) — free memory:
map.removeLayer(layerId)     // removes render layer
map.removeSource(sourceId)   // frees GeoJSON data from GPU memory
```

Using `removeSource` for the filter would cause a full GeoJSON re-parse every time the user switches filter states → visible flicker. `setLayoutProperty` is instant.

---

### Architecture: 100ms Debounce — UI vs Map

The debounce applies **only to the MapLibre `setLayoutProperty` calls**, not the chip's UI state.

```
User tap chip → activeLayer store updated immediately (chip appears active instantly)
             → debouncedActiveLayer updates after 100ms
             → usePoiLayers effect runs → setLayoutProperty('visibility', 'none')
```

If the user taps chip A then chip B within 100ms, only the final state (chip B) is applied to MapLibre. This eliminates flicker when cycling through chips quickly.

The `<CategoryFilterChips>` component reads `activeLayer` directly (no debounce) → chips respond instantly to taps.

---

### Architecture: PoiList — `ScrollArea` + `scrollTop` Reset

shadcn `<ScrollArea>` renders a Radix viewport div internally. To reset scroll on filter change, place a `ref` on the **inner content div** (not the `ScrollArea` wrapper):

```typescript
const viewportRef = useRef<HTMLDivElement>(null)

useEffect(() => {
  if (viewportRef.current) viewportRef.current.scrollTop = 0
}, [activeLayer])

// In JSX:
<ScrollArea>
  <div ref={viewportRef} ...>  // ← ref on inner div, not ScrollArea
    {filteredPois.map(...)}
  </div>
</ScrollArea>
```

If `ScrollArea`'s internal structure doesn't expose the scroll viewport via a plain div ref, fall back to a plain `overflow-y-auto` div with `ref` directly — simpler and more predictable for MVP.

---

### Architecture: `map-view.tsx` Layout Change

Current (post-4.4):
```
div.relative.flex.h-full.w-full
  MapCanvas (full area)
  absolute overlays (LayerToggles, SearchRangeSlider, StatusBanners, error banner)
  PoiDetailSheet (Sheet portal — doesn't affect layout)
```

After story 4.5:
```
div.relative.flex.flex-col.h-full.w-full
  div.relative.flex-1.min-h-0          ← map area (fills remaining height)
    MapCanvas
    absolute overlays (unchanged)
  div.bg-white...                       ← bottom panel (fixed height, ~35vh max)
    CategoryFilterChips
    PoiList
  PoiDetailSheet                        ← keep at root (Sheet portal)
```

`min-h-0` on the map area is required because flex children default to `min-height: auto`, which causes them to overflow their container. Without it, the map would be full screen and the bottom panel would be hidden below the viewport.

---

### Architecture: PoiList Empty State vs Loading State

```
visibleLayers.size === 0  → return null (don't render panel at all — controlled by map-view.tsx)
isPending === true         → show 3 <Skeleton> items (corridor search in progress)
filteredPois.length === 0  → show "Aucun POI dans cette plage" message
filteredPois.length > 0   → show list
```

Note: `isPending` comes from `usePois()` in `map-view.tsx` (already computed as `poisPending`). Pass it as prop to `<PoiList>`.

---

### Anti-Patterns to Avoid

```typescript
// ❌ Using removeSource for the category filter (causes GeoJSON rebuild + flicker)
map.removeSource(sourceId)  // when activeLayer is set
// ✅ Hide only — keep source in GPU memory
map.setLayoutProperty(layerId, 'visibility', 'none')

// ❌ Changing visibleLayers to apply the category filter (triggers Overpass API call)
toggleLayer(layer)  // as a filter action
// ✅ Use setActiveLayer — zero API calls
setActiveLayer(layer)

// ❌ Array.includes() to find a POI's layer
const layer = Object.entries(poisByLayer).find(([, pois]) => pois.includes(poi))?.[0]
// ✅ CATEGORY_TO_LAYER O(1) lookup
const layer = CATEGORY_TO_LAYER[poi.category]

// ❌ Putting the debounce on the chip's aria-pressed (confusing UX — chip lags behind tap)
// ✅ Debounce only the MapLibre setLayoutProperty call (via debouncedActiveLayer state)

// ❌ Using useUIStore() hook inside a MapLibre event handler (Rules of Hooks violation)
map.on('click', layerId, () => { const { setSelectedPoi } = useUIStore() })
// ✅ Already done in 4.4 — keep .getState() pattern unchanged
map.on('click', layerId, () => { const { setSelectedPoi } = useUIStore.getState() })

// ❌ Resetting activeLayer inside usePois (not needed — usePois queries are unchanged)
// ✅ activeLayer is consumed only by usePoiLayers (map) and PoiList (UI)
```

---

### Project Structure Notes

**Files to CREATE:**
```
apps/web/src/app/(app)/map/[id]/_components/
  category-filter-chips.tsx       ← new
  category-filter-chips.test.tsx  ← new
  poi-list.tsx                    ← new
  poi-list.test.tsx               ← new
```

**Files to MODIFY:**
```
apps/web/src/stores/map.store.ts
  ← toggleLayer: reset activeLayer when removing the currently-filtered layer

apps/web/src/hooks/use-poi-layers.ts
  ← add activeLayer read + debouncedActiveLayer state
  ← add setLayoutProperty visibility logic for filter (not removeSource)

apps/web/src/hooks/use-poi-layers.test.ts
  ← ALREADY EXISTS with 5 tests from 4.4 — add new filter test cases

apps/web/src/app/(app)/map/[id]/_components/map-view.tsx
  ← add visibleLayers from useMapStore
  ← change outer div to flex-col
  ← wrap existing content in flex-1 min-h-0 div
  ← add bottom panel with CategoryFilterChips + PoiList
  ← move LayerToggles from bottom-8 to bottom-4 to avoid panel overlap

apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx
  ← add bottom panel render tests
```

**No backend changes. No DB migrations. No new API endpoints.**
No changes to `packages/shared/` — all needed types and constants already exist.

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.5 ACs: FR-034]
- [Source: apps/web/src/stores/map.store.ts — `activeLayer: MapLayer | null` defined but unused until 4.5]
- [Source: apps/web/src/stores/map.store.ts — `visibleLayers`, `toggleLayer`, `setActiveLayer`]
- [Source: apps/web/src/hooks/use-poi-layers.ts — current state: MapLibre source/layer management + POI click handlers from 4.4]
- [Source: apps/web/src/hooks/use-poi-layers.test.ts — 5 tests from 4.4 — modify, do not recreate]
- [Source: apps/web/src/hooks/use-pois.ts — `poisByLayer: Record<MapLayer, Poi[]>` sorted by distAlongRouteKm]
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx — post-4.4 state with PoiDetailSheet integrated]
- [Source: apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx — LAYER_CONFIGS (emoji + label reference)]
- [Source: packages/shared/src/types/poi.types.ts — `CATEGORY_TO_LAYER`, `LAYER_CATEGORIES`, `Poi` (source includes 'google' since 4.4)]
- [Source: apps/web/src/components/ui/scroll-area.tsx — available shadcn component]
- [Source: apps/web/src/components/ui/skeleton.tsx — available shadcn component]
- [Source: _bmad-output/implementation-artifacts/4-4-poi-detail-sheet-booking-deep-links.md — File List: full picture of 4.4 changes including DTOs, Dockerfile, webpack, overpass categories, CORRIDOR_WIDTH_M 3000, DEFAULT_CYCLING_SPEED_KMH]
- [Source: _bmad-output/implementation-artifacts/4-3-corridor-search-poi-discovery-by-km-range.md — PoiList cancelled in 4.3 → introduced here in 4.5]
- [Source: _bmad-output/project-context.md — shadcn/ui + Tailwind v4, MapLibre v4, Zustand v5]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

(none)

### Completion Notes List

- Task 1: `usePoiLayers` updated with `activeLayer` read + `debouncedActiveLayer` state (100ms debounce). Filter logic uses `setLayoutProperty('visibility')` to hide non-selected layers without removing their source — enables instant restore on filter clear. Dependency array updated.
- Task 2: `toggleLayer` in `useMapStore` updated to reset `activeLayer` to null when the currently-filtered layer is toggled off — prevents empty map state.
- Task 3: `<CategoryFilterChips />` created. Renders only when ≥2 visible layers have POIs. Toggle-style chips (tap active chip → null, tap inactive → set), "Tout" chip visible only when filter active.
- Task 4: `<PoiList />` created. Shows all visible layers sorted by `distAlongRouteKm` when `activeLayer=null`, or only the active layer's POIs. Scroll reset on filter change. Loading skeletons and empty state included.
- Task 5: `map-view.tsx` refactored to `flex-col` layout. Map area wrapped in `flex-1 min-h-0`. Bottom panel with `<CategoryFilterChips>` and `<PoiList>` rendered conditionally on `visibleLayers.size > 0`. LayerToggles moved from `bottom-8` to `bottom-4`.
- All 171 tests pass (23 test files). 4 new filter tests in `use-poi-layers.test.ts`, 7 in `category-filter-chips.test.tsx`, 7 in `poi-list.test.tsx`, 2 new bottom panel tests in `map-view.test.tsx`.

### File List

**Modified:**
- `apps/web/src/hooks/use-poi-layers.ts`
- `apps/web/src/hooks/use-poi-layers.test.ts`
- `apps/web/src/stores/map.store.ts`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx`

**Created:**
- `apps/web/src/app/(app)/map/[id]/_components/category-filter-chips.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/category-filter-chips.test.tsx`
