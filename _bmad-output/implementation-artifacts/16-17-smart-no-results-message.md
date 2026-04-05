# Story 16.17: Smart No-Results Message for Filtered Accommodation Search

Status: done

## Story

As a **cyclist searching for accommodations on the planning or live map**,
I want a contextual message when my sub-type filter yields no visible results but other accommodation types exist,
so that I know results are available if I broaden my filter — instead of seeing an empty map with no explanation.

---

## Context & Problème actuel

### Scénario problématique

1. L'utilisateur lance une recherche d'hébergements sur un segment
2. L'API retourne 8 campings, 2 refuges, 0 hôtels
3. L'utilisateur a le filtre "Hôtel" activé uniquement (chips dans `AccommodationSubTypes`)
4. Le filtre client-side dans `use-poi-layers.ts:58-59` exclut tous les POIs → **0 pins sur la carte**
5. Mais `allPois.length === 10` → le banner "Aucun résultat dans cette zone" (map-view.tsx:432) **ne s'affiche PAS**
6. L'utilisateur ne comprend pas pourquoi la carte est vide

### Comportement attendu

Un message contextuel doit s'afficher quand :
- La recherche a retourné des hébergements (`poisByLayer.accommodations.length > 0`)
- Mais le filtrage par sous-type produit 0 résultats visibles
- Le message indique combien de résultats existent pour les autres types

### Cas à couvrir

**Cas A — Filtre sous-type vide, résultats existent dans d'autres sous-types** (scénario principal)
→ Message contextuel : "Aucun hôtel dans cette zone — 8 campings, 2 refuges disponibles"

**Cas B — `allPois.length === 0` (aucun résultat toutes catégories confondues)**
→ Message existant inchangé : "Aucun résultat dans cette zone"

**Cas C — Filtre sous-type produit des résultats**
→ Aucun message (comportement normal)

**Cas D — Plusieurs sous-types sélectionnés, certains ont des résultats**
→ Pas de message (au moins un sous-type actif a des pins)

**Cas E — Mode live**
→ Même logique que le mode planning

---

## Acceptance Criteria

**AC-1 — Message contextuel quand le filtre sous-type hébergement exclut tous les résultats (planning)**

**Given** une recherche commitée en mode planning avec la couche "Hébergements" active,
**When** `poisByLayer.accommodations` contient des résultats MAIS aucun ne correspond aux `activeAccommodationTypes` sélectionnés,
**Then** un banner s'affiche au-dessus de la carte : "Aucun {types_actifs} dans cette zone — {N} {types_disponibles} disponible(s)".
**And** le banner existant "Aucun résultat dans cette zone" ne s'affiche PAS (puisque `allPois.length > 0`).

**AC-2 — Le message liste les types alternatifs avec leurs compteurs**

**Given** le banner contextuel est affiché,
**When** il y a des résultats dans d'autres sous-types,
**Then** le message affiche le détail par type avec compteur : ex. "8 campings, 2 refuges disponibles".
**And** seuls les types ayant `count > 0` sont listés (pas de "0 auberge").

**AC-3 — Aucun message si au moins un résultat correspond au filtre actif**

**Given** une recherche commitée retourne des hébergements,
**When** au moins 1 POI correspond à un `activeAccommodationType` sélectionné,
**Then** aucun banner contextuel n'est affiché.

**AC-4 — Message identique en mode live**

**Given** le mode live est actif et une recherche POI a été exécutée,
**When** `pois` contient des hébergements mais aucun ne correspond aux `activeAccommodationTypes`,
**Then** le même banner contextuel s'affiche (même composant, même logique).

**AC-5 — Le message existant "Aucun résultat" reste inchangé**

**Given** une recherche commitée,
**When** `allPois.length === 0` (aucun résultat toutes couches confondues),
**Then** le banner orange existant "Aucun résultat dans cette zone" s'affiche normalement (pas de régression).

**AC-6 — Le banner contextuel est cliquable pour réinitialiser les filtres**

**Given** le banner contextuel est affiché,
**When** l'utilisateur clique dessus,
**Then** tous les sous-types hébergement sont réactivés (`activeAccommodationTypes` = tous) et le banner disparaît.

---

## Tasks / Subtasks

### Task 1 — Logique de détection "filtre vide" (AC: 1, 2, 3)

**Files:** `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`

- [x] Calculer `filteredAccommodations` = `poisByLayer.accommodations.filter(p => activeAccommodationTypes.has(p.category))`
- [x] Calculer `hasUnfilteredResults` = `poisByLayer.accommodations.length > 0 && filteredAccommodations.length === 0`
- [x] Calculer `alternativeCounts` = compteur par sous-type des hébergements NON filtrés (ex. `{ camp_site: 8, shelter: 2 }`)
- [x] Condition d'affichage : `searchCommitted && !poisPending && visibleLayers.has('accommodations') && hasUnfilteredResults`

### Task 2 — Composant `NoResultsSubTypeBanner` (AC: 1, 2, 6)

**File:** `apps/web/src/app/(app)/map/[id]/_components/no-results-sub-type-banner.tsx` (nouveau)

- [x] Props : `activeTypeLabels: string[]`, `alternatives: { label: string; count: number }[]`, `onResetFilters: () => void`
- [x] Affiche : "Aucun {activeTypeLabels.join(', ')} — {alternatives.map(a => `${a.count} ${a.label}`).join(', ')} disponible(s)"
- [x] Style : même positionnement que le banner existant (absolute bottom-20, centered, backdrop-blur) mais bleu info (`bg-blue-500/90`) pour le distinguer du orange "aucun résultat"
- [x] `onClick` → appelle `onResetFilters` (reset tous les types)
- [x] Cursor pointer + petit texte "(cliquer pour afficher)" en dessous du message principal

### Task 3 — Intégration dans `map-view.tsx` (AC: 1, 3, 5)

**File:** `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`

- [x] Importer `NoResultsSubTypeBanner`
- [x] Ajouter le banner entre le `MapSearchOverlay` et le banner existant "Aucun résultat"
- [x] Les deux banners sont mutuellement exclusifs : le contextuel prime si `hasUnfilteredResults`, sinon le orange existant
- [x] `onResetFilters` → `useMapStore.getState().resetAccommodationTypes()`

### Task 4 — Action `resetAccommodationTypes` dans le store (AC: 6)

**File:** `apps/web/src/stores/map.store.ts`

- [x] Ajouter `resetAccommodationTypes: () => void` qui remet `activeAccommodationTypes` à l'ensemble complet (tous les sous-types)
- [x] Test dans `map.store.test.ts`

### Task 5 — Intégration mode live (AC: 4)

**File:** `apps/web/src/app/(app)/live/[id]/page.tsx`

- [x] Même logique que planning : détecter si `pois` contient des hébergements mais filtrage vide
- [x] Afficher `NoResultsSubTypeBanner` dans le même positionnement
- [x] Le banner live existant "Aucun résultat dans cette zone" reste inchangé pour le cas `pois.length === 0`

### Task 6 — Tests (AC: 1, 2, 3, 4, 5, 6)

- [x] `no-results-sub-type-banner.test.tsx` — unit tests du composant (6 tests)
- [x] `map-view.test.tsx` — mocks updated + 4 integration tests NoResultsSubTypeBanner (AC-1/2/3/5)
- [x] `map.store.test.ts` — 2 tests for resetAccommodationTypes
- [x] `live/[id]/page.test.tsx` — mocks updated + 3 integration tests NoResultsSubTypeBanner (AC-4/5)
- [x] `apps/web/src/app/(app)/live/[id]/page.test.tsx` �� mocks updated for new imports

### Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] Dev Notes claim `activeAccommodationTypes` is initialized with ALL sub-types, but code shows `new Set(['hotel'])` only — fix Dev Notes accuracy or align initial value [`map.store.ts:70`]
- [ ] [AI-Review][MEDIUM] Live mode banner may mislead in areas with genuinely 0 accommodations — "peut-être disponible(s)" shown but click→refetch still returns nothing. Consider detecting empty refetch result and suppressing banner on 2nd attempt [`live/[id]/page.tsx:155-173`]
- [ ] [AI-Review][LOW] `NoResultsSubTypeBanner` lacks `aria-label` for screen readers — add descriptive label like "Réinitialiser les filtres d'hébergement" [`no-results-sub-type-banner.tsx:24`]
- [ ] [AI-Review][LOW] Component doesn't guard against empty `alternatives` array — would render awkward text. Parent guards, but defensive check would be safer [`no-results-sub-type-banner.tsx:17-21`]
- [ ] [AI-Review][LOW] Story Dev Notes line references are stale after this story's changes (e.g. "map-view.tsx:432-436" → actual ~463)

---

## Dev Notes

### Logique de filtrage — côté client uniquement

Le filtrage par sous-type hébergement est 100% client-side (`use-poi-layers.ts:58-59`). L'API retourne TOUS les types d'hébergement. La détection "filtre vide" doit donc se baser sur `poisByLayer.accommodations` (données brutes API) vs `activeAccommodationTypes` (état store).

### Labels des sous-types

Les labels humains sont dans `ACCOMMODATION_SUB_TYPES` (`accommodation-sub-types.tsx:6-12`). Réutiliser ce mapping pour construire le message :
```ts
const labelMap: Record<string, string> = Object.fromEntries(
  ACCOMMODATION_SUB_TYPES.map(({ type, label }) => [type, label.toLowerCase()])
)
```

### Distinction visuelle des banners

- Banner existant "Aucun résultat" : `bg-orange-500/90` → **alerte** (pas de données du tout)
- Nouveau banner "Aucun {type}" : `bg-blue-500/90` → **info** (il y a des données, juste pas dans le filtre actif)

### `activeAccommodationTypes` — valeur par défaut

Dans `map.store.ts`, `activeAccommodationTypes` est initialisé avec TOUS les sous-types. `resetAccommodationTypes()` doit restaurer cet état initial.

### Mode live — source des données

En live mode, les POIs viennent de `useLivePoiSearch` (pas `usePois`). Les hébergements sont aussi filtrés par `activeAccommodationTypes` dans le même hook `usePoiLayers`. La détection "filtre vide" utilise les mêmes données brutes `pois` avant filtrage.

### Project Structure Notes

- `map-view.tsx` : composant principal planning map — ajout du banner contextuel
- `live/[id]/page.tsx` : page live mode — ajout du même banner
- `map.store.ts` : ajout `resetAccommodationTypes()`
- `accommodation-sub-types.tsx` : réutilisation de `ACCOMMODATION_SUB_TYPES` pour les labels
- Nouveau fichier : `no-results-sub-type-banner.tsx` — composant partagé planning + live

### References

- Filtre sous-type client-side : `apps/web/src/hooks/use-poi-layers.ts:58-59`
- Banner "aucun résultat" existant : `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:432-436`
- Sous-types hébergement : `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx:6-12`
- Store map : `apps/web/src/stores/map.store.ts`
- Live POI search : `apps/web/src/hooks/use-live-poi-search.ts`
- Live banner existant : `apps/web/src/app/(app)/live/[id]/page.tsx:110-111`

---

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- Fixed map-view.test.tsx mock: added ACCOMMODATION_SUB_TYPES export to accommodation-sub-types mock
- Fixed live/page.test.tsx mock: added activeAccommodationTypes to useMapStore selector + getState mock
- Fixed NoResultsSubTypeBanner positioning: removed built-in absolute positioning, added className prop for parent control
- Fixed live mode detection: removed `pois.length > 0` condition (API-side filtering means pois can be empty even when other types exist)
- Fixed live mode reset: added `handleSearch()` after `resetAccommodationTypes()` to trigger API refetch with new categories

### Completion Notes List
- Task 1: Detection logic in map-view.tsx — computes filteredAccommodations, hasUnfilteredResults, alternativeCounts, activeTypeLabels
- Task 2: NoResultsSubTypeBanner component — blue info banner with click-to-reset, supports both planning (with counts) and live mode (without counts) via "peut-être disponible(s)" fallback
- Task 3: Integrated in map-view.tsx — mutually exclusive with orange no-results banner, contextual banner takes priority
- Task 4: resetAccommodationTypes() in map.store.ts — uses LAYER_CATEGORIES.accommodations as source of truth
- Task 5: Live mode integration — detects when no accommodations match active filter and not all types selected. Reset also triggers refetch (API-side filtering requires new request with updated categories)
- Task 6: 8 new tests (6 component + 2 store), existing test mocks updated

### Change Log
- 2026-04-05: Story 16.17 implemented — smart no-results message for filtered accommodation search (all ACs)
- 2026-04-05: Code review — added 7 integration tests (4 map-view AC-1/2/3/5, 3 live AC-4/5), 5 action items (2 MEDIUM, 3 LOW)

### File List
- `apps/web/src/app/(app)/map/[id]/_components/no-results-sub-type-banner.tsx` (new)
- `apps/web/src/app/(app)/map/[id]/_components/no-results-sub-type-banner.test.tsx` (new)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (modified)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` (modified)
- `apps/web/src/app/(app)/live/[id]/page.tsx` (modified)
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` (modified)
- `apps/web/src/stores/map.store.ts` (modified)
- `apps/web/src/stores/map.store.test.ts` (modified)
