# Story 16.14: Global Accommodation Search CTA (Booking + Airbnb)

Status: done

## Story

As a **cyclist using the planning or live mode**,
I want a "Rechercher sur" dropdown CTA available to search Booking.com or Airbnb for any accommodation zone,
so that I can instantly open an external platform centered on the right location — whether from the map sidebar, the live controls, or a specific POI popup.

---

## Context & Design Decisions

### Problème actuel

Il n'existait pas de CTA pour faire une recherche globale sur une plateforme d'hébergement pour toute la zone recherchée. Le seul lien Booking existant était dans la fiche POI individuelle (`poi-popup.tsx`) — il ouvrait Booking.com sur un établissement spécifique.

L'utilisateur doit pouvoir ouvrir Booking.com ou Airbnb centré sur la zone de recherche pour voir tous les hébergements disponibles, pas seulement ceux indexés dans l'app. Ce besoin existe dans trois contextes : sidebar planning, contrôles live, et fiche POI hébergement.

### Comportement attendu

**Mode planning (`search-range-control.tsx`):**
- Apparaît sous le bouton "Rechercher" quand : `searchCommitted && !isPoisPending && visibleLayers.has('accommodations')`
- Centre de la zone : waypoint le plus proche du milieu du corridor `(fromKm + toKm) / 2`
- Composant : `<SearchOnDropdown center={center} variant="outline" className="w-full" />`

**Mode live (`live/[id]/_components/live-controls.tsx`):**
- Intégré dans l'action row de `LiveControls` à côté du bouton "Rechercher"
- `center` prop calculé dans `page.tsx` via `useMemo` — disponible dès que le mode live est actif et `targetKm` connu (pas besoin d'avoir lancé une recherche POI)
- `null` uniquement si `!isLiveModeActive || targetKm === null || allCumulativeWaypoints.length === 0`
- Composant : `<SearchOnDropdown center={center} variant="action" className="flex-1" />`

**Fiche POI hébergement (`poi-popup.tsx`):**
- Remplace l'ancien bouton Booking unique (qui avait `nflt` + `trackBookingClick`)
- Layout vertical : `SearchOnDropdown` pleine largeur (`variant="action"`) + "Site officiel" en dessous si disponible
- `center={{ lat: poi.lat, lng: poi.lng }}` — toujours actif (le POI a toujours des coords)
- `overflow-hidden` retiré du card popup (idem `search-range-control`)
- `POI_BOOKING_FILTERS` (`nflt`) supprimés — recherche globale intentionnellement générique

### Composant `SearchOnDropdown`

Nouveau composant partagé (`apps/web/src/components/shared/search-on-dropdown.tsx`) :
- Trigger "Rechercher sur ▾" — clic ouvre un menu déroulant au-dessus ou en-dessous
- Menu : "Rechercher sur Booking.com" + "Rechercher sur Airbnb" — chaque item `target="_blank"`
- `center` = `null` → trigger `aria-disabled` (grisé, non cliquable)
- Deux variants : `'outline'` (sidebar planning) et `'action'` (rounded-full primary, live mode)
- Fermeture au clic extérieur (`document.addEventListener('mousedown', ...)`)

### URLs

- **Booking.com** : `https://www.booking.com/searchresults.html?latitude={lat}&longitude={lng}`
- **Airbnb** : `https://www.airbnb.com/s/homes?ne_lat={lat+0.2}&ne_lng={lng+0.2}&sw_lat={lat-0.2}&sw_lng={lng-0.2}` (bbox ±0.2° ≈ 22 km)

### Layout final `LiveControls`

```
┌─────────────────────────────────────────────┐
│ MON HÔTEL DANS   D+ Xm 🏔  [≡icon badge]  │  ← Filters = icône ronde avec badge
│ X         km     ~Xh00 🕐                  │
│ [slider]                                    │
│ [🔍 RECHERCHER]  [Rechercher sur ▾]        │  ← Dropdown remplace bouton FILTERS
└─────────────────────────────────────────────┘
```

---

## Acceptance Criteria

**AC-1 — Dropdown planning : affiché après recherche hébergements**

**Given** le mode planning est actif, la couche "Hébergements" est visible (`visibleLayers.has('accommodations')`), et l'utilisateur a cliqué "Rechercher" (`searchCommitted = true`),
**When** le fetch POI est terminé (`!isPoisPending`),
**Then** un dropdown "Rechercher sur" apparaît en dessous du bouton "Rechercher" dans le sidebar.
**And** le dropdown est visible même si le fetch a renvoyé 0 résultats.

**AC-2 — Dropdown planning : masqué si hébergements non actifs**

**Given** la couche "Hébergements" n'est PAS dans `visibleLayers`,
**When** une recherche est committée,
**Then** le composant `SearchOnDropdown` n'est **pas** affiché.

**AC-3 — Dropdown planning : masqué pendant le fetch**

**Given** une recherche est en cours (`isPoisPending = true`),
**When** le fetch est actif,
**Then** le composant `SearchOnDropdown` n'est **pas** affiché (éviter un CTA sur des données incomplètes).

**AC-4 — Dropdown planning : URLs avec centre du corridor**

**Given** le corridor recherché est `[fromKm, toKm]` et les waypoints sont disponibles,
**When** l'utilisateur ouvre le dropdown et clique "Rechercher sur Booking.com" ou "Rechercher sur Airbnb",
**Then** le lien s'ouvre dans un nouvel onglet avec l'URL correcte centrée sur le waypoint le plus proche de `midKm = (fromKm + toKm) / 2`.

**AC-5 — Dropdown live : actif dès que le slider est positionné**

**Given** le mode live est actif et `targetKm` est connu (slider positionné),
**When** `LiveControls` s'affiche,
**Then** le composant `SearchOnDropdown` est actif — aucune recherche POI préalable n'est requise.
**And** le `center` correspond au waypoint le plus proche de `targetKm`.

**AC-6 — Dropdown live : center null uniquement si live inactif ou waypoints absents**

**Given** le mode live est inactif OU `targetKm === null` OU `allCumulativeWaypoints` est vide,
**Then** `center` est `null` → trigger `SearchOnDropdown` désactivé (grisé, non cliquable).

**AC-7 — Dropdown live : URLs avec coordonnées du targetKm**

**Given** `targetKm` et les waypoints cumulatifs sont disponibles,
**When** l'utilisateur ouvre le dropdown et clique un lien en mode live,
**Then** le lien ouvre la plateforme choisie centré sur le waypoint le plus proche de `targetKm`.

**AC-8 — Dropdown si waypoints absents : trigger désactivé (pas d'erreur)**

**Given** `waypoints` est `null` ou vide (segment non parsé),
**When** les conditions d'affichage sont remplies,
**Then** `center` est `null` → trigger grisé (`aria-disabled`) — pas de crash, pas de lien cassé.

**AC-9 — Dropdown POI popup hébergement : remplace bouton Booking**

**Given** une fiche POI hébergement est ouverte,
**When** les CTAs s'affichent,
**Then** `SearchOnDropdown` apparaît en pleine largeur (`variant="action"`) centré sur les coords du POI.
**And** "Site officiel" apparaît en-dessous en outline si un site web est disponible.
**And** le trigger est toujours actif (les coords POI sont toujours connues).

---

## Tasks / Subtasks

### Task 1 — Helper `getCorridorCenter` dans `booking-url.ts`

**File:** `apps/web/src/lib/booking-url.ts` (nouveau fichier partagé)

```typescript
import type { MapWaypoint } from '@ridenrest/shared'

export function getCorridorCenter(
  waypoints: MapWaypoint[],
  targetKm: number,
): { lat: number; lng: number } | null {
  if (waypoints.length === 0) return null
  let closest = waypoints[0]!
  let minDiff = Math.abs(waypoints[0]!.distKm - targetKm)
  for (const wp of waypoints) {
    const diff = Math.abs(wp.distKm - targetKm)
    if (diff < minDiff) { minDiff = diff; closest = wp }
  }
  return { lat: closest.lat, lng: closest.lng }
}

export function buildBookingSearchUrl(center: { lat: number; lng: number }): string {
  return `https://www.booking.com/searchresults.html?latitude=${center.lat}&longitude=${center.lng}`
}

/** Bounding box ±0.2° (≈ 22 km) autour du centre */
export function buildAirbnbSearchUrl(center: { lat: number; lng: number }): string {
  const d = 0.2
  return `https://www.airbnb.com/s/homes?ne_lat=${center.lat + d}&ne_lng=${center.lng + d}&sw_lat=${center.lat - d}&sw_lng=${center.lng - d}`
}
```

- [x] Créer `apps/web/src/lib/booking-url.ts` avec `getCorridorCenter`, `buildBookingSearchUrl`, `buildAirbnbSearchUrl`

### Task 2 — Composant partagé `SearchOnDropdown`

**File:** `apps/web/src/components/shared/search-on-dropdown.tsx`

Nouveau composant dropdown réutilisable :
- Props : `center: { lat, lng } | null`, `variant?: 'outline' | 'action'`, `className?: string`
- Trigger : texte "Rechercher sur" (sans icône)
- Menu au-dessus du trigger (`bottom-full mb-1.5`, `z-50`)
- Items : liens "Rechercher sur Booking.com" + "Rechercher sur Airbnb" avec style CTA (icône + label)
- `center = null` → trigger `aria-disabled`, liens désactivés
- Fermeture au clic extérieur

```tsx
// variants :
// 'outline' : border border-[--border] rounded-lg
// 'action'  : bg-primary text-primary-foreground rounded-full (style bouton action live)
```

- [x] Créer `apps/web/src/components/shared/search-on-dropdown.tsx`
- [x] Créer `apps/web/src/components/shared/search-on-dropdown.test.tsx` (14 tests)

### Task 3 — Intégration planning (`search-range-control.tsx`)

**File:** `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`

- Remplacer le lien `<a>` Booking par `<SearchOnDropdown center={...} variant="outline" className="w-full" />`
- `center` calculé via `getCorridorCenter(waypoints, (fromKm + toKm) / 2)`
- **Supprimer `overflow-hidden`** du container `rounded-xl border` (cliperait le menu dropdown)
- Condition d'affichage : `searchCommitted && !isPoisPending && visibleLayers.has('accommodations')`
- Ajouter `searchCommitted` au destructuring de `useMapStore()` (était manquant)

- [x] Remplacer le bouton Booking par `SearchOnDropdown` dans `search-range-control.tsx`
- [x] Supprimer `overflow-hidden` du container parent
- [x] Mettre à jour les tests (`search-range-control.test.tsx`)

### Task 4 — Intégration live (`live-controls.tsx` + `page.tsx`)

**Restructuration `LiveControls` :**
- FILTERS → icône ronde (`h-9 w-9 rounded-full`) avec badge, déplacée dans le header row à droite de D+/ETA
- Action row : `[🔍 RECHERCHER]` + `[SearchOnDropdown variant="action" flex-1]`
- Prop `bookingUrl: string | null` → `center: { lat, lng } | null`

**Dans `page.tsx` :**
- `liveSearchCenter` via `useMemo` (remplace `liveBookingUrl`) — retourne `{ lat, lng } | null`
- Conditions : `isLiveModeActive && poisHasFetched && !poisFetching && mapVisibleLayers.has('accommodations') && targetKm !== null && allCumulativeWaypoints.length > 0`
- Supprimer l'overlay flottant `absolute bottom-[200px]`

- [x] Restructurer `live-controls.tsx` : FILTERS icône header, `SearchOnDropdown` dans action row
- [x] Calculer `liveSearchCenter` dans `page.tsx`, supprimer overlay flottant
- [x] Mettre à jour les tests (`live-controls.test.tsx`)

### Task 5 — Intégration POI popup (`poi-popup.tsx`)

**File:** `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`

- Remplacer le bouton Booking `<a>` + `trackBookingClick` par `<SearchOnDropdown center={{ lat: poi.lat, lng: poi.lng }} variant="action" className="w-full" />`
- Layout CTA hébergement → `flex-col gap-2` : `SearchOnDropdown` en premier, "Site officiel" en dessous
- Supprimer `POI_BOOKING_FILTERS`, `nflt`, `bookingUrl`, `handleBookingClick`, `trackBookingClick`
- Supprimer `overflow-hidden` du card (cliperait le menu dropdown)
- Supprimer imports `Search` (lucide) et `trackBookingClick` (`@/lib/api-client`)

- [x] Intégrer `SearchOnDropdown` dans `poi-popup.tsx`
- [x] Layout vertical CTAs hébergement
- [x] Supprimer logique Booking legacy

### Task 6 — Tests

- [x] `search-range-control.test.tsx` : mock `SearchOnDropdown`, 8 tests CTA (présence, absence, data-has-center) — inclut test `waypoints=[]` vide (AC-8)
- [x] `live-controls.test.tsx` : mock `SearchOnDropdown`, tests FILTERS icône header, dropdown action row
- [x] `search-on-dropdown.test.tsx` : 14 tests (open/close, URLs Booking + Airbnb, disabled si center=null, outside click, variants, aria-expanded)
- [x] `booking-url.test.ts` : 12 tests unitaires (`getCorridorCenter` + `buildBookingSearchUrl` + `buildAirbnbSearchUrl`)

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `search-on-dropdown.tsx` — Menu opens `bottom-full` unconditionally; no viewport collision detection — may clip if trigger is near screen top [search-on-dropdown.tsx:75]
- [ ] [AI-Review][LOW] `search-on-dropdown.tsx` — No keyboard navigation between menu items (ArrowDown/ArrowUp) — accessibility gap for keyboard users [search-on-dropdown.tsx:77-98]
- [ ] [AI-Review][LOW] Story Completion Notes say "AC-1 through AC-8 covered" but story has AC-9; Task 4 lists conditions (`poisHasFetched` etc.) intentionally not implemented per AC-5 — update story documentation if needed

---

## Dev Notes

### `overflow-hidden` clipe le dropdown

Deux endroits affectés :
- `search-range-control.tsx` : container `rounded-xl border overflow-hidden` → `overflow-hidden` supprimé
- `poi-popup.tsx` : card `rounded-2xl overflow-hidden` → `overflow-hidden` supprimé

Dans les deux cas, aucun enfant ne déborde visuellement — suppression safe.

### `mapVisibleLayers` vs `visibleLayers` en live

En live, la variable s'appelle `mapVisibleLayers` (depuis `useLiveStore`), pas `visibleLayers` (nom planning dans `useMapStore`).

### `aria-disabled` — ne pas utiliser `false`

`aria-disabled={false}` rendu par React → attribut string `"false"` dans le DOM. Pattern correct : `aria-disabled={center ? undefined : true}` (omis quand actif).

### `nflt` Booking supprimé partout

L'ancien bouton Booking dans `poi-popup.tsx` utilisait des filtres `nflt` par type d'hébergement (`hotel`, `hostel`, `guesthouse`). Ces filtres sont supprimés — la recherche via `SearchOnDropdown` est intentionnellement générique, l'utilisateur affine sur la plateforme externe.

### `liveSearchCenter` — pas besoin de fetch POI

En mode live, `liveSearchCenter` est calculé dès que `isLiveModeActive && targetKm !== null && allCumulativeWaypoints.length > 0`. Le slider (`targetKm`) suffit à déterminer la zone — inutile d'attendre un fetch POI.

### Airbnb URL — bbox ±0.2°

Airbnb nécessite une bounding box géographique. ±0.2° ≈ 22 km autour du centre. Format : `ne_lat/ne_lng/sw_lat/sw_lng` en query params.

---

## Project Structure Notes

- `apps/web/src/components/shared/search-on-dropdown.tsx` — composant dropdown "Rechercher sur" (Booking + Airbnb), variants `outline` et `action`
- `apps/web/src/lib/booking-url.ts` — helpers : `getCorridorCenter`, `buildBookingSearchUrl`, `buildAirbnbSearchUrl`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — intègre `SearchOnDropdown` après le bouton "Rechercher" (planning)
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — intègre `SearchOnDropdown` dans l'action row (live)
- `apps/web/src/app/(app)/live/[id]/page.tsx` — calcule `liveSearchCenter` (actif dès slider positionné)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — remplace bouton Booking par `SearchOnDropdown`, layout vertical, `overflow-hidden` supprimé
- Aucune modification backend requise — URLs construites côté client uniquement

---

## References

- `SearchOnDropdown` dans POI popup : `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`
- `MapWaypoint` type (lat, lng, distKm) : `packages/shared/src/types/adventure.types.ts:8-12`
- `searchCommitted` gate : `_bmad-output/project-context.md#POI-Search-Explicit-Trigger-Gate`
- `mapVisibleLayers` live : `apps/web/src/app/(app)/live/[id]/page.tsx:133`
- `allCumulativeWaypoints` live : `apps/web/src/app/(app)/live/[id]/page.tsx:80`
- `targetKm` live : `apps/web/src/hooks/use-live-poi-search.ts:29-30`
- Story 16.13 (POI popup Booking button context) : `_bmad-output/implementation-artifacts/16-13-poi-popup-redesign.md`

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Chose **Option B** for Task 4 (refactoring): extracted `getCorridorCenter` + `buildBookingSearchUrl` to `apps/web/src/lib/booking-url.ts` — both planning and live mode use the same algorithm, shared utility avoids duplication.
- Planning mode: added `searchCommitted` to `useMapStore()` destructure (was missing, only `setSearchCommitted` was present). Button renders after the "Rechercher" button, uses `(fromKm + toKm) / 2` as midKm.
- Live mode (v1): bouton overlay flottant à `absolute bottom-[200px]` dans `page.tsx`.
- Live mode (v2 — design review Guillaume): Bouton Booking intégré dans `LiveControls` comme action button (remplace FILTERS). FILTERS devient icône ronde avec badge dans le header. `liveBookingUrl` calculé dans `page.tsx` via `useMemo` et passé en prop. L'overlay flottant est supprimé.
- All AC satisfied: AC-1 through AC-8 covered. AC-8 (disabled state) implémenté via `href='#'` + `aria-disabled={true}` + `pointer-events-none`. `aria-disabled` omis (pas `false`) quand actif pour éviter confusion DOM.
- 8 new tests added to `search-range-control.test.tsx`. 2 new tests in `live-controls.test.tsx`. Mocks updated.
- 707 tests pass, no regressions.

### File List

- `apps/web/src/lib/booking-url.ts` — NEW: `getCorridorCenter`, `buildBookingSearchUrl`, `buildAirbnbSearchUrl`
- `apps/web/src/components/shared/search-on-dropdown.tsx` — NEW: dropdown "Rechercher sur" (Booking + Airbnb), variants `outline`/`action`, CTAs brand colors
- `apps/web/src/components/shared/search-on-dropdown.test.tsx` — NEW: 14 tests
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — modified: `SearchOnDropdown` après "Rechercher", `overflow-hidden` supprimé
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx` — modified: mock `SearchOnDropdown`, 8 tests CTA
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — modified: FILTERS → icône header, `SearchOnDropdown` dans action row, prop `center`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` — modified: mock `SearchOnDropdown`, tests màj
- `apps/web/src/app/(app)/live/[id]/page.tsx` — modified: `liveSearchCenter` (actif dès slider, sans condition POI), overlay supprimé
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — modified: `SearchOnDropdown` remplace bouton Booking, layout vertical, `overflow-hidden` supprimé, `nflt`/tracking supprimés
- `apps/web/src/lib/booking-url.test.ts` — NEW: 12 tests unitaires pour `getCorridorCenter`, `buildBookingSearchUrl`, `buildAirbnbSearchUrl`

## Change Log

- **2026-04-03** — Implémentation initiale : Booking CTA en mode planning + live. Shared utility `booking-url.ts`.
- **2026-04-03** — Design review : restructuration LiveControls (FILTERS icône header, BOOKING action row), suppression overlay flottant.
- **2026-04-03** — Ajout Airbnb : composant `SearchOnDropdown` (Booking + Airbnb), CTAs brand colors, `nflt` supprimé.
- **2026-04-03** — Live mode : `liveSearchCenter` actif dès slider positionné (sans attendre fetch POI). POI popup : bouton Booking → `SearchOnDropdown`, layout vertical, `overflow-hidden` supprimé.
- **2026-04-03** — Code review : ajout `booking-url.test.ts` (12 tests), ajout test `waypoints=[]` dans `search-range-control.test.tsx` (AC-8). Note : `live-controls.tsx` filter button `w-14` (vs `h-9 w-9` spécifié) — intentionnel, demande design Guillaume.
