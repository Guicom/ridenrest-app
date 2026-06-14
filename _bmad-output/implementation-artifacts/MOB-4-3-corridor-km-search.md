# Story MOB-4.3 : Recherche par corridor kilométrique

Status: ready-for-dev

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

- [ ] **T1 — Primitive `components/ui/slider.tsx` (double poignée) ou lib** (AC: 1)
  - [ ] Évaluer : `@react-native-community/slider` (mono-poignée, ne couvre PAS une plage A→B) vs une primitive **range** (double poignée) basée sur `react-native-gesture-handler` + `react-native-reanimated` (déjà présents). L'archi prévoit `components/ui/slider.tsx + slider.stories.tsx` + `components/map/search-range-slider.tsx`. **Recommandation** : primitive range maison (gesture-handler/reanimated) — pas de nouvelle dép, contrôle du cap. Documenter le choix.
  - [ ] Storybook `slider.stories.tsx` (cette primitive **a** des stories, contrairement aux composants natifs lourds — archi L1053-1054). Variantes : default, min/max, valeurs.
  - [ ] A11y : `accessibilityRole="adjustable"`, `accessibilityValue={{ min, max, now }}`, increment/decrement via `accessibilityActions` (gestes a11y).

- [ ] **T2 — `components/map/search-range-slider.tsx`** (AC: 1, 2)
  - [ ] Slider plage `[fromKm, toKm]` (km cumulés aventure), bornes `[0, totalDistanceKm]`. **Cap 30 km** sur `(toKm - fromKm)` : empêcher l'écartement au-delà (clamp à la poignée déplacée). Afficher « km A → km B » + l'étendue.
  - [ ] Bouton **« Rechercher »** (réutiliser `Button`), **désactivé** si plage invalide (toKm ≤ fromKm). Clic → `setSearchCommitted(true)`.
  - [ ] Tout déplacement de poignée → `setSearchRangeInteracted(true)` + **n'arme PAS** la requête (le gate `searchCommitted` reste la seule porte). Parité web : `searchCommitted` / `searchRangeInteracted`.
  - [ ] Défauts parité web : `fromKm = 0`, `toKm = 15` (≤ cap 30).

- [ ] **T3 — Finaliser `hooks/use-pois.ts` (gate + plage)** (AC: 1, 2, 3, 4)
  - [ ] Param `fromKm`, `toKm`, `enabled: searchCommitted` (la requête ne part que committée). À chaque nouvelle recherche, query key change (`fromKm/toKm`) → refetch ; sinon, cache.
  - [ ] Exposer `isFetching` (→ overlay T4), `data` (pins), `isError` (→ ErrorBanner), et `isEmpty = committed && !isFetching && data?.length === 0` (→ bannière « Aucun résultat »).
  - [ ] Conserver le write-through `poi-cache` (MOB-4.2). Le gate ne casse pas l'offline (cache lu indépendamment).
  - [ ] **Résolution multi-segments (AC5)** : mapper `[fromKm, toKm]` (cumulés) → `segmentId` + km locaux. Réutiliser les `cumulativeStartKm` de `AdventureMapResponse`/segments. Au MVP, si la plage chevauche plusieurs segments, lancer une requête par segment couvert (parité `useQueries` web par segment × calque) et fusionner les pins.

- [ ] **T4 — Overlay de chargement scopé carte + bannières** (AC: 2, 3, 4)
  - [ ] Overlay `isFetching` : voile semi-opaque **sur la zone carte uniquement** + `<ActivityIndicator />` ou `<Skeleton />`. **Jamais** plein écran bloquant (archi). N'empêche pas de fermer le slider.
  - [ ] Bannière « Aucun résultat » (`isEmpty`) : composant scopé carte (réutiliser le style `bg-…/10` + texte i18n), dismissable. **Distincte** de l'erreur réseau.
  - [ ] `<ErrorBanner />` (`isError`) scopé carte + relance possible (« Rechercher »).

- [ ] **T5 — Intégration route map** (AC: 1, 2, 3, 4, 5)
  - [ ] Monter `search-range-slider` (overlay bas/haut de carte, au-dessus des toggles ou en panneau). Lifter `fromKm/toKm/searchCommitted/searchRangeInteracted` à la route (cohérent avec `visibleLayers`/`selectedPoiId` de MOB-4.2).
  - [ ] Brancher overlay/bannières sur les flags de `use-pois`.
  - [ ] Désactiver le slider/bouton si `!isOnline` ? Non — autoriser la consultation des pins cachés ; mais une **nouvelle recherche** offline doit afficher un message « hors-ligne » (réutiliser `useNetworkStatus`).

- [ ] **T6 — i18n (FR + EN)** (AC: 1, 2, 3, 4)
  - [ ] Bloc `pois.search.*` (parité) :
    - `pois.search.range` (« km {{from}} → km {{to}} ») / `pois.search.button` (« Rechercher »)
    - `pois.search.capHint` (« Plage max 30 km »)
    - `pois.search.loading` (a11y overlay)
    - `pois.search.noResults` (« Aucun POI dans cette plage — élargissez ou déplacez la zone »)
    - `pois.search.error` (ErrorBanner)
    - `pois.search.offline` (« Recherche indisponible hors-ligne »)
  - [ ] Slider a11y labels (`pois.search.fromHandleA11y` / `toHandleA11y`). **Zéro chaîne en dur**.

- [ ] **T7 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [ ] Slider range (pur/logique) : clamp cap 30 km ; `toKm > fromKm` ; bouton désactivé si invalide.
  - [ ] `use-pois` gate : requête **non** lancée tant que `searchCommitted=false` ; lancée au commit ; `isEmpty` vrai si committé + 0 résultat ; refetch sur changement `fromKm/toKm`.
  - [ ] Résolution multi-segments : `[fromKm,toKm]` cumulés → bons `segmentId`/km (test pur sur le mapper).
  - [ ] `search-range-slider` : déplacer poignée → `searchRangeInteracted=true` mais **aucun** appel réseau ; clic « Rechercher » → commit. Overlay visible si `isFetching` ; bannière « Aucun résultat » si `isEmpty` ; `ErrorBanner` si `isError`. (`userEvent`)
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` OK.

- [ ] **T8 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client
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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.3 (ready-for-dev) — slider plage km double poignée (cap 30 km), gate `searchCommitted` (recherche au clic uniquement), `use-pois` finalisé (fromKm/toKm + enabled + isEmpty), overlay chargement scopé carte, bannière « Aucun résultat »/erreur/offline, mapping km cumulés → segment(s). `GET /pois` corridor réutilisé. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
