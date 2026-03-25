# Story 9.4: POI Card & Bottom Sheet

Status: done

## Story

As a **cyclist browsing accommodation options**,
I want a clear POI detail card with key info and a direct booking link,
So that I can decide quickly without leaving the map.

## Acceptance Criteria

1. **Given** a user taps a POI pin,
   **When** the POI popup opens,
   **Then** a floating card appears above the pin showing name, type badge, distance from trace, and CTA; closes via the × button or Escape key.
   _(Architectural pivot: Vaul Drawer replaced by `PoiPopup` floating card positioned via `map.project()` — see Dev Notes)_

2. **Given** the POI card renders for an accommodation,
   **When** displayed,
   **Then** shows: name (`text-lg font-semibold`), type badge (`--primary-light` chip), distance from trace (`text-sm text-[--text-secondary]`), km on route (`font-mono text-sm`).

3. **Given** the Booking.com CTA renders,
   **When** displayed,
   **Then** full-width primary button "Recherche sur Booking" with external link icon; `target="_blank" rel="noopener noreferrer"`; explicit `aria-label`.

4. **Given** a Google Places (or OSM) website URL is available for an accommodation,
   **When** the card displays,
   **Then** a secondary ghost button "Site officiel" is shown below the Booking CTA, linking to the establishment's website; `target="_blank" rel="noopener noreferrer"`.

5. **Given** a non-accommodation POI (restau, vélo, alimentation) renders,
   **When** the card displays,
   **Then** no CTA is shown.

## Tasks / Subtasks

- [x] Task 1: Replace shadcn `Sheet` with Vaul `Drawer` in `poi-detail-sheet.tsx` (AC: #1)
  - [x] 1.1 Replace `Sheet/SheetContent/SheetHeader/SheetTitle` imports with `Drawer` from `vaul`
  - [x] 1.2 Set `snapPoints={[0.4, 0.85]}` on `<Drawer.Root>` (defaultSnapPoint not in vaul v1 types — defaults to first snap point automatically)
  - [x] 1.3 Remove `max-h-[70vh]` — Vaul handles height via snap points
  - [x] 1.4 Remove any `backdrop-blur` or `bg-background/95` from the drawer overlay — no blur; using `bg-black/40`

- [x] Task 2: Redesign POI card header — type badge + distances (AC: #2)
  - [x] 2.1 Add type badge using `--primary-light` chip: `bg-[--primary-light] text-[--primary] text-xs font-medium px-2 py-0.5 rounded-full`
  - [x] 2.2 Type label mapped from `layer` value via `LAYER_LABELS` constant
  - [x] 2.3 Distance from trace displayed as `text-sm text-[--text-secondary]`
  - [x] 2.4 Km on route displayed as `font-mono text-sm`
  - [x] 2.5 Remove `details.rating` display block from card (the `⭐ X.X / 5` line)

- [x] Task 3: Update Booking CTA — label + style + remove Hotels.com (AC: #3)
  - [x] 3.1 Rename button label from "Rechercher sur Booking.com" to "Recherche sur Booking"
  - [x] 3.2 Apply design system styles: `bg-[--primary] text-white rounded-full h-12 w-full font-medium flex items-center justify-center gap-2`
  - [x] 3.3 Add `<ExternalLink className="h-4 w-4" />` icon (lucide-react)
  - [x] 3.4 Add `aria-label="Recherche sur Booking.com"`
  - [x] 3.5 Remove Hotels.com button entirely (and `hotelsUrl` variable + `trackBookingClick('hotels_com')` call)
  - [x] 3.6 Remove "Lien partenaire" label

- [x] Task 4: Add "Site officiel" ghost button for accommodations when website available (AC: #4)
  - [x] 4.1 After Booking CTA, conditionally render ghost button if `displayWebsite` is truthy AND `isAccommodation`
  - [x] 4.2 Button style: `border border-[--border] text-[--text-primary] rounded-full h-12 w-full font-medium flex items-center justify-center gap-2 hover:bg-[--surface]`
  - [x] 4.3 Add `<Globe className="h-4 w-4" />` icon (lucide-react)
  - [x] 4.4 `href={displayWebsite}`, `target="_blank"`, `rel="noopener noreferrer"`, `aria-label="Site officiel de l'établissement"`
  - [x] 4.5 Reused existing `displayWebsite = details?.website ?? osmWebsite` variable

- [x] Task 5: Verify no CTA for non-accommodation POIs (AC: #5)
  - [x] 5.1 `isAccommodation` guard wraps both buttons — verified in code and tests
  - [x] 5.2 "Voir sur OpenStreetMap" button was never present — confirmed absent, no action needed

- [x] Task 6: Update tests (AC: all)
  - [x] 6.1 Updated test mock from shadcn `Sheet` to Vaul `Drawer` components
  - [x] 6.2 Updated: "Rechercher sur Booking.com" → "Recherche sur Booking"
  - [x] 6.3 Removed: Hotels.com button test assertions
  - [x] 6.4 Removed: "Lien partenaire" label test
  - [x] 6.5 Removed: `details.rating` (⭐) test; added regression guard (`does NOT show rating block`)
  - [x] 6.6 Added: type badge test — accommodation shows "Hébergement" chip
  - [x] 6.7 Added: "Site officiel" button shown when `displayWebsite` available AND accommodation
  - [x] 6.8 Added: "Site officiel" button NOT shown when `displayWebsite` is null
  - [x] 6.9 Added: "Site officiel" button NOT shown for non-accommodation POI even if website available
  - [x] 6.10 Added: `trackBookingClick` NOT called for `'hotels_com'` assertion

## Dev Notes

### Context: The Sheet Component Already Exists

`poi-detail-sheet.tsx` is currently implemented using **shadcn `Sheet`** (Radix Dialog-based). The story requires migrating it to **Vaul `Drawer`** to get native snap-point behavior.

This component is **shared** between planning and live mode:
- Planning: `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx`
- Live: `apps/web/src/app/(app)/live/[id]/page.tsx` imports `PoiDetailSheet` from the planning route (relative import)

Any change here affects both modes.

### Vaul Drawer — Already in Project

Vaul v1.1.2 is already installed (`apps/web/package.json`). It's actively used in `live-filters-drawer.tsx`. The pattern is established:

```typescript
import { Drawer } from 'vaul'

// Usage pattern from live-filters-drawer.tsx
<Drawer.Root open={open} onOpenChange={...} snapPoints={[...]} defaultSnapPoint={...}>
  <Drawer.Portal>
    <Drawer.Overlay className="fixed inset-0 bg-black/40" />
    <Drawer.Content className="...">
      <Drawer.Title className="sr-only">...</Drawer.Title>
      {/* content */}
    </Drawer.Content>
  </Drawer.Portal>
</Drawer.Root>
```

Look at `live-filters-drawer.tsx` for the exact Vaul API usage in this codebase.

**No backdrop blur on the overlay:** Use `bg-black/40` (semi-transparent dark overlay) WITHOUT `backdrop-blur-sm`. The epic spec explicitly removes the blur.

**Snap points:** `snapPoints={[0.4, 0.85]}` — percentage of viewport height. `defaultSnapPoint={0.4}` for the initial 40% snap.

### Current Component State (What Changes)

Current `poi-detail-sheet.tsx` summary:
- **Sheet**: shadcn `Sheet` with `side="bottom"` → **migrate to Vaul Drawer**
- **Stats grid**: D+, ETA, km on trace, dist from trace → **keep as-is**
- **Google enrichment**: `details.rating`, `details.isOpenNow`, `details.formattedAddress` → **remove rating block** (`⭐ X.X / 5` line), keep `isOpenNow` + `formattedAddress`
- **Contact section**: phone + website inline links → **keep as-is**
- **Booking buttons**: Booking.com + Hotels.com → **keep Booking only**, rename + restyle, remove Hotels.com
- **"Lien partenaire" label**: → **remove**
- **"Site officiel" ghost button**: → **add** (new, conditional on `displayWebsite && isAccommodation`)

### POI Type Badge — Layer Label Map

Add this constant in the component:

```typescript
const LAYER_LABELS: Record<MapLayer, string> = {
  accommodations: 'Hébergement',
  restaurants:    'Restauration',
  supplies:       'Alimentation',
  bike:           'Vélo / Réparation',
}
```

Badge markup:
```tsx
<span className="bg-[--primary-light] text-[--primary] text-xs font-medium px-2 py-0.5 rounded-full">
  {LAYER_LABELS[layer]}
</span>
```

### Booking CTA — Design System

Current (to remove):
```tsx
className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
```

Target (AC #3 + design system):
```tsx
import { ExternalLink } from 'lucide-react'

<a
  href={bookingUrl}
  target="_blank"
  rel="noopener noreferrer"
  onClick={() => handleBookingClick('booking_com')}
  aria-label="Recherche sur Booking.com"
  className="flex items-center justify-center gap-2 w-full h-12 rounded-full bg-[--primary] text-white text-sm font-medium hover:opacity-90"
>
  <ExternalLink className="h-4 w-4" />
  Recherche sur Booking
</a>
```

### "Site officiel" Ghost Button

```tsx
{isAccommodation && displayWebsite && (
  <a
    href={displayWebsite}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Site officiel de l'établissement"
    className="flex items-center justify-center gap-2 w-full h-12 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface]"
  >
    <Globe className="h-4 w-4" />
    Site officiel
  </a>
)}
```

`displayWebsite` is already computed at line ~79 of current component:
```typescript
const displayWebsite = details?.website ?? osmWebsite
```

This covers both Google Places (`details.website`) and OSM fallback (`rawData.website`). **Reuse this variable** — do not add a new one.

### Vaul Drawer vs shadcn Sheet — Test Mock

The existing test mocks shadcn `Sheet`:
```typescript
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ...,
  SheetContent: ...,
  SheetHeader: ...,
  SheetTitle: ...,
}))
```

Replace with Vaul mock:
```typescript
vi.mock('vaul', () => ({
  Drawer: {
    Root: ({ children, open, onOpenChange }: any) => (
      <div data-testid="drawer" data-open={open} onClick={() => onOpenChange?.(false)}>{children}</div>
    ),
    Portal: ({ children }: any) => <div>{children}</div>,
    Overlay: () => <div data-testid="drawer-overlay" />,
    Content: ({ children }: any) => <div data-testid="drawer-content">{children}</div>,
    Title: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
    Handle: () => <div data-testid="drawer-handle" />,
  },
}))
```

### Files to Modify

**Modify:**
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — main implementation
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx` — test updates

**No changes needed:**
- `apps/web/src/app/(app)/live/[id]/page.tsx` — imports `PoiDetailSheet` unchanged (same props)
- NestJS API — no changes
- Database — no changes
- Shared packages — no changes

### Design Tokens (from `globals.css`)

```css
--primary:        #2D6A4A   /* Booking button bg */
--primary-light:  #EBF5EE   /* type badge bg */
--surface:        #F8FAF9   /* ghost button hover bg */
--border:         #D4E0DA   /* ghost button border */
--text-primary:   #1A2D22   /* ghost button text */
--text-secondary: (muted green) /* distance labels */
```

### Git Context (recent commits)

- `74819f6 fix(story-9.3)`: MapStylePicker + density badge fixes
- `e822e6f update(story-9.3)`: mobile UX polish (bottom sheet spacing, slider thumb)
- `c1454af feat(story-9.2)`: auth pages polish

Story 9.4 is purely a front-end restyling of an existing component. No new API calls, no NestJS changes, no DB changes. Touches only the `poi-detail-sheet.tsx` component and its test.

### Previous Story Learnings (9.3)

Key learnings applicable here:
- **Tailwind JIT + dynamic DOM**: do NOT use Tailwind classes on elements created via `document.createElement`. Not applicable here (no MapLibre layers), but worth keeping in mind.
- **React Strict Mode refs**: N/A for this component.
- **Vaul Drawer in this project**: Check `live-filters-drawer.tsx` for the exact import style and prop names — it's already battle-tested.
- `useMapStore.getState().setSelectedPoiId(null)` must be called on drawer close (already done in current `onOpenChange` handler) — preserve this.

### Project Structure Notes

- POI detail sheet is **co-located** with the map route: `apps/web/src/app/(app)/map/[id]/_components/`
- Live mode **imports** it relatively — no need to move or duplicate the file
- `LAYER_CATEGORIES`, `LAYER_ICONS`, and `MapLayer` type are imported from `@ridenrest/shared`
- `computeElevationGain` from `@ridenrest/gpx`
- `trackBookingClick`, `MapSegmentData` from `@/lib/api-client`

### References

- [Source: `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx`] — current implementation
- [Source: `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx`] — Vaul Drawer usage pattern in this project
- [Source: `apps/web/src/app/globals.css`] — design tokens
- [Source: `_bmad-output/planning-artifacts/epics.md#Story 9.4`] — ACs source of truth (updated 2026-03-24)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6 (2026-03-24)

### Debug Log References

- `defaultSnapPoint` prop absent des types Vaul v1 — omis (Vaul utilise le premier snap point par défaut).
- Test: `getByText('Hôtel du Lac')` matchait deux éléments (Drawer.Title sr-only + h2 visible) → migré à `getAllByText`.
- UX pivot en cours d'implémentation : Vaul Drawer bottom-sheet remplacé par un popup flottant `PoiPopup` positionné au-dessus du PIN, à la demande de l'utilisateur.
- Problème live mode : `PoiDetailSheet` rendu hors du conteneur `relative` de la carte → popup affiché sous la carte. Résolu en déplaçant `PoiPopup` à l'intérieur du div map container + ajout `forwardRef`/`getMap()` sur `LiveMapCanvas`.

### Completion Notes List

- **Approche finale : `PoiPopup` flottant** — popup positionné au-dessus du PIN cliqué via `map.project([lng, lat])`, repositionné sur `move`/`zoom`, fermé via bouton ×, Escape ou clic autre PIN. Fonctionne en planning ET live mode.
- `poi-detail-sheet.tsx` : migration Vaul Drawer + redesign complet (badge type, Booking CTA design tokens, bouton "Site officiel", suppression Hotels.com/rating/"Lien partenaire") — conservé, non utilisé directement.
- `poi-popup.tsx` (nouveau) : popup flottant — badge type, distance trace, stats (km/D+/ETA), open/closed Google, sélecteur de type d'hébergement (chips 🏨/🛏️/🏠/🏕️/🏔️) modifiant le filtre `nflt` de l'URL Booking.com, bouton "Site officiel".
- `map-canvas.tsx` : `MapCanvasHandle` étendu avec `getMap()`.
- `live-map-canvas.tsx` : converti en `forwardRef` + `LiveMapCanvasHandle.getMap()`.
- `map-view.tsx` : `<PoiDetailSheet>` → `<PoiPopup>` (planning mode).
- `live/[id]/page.tsx` : `<PoiDetailSheet>` → `<PoiPopup>` à l'intérieur du conteneur map (live mode).
- `map.store.ts` : `activeAccommodationTypes` par défaut réduit à `['hotel']` uniquement — la recherche live démarre sur les hôtels seuls, les autres types se sélectionnent via les filtres.
- `accommodation-sub-types.tsx` : `computeAccCountByType([])` retourne désormais `null` au lieu de `{}` — les chips de type s'affichent sans compteur et sans état grisé avant la première recherche.
- 497 tests passent, zéro erreur TypeScript.

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Unused `Drawer.Handle` in Vaul mock — `poi-detail-sheet.test.tsx:63` mocks `Handle` but component uses a raw `<div>` handle, not `<Drawer.Handle>`
- [ ] [AI-Review][LOW] Verify Booking.com `nflt` filter encoding — `poi-popup.tsx:30-34` uses pre-encoded `ht_id%3D204`; confirm Booking.com accepts `nflt=ht_id%3D204` vs `nflt=ht_id=204`
- [ ] [AI-Review][LOW] `selectedCategory` 1-render flash on POI change — `poi-popup.tsx:63+88-90` initializes from `poi.category` then resets via `useEffect`; adding a `key={poi.id}` on the popup would eliminate the flash
- [ ] [AI-Review][LOW] `PoiDetailSheet` is dead code — no callers remain; candidate for removal once PoiPopup is confirmed stable (keep until Epic 9 complete)

### File List

- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — migré Vaul Drawer + redesign complet (conservé, non utilisé directement)
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx` — mock Vaul, 6 nouveaux tests, anciens tests obsolètes supprimés
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — **nouveau** : popup flottant avec sélecteur de type d'hébergement
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx` — **nouveau** : 22 tests couvrant rendu, Booking CTA, type selector, Site officiel, close behavior, map listeners
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — `MapCanvasHandle` étendu avec `getMap()`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — utilise `PoiPopup` à la place de `PoiDetailSheet`
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx` — `computeAccCountByType` retourne `null` pour tableau vide
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — converti en `forwardRef` + `LiveMapCanvasHandle` exposant `getMap()`
- `apps/web/src/app/(app)/live/[id]/page.tsx` — utilise `PoiPopup` dans le conteneur map, suppression `PoiDetailSheet`
- `apps/web/src/stores/map.store.ts` — `activeAccommodationTypes` par défaut : `['hotel']` uniquement
