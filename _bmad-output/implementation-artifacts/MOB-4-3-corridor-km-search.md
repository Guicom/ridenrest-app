---
baseline_commit: e4e931358e64cdab451c57f890941e212e0d436c
---

# Story MOB-4.3 : Recherche par corridor kilométrique

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur planifiant**,
I want **définir une plage kilométrique et chercher les POIs dans le corridor**,
So that **je trouve des services autour d'une portion précise de ma trace**.

> **Dépend de MOB-4.1** (carte) **et MOB-4.2** (calques + pins + `hooks/use-pois.ts` + `lib/api/pois.ts` + cache POI). Cette story ajoute le **slider de plage km** (`search-range-slider.tsx`), le **gate `searchCommitted`** (recherche déclenchée **uniquement** au clic « Rechercher »), l'**overlay de chargement scopé carte**, et la **bannière « Aucun résultat »**. Elle **finalise** `use-pois.ts` (param `fromKm/toKm` + `enabled` piloté par le gate), que MOB-4.2 a posé en déclenchement minimal.
>
> **Backend `GET /pois` livré** — corridor géospatial (`CORRIDOR_WIDTH_M = 3000`) calculé serveur ; cap **30 km** côté UI (le serveur tolère jusqu'à `MAX_SEARCH_RANGE_KM = 50`, mais l'epic mobile impose **30 km max**). **Rien à recréer serveur**.

## Acceptance Criteria

1. **Given** la carte d'une aventure
   **When** je définis une plage **km A → km B** via le slider (double poignée), avec un **cap de 30 km max** sur l'étendue `(toKm - fromKm)`
   **Then** la recherche **n'est PAS déclenchée** au déplacement du slider — elle ne part **qu'au clic explicite sur « Rechercher »** (gate `searchCommitted`) (FR-030)
   **And** modifier le slider après une recherche « invalide » l'état committé (le bouton « Rechercher » redevient l'action requise ; les pins précédents peuvent rester affichés jusqu'à la nouvelle recherche — parité web `searchRangeInteracted`)

2. **Given** une recherche déclenchée
   **When** les résultats reviennent
   **Then** les POIs situés dans le **corridor géospatial** autour du segment `[fromKm, toKm]` sont affichés en pins (selon calques actifs MOB-4.2) (FR-031)
   **And** un **overlay de chargement scopé à la carte** (pas plein écran bloquant) est visible **pendant** la requête
   **And** la plage `[fromKm, toKm]` est passée à `GET /pois` (query key `['pois', { segmentId, fromKm, toKm, layer, overpassEnabled }]`)

3. **Given** une recherche retournant **zéro POI**
   **When** elle est terminée
   **Then** une **bannière « Aucun résultat »** explicite est affichée (scopée carte, dismissable), distincte d'une erreur réseau

4. **Given** une erreur réseau pendant la recherche
   **When** la requête échoue
   **Then** un `<ErrorBanner />` scopé carte est affiché (jamais `Alert.alert`), avec possibilité de relancer « Rechercher »

5. **Given** une trace multi-segments
   **When** je règle la plage km
   **Then** la plage est interprétée en **km cumulés de l'aventure** et résolue vers le bon `segmentId` + offset (parité web : `fromKm/toKm` adventure-cumulés → recherche par segment concerné), ou, au MVP, scoper la recherche au(x) segment(s) couverts par `[fromKm, toKm]`

## Tasks / Subtasks

- [x] **T1 — Primitive `components/ui/slider.tsx` (double poignée) ou lib** (AC: 1)
  - [x] Évaluer : choix **primitive range maison** avec **`PanResponder` (cœur RN) + positionnement %** — PAS gesture-handler/reanimated. **Décision documentée** (`slider.tsx`) : Reanimated casse le build **Storybook** (cf. `skeleton.tsx`) or la story exige des `slider.stories.tsx` → `PanResponder` est polyfillé par react-native-web. Pas de nouvelle dép. Logique de clamp extraite en fonction **pure** `clampRange`.
  - [x] Storybook `slider.stories.tsx` : variantes Default, Capped30km, FullWidth (état local via `render`).
  - [x] A11y : `accessibilityRole="adjustable"` + `accessibilityValue={{ min, max, now }}` + `accessibilityActions` increment/decrement (sert aussi de point d'entrée testable RNTL).

- [x] **T2 — `components/map/search-range-slider.tsx`** (AC: 1, 2)
  - [x] Slider plage `[fromKm, toKm]` (km cumulés), bornes `[0, totalDistanceKm]`. **Cap 30 km** via `maxRange` du slider (clamp à la poignée). Affiche « km A → km B » + l'étendue (capHint).
  - [x] Bouton **« Rechercher »** (`Button` size `lg`), **désactivé** si plage invalide (toKm ≤ fromKm). Clic en ligne → `onCommit()`.
  - [x] Tout déplacement de poignée → `onChange` (la route dé-committe) + **n'arme PAS** la requête (gate `searchCommitted`).
  - [x] Défauts parité web : `fromKm = 0`, `toKm = 15` (état initial route).

- [x] **T3 — Finaliser `hooks/use-pois.ts` (gate + plage)** (AC: 1, 2, 3, 4)
  - [x] Param `fromKm`, `toKm`, `enabled` (= `searchCommitted` côté route). Query key change (`fromKm/toKm` locaux) → refetch ; sinon cache.
  - [x] Expose `isFetching` (→ overlay T4), `pois` (pins), `isError` (→ ErrorBanner), `isEmpty = enabled && isSuccess && pois.length === 0` (→ bannière « Aucun résultat »). *(Note : `isEmpty` basé sur `isSuccess` plutôt que `!isFetching` — hors-ligne `isSuccess` est faux donc pas de fausse bannière, cf. AC5.)*
  - [x] Conserve le write-through `poi-cache` + fallback offline (MOB-4.2) — inchangé.
  - [x] **Résolution multi-segments (AC5)** : fonction pure `resolveSegmentRanges(segments, fromKm, toKm)` → plages **locales** par segment couvert (km arrondis 0,1, parité web) ; une `useQuery` par (segment × calque), pins fusionnés/dédoublonnés.

- [x] **T4 — Overlay de chargement scopé carte + bannières** (AC: 2, 3, 4)
  - [x] Composant présentiel pur `map-search-feedback.tsx` : overlay `isFetching` (`ActivityIndicator` + voile, `inset-0`, `pointer-events-none`, **jamais** plein écran bloquant).
  - [x] Bannière « Aucun résultat » (`isEmpty`) scopée carte (`bg-orange-500/90`, parité web), **distincte** de l'erreur.
  - [x] `<ErrorBanner />` (`isError`) scopé carte + relance « Rechercher ». Précédence : fetching > error > empty.

- [x] **T5 — Intégration route map** (AC: 1, 2, 3, 4, 5)
  - [x] `search-range-slider` monté en panneau bas (au-dessus des `LayerToggles`) + `map-search-feedback` superposé. État `fromKm/toKm/searchCommitted` lifté à la route. **Doc Sync** : `searchRangeInteracted` (parité web) **non lifté** — aucun consommateur sur mobile MVP (pas de surbrillance corridor ni météo MOB-4.8) ; AC1 satisfait par `searchCommitted` seul (le déplacement de poignée dé-committe). Reporté avec son 1er consommateur.
  - [x] Overlay/bannières branchés sur `isFetching`/`isError`/`isEmpty` de `use-pois`.
  - [x] Slider/bouton **non désactivés** hors-ligne ; une nouvelle recherche offline affiche un message inline (`useNetworkStatus` → `isOnline` passé au slider).

- [x] **T6 — i18n (FR + EN)** (AC: 1, 2, 3, 4)
  - [x] Bloc `pois.search.*` : `range`, `button`, `capHint`, `loading`, `noResults`, `error`, `offline`, `fromHandleA11y`, `toHandleA11y` — parité FR/EN. **Zéro chaîne en dur**.

- [x] **T7 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [x] Slider : `clampRange` pur (cap 30 km, écart min, bornes/pas) + actions a11y increment/decrement.
  - [x] `use-pois` gate : requête **non** lancée si `enabled=false` ; lancée au commit ; `isEmpty` vrai si committé + 0 résultat.
  - [x] Résolution multi-segments : test pur `resolveSegmentRanges` (mono-segment, à cheval, hors plage).
  - [x] `search-range-slider` : déplacer poignée → `onChange` sans commit ; clic « Rechercher » → `onCommit` ; bouton désactivé si invalide ; offline → message inline. `map-search-feedback` : overlay/`isEmpty`/`isError`/précédence. Route : gate (aucune recherche avant clic, lancée au clic).
  - [x] Gate : **test 313/313**, **tsc 0**, **lint 0**, **`expo export` iOS OK**.

- [ ] **T8 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client (reste manuel Guillaume)
  - [ ] Déplacer le slider → aucun appel réseau ; cap 30 km respecté.
  - [ ] « Rechercher » → overlay, puis pins du corridor (calques actifs).
  - [ ] Plage sans POI → bannière « Aucun résultat ». Couper réseau + rechercher → message offline. Forcer une erreur → ErrorBanner + relance.
  - [ ] Multi-segments : plage chevauchant 2 segments → pins corrects.

## Dev Notes

### Backend `GET /pois` (corridor) — réutilisé tel quel

- Query `FindPoisDto` mode corridor : `segmentId` (uuid), `fromKm`, `toKm` (`toKm > fromKm`, `toKm - fromKm ≤ MAX_SEARCH_RANGE_KM = 50` côté serveur ; **UI impose 30 km**), `categories?`, `overpassEnabled?` (défaut false). Le **corridor latéral** (`CORRIDOR_WIDTH_M = 3000`) est appliqué **serveur** — l'UI n'envoie pas de largeur. [Source: apps/api/src/pois/pois.controller.ts:27-31 ; dto/find-pois.dto.ts:8-49 ; packages/shared/src/constants/gpx.constants.ts]
- **RGPD** : aucune lat/lng user — seulement `segmentId` + km. [archi L795,#L948]
- Réponse `{ data: Poi[] }` (déballée par `apiFetch`).

### Gate de recherche (référence web)

- Web : `searchCommitted` (la requête `useQueries` est **gated** dessus) + `searchRangeInteracted` (le slider a bougé → invite à recommiter). Query hook web debounce 400 ms, **une query par (segment × calque)**, key `['pois', { segmentId, fromKm, toKm, layer, overpassEnabled }]`. Défauts `fromKm=0`, `toKm=15`. [Source: apps/web/src/hooks/use-pois.ts ; stores/map.store.ts]
- Contrôle UI web : `search-range-control.tsx` (à porter en `search-range-slider.tsx`). Corridor = `[fromKm, toKm]` (pas de rayon le long de la trace ; largeur latérale serveur).

### Réutilisation du code mobile existant

- **MOB-4.2** : `hooks/use-pois.ts` + `lib/api/pois.ts` (`findPois`) + `lib/cache/poi-cache.ts` + `poi-layer`/pins + `layer-toggles`. **MOB-4.3 finalise** `use-pois` (gate + plage).
- **MOB-4.1** : route map, caméra, `AdventureMapResponse`/`cumulativeStartKm` (pour le mapping km cumulés → segment).
- `src/components/ui/button.tsx` (« Rechercher »), `error-banner.tsx`, `skeleton.tsx`, `src/lib/cn.ts`, `src/lib/i18n`, `src/lib/format/distance` (`formatKm`).
- `react-native-gesture-handler` / `react-native-reanimated` (déjà présents) pour le slider range. `GestureHandlerRootView` déjà monté root.
- `src/hooks/use-network-status.ts` (recherche offline).

### Conventions

- **Cap 30 km** : impose l'epic mobile (le serveur tolère 50). Clamp à la poignée.
- Overlay **scopé carte** + bannières inline — jamais `Alert.alert`, jamais blocage plein écran. [archi §Loading L713-719]
- Tests hors `src/app/`, `userEvent`, mocks sans JSX. i18n FR/EN parité.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/components/ui/slider.tsx (+ slider.stories.tsx)
apps/mobile/src/components/map/search-range-slider.tsx
+ tests co-localisés (slider, search-range-slider, use-pois gate, km-mapping)
```
**Modifs** :
```
apps/mobile/src/hooks/use-pois.ts                (gate searchCommitted + fromKm/toKm + isEmpty)
apps/mobile/src/app/(app)/map/[id].tsx           (slider + overlay + bannières)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (bloc pois.search.*)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : slider range (cap 30 km), gate `searchCommitted`, `use-pois` finalisé (plage + enabled + isEmpty), overlay loading scopé, bannières « Aucun résultat »/erreur/offline, mapping km cumulés → segment(s), i18n, tests.
- **Exclu** : rendu pins/clusters/fiche (MOB-4.2) ; densité (MOB-4.4) ; booking (MOB-4.5) ; accès POI (MOB-4.6/4.7) ; météo (MOB-4.8) ; sous-filtre type hébergement (ultérieur).

### References

- [Source: epics-mobile.md#Story MOB-4.3 (l.751-770)] — AC d'origine (FR-030, FR-031) + cap 30 km
- [Source: apps/api/src/pois/pois.controller.ts:27-31 ; dto/find-pois.dto.ts:8-49] — `GET /pois` corridor
- [Source: packages/shared/src/constants/gpx.constants.ts] — `CORRIDOR_WIDTH_M=3000`, `MAX_SEARCH_RANGE_KM=50`
- [Source: apps/web/src/hooks/use-pois.ts ; stores/map.store.ts] — gate `searchCommitted`/`searchRangeInteracted`, query key, défauts 0/15
- [Source: architecture-mobile.md#L825,#L1037,#L1053-1054] — `search-range-slider.tsx`, `slider.tsx` + stories
- [Source: architecture-mobile.md#L795,#L948] — RGPD POI sans GPS
- [Source: _bmad-output/implementation-artifacts/MOB-4-2-poi-layers-pins-clusters-detail-sheet.md] — `use-pois`/`pois.ts`/cache (dépendance)
- [Source: _bmad-output/implementation-artifacts/MOB-4-1-maplibre-native-trace-themes-attribution.md] — carte + `cumulativeStartKm`

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Amelia / bmad-dev-story)

### Debug Log References

- **Tests jest depuis `apps/mobile`** : le runner doit tourner avec `apps/mobile` comme rootDir (babel/jsx + alias `@/`). Lancé depuis la racine → `SyntaxError: jsx isn't enabled` / type-import KO.
- **RNTL `render` doit être `await`** (pattern repo) : sinon `screen` non peuplé → « `render` function has not been called ». Helper `setup` rendu async.
- **Flake d'isolation (suite complète)** : `search-range-slider` test offline passait seul mais échouait en 4e position — la maj d'état post-`fireEvent.press` est flushée en microtâche (React 19). Fix : `findByText` (async) au lieu de `getByText`.
- **Lint React Compiler** : `react-hooks/refs` (pas d'accès ref en rendu) → slider recréé via closures fraîches (pas de `stateRef` lu en rendu) ; `react-hooks/set-state-in-effect` → effet de désélection POI (route) et reset offline (slider) convertis en logique render-phase / supprimés.
- **Validation device T8 — fix fit caméra** : MapLibre Native émettait `[ERROR] Unable to calculate appropriate zoom level for bounds. Vertical or horizontal padding is greater than map's height or width.` Cause : `fitBounds` (auto-fit trace hérité MOB-4.1) déclenché sur `onDidFinishLoadingStyle` AVANT que la surface native ait sa taille → padding 40px > taille carte. Fix : helper pur `safeFitPadding(w,h)` (clampe le padding sous la moitié de la plus petite dimension) + gate du fit sur `mapSize` mesuré via `onLayout` (`map-canvas.tsx`). Fit différé jusqu'à une taille valide, padding toujours sûr.

### Completion Notes List

- **T1** — `components/ui/slider.tsx` : primitive range double poignée (`PanResponder` + %), fonction pure `clampRange` (cap, écart min, bornes), a11y `adjustable` + actions increment/decrement. **Décision documentée** : pas de gesture-handler/reanimated (build Storybook). `slider.stories.tsx` (3 variantes).
- **T2** — `components/map/search-range-slider.tsx` : panneau slider `[fromKm,toKm]` + bouton « Rechercher » (gate), cap 30 km (`CORRIDOR_MAX_RANGE_KM`), message offline inline.
- **T3** — `hooks/use-pois.ts` finalisé : `resolveSegmentRanges` (cumulés → locaux par segment, AC5), `enabled` = gate, `isEmpty`/`isFetching` exposés, write-through/offline conservés.
- **T4** — `components/map/map-search-feedback.tsx` : overlay chargement + bannière « Aucun résultat » + ErrorBanner (présentiel pur, scopé carte, précédence fetching>error>empty).
- **T5** — route `map/[id].tsx` : état `fromKm/toKm/searchCommitted` lifté, slider + feedback câblés. `searchRangeInteracted` non lifté (sans consommateur mobile MVP — Doc Sync ci-dessus).
- **T6** — i18n `pois.search.*` FR/EN (parité, zéro chaîne en dur).
- **T7** — tests Jest/RNTL co-localisés. **Gate verte** : 313/313 tests (48 suites), tsc 0, lint 0, `expo export` iOS OK.
- **T8** — ⏳ validation device (Dev Client) : reste manuel Guillaume (MapLibre/SVG natifs → rebuild requis ; cf. AGENTS.md).

### File List

**Ajouts :**
- `apps/mobile/src/components/ui/slider.tsx`
- `apps/mobile/src/components/ui/slider.stories.tsx`
- `apps/mobile/src/components/ui/slider.test.tsx`
- `apps/mobile/src/components/map/search-range-slider.tsx`
- `apps/mobile/src/components/map/search-range-slider.test.tsx`
- `apps/mobile/src/components/map/map-search-feedback.tsx`
- `apps/mobile/src/components/map/map-search-feedback.test.tsx`

**Modifications :**
- `apps/mobile/src/hooks/use-pois.ts` (gate `enabled`, `resolveSegmentRanges`, `isEmpty`, `isFetching`)
- `apps/mobile/src/hooks/use-pois.test.tsx` (mapper, gate, isEmpty)
- `apps/mobile/src/app/(app)/map/[id].tsx` (état corridor lifté, slider + feedback, désélection render-phase)
- `apps/mobile/src/__tests__/map-screen.test.tsx` (test gate route)
- `apps/mobile/src/components/ui/icon.tsx` (`SearchIcon`)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (bloc `pois.search.*`)
- `apps/mobile/src/lib/map/maplibre-config.ts` (helper pur `safeFitPadding` — fix fit caméra T8)
- `apps/mobile/src/lib/map/__tests__/maplibre-config.test.ts` (tests `safeFitPadding`)
- `apps/mobile/src/components/map/map-canvas.tsx` (gate fit sur `mapSize`/`onLayout` + padding clampé — fix fit caméra T8)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.3 (ready-for-dev) — slider plage km double poignée (cap 30 km), gate `searchCommitted` (recherche au clic uniquement), `use-pois` finalisé (fromKm/toKm + enabled + isEmpty), overlay chargement scopé carte, bannière « Aucun résultat »/erreur/offline, mapping km cumulés → segment(s). `GET /pois` corridor réutilisé. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
| 2026-06-14 | 1.0 | Implémentation T1–T7 (status review). Primitive `slider` range maison (PanResponder, `clampRange` pur, a11y adjustable) + stories ; `search-range-slider` (cap 30 km, gate, offline) ; `use-pois` finalisé (`resolveSegmentRanges` AC5, `enabled`/`isEmpty`/`isFetching`) ; `map-search-feedback` (overlay/aucun résultat/erreur) ; route câblée (état lifté, désélection render-phase) ; i18n `pois.search.*` FR/EN ; `SearchIcon`. **Doc Sync** : `searchRangeInteracted` non lifté (sans consommateur mobile MVP). Gate : 313/313 tests, tsc 0, lint 0, expo export iOS OK. ⏳ T8 device validation manuelle (Guillaume). | claude-opus-4-8[1m] (Amelia) |
| 2026-06-14 | 1.1 | Fix remonté en validation device T8 : erreur MapLibre Native « padding is greater than map's height or width » au fit auto de la trace (`fitBounds` sur `onDidFinishLoadingStyle` avant que la surface native ait sa taille). Helper pur `safeFitPadding` (clampe le padding à la taille rendue) + gate du fit sur `mapSize` mesuré via `onLayout` dans `map-canvas.tsx`. Gate : 318/318 tests (+5), tsc 0, lint 0, expo export iOS OK. | claude-opus-4-8[1m] (Amelia) |
| 2026-06-14 | 2.4 | **Fix slider — cause finale** : après les itérations moveX/locationX/pageX, le slider « rampait » car le `PanResponder` était recréé à chaque `onChange` (re-rendu) → RN re-négociait le responder en plein drag → `onGrant` re-déclenché → `dx` remis à ~0. **Solution** : `PanResponder` créé **une seule fois** (init paresseuse `useState`, pas `useMemo([])` à cause de `preserve-manual-memoization`) + pattern « latest ref » (props courantes lues via une ref mise à jour en effet). Déplacement par `gesture.dx` relatif (insensible offsets/transforms/hit-test). Gesture jamais interrompu → glissement fluide. Gate : 343/343, tsc 0, lint 0. | claude-opus-4-8[1m] (Amelia) |
| 2026-06-14 | 2.3 | **Étapes — colorisation de la trace (remonté Guillaume)** : il manquait la recoloration du tracé par étape (le web colore chaque tronçon `[startKm,endKm]` avec `stage.color` ; on n'avait que les pastilles). Ajout : helper pur `buildStageColoredFeatures` + overlay `StageTraceLayer` (`GeoJSONSource`/`Layer` line, `line-color: ['get','color']`), rendu sous les pastilles `StageMarkers`, gated `stagesVisible`. Gate : 343/343 tests (+2), tsc 0, lint 0, expo export iOS OK. | claude-opus-4-8[1m] (Amelia) |
| 2026-06-14 | 2.2 | **Fix slider (remonté Guillaume — 2 itérations)** : (1) saut à droite au contact — `gesture.moveX` (X absolu écran) ÷ trackWidth, faux car piste pas en x=0 (drawer/marges) ; (2) comportement erratique gauche-droite — `locationX` change de repère selon l'enfant survolé (poignée vs piste). **Fix final** : `PanResponder` sur le conteneur + `evt.nativeEvent.pageX − trackLeft` où `trackLeft`/`trackWidth` sont mesurés via `measureInWindow` (callback `onLayout`). Repère **écran absolu stable** → insensible au hit-test et aux re-rendus. Range = poignée la plus proche. Ref de piste lue uniquement en callback (règle `react-hooks/refs` OK). Gate : 341/341 tests, tsc 0, lint 0. | claude-opus-4-8[1m] (Amelia) |
| 2026-06-14 | 2.1 | **Phase 2 livrée (full sidebar iso)** : cartes **Étapes** (CRUD complet — liste `StageCard`, dialogs création/édition/suppression, palette `STAGE_COLORS`, placement par tap sur la trace `onMapPress`→snap waypoint, marqueurs `StageMarkers`, hook `use-stages` mutations + `use-end-date-sync` stubbé), **Météo** (toggle, sélecteur dimension temp/pluie/vent, départ texte, overlay `WeatherLayer` ligne colorée + flèches vent, hook `use-weather` 1 query/segment gatée `weatherActive`, km cumulés), **Densité** (états idle/analyse/succès, `DensityCategoryDialog`, légende 3 niveaux, overlay `DensityLayer` tronçons 10 km colorés, hook `use-density` polling 3 s). Primitives neuves : `Switch`, `Dialog` (Modal RN). Façades : `density`, `weather`. Store : `stagesVisible`/`weatherActive`/`weatherDimension`/`densityColorEnabled`. **Tout en JS** (overlays = `GeoJSONSource`/`Layer`/`Marker` du module natif déjà installé) → validable par reload Metro, **pas de prebuild**. Suppression du code mort v1.0 (`search-range-slider`, `layer-toggles` + tests). Gate : 341/341 tests, tsc 0, lint 0, expo export iOS OK. **Déviations notées** : pas de drag-reorder d'étape (édition via liste) ; départ/dates en champ texte (pas de date-picker natif, évite un module natif) ; météo sans liste par-waypoint (overlay carte uniquement, iso web). | claude-opus-4-8[1m] (Amelia) |
| 2026-06-14 | 2.0 | **Pivot d'architecture (demande Guillaume — iso web)** : l'écran planning passe du « map-first + barre basse » au **shell drawer + cartes** du web (parité visuelle/UX exigée). Dépasse MOB-4.3 (couvre aussi Vitesse/Étapes/Météo/Densité → livré en 2 phases). **Phase 1** : 1er store Zustand mobile `useMapStore` (port iso `apps/web/stores/map.store.ts`) ; `PlanningSidebar` (drawer coulissant + backdrop + poignée) ; carte **Recherche** iso (position `fromKm` + largeur `rangeKm` → `toKm`, « À partir » étape, stats km·D+·D−, slider position±, `PoiLayerGrid`, sous-types hébergement + compteurs, « Rechercher sur » Booking/Airbnb via `Linking`) ; carte **Vitesse moyenne** (PATCH avgSpeed) ; `CorridorPill`. **Doc Sync** : (a) modèle slider remplacé — double-poignée `[from,to]` (v1.0) → **position+largeur** iso web ; (b) cap passé de **30 → 50 km** (`MAX_SEARCH_RANGE_KM` partagé, parité web) ; (c) `search-range-slider.tsx`/`layer-toggles.tsx` (v1.0) deviennent du code mort (remplacés par `search-range-control`/`poi-layer-grid`) — suppression en Phase 2. Façades neuves : `stages` (getStages), `geo` (reverse-city), `adventures.updateAdventureAvgSpeedKmh`. Gate Phase 1 : 332/332 tests (+14), tsc 0, lint 0, expo export iOS OK. **Phase 2 à venir** : cartes Étapes (CRUD), Météo, Densité (+ overlays carte) — couvre MOB-4.4→4.8. | claude-opus-4-8[1m] (Amelia) |
