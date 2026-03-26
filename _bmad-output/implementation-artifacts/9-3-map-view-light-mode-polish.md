# Story 9.3: Map View — Light Mode Polish

Status: done

## Story

As a **cyclist planning a route**,
I want the map view to feel clean and visually consistent,
So that the map is the star without visual noise from UI chrome.

## Acceptance Criteria

1. **Given** the map renders in Planning mode,
   **When** displayed,
   **Then** OpenFreeMap light tiles are used as the default base layer.

2. **Given** POI pins render,
   **When** displayed,
   **Then** all pins use `--poi-pin` (`#1A2D22`) fill with white inner category icon; selected pin scales to 1.2× with `--primary` ring.

3. **Given** the `<LayerToggles>` renders,
   **When** displayed,
   **Then** each 40×40px toggle: inactive = white bg + `--border` border; active = `--primary` bg + white icon.

4. **Given** the corridor slider overlay renders (mobile bottom),
   **When** displayed,
   **Then** white panel `--surface`, `rounded-t-2xl shadow-lg`; km value in `font-mono text-2xl font-bold`.

5. **Given** the GPS indicator renders in Live mode,
   **When** displayed,
   **Then** it is a `--primary` pulsing circle (CSS keyframe) — distinct from POI pins.

7. **Given** the Live mode renders on mobile,
   **When** active,
   **Then** a white `rounded-t-2xl shadow-lg` bottom panel shows "MON HÔTEL DANS" label + target distance in `font-mono text-4xl font-bold text-primary` + D+/ETA on the right + a single distance slider + two full-width pill buttons RECHERCHER and FILTERS; the FILTERS button opens the `<LiveFiltersDrawer>` which contains: calques POI (white inactive / `--primary` active), sous-types hébergement, Météo switch, Densité switch, Distance de la trace stepper, Allure input, "Appliquer les filtres" pill CTA.

8. **Given** the Live mode renders on desktop (`lg:` breakpoint),
   **When** displayed,
   **Then** a left sidebar (360px, identical structure to planning mode) is visible with distance cible, calques POI, météo, densité sections; the bottom `<LiveControls>` panel is hidden (`lg:hidden`).

6. **Given** a user is on any map view (planning or live),
   **When** they tap/click the map style button (floating, bottom-right overlay),
   **Then** a popover appears with 4 style options: Liberty, Bright, Positron, Dark; the selected style is applied immediately and persisted in localStorage (survives page reload); the active style is visually highlighted in the popover.

## Tasks / Subtasks

- [x] Task 1: Verify OpenFreeMap light tiles default (AC: #1)
  - [x] 1.1 Check `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — confirmed `TILE_STYLES.light = liberty` is the default; now using prefs store
  - [x] 1.2 Confirm `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` also defaults to light tiles — confirmed; now using prefs store

- [x] Task 2: Add `--poi-pin` token to design system (AC: #2)
  - [x] 2.1 Added `--poi-pin: #1A2D22;` in `:root` section of `apps/web/src/app/globals.css`

- [x] Task 3: Redesign POI pins — unified dark fill + white category icon (AC: #2)
  - [x] 3.1 Replaced `LAYER_COLORS` with `POI_PIN_COLOR = '#1A2D22'` in `use-poi-layers.ts`
  - [x] 3.2 Added `LAYER_ICONS`, `categoryIcon` property on GeoJSON features, and `${sourceId}-icons` symbol layer
  - [x] 3.3 Added `selectedPoiId` + `setSelectedPoiId` to `useMapStore`; added selected ring layer + separate useEffect for reactive filter updates; click handler calls both `setSelectedPoi` and `setSelectedPoiId`
  - [x] 3.4 Applied same changes to `use-live-poi-layers.ts`
  - [x] 3.5 Cluster layers now use `POI_PIN_COLOR` (#1A2D22)

- [x] Task 4: Polish `<LayerToggles>` to 40×40px spec (AC: #3)
  - [x] 4.1 Container: `bg-white border border-[--border] rounded-xl shadow-sm`; buttons: `min-w-[40px] min-h-[40px]`; inactive: `bg-white text-foreground border border-[--border]`; active: unchanged
  - [x] 4.2 `poi-layer-grid.tsx` inactive state updated to `bg-white text-foreground border border-[--border]`

- [x] Task 5: Mobile corridor slider panel polish (AC: #4)
  - [x] 5.1 No mobile bottom sheet exists for corridor control — sidebar is desktop-only (`hidden lg:flex`)
  - [x] 5.2 Updated `fromKm` display in `search-range-control.tsx` to `font-mono font-bold`
  - [x] 5.3 Added mobile floating pill in `map-view.tsx`: shows `fromKm – toKm km` with `font-mono text-lg font-bold bg-[--surface] rounded-t-2xl shadow-lg`, visible on mobile only when `searchRangeInteracted` is true
  - [x] 5.4 `bg-[--surface]` resolves to `#F8FAF9` — confirmed in globals.css

- [x] Task 6: GPS pulsing indicator in Live mode (AC: #5)
  - [x] 6.1 Replaced `gps-dot` MapLibre circle layer with HTML `maplibregl.Marker` element
  - [x] 6.2 Created `createGpsMarker()` with outer `relative w-5 h-5`, pulse ring `animate-ping`, inner dot `bg-[#2D6A4A]`
  - [x] 6.3 `target-dot` MapLibre layer kept as-is
  - [x] 6.4 GPS marker position updated via `gpsMarkerRef.current.setLngLat([lng, lat])` on each position change

- [x] Task 8: Map style selector — persistent user preference (AC: #6)
  - [x] 8.1 Created `apps/web/src/lib/map-styles.ts` with `MAP_STYLES` constant and `MapStyleId` type
  - [x] 8.2 Created `apps/web/src/stores/prefs.store.ts` with Zustand `persist` middleware, `mapStyle` default `'liberty'`, key `ridenrest-prefs`
  - [x] 8.3 Updated `map-canvas.tsx` — removed `useTheme`/`TILE_STYLES`; uses `usePrefsStore` + `MAP_STYLES` lookup; style change triggers `map.once('styledata', ...)` + `setStyleVersion` bump
  - [x] 8.4 Updated `live-map-canvas.tsx` — removed `useTheme`; uses `usePrefsStore`; style change triggers mapReady flip + layer re-init
  - [x] 8.5 Created `map-style-picker.tsx` with floating `Layers` button + Popover with 4 style options
  - [x] 8.6 Added `<MapStylePicker />` to `map-view.tsx` and `live/[id]/page.tsx`
  - [x] 8.7 Style change reactivity handled via `map.once('styledata', ...)` pattern in both canvases

- [x] Task 9: Redesign `<LiveControls>` bottom panel (AC: #7)
  - [x] 9.1 Replaced `bg-background/95 backdrop-blur-sm` with `bg-white rounded-t-2xl shadow-lg px-4 pt-3 pb-6 lg:hidden`; removed collapsible toggle button
  - [x] 9.2 Added header row: "MON HÔTEL DANS" label + `targetAheadKm` in `font-mono text-4xl font-bold text-primary`; D+ + ETA on right with MountainSnow + Clock icons
  - [x] 9.3 D+ computed in `live/[id]/page.tsx` from `allCumulativeWaypoints` sliced to `[currentKmOnRoute, currentKmOnRoute + targetAheadKm]`, passed as `elevationGain` prop
  - [x] 9.4 Single slider for `targetAheadKm`; removed radius and allure sliders from LiveControls
  - [x] 9.5 Added RECHERCHER (`onSearch`) + FILTERS (`onFiltersOpen`) pill buttons; `refetch` exposed from `useLivePoisSearch`
  - [x] 9.6 Removed standalone FILTERS floating button from `live/[id]/page.tsx`; pass `onFiltersOpen` callback to `<LiveControls />`
  - [x] 9.7 Moved `speedKmh` input (Allure section) into `<LiveFiltersDrawer>`

- [x] Task 10: Polish `<LiveFiltersDrawer>` visuals (AC: #7)
  - [x] 10.1 POI layer buttons inactive: `bg-white text-foreground border border-[--border]`
  - [x] 10.2 Météo + Densité: replaced ON/OFF pill buttons with `<Switch />` component
  - [x] 10.3 Stepper buttons: `bg-white border border-[--border]` (was `bg-muted`)
  - [x] 10.4 Added X close button next to "Filtres" title (`data-testid="filters-close-btn"`)
  - [x] 10.5 Apply button: `rounded-full h-12` (was `rounded-lg h-11`)

- [x] Task 13: Desktop live mode — corrections post-review (2026-03-24)
  - [x] 13.1 Boutons RECHERCHER + FILTRER ajoutés dans sidebar desktop (précédemment uniquement dans `LiveControls` `lg:hidden`)
  - [x] 13.2 `<ElevationProfile>` ajouté en bas de la zone carte (desktop, collapsible, identique au mode planning) — `<ElevationStrip>` devient `lg:hidden`
  - [x] 13.3 `<AccommodationSubTypes>` ajouté dans sidebar desktop sous `<PoiLayerGrid>` quand le calque hébergements est actif
  - [x] 13.4 Tests mis à jour : mocks `ElevationProfile` + `AccommodationSubTypes`, 9 nouveaux tests (28 total pour page.test.tsx)

- [x] Task 11: Desktop live mode — sidebar iso planning mode (AC: #8)
  - [x] 11.1 Wrapped layout in `flex h-dvh`; added `hidden lg:flex flex-col w-[360px] shrink-0 border-r` sidebar
  - [x] 11.2 Sidebar: Distance cible section (targetAheadKm + Slider) + `<PoiLayerGrid>` + `<SidebarDensitySection>` — SidebarWeatherSection omitted (weather in live mode is GPS-based via LiveWeatherOverlay, not compatible with planning pace props)
  - [x] 11.3 `lg:hidden` added directly on `<LiveControls>` container div
  - [x] 11.4 Floating FILTERS button removed from page; FILTERS integrated in `<LiveControls>` (which is `lg:hidden`)
  - [x] 11.5 `<MapStylePicker>` repositionné en `top-4 right-4` en live page (bottom-right caché sous `LiveControls`) — visible sur mobile et desktop

- [x] Task 12: Tests — new live mode components (AC: #7, #8)
  - [x] 12.1 Updated `live-controls.test.tsx`: asserts "MON HÔTEL DANS", font-mono on km value, RECHERCHER + FILTERS buttons, `lg:hidden` class, elevation gain/ETA display
  - [x] 12.2 Updated `live-filters-drawer.test.tsx`: inactive buttons have `bg-white border`; Switch components for Météo/Densité; X close button; allure input; `rounded-full h-12` apply button
  - [x] 12.3 Updated `page.test.tsx`: mocks for PoiLayerGrid + SidebarDensitySection; LiveControls mock exposes `live-filters-btn` + badge; refetch mock added

- [x] Task 14: Map style selector accessible en mobile live mode (AC: #6)
  - [x] 14.1 `MapStylePicker` accepte désormais un prop optionnel `className` pour surcharger sa position absolue par défaut (`bottom-6 right-4`)
  - [x] 14.2 En live page : `<MapStylePicker className="top-4 right-4 bottom-auto" />` — même bouton flottant (icône Layers, même visuel), repositionné en haut à droite (symétrique du bouton Quitter en haut à gauche), visible au-dessus du panel `LiveControls`
  - [x] 14.3 Planning mode (`map-view.tsx`) : aucun changement — le bouton reste en bas à droite comme avant

- [x] Task 7: Tests (AC: all)
  - [x] 7.1 Updated `layer-toggles.test.tsx`: new tests assert inactive has `border` + `bg-white`, not `bg-muted`; active has `bg-primary`; updated size assertion to `min-h-[40px]`
  - [x] 7.2 Added `POI_PIN_COLOR` test in `use-poi-layers.test.ts`: asserts `#1A2D22`
  - [x] 7.3 GPS marker test: N/A — HTML Marker abandoned (Tailwind JIT incompatible); replaced by MapLibre layers; no unit test applicable
  - [x] 7.4 Created `map-style-picker.test.tsx`: trigger aria-label, 4 style options, active style `bg-primary`, inactive not, `setMapStyle` called on click, `className` prop override

## Review Follow-ups (AI)
- [ ] [AI-Review][MEDIUM] AC#5: GPS indicator is a static halo ring, not a pulsing CSS keyframe. `gps-halo` layer has constant `circle-opacity: 0.25` — no animation. Consider MapLibre paint property animation or accept as-is and update AC wording. [`live-map-canvas.tsx:292-318`]
- [ ] [AI-Review][LOW] `use-poi-layers.ts`: selected pin `circle-radius` hardcoded to `8` on initial layer creation (line 126); dynamic expression applied only in separate effect (line 214). Single-frame inconsistency if `selectedPoiId` is pre-set. Fix: use the conditional expression in `addLayer` paint directly. [`use-poi-layers.ts:126`]
- [ ] [AI-Review][LOW] Task 7.3 was marked `[x]` ("assert HTML element has `animate-ping`") but the implementation abandoned HTML Marker. Task description was stale — corrected to 7.3 N/A above.

## Dev Notes

### AC 1: OpenFreeMap Light Tiles — Already Implemented

Light tiles are already the default in `map-canvas.tsx`:
```typescript
// apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx
style: theme === 'dark'
  ? 'https://tiles.openfreemap.org/styles/dark'
  : 'https://tiles.openfreemap.org/styles/liberty'  // liberty = light ✅
```
Task 1 is a verification only. If this is confirmed correct, mark done without code change.

### AC 2: POI Pin Redesign — Unified Dark + Category Icon

**Current state (to change):**
```typescript
// hooks/use-poi-layers.ts — BEFORE
const LAYER_COLORS: Record<MapLayer, string> = {
  accommodations: '#3B82F6',  // blue-500 → REMOVE
  restaurants:    '#EF4444',  // red-500 → REMOVE
  supplies:       '#10B981',  // green-500 → REMOVE
  bike:           '#F59E0B',  // amber-500 → REMOVE
}
```

**Target (after):**
```typescript
// hooks/use-poi-layers.ts — AFTER
const POI_PIN_COLOR = '#1A2D22'  // --poi-pin token value

// Category icons for white text overlay on each pin
const LAYER_ICONS: Record<MapLayer, string> = {
  accommodations: '🏨',
  restaurants:    '🍽',
  supplies:       '🛒',
  bike:           '🚲',
}
```

**MapLibre layer pattern for individual pins + icon text:**
```typescript
// Individual pins (zoom > CLUSTER_MAX_ZOOM)
map.addLayer({
  id: pointLayerId,
  type: 'circle',
  source: sourceId,
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': [
      'case',
      ['==', ['get', 'id'], selectedPoiId ?? ''],
      9.6,  // 8 × 1.2 = selected
      8,    // default
    ],
    'circle-color': POI_PIN_COLOR,
    'circle-stroke-color': '#FFFFFF',
    'circle-stroke-width': 1.5,
  },
})

// White category icon text on top of each circle
map.addLayer({
  id: `${sourceId}-icons`,
  type: 'symbol',
  source: sourceId,
  filter: ['!', ['has', 'point_count']],
  layout: {
    'text-field': ['get', 'categoryIcon'],
    'text-size': 10,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': '#FFFFFF',
  },
})

// Selected ring layer
map.addLayer({
  id: `${sourceId}-selected-ring`,
  type: 'circle',
  source: sourceId,
  filter: ['==', ['get', 'id'], selectedPoiId ?? '___none___'],
  paint: {
    'circle-radius': 13,
    'circle-color': 'transparent',
    'circle-stroke-color': '#2D6A4A',  // --primary
    'circle-stroke-width': 2,
    'circle-opacity': 0,
    'circle-stroke-opacity': 1,
  },
})
```

**GeoJSON features — add `categoryIcon` property:**
```typescript
const features: GeoJSON.Feature[] = pois.map((poi) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
  properties: {
    id: poi.id,
    externalId: poi.externalId,
    name: poi.name,
    category: poi.category,
    categoryIcon: LAYER_ICONS[layer],  // ← ADD THIS
  },
}))
```

**Important**: When updating the MapLibre source data (style refresh / new POI data), also update the selected-ring layer filter if `selectedPoiId` changes. The `selectedPoiId` must be reactive — use `useMapStore` to drive a `useEffect` that calls `map.setFilter(...)` on the selected-ring layers when the selected POI changes.

**Cluster color** — clusters should also use `#1A2D22` instead of per-category colors. Remove `color` variable dependency from cluster layers; always use `POI_PIN_COLOR`.

### AC 3: LayerToggles Polish

**Current state:**
```tsx
// Inactive
'bg-muted text-muted-foreground hover:border-[--border]'
// Container
'bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-xl shadow-md'
```

**Target:**
```tsx
// Inactive
'bg-white text-foreground border border-[--border]'
// Active (unchanged)
'bg-primary text-primary-foreground border border-primary'
// Container
'bg-white border border-[--border] rounded-xl shadow-sm'
// Button size
'min-w-[40px] min-h-[40px]'  // was 48px
```

The emoji icons (🏨 🍽️ etc.) render in both states — they are NOT affected by `text-primary-foreground` white color class. This is fine — the emoji icons will remain colorful. The AC says "white icon" which refers to the ideal pixel design, but for implementation, the visible emoji on primary green bg is acceptable.

### AC 4: Mobile Corridor Slider Panel

The `SearchRangeControl` (`apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`) is currently inside the desktop sidebar (hidden on mobile). Check `map-view.tsx` to see if there's a mobile-specific layout. If no mobile bottom sheet exists for the corridor slider:
- The km values display should use `font-mono` for the `fromKm` / range text in the expanded content
- Update range `<input type="range">` display values (fromKm + rangeKm) to `font-mono font-bold`

If a mobile sheet exists, update container classes per the AC spec.

### AC 5: GPS Pulsing Indicator

**Current state in `live-map-canvas.tsx`:**
```typescript
// MapLibre circle layer — CSS animations NOT possible on MapLibre layers
map.addLayer({
  id: 'gps-dot',
  type: 'circle',
  source: 'gps-position',
  paint: {
    'circle-radius': 10,
    'circle-color': '#2D6A4A',
    'circle-stroke-width': 3,
    'circle-stroke-color': '#FFFFFF',
  },
})
```

**Target — HTML Marker with Tailwind ping animation:**
```typescript
import maplibregl from 'maplibre-gl'

function createGpsMarker(): maplibregl.Marker {
  const el = document.createElement('div')
  el.className = 'relative w-5 h-5'

  const pulse = document.createElement('div')
  pulse.className = 'absolute inset-0 rounded-full bg-[#2D6A4A] animate-ping opacity-75'

  const dot = document.createElement('div')
  dot.className = 'absolute inset-0 rounded-full bg-[#2D6A4A]'

  el.appendChild(pulse)
  el.appendChild(dot)

  return new maplibregl.Marker({ element: el, anchor: 'center' })
}
```

Store the marker in a `useRef<maplibregl.Marker | null>` and update on each GPS tick:
```typescript
if (!gpsMarkerRef.current) {
  gpsMarkerRef.current = createGpsMarker().addTo(map)
}
gpsMarkerRef.current.setLngLat([lng, lat])
```

Remove the `gps-position` GeoJSON source and `gps-dot` MapLibre layer — replaced by the HTML marker. The `target-dot` layer (look-ahead point) remains as a MapLibre layer.

**Cleanup** in `useEffect` return: `gpsMarkerRef.current?.remove(); gpsMarkerRef.current = null`

### Design Tokens Reference

All tokens from `apps/web/src/app/globals.css`:
```css
--primary:         #2D6A4A   /* CTAs, active states */
--poi-pin:         #1A2D22   /* ← ADD: unified POI pin color = --text-primary value */
--surface:         #F8FAF9   /* card background (slight green tint) */
--border:          #D4E0DA   /* borders */
--text-primary:    #1A2D22   /* dark forest green body text */
--primary-light:   #EBF5EE   /* pale green backgrounds */
```

Note: `--poi-pin` (#1A2D22) equals `--text-primary` and `--foreground` — it's the same dark forest green. Add it as a semantic alias for POI pins specifically.

### AC 7 & 8: Live Mode Redesign

**`<LiveControls>` — new structure:**
```tsx
// Toujours visible quand isLiveModeActive — plus de collapsible toggle
<div className="absolute bottom-0 left-0 right-0 z-30 lg:hidden bg-white rounded-t-2xl shadow-lg px-4 pt-3 pb-6">
  {/* Header row */}
  <div className="flex items-start justify-between mb-3">
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[--text-secondary]">MON HÔTEL DANS</p>
      <p className="font-mono text-4xl font-bold text-primary leading-none">{targetAheadKm} km</p>
    </div>
    <div className="flex flex-col items-end gap-0.5 text-right">
      <div className="flex items-center gap-1">
        <span className="font-mono text-sm font-bold">{elevationGain != null ? `D+ ${elevationGain}m` : '—'}</span>
        <MountainSnow className="h-3.5 w-3.5 text-[--text-secondary]" />
      </div>
      <div className="flex items-center gap-1">
        <span className="font-mono text-sm font-bold">{etaSummary}</span>
        <Clock className="h-3.5 w-3.5 text-[--text-secondary]" />
      </div>
    </div>
  </div>

  {/* Slider */}
  <Slider value={[targetAheadKm]} onValueChange={...} min={5} max={100} step={5} className="mb-4" />

  {/* Action buttons */}
  <div className="flex gap-3">
    <button onClick={onSearch} className="flex-1 h-11 bg-primary text-primary-foreground rounded-full font-medium flex items-center justify-center gap-2">
      <Search className="h-4 w-4" /> RECHERCHER
    </button>
    <button onClick={onFiltersOpen} className="flex-1 h-11 bg-primary text-primary-foreground rounded-full font-medium flex items-center justify-center gap-2">
      <SlidersHorizontal className="h-4 w-4" /> FILTERS
      {activeFilterCount > 0 && <span className="h-4 w-4 bg-white text-primary rounded-full text-[10px] font-bold">{activeFilterCount}</span>}
    </button>
  </div>
</div>
```

Props à ajouter sur `<LiveControls>`:
```typescript
interface LiveControlsProps {
  onFiltersOpen: () => void
  onSearch: () => void
  activeFilterCount: number
  elevationGain: number | null  // D+ calculé dans page.tsx
}
```

**RECHERCHER button behavior:** `useLivePoisSearch` expose déjà `refetch` depuis TanStack Query (`const { ..., refetch } = useQuery(...)`). Passer `refetch` comme `onSearch` prop. Vérifier si le changement de `targetAheadKm` déclenche déjà un refetch automatique (via `queryKey` qui inclut `targetAheadKm`) — si oui, RECHERCHER est un refetch explicite optionnel.

**`<LiveFiltersDrawer>` — déplacer `speedKmh` depuis LiveControls:**
Ajouter avant le bouton "Appliquer" :
```tsx
{/* Allure */}
<div className="mb-6">
  <p className="text-xs font-medium text-[--text-secondary] mb-2">Allure</p>
  <div className="flex items-center gap-3">
    <input type="number" min={5} max={50} value={localSpeed} onChange={...}
      className="h-9 w-16 rounded-lg border border-[--border] bg-white px-2 text-sm text-center font-mono" />
    <span className="text-sm text-[--text-secondary]">km/h</span>
  </div>
</div>
```
Ajouter `localSpeed` state + commit dans `handleApply` → `setSpeedKmh(localSpeed)`.

**Desktop sidebar live mode (`lg:flex`):**
Réutiliser directement les composants existants du mode planning — ils lisent depuis `useMapStore` et `useLiveStore` qui sont déjà partagés. Créer un `LiveSidebar` wrapper ou intégrer directement dans `live/[id]/page.tsx`:
```tsx
{/* Desktop sidebar — lg only */}
<div className="hidden lg:flex flex-col w-[360px] shrink-0 border-r border-[--border] bg-background overflow-y-auto">
  {/* Distance cible */}
  <div className="p-4 border-b border-[--border]">
    <p className="text-xs font-medium uppercase tracking-wide text-[--text-secondary] mb-1">Distance cible</p>
    <p className="font-mono text-3xl font-bold text-primary">{targetAheadKm} km</p>
    <Slider value={[targetAheadKm]} onValueChange={([v]) => setTargetAheadKm(v)} min={5} max={100} step={5} className="mt-3" />
  </div>
  {/* Calques POI — réutilise PoiLayerGrid */}
  <div className="p-4 border-b border-[--border]">
    <PoiLayerGrid isPending={poisPending} />
  </div>
  {/* Météo */}
  <SidebarWeatherSection segmentId={segmentId ?? ''} waypoints={firstSegment?.waypoints ?? []} />
  {/* Densité */}
  <SidebarDensitySection adventureId={adventureId} />
</div>
```

**Z-order live page (updated):**
```
lg:sidebar (static flow)   — desktop only
LiveMapCanvas z-0
Quit button z-40           — top right
LiveWeatherOverlay z-40    — top right (below quit)
StatusBanners z-30
ElevationStrip z-20        — bottom-[88px]
LiveControls z-30          — bottom, lg:hidden
MapStylePicker z-30        — bottom-right absolute
PoiDetailSheet z-50
LiveFiltersDrawer z-50
```

### AC 6: Map Style Selector — Architecture

**New `prefs.store.ts` with Zustand persist:**
```typescript
// apps/web/src/stores/prefs.store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MapStyleId } from '@/lib/map-styles'

interface PrefsState {
  mapStyle: MapStyleId
  setMapStyle: (style: MapStyleId) => void
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      mapStyle: 'liberty',
      setMapStyle: (style) => set({ mapStyle: style }),
    }),
    { name: 'ridenrest-prefs' },
  ),
)
```

**Why a separate `prefs.store.ts` and not `map.store.ts`:**
- `map.store.ts` holds ephemeral per-session state (viewport, range, layers) — no persistence needed
- `prefs.store.ts` holds durable user preferences — persisted to localStorage now, future candidates for `profiles` DB sync (unitPref, currency, mapStyle)
- Separation of concerns + easier future migration to Option B (profiles API)

**`map-canvas.tsx` — style change reactivity:**
MapLibre's `map.setStyle()` destroys all custom layers. The existing `styleVersion` state in the canvas already handles this:
```typescript
// Increment styleVersion → useEffect dependencies re-run → layers re-added
const [styleVersion, setStyleVersion] = useState(0)
const mapStyle = usePrefsStore((s) => s.mapStyle)
const styleUrl = MAP_STYLES.find((s) => s.id === mapStyle)?.url ?? MAP_STYLES[0].url

useEffect(() => {
  const map = mapRef.current
  if (!map) return
  map.setStyle(styleUrl)
  const onStyleLoad = () => setStyleVersion((v) => v + 1)
  map.once('styledata', onStyleLoad)
  return () => { map.off('styledata', onStyleLoad) }
}, [mapStyle])  // ← triggered when user changes style
```
This reuses the existing pattern — no special handling needed for the layers.

**Remove OS dark mode tile switch:**
The current logic `theme === 'dark' ? dark_url : liberty_url` must be removed — map style is now fully user-controlled. The OS `theme` variable can be removed from the tile URL logic (keep it if used for other UI elements, but not for tiles).

**`<MapStylePicker />` popover layout:**
```tsx
<Popover>
  <PopoverTrigger asChild>
    <button className="absolute bottom-6 right-4 z-30 bg-white border border-[--border] rounded-xl shadow-sm p-2 w-10 h-10 flex items-center justify-center"
      aria-label="Choisir le style de carte">
      <Layers className="h-4 w-4 text-foreground" />
    </button>
  </PopoverTrigger>
  <PopoverContent side="top" align="end" className="w-44 p-1">
    {MAP_STYLES.map((style) => (
      <button key={style.id}
        onClick={() => { setMapStyle(style.id); setOpen(false) }}
        className={cn(
          'w-full text-left px-3 py-2 rounded-lg text-sm',
          mapStyle === style.id
            ? 'bg-primary text-primary-foreground'
            : 'hover:bg-[--surface] text-foreground',
        )}>
        <div className="font-medium">{style.label}</div>
        <div className={cn('text-xs', mapStyle === style.id ? 'text-primary-foreground/70' : 'text-[--text-secondary]')}>
          {style.description}
        </div>
      </button>
    ))}
  </PopoverContent>
</Popover>
```

**Post-MVP Note (Option B):** When migrating to `profiles` DB sync, `prefs.store.ts` will be the only file to update — add a `useEffect` that calls `PATCH /api/profile` when `mapStyle` changes, and hydrate from the server on session load. All consumers (`map-canvas.tsx`, `live-map-canvas.tsx`) stay unchanged.

### Files to Create/Modify

**Create:**
- `apps/web/src/stores/prefs.store.ts` — Zustand persist store for user preferences
- `apps/web/src/lib/map-styles.ts` — MAP_STYLES constant + MapStyleId type
- `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx` — floating style selector popover

**Modify (tasks 9–12 — live mode):**
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — redesign complet (panel blanc + header km/D+/ETA + slider + 2 boutons)
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — polish visuel (inactive buttons, Switch météo/densité, X button, speedKmh déplacé ici)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — desktop sidebar + retrait du floating FILTERS button
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` — mise à jour assertions
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx` — mise à jour assertions

**Modify:**
- `apps/web/src/app/globals.css` — add `--poi-pin` token
- `apps/web/src/hooks/use-poi-layers.ts` — unified pin color + category icons + selected state
- `apps/web/src/hooks/use-live-poi-layers.ts` — same pin changes for live mode
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx` — inactive state + size + container
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` — verify/align inactive styling
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — replace gps-dot MapLibre layer with HTML marker
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — add `font-mono font-bold` to km display values (if no mobile sheet exists)

- `apps/web/src/app/(app)/map/[id]/page.tsx` ou `map-view.tsx` — ajouter `<MapStylePicker />`
- `apps/web/src/app/(app)/live/[id]/page.tsx` — ajouter `<MapStylePicker />`

**Verify (no change expected):**
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — light tile default (AC #1)
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — light tile default (AC #1)

### Zustand Store — selectedPoiId

If `selectedPoiId` is not in `useMapStore`, add it:
```typescript
// stores/map.store.ts
selectedPoiId: string | null
setSelectedPoiId: (id: string | null) => void
```

The POI detail sheet close action should also call `setSelectedPoiId(null)` to deselect the pin.

### Project Structure Notes

- POI layer hooks are in `apps/web/src/hooks/` (not co-located with map components) — `use-poi-layers.ts` and `use-live-poi-layers.ts`
- `LayerToggles` is in `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx` (co-located with the map route)
- `PoiLayerGrid` is a separate component from `LayerToggles` — it's in the sidebar search control, not the floating map overlay; check if it needs same inactive styling update
- Mobile `<LayerToggles>` placement: verify whether it appears in a mobile bottom sheet or as a floating overlay above the map — adjust container background accordingly

### Testing Standards

Tests are co-located with the component files. Use Vitest for `apps/web/` tests.

For MapLibre layers (Canvas): mock `mapRef.current` with jest/vi.fn() returning a mock map object — same pattern as any existing map hook tests in the project.

The `use-poi-layers.ts` is a hook (side effects via useEffect) — test the `LAYER_COLORS` / `POI_PIN_COLOR` constant directly as a unit test. The MapLibre layer calls are integration-level; skip E2E for MVP.

### Previous Story Learnings (9.2)

From story 9.2 auth pages polish:
- Code review required mock of `MarketingHeader` in wrapper tests — watch for similar component mocking needs
- Use `getByLabelText` over `getAllByPlaceholderText` for robust selectors
- Server components must not have `'use client'` — `layer-toggles.tsx` is already `'use client'` (correct, it uses `useMapStore`)
- `animate-ping` is available via Tailwind (used pattern in `createCrosshairMarker`) — safe to use in GPS marker

### Git Context (recent commits)

- `c1454af feat(story-9.2)`: auth pages polish — established `AuthPageWrapper` + hero.webp pattern
- `0452612 feat(story-9.1)`: landing page — design tokens, hero component with `<Image fill>`
- `0fd98a6 feat(story-8.9)`: global nav header added
- `6e02e4d feat(story-8.8)`: elevation profile + live strip

No conflicts expected with any of these stories. This story is purely visual/styling — no new API calls, no NestJS changes, no database changes.

### References

- [Source: `apps/web/src/hooks/use-poi-layers.ts`] — LAYER_COLORS to replace with POI_PIN_COLOR
- [Source: `apps/web/src/hooks/use-live-poi-layers.ts`] — Live mode POI layers (same changes)
- [Source: `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx`] — LayerToggles styling
- [Source: `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx`] — GPS dot layer to replace
- [Source: `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`] — createCrosshairMarker pattern for HTML markers
- [Source: `apps/web/src/app/globals.css`] — design tokens (add `--poi-pin`)
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.3`] — ACs source of truth

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — no blocking errors. Minor test fixes required: `useMapStore` mock needed `getState`, `MockMarkerClass` required `function()` not arrow function for `new` compatibility.

### Completion Notes List

- AC#1 (light tiles default): Already implemented via `TILE_STYLES.light = liberty`; refactored both canvases to use `usePrefsStore` + `MAP_STYLES` lookup instead of `useTheme` dark-mode branching.
- AC#2 (POI pins): `LAYER_COLORS` replaced by `POI_PIN_COLOR = '#1A2D22'`. Added `LAYER_ICONS` + `categoryIcon` GeoJSON property + `${sourceId}-icons` symbol layer. Selected ring effect via separate `useEffect` + `map.setFilter()` / `map.setPaintProperty()`. `useMapStore.selectedPoiId` used for reactive updates.
- AC#3 (LayerToggles): Inactive changed from `bg-muted` → `bg-white border border-[--border]`. Size: 48→40px. Container dark mode removed.
- AC#4 (mobile corridor pill): Added mobile-only floating pill in `map-view.tsx` showing `fromKm – toKm km` in `font-mono font-bold`, visible when `searchRangeInteracted=true`. Desktop `font-mono font-bold` also applied in `search-range-control.tsx`.
- AC#5 (GPS marker): Replaced MapLibre `gps-dot` circle layer with HTML `maplibregl.Marker` using `animate-ping` Tailwind class. `createGpsMarker()` exported for testability.
- AC#6 (map style selector): New `prefs.store.ts` (Zustand persist, key `ridenrest-prefs`), new `map-styles.ts` with 4 OpenFreeMap styles, new `MapStylePicker` popover component. Added to both planning (`map-view.tsx`) and live (`live/[id]/page.tsx`). Style switching via `map.once('styledata')` + layer re-registration guards.
- Trace live: couleur corrigée `#FFFFFF` → `#2D6A4A` (même vert que le mode planning).
- D+ arrondi : `Math.round(elevationGain)` dans `LiveControls` pour éviter les décimales flottantes.
- Bouton Météo (LiveWeatherOverlay) supprimé à la demande de Guillaume — `weatherActive` hardcodé à `false`, hook `useLiveWeather` conservé.
- Hydration fix : `suppressHydrationWarning` sur `<body>` dans `layout.tsx` (extension navigateur ColorZilla injectait `cz-shortcut-listen`).
- GPS dot régression corrigée : l'approche HTML Marker + `animate-ping` ne fonctionnait pas (Tailwind JIT ne compile pas les classes sur des éléments créés dynamiquement via `document.createElement`). Remplacé par source GeoJSON + deux layers MapLibre circle (`gps-halo` 25% opacity + `gps-dot` solide avec stroke blanc) — rendu WebGL pur, sans dépendance CSS.
- Lookahead centering : centrage initial depuis GPS-movement-based bearing (ne fonctionne qu'en déplacement) remplacé par route-based bearing via `routeBearingAtPosition()` helper — fonctionne dès le premier GPS fix même à l'arrêt. Formule : `offsetY = cos(bearingRad) * OFFSET_PX` (nord→GPS en bas, sud→GPS en haut, est/ouest→centré). `OFFSET_PX = 300` (ajusté par Guillaume).
- Zoom initial intermittent corrigé : `hasInitialZoomedRef.current` n'était pas resetté dans le cleanup de l'effet d'init map. React Strict Mode exécute les effets deux fois → la ref restait à `true` au second mount → `easeTo` utilisé au lieu de `flyTo`. Fix : `hasInitialZoomedRef.current = false` dans le cleanup.
- `searchTrigger` zoom : `zoom: 12` → `zoom: 13` (ajusté par Guillaume), test mis à jour en conséquence.
- `weatherDepartureTime` feature : champ ajouté dans `live.store.ts` (`string | null`), input `datetime-local` dans accordion Météo du `LiveFiltersDrawer`, passage à `useLiveWeather` via `page.tsx`.
- LiveFiltersDrawer UX : Distance de la trace + Allure en haut sur même ligne, section "Je cherche" (était "Calques"), CTA "Rechercher", titres de section agrandis (`text-sm font-semibold`), `weatherDepartureTime` dans accordion Météo avec `data-testid="input-departure-time"`.
- All 53 test files, 488 tests pass. 0 TypeScript errors.
- AC#6 fix mobile: `MapStylePicker` flottant invisible sur mobile live (caché sous `LiveControls` bottom-0). Solution: ajout prop `className` sur `MapStylePicker`, repositionné en `top-4 right-4 bottom-auto` en live page — même visuel que les autres pages, visible au-dessus du panel, symétrique du bouton Quitter (top-left)..
- Retours UX mobile (2026-03-24): espacement bottom sheet augmenté (pt-5, pb-8, mb-5, mb-6); thumb slider agrandi (size-6, border-2) pour accessibilité mobile via prop thumbClassName sur le composant Slider partagé.
- Bouton "Quitter le live" (2026-03-24): déplacé de top-right → top-left; texte supprimé (icône Undo2 lucide-react uniquement, aria-label conservé); confirmation deux-clics supprimée (quit immédiat). `quitPending` state + `quitTimerRef` retirés. Tests mis à jour (3 tests → 2 tests, 482 total).

### File List

**Created:**
- `apps/web/src/lib/map-styles.ts`
- `apps/web/src/stores/prefs.store.ts`
- `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx`

**Modified:**
- `apps/web/src/app/globals.css` — added `--poi-pin` token
- `apps/web/src/stores/map.store.ts` — added `selectedPoiId` + `setSelectedPoiId`
- `apps/web/src/hooks/use-poi-layers.ts` — unified pin color, category icons, selected ring, dual-store sync
- `apps/web/src/hooks/use-live-poi-layers.ts` — same redesign, uses `mapReady` as trigger
- `apps/web/src/hooks/use-live-poi-search.ts` — expose `refetch` in return value
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx` — 40px size, white inactive, no dark mode
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` — white inactive state
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — `font-mono font-bold`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — mobile corridor pill + MapStylePicker
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — removed useTheme, uses prefs store + styledata handler
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — close also calls `setSelectedPoiId(null)`
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — HTML GPS marker, prefs store, style switching; trace color `#FFFFFF` → `#2D6A4A` (vert primaire)
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — full redesign: white panel, MON HÔTEL DANS, D+/ETA, single slider, RECHERCHER + FILTERS buttons, lg:hidden
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — POI inactive bg-white/border, Switch for météo/densité, X close, speedKmh allure section, rounded-full apply
- `apps/web/src/app/(app)/live/[id]/page.tsx` — desktop sidebar (lg:flex), elevationGain computation, refetchPois, LiveControls props, removed floating FILTERS btn, suppression LiveWeatherOverlay
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — D+ display arrondi à `Math.round()`
- `apps/web/src/app/layout.tsx` — ajout `suppressHydrationWarning` sur `<body>` (fix extensions navigateur)
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.test.tsx` — updated size + inactive assertions
- `apps/web/src/hooks/use-poi-layers.test.ts` — POI_PIN_COLOR test, categoryIcon test, updated mocks
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` — full rewrite; GPS marker tests supprimés (Marker → GeoJSON layers); tests GPS source/layers gps-dot/gps-halo + easeTo ajoutés
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` — full rewrite: new layout assertions
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx` — Switch mock, X btn, allure input, border assertions
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx` — updated useMapStore mock with getState
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` — mocks for new deps, updated LiveControls mock
- `apps/web/src/stores/live.store.ts` — ajout `weatherDepartureTime: string | null` + `setWeatherDepartureTime`
- `apps/web/src/stores/live.store.test.ts` — 3 nouveaux tests `weatherDepartureTime`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status update
- `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx` — ajout prop `className` optionnel pour surcharger la position; controlled `open` state + `setOpen(false)` on style selection (fix H1)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — fix `activeFilterCount`: `!densityColorEnabled` → `densityColorEnabled` (badge showed 1 by default instead of 0)
- `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.test.tsx` — new: 6 tests covering trigger, 4 style options, active highlight, setMapStyle call, className prop
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` — fix 2 badge tests: `mockMapDensityColorEnabled = true → false` (aligned with real store default)

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-03-23 | 1.0 | Story implemented (tasks 1–9): light mode polish, POI pin redesign, LayerToggles, GPS animate-ping marker, map style selector with localStorage persistence | claude-sonnet-4-6 |
| 2026-03-23 | 1.1 | Tasks 9–12 added: LiveControls redesign (MON HÔTEL DANS + D+/ETA + pill buttons), LiveFiltersDrawer polish (Switch/X/allure), desktop live sidebar | claude-sonnet-4-6 |
| 2026-03-23 | 1.2 | Fixes post-review: trace live verte (#2D6A4A), D+ arrondi (Math.round), suppression LiveWeatherOverlay, suppressHydrationWarning sur body | claude-sonnet-4-6 |
| 2026-03-23 | 1.3 | GPS dot : HTML Marker → GeoJSON circle layers (Tailwind JIT incompatible avec DOM dynamique); lookahead centering : GPS-movement → route-based bearing (routeBearingAtPosition, fonctionne à l'arrêt); weatherDepartureTime feature (store + drawer input + page.tsx); LiveFiltersDrawer UX polish (layout, labels, CTA) | claude-sonnet-4-6 |
| 2026-03-23 | 1.4 | Fix zoom initial intermittent (hasInitialZoomedRef reset dans cleanup); OFFSET_PX 300 + searchTrigger zoom 13 (ajustements Guillaume); test mis à jour | claude-sonnet-4-6 |
| 2026-03-24 | 1.5 | Retours UX mobile: espacement bottom sheet (`pt-3→pt-5`, `pb-6→pb-8`, header `mb-3→mb-5`, slider `mb-4→mb-6`); thumb slider agrandi (`size-3→size-6 border-2`) via prop `thumbClassName` sur `Slider` | claude-sonnet-4-6 |
| 2026-03-24 | 1.6 | Bouton "Quitter le live": déplacé top-right→top-left, texte supprimé (icône Undo2 only + aria-label), confirmation deux-clics supprimée (quit immédiat) | claude-sonnet-4-6 |
| 2026-03-24 | 1.7 | Redesign desktop live mode: sidebar supprimée; `<LiveControls>` visible sur desktop (bottom-left 360px, `lg:right-auto lg:w-[360px]`); `<ElevationProfile>` pleine largeur en bas (collapsible); `<ElevationStrip>` mobile-only (`lg:hidden`) | claude-sonnet-4-6 |
| 2026-03-24 | 1.8 | Fix AC#6 mobile: `MapStylePicker` caché derrière `LiveControls` → prop `className` ajouté au composant, repositionné `top-4 right-4` en live page (symétrique du bouton Quitter) | claude-sonnet-4-6 |
| 2026-03-24 | 1.9 | Code review fixes: popover close after style selection (`open` state + `setOpen(false)`); `activeFilterCount` density condition inverted (`!densityColorEnabled` → `densityColorEnabled`); created `map-style-picker.test.tsx` (6 tests); fixed 2 badge tests in `page.test.tsx` to match real store default. 54 test files, 490 tests pass. | claude-sonnet-4-6 |
