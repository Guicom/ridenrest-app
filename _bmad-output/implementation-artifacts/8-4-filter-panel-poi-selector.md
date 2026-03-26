# Story 8.4: Filter Panel — POI Selector

Status: done

## Story

As a **cyclist user**,
I want to filter which types of places are shown on my map and configure search parameters,
so that I can focus on what I need without visual clutter.

## Acceptance Criteria

**[Planning Mode — Panneau latéral desktop]**

1. **Given** the Planning sidebar is visible, **When** the filter section renders, **Then** it shows inline (no separate drawer): layer toggles (🏨 Hébergements, 🍽️ Restauration, 🛒 Alimentation, 🚲 Vélo, 🌤️ Météo, 📊 Densité) as toggle chips — multi-selection, active = `bg-primary text-primary-foreground`, inactive = `bg-muted text-muted-foreground hover:border-[--border]`.

2. **Given** 🏨 Hébergements is active in the Planning sidebar, **When** the accommodation sub-section renders, **Then** sub-type chips appear inline below the layer toggles: Hôtel (hotel), Camping (camp_site), Refuge/Abri (shelter), Auberge de jeunesse (hostel), Chambre d'hôte (guesthouse) — all active by default, individually toggleable — same active/inactive chip style.

3. **Given** the user toggles a layer chip or sub-type chip in Planning mode, **When** toggled, **Then** the change applies immediately to the map (no apply button needed); POI pins of that type/sub-type disappear or reappear instantly.

**[Live Mode — Drawer Filtres]**

4. **Given** the user is in Live mode, **When** the map renders, **Then** a "FILTERS" button is visible as a floating button (bottom-left, `z-30`, above map, below LiveControls); if any non-default filters are active, a small badge shows the count of active filter changes.

5. **Given** a user taps the "FILTERS" button in Live mode, **When** tapped, **Then** a Vaul Drawer opens from the bottom (`z-50`).

6. **Given** the Live filters drawer is open, **When** rendered, **Then** it shows three sections: (1) **Distance de la trace** — stepper `— [value] km +` (step 0.5, range 0.5–30, default 5 km) controlling `searchRadiusKm`; (2) **Calques** — toggle chips: 🏨 Hébergements, 🍽️ Restauration, 🛒 Alimentation, 🚲 Vélo, 🌤️ Météo, 📊 Densité; (3) **Sub-types hébergement** — appears only if 🏨 is toggled active, same 4 chips as planning.

7. **Given** the "Appliquer les filtres" button is tapped (Live drawer), **When** applied, **Then** the map updates immediately; drawer closes; the badge on the "FILTERS" button reflects the count of active filter changes from defaults.

8. **Given** no POI layer chip is selected (all 4 POI layers off: Hébergements, Restauration, Alimentation, Vélo), **When** the user tries to tap "Appliquer les filtres", **Then** the button stays disabled and a validation message "Sélectionne au moins un type de lieu" appears above the button.

## Tasks / Subtasks

- [x] Task 1 — Install Vaul dependency (AC: #5)
  - [x] 1.1 Run `pnpm add vaul --filter web` in the monorepo root
  - [x] 1.2 Verify import works: `import { Drawer } from 'vaul'` in a test component — no build errors

- [x] Task 2 — Extend `map.store.ts` with accommodation sub-type filter state (AC: #2, #3)
  - [x] 2.1 Import `PoiCategory` from `@ridenrest/shared` in `apps/web/src/stores/map.store.ts`
  - [x] 2.2 Add to `MapState` interface: `activeAccommodationTypes: Set<PoiCategory>`
  - [x] 2.3 Add action: `toggleAccommodationType: (type: PoiCategory) => void`
  - [x] 2.4 Initialize: `activeAccommodationTypes: new Set(['hotel', 'hostel', 'camp_site', 'shelter'] as PoiCategory[])` (all active by default)
  - [x] 2.5 Implement `toggleAccommodationType`: toggle presence of `type` in the set, return new `Set`
  - [x] 2.6 **No API change needed** — filtering is client-side: when rendering POI pins in `MapCanvas`, skip pins whose `category` is not in `activeAccommodationTypes` (when accommodations layer is visible)

- [x] Task 3 — Refactor `LayerToggles` to use design token styles + add Météo and Densité chips (AC: #1)
  - [x] 3.1 In `layer-toggles.tsx`, remove hardcoded color classes (`bg-blue-500`, `bg-red-500`, etc.) — replace all active states with `bg-primary text-primary-foreground`
  - [x] 3.2 Add `MapLayer` type extension plan: Météo and Densité are NOT POI layers, so do NOT add them to `MapLayer` type. Instead, accept optional props to the component.
  - [x] 3.3 Update `LayerTogglesProps` to include optional: `weatherActive?: boolean; onWeatherToggle?: () => void; densityActive?: boolean; onDensityToggle?: () => void`
  - [x] 3.4 Append two chips at the end of the list if props are provided:
    - 🌤️ Météo: reads `weatherActive`, calls `onWeatherToggle` on click
    - 📊 Densité: reads `densityActive`, calls `onDensityToggle` on click
  - [x] 3.5 Both chips use the same chip style: active = `bg-primary text-primary-foreground`, inactive = `bg-muted text-muted-foreground`
  - [x] 3.6 In `map-view.tsx`, update the `<LayerToggles>` usage to pass: `weatherActive={weatherActive} onWeatherToggle={() => setWeatherActive(!weatherActive)} densityActive={densityColorEnabled} onDensityToggle={toggleDensityColor}`
  - [x] 3.7 The existing weather button (`⛅ Météo` standalone button) in the sidebar is REMOVED — the Météo chip in `LayerToggles` replaces it. `WeatherControls` still renders below when Météo is active.
  - [x] 3.8 Update `map-view.tsx`: after `<LayerToggles .../>`, show `<WeatherControls .../>` when `weatherActive === true` (same logic as before, just moved from within the weather button section)

- [x] Task 4 — Create `AccommodationSubTypes` component (AC: #2, #3)
  - [x] 4.1 Create `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx`
  - [x] 4.2 Import `PoiCategory` from `@ridenrest/shared`; import `useMapStore` from `@/stores/map.store`
  - [x] 4.3 Define display configs:
    ```typescript
    const ACCOMMODATION_SUB_TYPES: { type: PoiCategory; label: string; icon: string }[] = [
      { type: 'hotel',      label: 'Hôtel',               icon: '🏨' },
      { type: 'camp_site',  label: 'Camping',              icon: '⛺' },
      { type: 'shelter',    label: 'Refuge / Abri',        icon: '🏠' },
      { type: 'hostel',     label: 'Auberge de jeunesse',  icon: '🛏️' },
      { type: 'guesthouse', label: 'Chambre d\'hôte',      icon: '🏡' },
    ]
    ```
  - [x] 4.4 Component reads `activeAccommodationTypes` and `toggleAccommodationType` from `useMapStore()`
  - [x] 4.5 Renders a wrapping `<div className="flex flex-wrap gap-1.5 pt-1">` with chips for each sub-type
  - [x] 4.6 Chip style: active = `bg-primary text-primary-foreground text-xs px-2.5 py-1 rounded-full border border-transparent font-medium`; inactive = `bg-muted text-muted-foreground text-xs px-2.5 py-1 rounded-full border border-[--border] font-medium`
  - [x] 4.7 Each chip is a `<button aria-pressed={isActive}>` — clicking calls `toggleAccommodationType(type)`
  - [x] 4.8 Add a section label above: `<p className="text-xs font-medium text-[--text-secondary] mb-1">Type d'hébergement</p>`

- [x] Task 5 — Integrate `AccommodationSubTypes` into Planning sidebar (AC: #2, #3)
  - [x] 5.1 In `map-view.tsx`, replace the `{/* Sub-type chips — Story 8.4 */}` placeholder comment with:
    ```tsx
    {/* Accommodation sub-type chips (AC 8.4 #2) */}
    {visibleLayers.has('accommodations') && (
      <div className="flex flex-col gap-1">
        <AccommodationSubTypes />
      </div>
    )}
    ```
  - [x] 5.2 Import `AccommodationSubTypes` from `./_components/accommodation-sub-types`
  - [x] 5.3 Destructure `visibleLayers` from `useMapStore()` (already available in `map-view.tsx`)
  - [x] 5.4 Apply client-side filtering: in `map-canvas.tsx` (or wherever POI pins are rendered), when `visibleLayers.has('accommodations')`, filter pins to only show those whose `category` is in `activeAccommodationTypes` — read from `useMapStore.getState().activeAccommodationTypes` or via hook

- [x] Task 6 — Create `LiveFiltersDrawer` component (AC: #5, #6, #7, #8)
  - [x] 6.1 Create `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx`
  - [x] 6.2 Install vaul (Task 1) — import `Drawer` from `'vaul'`
  - [x] 6.3 Props: `open: boolean; onOpenChange: (open: boolean) => void`
  - [x] 6.4 **Drawer structure** (Vaul pattern):
    ```tsx
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl p-4 pb-8 max-h-[85vh] overflow-y-auto">
          {/* drag handle */}
          <div className="w-12 h-1.5 bg-[--border] rounded-full mx-auto mb-4" />
          <Drawer.Title className="text-base font-semibold mb-4">Filtres</Drawer.Title>
          {/* Section 1: Distance */}
          {/* Section 2: Layer chips */}
          {/* Section 3: Accommodation sub-types (conditional) */}
          {/* Apply button */}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
    ```
  - [x] 6.5 **Distance de la trace stepper** (section 1):
    - Local state: `localRadius` initialized from `useLiveStore(s => s.searchRadiusKm)` on open
    - Render: `<label>Distance de la trace</label>` + `<button onClick={() => setLocalRadius(r => Math.max(0.5, r - 0.5))}>—</button>` + `<span className="font-mono text-lg font-bold w-16 text-center">{localRadius} km</span>` + `<button onClick={() => setLocalRadius(r => Math.min(30, r + 0.5))}>+</button>`
    - Step: 0.5 km; range: 0.5–30 km; default initial value: current `searchRadiusKm` (default 3 km in store, spec says 5 km — note below)
  - [x] 6.6 **Layer chips** (section 2): use 6 chips — reads from `useMapStore` for POI layers + weather + density; tracks local pending state in drawer until apply
    - Local state: `localLayers: Set<MapLayer>` initialized from `visibleLayers`; `localWeather: boolean` from `weatherActive`; `localDensity: boolean` from `densityColorEnabled`
    - Render same chip style as planning sidebar
  - [x] 6.7 **Accommodation sub-types** (section 3): conditional on `localLayers.has('accommodations')`; local state `localAccTypes: Set<PoiCategory>` initialized from `activeAccommodationTypes`
  - [x] 6.8 **Validation**: compute `hasPoi = localLayers.has('accommodations') || localLayers.has('restaurants') || localLayers.has('supplies') || localLayers.has('bike')`; if `!hasPoi`, show `<p className="text-sm text-destructive text-center mb-2">Sélectionne au moins un type de lieu</p>` and disable apply button
  - [x] 6.9 **Apply button**: `<button disabled={!hasPoi} onClick={handleApply} className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed">Appliquer les filtres</button>`
  - [x] 6.10 `handleApply`: commit all local state → `useMapStore.setState({ visibleLayers: localLayers, weatherActive: localWeather, densityColorEnabled: localDensity, activeAccommodationTypes: localAccTypes })`; call `useLiveStore.getState().setSearchRadius(localRadius)`; call `onOpenChange(false)`

- [x] Task 7 — Add "FILTERS" button to Live mode page (AC: #4, #5, #7)
  - [x] 7.1 In `apps/web/src/app/(app)/live/[id]/page.tsx`, add state: `const [filtersOpen, setFiltersOpen] = useState(false)`
  - [x] 7.2 Add floating FILTERS button in map area (above `LiveControls`, below quit button):
    ```tsx
    <div className="absolute bottom-32 left-4 z-30">
      <button
        onClick={() => setFiltersOpen(true)}
        data-testid="live-filters-btn"
        className="inline-flex items-center gap-1.5 rounded-lg bg-background/90 px-3 py-2 text-sm font-medium backdrop-blur-sm border border-[--border] shadow-sm"
      >
        <SlidersHorizontal className="h-4 w-4" />
        FILTERS
        {activeFilterCount > 0 && (
          <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
    ```
  - [x] 7.3 Compute `activeFilterCount`: count of non-default active layers (default: accommodations active, others off) + 1 if searchRadius differs from default (5 km)
  - [x] 7.4 Import `SlidersHorizontal` from `lucide-react` (already installed)
  - [x] 7.5 Render `<LiveFiltersDrawer open={filtersOpen} onOpenChange={setFiltersOpen} />` at the end of the page JSX
  - [x] 7.6 Import `LiveFiltersDrawer` from `./_components/live-filters-drawer`

- [x] Task 8 — Update default `searchRadiusKm` in live.store (AC: #6)
  - [x] 8.1 In `apps/web/src/stores/live.store.ts`, change default `searchRadiusKm` from `3` to `5` to match spec ("default 5 km")
  - [x] 8.2 Update `LiveControls` Rayon slider max from `5` to `30` to match the new range — or leave LiveControls as-is (the stepper in the drawer handles it). Note: the FILTERS drawer and LiveControls both control `searchRadiusKm` — they should stay in sync by reading from the same store.

- [x] Task 9 — Write tests (AC: #1–#8)
  - [x] 9.1 Create `accommodation-sub-types.test.tsx` — co-located in `_components/`
    - Test: all 5 chips render (Hôtel, Camping, Refuge, Auberge de jeunesse, Chambre d'hôte)
    - Test: clicking a chip calls `toggleAccommodationType`
    - Test: active chip has `aria-pressed="true"`
  - [x] 9.2 Update `layer-toggles.test.tsx`:
    - Test: when `weatherActive` prop provided, Météo chip renders
    - Test: when `densityActive` prop provided, Densité chip renders
    - Test: clicking Météo chip calls `onWeatherToggle`
    - Test: active chip uses `bg-primary` class (no more `bg-blue-500`)
  - [x] 9.3 Create `live-filters-drawer.test.tsx` — co-located in `live/[id]/_components/`
    - Test: drawer renders when `open=true`
    - Test: 6 layer chips present
    - Test: distance stepper decrement/increment works
    - Test: apply button disabled when all POI layers off
    - Test: apply button calls store updates and `onOpenChange(false)` when clicked (valid state)
    - Test: accommodation sub-type chips appear when 🏨 is toggled on locally
    - Test: validation message "Sélectionne au moins un type de lieu" visible when no POI layer active
  - [x] 9.4 Update `map-view.test.tsx`:
    - Test: `AccommodationSubTypes` renders in sidebar when accommodations layer is active
    - Test: `AccommodationSubTypes` NOT rendered when accommodations layer is inactive
    - Test: Météo chip is visible in LayerToggles
  - [x] 9.5 Update `live/[id]/page.test.tsx` or create `page.test.tsx` extension:
    - Test: FILTERS button renders
    - Test: clicking FILTERS button opens the drawer (`filtersOpen` state → `open` prop)
    - Test: badge visible when `activeFilterCount > 0`

## Dev Notes

### Architecture Overview

Story 8.4 adds filter state to the existing map/live infrastructure. No new API endpoints. All filtering is **client-side**: sub-type chips filter pin rendering in `MapCanvas`, not the API query parameters. This keeps the implementation simple for MVP.

```
Filter state flow:
├── map.store.ts
│   ├── visibleLayers: Set<MapLayer>      → which POI categories fetch + display
│   ├── activeAccommodationTypes          → NEW: which accommodation sub-types show
│   ├── weatherActive                     → Météo chip
│   └── densityColorEnabled               → Densité chip
└── live.store.ts
    └── searchRadiusKm                    → Distance de la trace stepper
```

### Vaul Installation

Vaul (`vaul` npm package) is NOT yet installed. It must be installed as part of Task 1:

```bash
pnpm add vaul --filter web
```

Vaul is a peer-dependency-free drawer library built on Radix UI Dialog primitives. It works independently from `@base-ui/react`. Usage pattern:

```tsx
import { Drawer } from 'vaul'

<Drawer.Root open={open} onOpenChange={onOpenChange}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40" />
    <Drawer.Content className="fixed bottom-0 left-0 right-0 bg-background rounded-t-2xl p-4">
      <Drawer.Title>...</Drawer.Title>
      {children}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

**DO NOT** use `@base-ui/react` Dialog for this — Vaul is specifically designed for bottom-sheet drawers with swipe-to-dismiss gesture.

### `MapLayer` Type — Do NOT Extend

The `MapLayer` type in `packages/shared/src/types/map.types.ts` is:
```typescript
export type MapLayer = 'accommodations' | 'restaurants' | 'supplies' | 'bike'
```

**DO NOT add 'weather' or 'density' to this type.** Météo and Densité are visualization layers, not POI fetch layers. They have their own state in `useMapStore` (`weatherActive`, `densityColorEnabled`). The `LayerToggles` component renders chips for all 6 via optional props, but only the 4 POI layers affect `visibleLayers`.

### `map.store.ts` Changes Required

```typescript
// Add to interface MapState:
activeAccommodationTypes: Set<PoiCategory>
toggleAccommodationType: (type: PoiCategory) => void

// Add to initial state:
activeAccommodationTypes: new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'] as PoiCategory[]),

// Add action:
toggleAccommodationType: (type) =>
  set((state) => {
    const next = new Set(state.activeAccommodationTypes)
    if (next.has(type)) {
      next.delete(type)
    } else {
      next.add(type)
    }
    return { activeAccommodationTypes: next }
  }),
```

Import: `import type { PoiCategory } from '@ridenrest/shared'`

### Client-Side Pin Filtering

When `visibleLayers.has('accommodations')`, the accommodation pins displayed must be filtered by `activeAccommodationTypes`. Find where POI pins are rendered in `map-canvas.tsx` and add this filter:

```typescript
// When rendering accommodation pins:
const { activeAccommodationTypes } = useMapStore()
const visiblePois = pois.filter(poi => {
  if (poi.category === 'hotel' || poi.category === 'hostel' ||
      poi.category === 'camp_site' || poi.category === 'shelter') {
    return activeAccommodationTypes.has(poi.category)
  }
  return true // non-accommodation POIs unaffected
})
```

This is **client-side only** — the API still fetches all accommodation types. Filtering happens at render time.

### `LayerToggles` Refactor — Chip Style Update

The current active styles use hardcoded Tailwind colors (`bg-blue-500`, etc.) — **these must be replaced** with design system tokens from Story 8.1:

```typescript
// Before (Story 8.4 removes these):
{ layer: 'accommodations', activeColor: 'bg-blue-500 text-white' },
{ layer: 'restaurants',    activeColor: 'bg-red-500 text-white' },

// After:
// All active chips → bg-primary text-primary-foreground
// (defined in globals.css via --primary: #2D6A4A)
```

Updated `LayerTogglesProps`:
```typescript
interface LayerTogglesProps {
  isPending: boolean
  weatherActive?: boolean
  onWeatherToggle?: () => void
  densityActive?: boolean
  onDensityToggle?: () => void
}
```

### `map-view.tsx` — What Changes

1. Remove standalone weather button (`⛅ Météo`) — replaced by Météo chip in `LayerToggles`
2. Pass weather + density props to `LayerToggles`
3. `WeatherControls` still renders conditionally (`weatherActive && <WeatherControls .../>`)
4. Replace `{/* Sub-type chips — Story 8.4 */}` with `AccommodationSubTypes` conditional
5. Import `AccommodationSubTypes`

Placement in sidebar — after the refactor:
```tsx
<div className="flex flex-col gap-4 p-4">
  <SearchRangeSlider totalDistanceKm={data.totalDistanceKm} />
  <LayerToggles
    isPending={poisPending}
    weatherActive={weatherActive}
    onWeatherToggle={() => setWeatherActive(!weatherActive)}
    densityActive={densityColorEnabled}
    onDensityToggle={toggleDensityColor}
  />
  {weatherActive && <WeatherControls ... />}
  {visibleLayers.has('accommodations') && (
    <div>
      <AccommodationSubTypes />
    </div>
  )}
  {/* Stages list — Epic 11 */}
</div>
```

Destructure from `useMapStore()` in `map-view.tsx`:
```typescript
const { ..., densityColorEnabled, toggleDensityColor, visibleLayers } = useMapStore()
```

### Live Filters Drawer — Local State Pattern

The drawer uses **local state** until "Appliquer les filtres" is tapped. This prevents the map from updating live as the user browses filter options. On apply, all local state is committed to the stores:

```typescript
// On drawer open — initialize local state from stores
useEffect(() => {
  if (open) {
    setLocalLayers(new Set(visibleLayers))
    setLocalWeather(weatherActive)
    setLocalDensity(densityColorEnabled)
    setLocalAccTypes(new Set(activeAccommodationTypes))
    setLocalRadius(searchRadiusKm)
  }
}, [open])

// On apply
const handleApply = () => {
  useMapStore.setState({
    visibleLayers: localLayers,
    weatherActive: localWeather,
    densityColorEnabled: localDensity,
    activeAccommodationTypes: localAccTypes,
  })
  setSearchRadius(localRadius)
  onOpenChange(false)
}
```

### FILTERS Button — Positioning

The "⏹ Quitter le live" button is already at `absolute top-4 right-4 z-40`. The FILTERS button should be at `absolute bottom-32 left-4 z-30` to sit just above the `LiveControls` panel (which is `absolute bottom-0`, approximately 128px tall when expanded).

If `LiveControls` is collapsed, the FILTERS button might overlap. A `z-30` for FILTERS (below `z-40` quit button) is appropriate.

### Active Filter Count Badge Computation

```typescript
const { visibleLayers, activeAccommodationTypes, weatherActive, densityColorEnabled } = useMapStore()
const { searchRadiusKm } = useLiveStore()

// Default state: only accommodations active, radius = 5 km
const DEFAULT_LAYERS = new Set(['accommodations'] as MapLayer[])
const DEFAULT_RADIUS = 5

const activeFilterCount = useMemo(() => {
  let count = 0
  // Count non-default layer changes
  if (!visibleLayers.has('accommodations')) count++
  if (visibleLayers.has('restaurants')) count++
  if (visibleLayers.has('supplies')) count++
  if (visibleLayers.has('bike')) count++
  if (weatherActive) count++
  if (!densityColorEnabled) count++  // density is on by default
  if (searchRadiusKm !== DEFAULT_RADIUS) count++
  return count
}, [visibleLayers, weatherActive, densityColorEnabled, searchRadiusKm])
```

**Note:** The "default" for the badge is opinionated — 🏨 on, others off. Adjust based on what feels right UX-wise.

### Design Tokens — All Must Use CSS Vars

From `globals.css` (Story 8.1) — NO raw hex colors:
```
bg-primary text-primary-foreground → active chip: #2D6A4A bg + white text
bg-muted text-muted-foreground     → inactive chip
border-[--border]                  → chip border inactive
text-[--text-secondary]            → section labels
bg-background                      → drawer background
```

**NEVER** use `bg-blue-500`, `bg-green-500`, etc. — these were pre-Story 8.1 patterns now replaced.

### Accommodation Sub-Type Display Labels

Mapping from `PoiCategory` to display:
| `PoiCategory` | Display Label | Icon |
|---|---|---|
| `hotel` | Hôtel | 🏨 |
| `camp_site` | Camping | ⛺ |
| `shelter` | Refuge / Abri | 🏠 |
| `hostel` | Auberge de jeunesse | 🛏️ |
| `guesthouse` | Chambre d'hôte | 🏡 |

**`guesthouse` est un nouveau `PoiCategory`** — doit être ajouté dans `packages/shared/src/types/poi.types.ts` :
- Ajouter `'guesthouse'` à `PoiCategory`
- Ajouter dans `LAYER_CATEGORIES.accommodations`: `['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse']`
- Ajouter dans `CATEGORY_TO_LAYER`: `guesthouse: 'accommodations'`
- Mettre à jour l'initialisation du store: `activeAccommodationTypes: new Set(['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse'] as PoiCategory[])`
- Sur Overpass, `guesthouse` correspond au tag `tourism=guest_house`

**Correction du mapping Google Places** (`apps/api/src/pois/providers/google-places.provider.ts`) :

Actuellement `guest_house`, `bed_and_breakfast`, `private_guest_room` sont incorrectement mappés vers `'hostel'` (ligne 55). Corriger `mapGoogleTypesToCategory()` :

```typescript
// Avant (incorrect):
if (types.some((t) => ['guest_house', 'bed_and_breakfast', 'private_guest_room', 'farmstay'].includes(t))) return 'hostel'

// Après:
if (types.some((t) => ['guest_house', 'bed_and_breakfast', 'private_guest_room', 'farmstay'].includes(t))) return 'guesthouse'
```

Ces 7 types Google (`lodging`, `campground`, `bed_and_breakfast`, `hostel`, `guest_house`, `camping_cabin`, `private_guest_room`) sont tous déjà requêtés dans `LAYER_GOOGLE_TYPES.accommodations` — aucun changement côté requête API, seulement le mapping de retour.

### `useLiveStore` — Default `searchRadiusKm` Update

The current default is `3` km; the spec says `5` km for the Live filters drawer. Update in `live.store.ts`:

```typescript
searchRadiusKm: 5, // Story 8.4: updated default (was 3)
```

Also update the Rayon slider in `LiveControls` max from `5` to `30` to match the expanded range. The FILTERS drawer stepper and the LiveControls slider both control the same `searchRadiusKm` — they auto-sync through the store.

### Tailwind v4 Reminder

No `tailwind.config.ts`. All tokens defined in `globals.css` `@theme inline`. Custom tokens (`bg-primary`, `text-primary-foreground`, etc.) work as Tailwind classes directly. The `vaul` Drawer.Content needs manual z-index and positioning classes.

### What NOT to Change

- `MapCanvas` component interface — only add internal filtering logic
- `usePois` hook — no changes (API still fetches all accommodation types)
- `SearchRangeSlider` component — unchanged
- `WeatherControls` component — unchanged (just moved in render tree, same props)
- Existing tests for `layer-toggles.test.tsx` — extend, don't break passing tests
- `live-controls.tsx` — keep Rayon slider (update max to 30), but otherwise unchanged
- Query key convention: `['pois', { segmentId, fromKm, toKm }]` — unchanged
- `GeolocationConsent` dialog — untouched

### Previous Story Intelligence (8.3)

From Story 8.3 implementation:
- Sidebar placeholder `{/* Sub-type chips — Story 8.4 */}` is at `map-view.tsx` line 178
- Sidebar uses `{collapsed ? 'w-0 overflow-hidden' : 'w-[360px] overflow-y-auto'}` — CSS class on `<aside>`
- Weather state already in `map-view.tsx`: `const { weatherActive, weatherDimension, setWeatherActive, setWeatherDimension, densityColorEnabled, toggleDensityColor } = useMapStore()`
- The standalone weather button is a `<button>` at `map-view.tsx` line 153-175 — **REMOVE** this and replace with `weatherActive` prop on `<LayerToggles>`
- `sonner` `<Toaster>` in `(app)/layout.tsx` — available for any new toasts if needed
- `data-testid="planning-sidebar"` on the `<aside>` element

From Story 8.3 completion notes:
- `useLiveMode()` hook exports `stopWatching` — don't touch
- Live page `page.tsx` is a `'use client'` component (needed for `useState` and `useRouter`)
- Map page height: `h-[calc(100dvh-3.5rem)]` — don't change

### Git Context (Recent Commits)

```
6fdf726 feat(story-8.3): app shell & routing — sidebar layout, mobile toast, live quit button
cdcd492 fix(story-8.2): revert DialogTrigger asChild — @/components/ui/dialog is Base UI, render= is correct
0c8b9bc feat(story-8.2): adventures list page — design tokens, mobile selection, Montserrat
e742278 feat(story-8.1): design system tokens — Ride'n'Rest palette in globals.css
```

**Key pattern from 8.2 fix**: The project uses `@base-ui/react` for Dialog/Overlay components, NOT Radix UI or shadcn. `@base-ui/react` uses `render=` prop syntax, not `asChild`. This is why Vaul (which is Radix-based) must be imported directly, not via shadcn drawer wrapper.

### Project Structure Notes

Files to create:
```
apps/web/src/app/(app)/map/[id]/_components/
  accommodation-sub-types.tsx          ← NEW component
  accommodation-sub-types.test.tsx     ← NEW tests

apps/web/src/app/(app)/live/[id]/_components/
  live-filters-drawer.tsx              ← NEW Vaul drawer
  live-filters-drawer.test.tsx         ← NEW tests
```

Files to modify:
```
apps/web/src/stores/map.store.ts                    ← add activeAccommodationTypes + toggleAccommodationType
apps/web/src/stores/live.store.ts                   ← default searchRadiusKm: 3 → 5
apps/web/src/app/(app)/map/[id]/_components/
  layer-toggles.tsx                                 ← remove hardcoded colors, add weather/density props
  layer-toggles.test.tsx                            ← extend tests
  map-view.tsx                                      ← remove weather button, add AccommodationSubTypes, update LayerToggles props
  map-view.test.tsx                                 ← extend tests
apps/web/src/app/(app)/live/[id]/
  page.tsx                                          ← add FILTERS button + LiveFiltersDrawer
  page.test.tsx                                     ← extend tests
apps/web/src/app/(app)/live/[id]/_components/
  live-controls.tsx                                 ← update Rayon slider max: 5 → 30
```

No changes to: `packages/shared/`, `apps/api/`, `MapCanvas` props interface, `useMapStore` existing state.

---

## Design Corrections (post-review — 2026-03-21)

> Ces corrections font suite au design de la maquette Google Stitch et au merge de la story 8.5. La story 8.5 est **annulée** (voir sprint-status.yaml). Le travail déjà livré (Tasks 1–9) reste valide — seule la mise en page visuelle du panneau latéral change.

### Nouvelles Acceptance Criteria (remplacent AC #1)

**AC #1 — remplacé :** La grille POI remplace les chips horizontaux.

**Given** the Planning sidebar is visible, **When** the filter section renders, **Then** the 4 POI layers render as a **2×2 grid of large cards** (`grid grid-cols-2 gap-3`): 🛏️ Hébergements, 🍴 Restauration, 🧺 Alimentation, 🚲 Vélo. Active card = `bg-primary text-primary-foreground rounded-2xl`. Inactive = `bg-muted text-muted-foreground rounded-2xl`. **Météo et Densité ne sont PAS dans cette grille** — ils ont leurs propres sections.

**AC #9 — nouveau :** Météo section collapsible

**Given** the Planning sidebar renders, **When** looking at the Météo section, **Then** it appears as a collapsible section (accordion) with: header = icône ☁️ + label "Météo" + chevron ∧/∨ + toggle switch ON/OFF à droite; body (si expanded) = `<WeatherControls>` existant. Le toggle switch contrôle `weatherActive` — désactiver masque la couche météo sur la carte.

**AC #10 — nouveau (merge story 8.5) :** Densité section collapsible

**Given** the Planning sidebar renders, **When** looking at the Densité section, **Then** it appears as a collapsible section avec: header = icône 📊 + label "Densité" + chevron ∧/∨; body = toggle "AFFICHER SUR LA CARTE" (contrôle `densityColorEnabled`) + légende:
- 🟢 **Bonne disponibilité** — 2+ hébergements / 10km
- 🟠 **Disponibilité limitée** — 1 hébergement / 10km
- 🔴 **Zone critique** — Aucun hébergement / 10km

La légende est affichée en permanence dans la section (pas conditionnelle à l'activation du toggle).

### Tasks de correction

- [x] **C1 — Refactoriser `LayerToggles` → `PoiLayerGrid`** (remplace Task 3)
  - [x] C1.1 Renommer ou recréer le composant en `poi-layer-grid.tsx` (ou renommer `layer-toggles.tsx`)
  - [x] C1.2 Layout : `<div className="grid grid-cols-2 gap-3">` — 4 cards uniquement (POI seulement)
  - [x] C1.3 Chaque card : `<button className="flex flex-col items-center justify-center gap-2 rounded-2xl p-4 min-h-[80px] ...">` avec icône Lucide 24px + label. Icônes **validées** (monochrome flat, `currentColor`) :
    ```typescript
    import { BedDouble, Utensils, ShoppingBasket, Bike } from 'lucide-react'

    const POI_LAYERS = [
      { layer: 'accommodations', label: 'Hébergements', icon: BedDouble },
      { layer: 'restaurants',    label: 'Restauration',  icon: Utensils },
      { layer: 'supplies',       label: 'Alimentation',  icon: ShoppingBasket },
      { layer: 'bike',           label: 'Vélo',          icon: Bike },
    ]
    ```
    Rendu : `<Icon className="h-6 w-6" />` — la couleur suit automatiquement via `currentColor`
  - [x] C1.4 Active : `bg-primary text-primary-foreground` — Inactive : `bg-muted text-muted-foreground`
  - [x] C1.5 **Supprimer** les props `weatherActive`, `onWeatherToggle`, `densityActive`, `onDensityToggle` — ces chips n'existent plus dans ce composant
  - [x] C1.6 Mettre à jour `map-view.tsx` pour utiliser `<PoiLayerGrid>` à la place de `<LayerToggles>`
  - [x] C1.7 Mettre à jour les tests associés

- [x] **C2 — Créer `SidebarWeatherSection`** (collapsible avec toggle)
  - [x] C2.1 Créer `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx`
  - [x] C2.2 State local : `const [expanded, setExpanded] = useState(true)`
  - [x] C2.3 Header : `<CloudRain className="h-5 w-5" />` + "Météo" + chevron (switch dans le body) — `import { CloudRain } from 'lucide-react'`
  - [x] C2.4 Body (si `expanded`) : Switch "Afficher sur la carte" + `<WeatherControls .../>`
  - [x] C2.5 Le switch est dans le body, le header collapse/expand la section
  - [x] C2.6 Remplacer le bloc météo existant dans `map-view.tsx` par `<SidebarWeatherSection />`

- [x] **C3 — Créer `SidebarDensitySection`** (collapsible avec toggle + légende — merge story 8.5)
  - [x] C3.1 Créer `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx`
  - [x] C3.2 State local : `const [expanded, setExpanded] = useState(true)` (ouvert par défaut)
  - [x] C3.3 Header : `<LayoutGrid className="h-5 w-5" />` + "Densité" + chevron — `import { LayoutGrid } from 'lucide-react'`
  - [x] C3.4 Body : Switch "Afficher sur la carte" + légende fixe avec CSS vars --density-high/medium/low
  - [x] C3.5 `LegendItem` : inline component — `<span>` rond coloré + label bold + detail muted
  - [x] C3.6 Couleurs de la légende = CSS vars `--density-high`, `--density-medium`, `--density-low`
  - [x] C3.7 `<SidebarDensitySection />` dans `map-view.tsx` après `<SidebarWeatherSection />`

- [x] **C4 — Types d'hébergement dans la sidebar** (déductible de la maquette)
  - [x] C4.1 `<AccommodationSubTypes />` en dessous de la grille quand Hébergements actif
  - [x] C4.2 Style cohérent : chips `text-xs rounded-full px-2.5 py-1`

- [x] **C5 — Mettre à jour le Live Filters Drawer** pour refléter la structure sidebar
  - [x] C5.1 Grille 2×2 POI + toggles Météo/Densité dans le drawer
  - [x] C5.2 Tests du drawer mis à jour

- [x] **C7 — Visualisation de la plage de recherche sur la carte**
  - [x] C7.1 Dans `map-canvas.tsx`, lire `fromKm` et `toKm` depuis `useMapStore()`
  - [x] C7.2 **Marqueur point de départ** : calculer la position lat/lng via `findPointAtKm(allWaypoints, fromKm)` (déjà dans `packages/gpx`) → créer un `new maplibregl.Marker({ element })` avec un rond gris foncé
  - [x] C7.3 Le marqueur se met à jour à chaque changement de `fromKm` — `markerRef.current.setLngLat([lng, lat])` sans recréer l'élément
  - [x] C7.4 **Segment surligné [fromKm → toKm]** : `corridor-highlight` layer amber `#FBBF24` (8px, rendu au-dessus de la trace), masqué si `!searchRangeInteracted`. Bug fix: `map.isStyleLoaded()` remplacé par `map.getSource('trace')` — MapLibre retourne `isStyleLoaded=false` tant que des tuiles chargent en arrière-plan.
  - [x] C7.5 `allWaypoints` — hook `useAdventureWaypoints(segments)` créé dans `hooks/use-adventure-waypoints.ts`, utilisé dans `map-view.tsx` et passé à `MapCanvas` via prop `allWaypoints`
  - [x] C7.6 État initial : `searchRangeInteracted: boolean` ajouté au `map.store.ts` (défaut `false`, mis à `true` au 1er appel `setSearchRange`). Marqueur et surligné masqués tant que `!searchRangeInteracted`

- [x] **C8 — Couleur de trace uniforme pour tous les segments**
  - [x] C8.1 Dans `map-canvas.tsx`, remplacé `SEGMENT_COLORS` par `const TRACE_COLOR = '#2D6A4A'`
  - [x] C8.2 Dans `addTraceLayers` et `buildGeoJsonFeatures`, `TRACE_COLOR` utilisé directement dans le paint `line-color` (plus de `['get', 'color']`)
  - [x] C8.3 `SEGMENT_JOIN_COLOR` supprimé — les join circles utilisent aussi `TRACE_COLOR`
  - [x] C8.4 La couche densité (`trace-density-line`) utilise ses propres `['get', 'color']` → non affectée

- [x] **C6 — Tests** pour les nouveaux composants
  - [x] C6.1 `sidebar-weather-section.test.tsx` : toggle switch active/inactive, expand/collapse
  - [x] C6.2 `sidebar-density-section.test.tsx` : toggle active/inactive, légende présente, expand/collapse
  - [x] C6.3 `poi-layer-grid.test.tsx` : 4 cards présentes, active card style, click toggle

### Composants remplacés / renommés

| Avant (Tasks 1–9) | Après (Corrections) |
|---|---|
| `layer-toggles.tsx` (chips horizontaux + Météo + Densité props) | `poi-layer-grid.tsx` (grille 2×2, POI uniquement) |
| Météo = chip dans `LayerToggles` | `sidebar-weather-section.tsx` (collapsible + switch) |
| Densité = chip dans `LayerToggles` | `sidebar-density-section.tsx` (collapsible + switch + légende) |

### C0 — Refactoriser la section "Recherche" (remplace `SearchRangeSlider`)

Le `SearchRangeSlider` actuel (double slider fromKm/toKm) est remplacé par un nouveau composant `SearchRangeControl` plus adapté aux longues traces (1500+ km).

**Nouveau UX :**
```
┌─ Recherche ─────────────────── ∧ ─┐
│  📍 1 487 km   ↑ 18 200 m D+      │  ← info aventure
│                                    │
│  PLAGE DE RECHERCHE        [15 km] │  ← badge valeur courante
│  [══════════●══════════════════]   │  ← slider fromKm (point de départ)
│  0 km                   1 487 km   │
│                                    │
│  Rechercher sur  [—] [15 km] [+]   │  ← stepper rangeKm (1–30 km)
└────────────────────────────────────┘
```

**Logique :**
- `fromKm` : position de départ sur la trace (slider, 0 → `totalDistanceKm`)
- `rangeKm` : plage de recherche à partir de ce point (stepper, 1–30 km, step 1 km, default 15 km)
- `toKm` = `fromKm + rangeKm` — calculé, jamais stocké séparément
- Le store garde `fromKm` et `toKm` (aucun changement de l'interface store) — `toKm` est juste mis à jour automatiquement à chaque changement

**Données distance + D+ :**
- Le D+ affiché est **dynamique** : dénivelé positif cumulé **de km 0 jusqu'au point de départ** (`fromKm`) — pas la plage, pas le total
- Il se recalcule uniquement quand le slider (`fromKm`) change — changer la plage (`rangeKm`) ne le modifie pas
- `computeElevationGain(points)` existe déjà dans `packages/gpx/src/parser.ts` — l'utiliser
- Les waypoints sont disponibles via `segment.waypoints: MapWaypoint[]` — `MapWaypoint` a `ele?: number | null`

**Calcul D+ — cumulé de km 0 jusqu'au point de départ (`fromKm`) :**

Le D+ affiché représente le dénivelé positif accumulé **depuis le début de la trace jusqu'au point de départ de la recherche**. Changer la plage (`rangeKm`) n'influence PAS le D+ affiché — seul le slider (`fromKm`) le met à jour.

```typescript
import { computeElevationGain } from '@ridenrest/gpx'
import type { GpxPoint } from '@ridenrest/gpx'

// D+ cumulé depuis km 0 jusqu'à fromKm — rangeKm ignoré
const elevationGain = useMemo(() => {
  if (!waypoints || waypoints.length < 2) return null
  const pointsToStart = waypoints.filter(w => w.km <= fromKm)
  if (pointsToStart.every(w => w.ele == null)) return null
  const points: GpxPoint[] = pointsToStart.map(w => ({
    lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined
  }))
  return computeElevationGain(points)
}, [waypoints, fromKm])  // ← rangeKm absent intentionnellement
```

Exemple : si fromKm = 250 et rangeKm = 15, le D+ affiché est le D+ de km 0 → km 250. Passer à rangeKm = 30 ne change pas le D+ affiché.

**Tasks :**
- [x] C0.1 Créer `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` (remplace `search-range-slider.tsx`)
- [x] C0.2 Props : `totalDistanceKm: number; waypoints: MapWaypoint[] | null`
- [x] C0.3 Lire `fromKm`, `toKm`, `setSearchRange` depuis `useMapStore()`
- [x] C0.4 State local : `rangeKm` initialisé à 15 si `toKm === 30 && fromKm === 0`
- [x] C0.5 Sur changement slider : `setSearchRange(newFromKm, newFromKm + rangeKm)` — capper `toKm` à `totalDistanceKm`
- [x] C0.6 Sur changement stepper : `setSearchRange(fromKm, fromKm + newRangeKm)` — min 1, max 30
- [x] C0.7 D+ via `useMemo` sur `[waypoints, fromKm]` uniquement — **`rangeKm` ne déclenche PAS de recalcul**
- [x] C0.8 Affichage info ligne :
  - `{fromKm} km` — position de départ de la recherche (mise à jour en live avec le slider)
  - `·` séparateur
  - `↑ {elevationGain} m D+` (ou `↑ — m D+` si pas de données élévation)
  - Exemple rendu : `250 km · ↑ 3 200 m D+`
  - Tous les nombres en `font-mono`
- [x] C0.9 Dans `map-view.tsx`, remplacer `<SearchRangeSlider>` par `<SearchRangeControl totalDistanceKm={...} waypoints={allWaypoints} />`
- [x] C0.10 `allWaypoints` = concaténation des `segment.waypoints` en ajustant les `km` par `cumulativeStartKm` de chaque segment
- [x] C0.11 Créer `search-range-control.test.tsx` :
  - slider fromKm change → D+ recalculé
  - stepper rangeKm change → D+ **inchangé**
  - toKm cappé à `totalDistanceKm`

### C0.bis — Ajouter `totalElevationGainM` sur l'adventure

> **Deux usages :** (1) afficher le D+ total sur la **card aventure** (`/adventures`) ; (2) le D+ dynamique du `SearchRangeControl` est calculé client-side et n'utilise PAS ce champ. C0.bis est donc indépendant de C0.

`elevationGainM` existe sur chaque segment (`adventure_segments.elevation_gain_m`, nullable) mais n'est pas agrégé sur l'adventure. À faire dans cet ordre :

- [x] C0.bis.1 **Schema DB** — `totalElevationGainM: real('total_elevation_gain_m')` ajouté dans `adventures.ts`
- [x] C0.bis.2 **Migration** — `0004_mysterious_wildside.sql` généré via drizzle-kit (avec IF NOT EXISTS pour compatibilité avec `density_progress` déjà appliqué manuellement)
- [x] C0.bis.3 **`recomputeCumulativeDistances`** — mis à jour dans `segments.service.ts` pour calculer D+ + appel `updateTotals()` (anciennement `updateTotalDistance`)
- [x] C0.bis.4 **API response** — `totalElevationGainM` ajouté dans `AdventureMapResponse` (shared types) + `getAdventureMapData` du repository
- [x] C0.bis.5 **Card aventure** — afficher `totalElevationGainM` sur la card dans `/adventures` (usage distinct du D+ dynamique du `SearchRangeControl`)

---

### References

- [Source: epics.md#Story 8.4, line 1221] — Acceptance criteria, UX decisions 2026-03-20
- [Source: epics.md#Story 8.5, line 1268] — Density toggle spec (next story, chip already added here)
- [Source: epics.md#Story 8.6, line 1290] — Accommodation sub-type display filters (count badges — deferred to 8.6)
- [Source: _bmad-output/implementation-artifacts/8-3-app-shell-routing.md#Completion Notes] — Placeholder location, weather button location, store state
- [Source: apps/web/src/stores/map.store.ts] — Current store state (no activeAccommodationTypes yet)
- [Source: apps/web/src/stores/live.store.ts] — searchRadiusKm default (3 → 5)
- [Source: packages/shared/src/types/poi.types.ts] — PoiCategory, LAYER_CATEGORIES
- [Source: packages/shared/src/types/map.types.ts] — MapLayer (DO NOT extend)
- [Source: apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx] — Current component to refactor
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx] — Rayon slider (max 5 → 30)
- [Source: _bmad-output/project-context.md#Zustand Stores — Convention] — naming: useMapStore, useLiveStore

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Installed vaul via `pnpm add vaul --filter web` — Radix-based bottom-sheet drawer with swipe-to-dismiss
- Replaced all hardcoded chip colors (`bg-blue-500`, `bg-red-500`, etc.) in `LayerToggles` with design token classes (`bg-primary text-primary-foreground` / `bg-muted text-muted-foreground`)
- Added Météo and Densité chips to `LayerToggles` via optional props — `MapLayer` type NOT extended (visualization layers only)
- Removed standalone `⛅ Météo` button from `map-view.tsx` sidebar — replaced by `LayerToggles` Météo chip
- Accommodation sub-type filtering is **client-side only** in `use-poi-layers.ts` — API still fetches all types
- `LiveFiltersDrawer` uses local state pattern (copy-on-open, commit-on-apply) to prevent live map updates while user browses filters
- `DEFAULT_RADIUS = 5` for badge computation — `activeFilterCount` counts deviations from default state
- LiveControls Rayon slider max updated from 5 → 30, step from 1 → 0.5 (stays in sync with drawer stepper via store)
- `vi.hoisted()` used in `live-filters-drawer.test.tsx` to allow `mockSetState` to be referenced in `vi.mock()` factory (hoisting constraint)
- Pre-existing TS errors in `weather-layer.test.tsx` (lines 281, 301) not introduced by this story

### File List

**New files:**
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.test.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx`

**Modified files:**
- `apps/web/src/stores/map.store.ts` — added `activeAccommodationTypes`, `toggleAccommodationType`
- `apps/web/src/stores/live.store.ts` — default `searchRadiusKm` 3 → 5
- `apps/web/src/hooks/use-poi-layers.ts` — client-side accommodation sub-type filtering
- `apps/web/src/hooks/use-poi-layers.test.ts` — updated mock for `useMapStore`
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx` — design tokens, Météo/Densité props
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.test.tsx` — new Story 8.4 tests
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — removed weather button, added AccommodationSubTypes, PoiLayerGrid, SidebarWeatherSection, SidebarDensitySection, SearchRangeControl
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — updated mocks for all new components
- `apps/web/src/app/(app)/live/[id]/page.tsx` — FILTERS button, LiveFiltersDrawer, activeFilterCount
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` — new Story 8.4 FILTERS button tests
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — Rayon slider max 5 → 30, step 1 → 0.5
- `apps/web/package.json` — vaul dependency added
- `pnpm-lock.yaml` — lockfile updated

**New files (Design Corrections):**
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`

**Modified files (Design Corrections + C0.bis):**
- `packages/shared/src/types/adventure.types.ts` — added `totalElevationGainM` to `AdventureMapResponse`
- `packages/database/src/schema/adventures.ts` — added `totalElevationGainM` column
- `packages/database/migrations/0004_mysterious_wildside.sql` — migration (IF NOT EXISTS)
- `apps/api/src/adventures/adventures.service.ts` — `updateTotals()` replaces `updateTotalDistance()`
- `apps/api/src/adventures/adventures.repository.ts` — `updateTotals()` + `getAdventureMapData` includes elevation
- `apps/api/src/segments/segments.service.ts` — `recomputeCumulativeDistances` computes D+

**Modified files (C7 + C8 — 2026-03-21):**
- `apps/web/src/stores/map.store.ts` — added `searchRangeInteracted: boolean` flag, `setSearchRange` now sets it to `true`
- `apps/web/src/hooks/use-adventure-waypoints.ts` — NEW hook returning `MapWaypoint[]` with cumulative distKm
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — C8: `TRACE_COLOR = '#2D6A4A'` uniform; C7: `markerRef`, `allWaypoints` prop, `searchRangeInteracted`, start marker via `findPointAtKm`, corridor color `#1A2D22`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — uses `useAdventureWaypoints` hook, passes `allWaypoints` to `MapCanvas`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — updated store mock (`searchRangeInteracted`, `weatherActive`, `weatherDimension`)

**Modified files (UX polish — post-review 2026-03-21):**
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — corridor bug fix: `map.isStyleLoaded()` → `map.getSource('trace')`; corridor color amber `#FBBF24` 8px (visible); idem pour effects densité et trace
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — distance dynamique (`fromKm` au lieu de `totalDistanceKm`); D+ cumulé de 0 à `fromKm`; suppression doublon "PLAGE DE RECHERCHE"; icône `Search` lucide; max range 50km; input éditable; `PoiLayerGrid` + `AccommodationSubTypes` intégrés dans l'accordéon
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` — icônes seules sur une ligne (suppression labels)
- `apps/web/src/app/(app)/map/[id]/_components/weather-controls.tsx` — icônes Thermometer/Umbrella/Wind sur les boutons dimension; champ vitesse restyled (même style que date); label "Vitesse moyenne"
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx` — `expanded: false` par défaut
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx` — `expanded: false` par défaut
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — suppression `PoiLayerGrid` et `AccommodationSubTypes` standalone (déplacés dans `SearchRangeControl`)
- `apps/web/src/app/globals.css` — CSS borderless range slider (appearance: none + track/thumb custom)

## Change Log

- Initial Tasks 1–9 implementation: vaul, accommodation sub-types, layer toggles refactor, live filters drawer, FILTERS button, search radius default 5km
- Design Corrections C0–C6: PoiLayerGrid, SidebarWeatherSection, SidebarDensitySection, SearchRangeControl, totalElevationGainM DB migration
- C7: Search-range visualization on map — start marker + corridor highlight (dark green), hidden until user interacts
- C8: Uniform trace color `#2D6A4A` for all segments (replaces per-segment color array)
- UX polish post-review: corridor highlight visible (amber, isStyleLoaded fix), SearchRangeControl restructuré (distance/D+ dynamiques, POIs intégrés, max 50km, input éditable), météo/densité fermés par défaut, POI grid icônes seules, weather controls icônes + vitesse restyled, borderless range slider
