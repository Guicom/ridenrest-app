---
baseline_commit: 71a6ec41ffc9046fa02918a06443b91c47d706e8
---

# Story MOB-4.7 : POI Access Routing — polyline carte, auto-zoom & invalidation

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur planifiant**,
I want **voir l'itinéraire d'accès tracé sur la carte et qu'il reste à jour**,
So that **je visualise concrètement le détour vers un hébergement**.

> **Dépend de MOB-4.6** (hook `use-access`, `selectedVariantIndex` lifté à l'écran carte) **et MOB-4.1** (carte + caméra). Cette story porte la **polyline d'accès sur la carte** (variante sélectionnée + variantes « fantômes »), l'**auto-zoom** sur le bbox accès+trace, l'**unicité** (une seule polyline à la fois) et l'**invalidation** des accès quand la trace change.
>
> **La géométrie provient de la MÊME query `use-access`** (`['poi-access', poiId, origin]`) que MOB-4.6 — **un seul fetch** partagé entre fiche et carte. **Précompute + invalidation backend déjà livrés** (BullMQ) — mobile **consomme** et **re-fetch** (pas de websocket/push).

## Acceptance Criteria

1. **Given** un POI dont l'itinéraire d'accès est disponible (`status === 'ok'`, `variants`)
   **When** je le sélectionne (tap pin / ouverture fiche)
   **Then** la **polyline de la variante sélectionnée** s'affiche **au-dessus de la trace principale**, style **magenta `#e6007e` pointillé** (`[2,2]`) avec un casing blanc, et les autres variantes en **« fantômes » gris pointillés** (`#9ca3af`, opacité ~0.55) tapables (FR-PA-007)
   **And** la carte effectue un **auto-zoom** (`fitBounds`, padding ~40, durée ~500 ms) sur le **bbox englobant toutes les variantes**, **une seule fois** par jeu de variantes (FR-PA-009)

2. **Given** une polyline d'accès affichée
   **When** je tape sur **un autre POI** ou **en dehors**
   **Then** une **seule polyline d'accès est visible à la fois** : un autre POI la remplace, un clic extérieur / fermeture de fiche la **masque** (FR-PA-008)
   **And** taper une variante **fantôme** la sélectionne (met à jour `selectedVariantIndex`, synchronisé avec les chips de la fiche MOB-4.6)

3. **Given** une variante sélectionnée dans la fiche (chips MOB-4.6)
   **When** je change de variante
   **Then** la **polyline** affichée change en conséquence (sélection **partagée** via `selectedVariantIndex` lifté écran) — fiche et carte restent synchronisées

4. **Given** une **modification de trace** (ajout/suppression/remplacement de segment) ou de profil
   **When** elle est appliquée
   **Then** les itinéraires d'accès rattachés sont **invalidés** côté client (invalidation des queries `['poi-access', …]`) et re-calculés à la prochaine consultation (FR-PA-015/016/017 ; le recompute d'arrière-plan est backend) — la polyline obsolète n'est pas conservée

5. **Given** un changement de **thème** (light/dark) qui recharge le style de carte
   **When** il survient
   **Then** la polyline d'accès est **ré-appliquée** (les couches custom détruites par un reload de style sont reconstruites — robustesse `styledata`), sans doublon

## Tasks / Subtasks

- [x] **T1 — `components/poi-access/access-map-layer.tsx`** (AC: 1, 2, 5)
  - [x] Source GeoJSON `poi-access` = `FeatureCollection` (une feature par variante, `properties.idx`). 3 couches (bas→haut), parité web :
    - `poi-access-ghost` — variantes non sélectionnées : gris `#9ca3af`, width 3, **dasharray [2,2]**, opacité 0.55, **tapable → onSelect(idx)**.
    - `poi-access-casing` — casing blanc `#ffffff` sous la sélection, width 7, opacité 0.9.
    - `poi-access-line` — variante sélectionnée : **magenta `#e6007e`**, width 4, **dasharray [2,2]**, opacité 1, cap/join round.
  - [x] **Insérée au-dessus de la trace, sous les pins POI** : `afterId` chaîné (`ghost`→`trace-line`, `casing`→`ghost`, `line`→`casing`) → empilement déterministe ; montée AVANT `<PoiLayer>` dans `MapCanvas` (pins au sommet). Une **seule** polyline sélectionnée via **filtre `idx`** (prop `filter`), update par `data` déclaratif (pas remove/add).
  - [x] **Robustesse reload style (AC5)** : le modèle **déclaratif** de `@maplibre/maplibre-react-native` ré-attache automatiquement source+couches au reload de style (parité densité/étapes/corridor) — pas besoin de gestion `styledata` impérative (différence assumée vs web). MapLibre dédoublonne par `id` → pas de doublon.
  - [x] Géométrie : `AccessVariant.geometry` (GeoJSON `LineString|MultiLineString`, `[lon,lat]`). Normalisation MultiLineString + **filtrage coordonnées non finies au niveau du point** (`isValidLngLat`, anti-SIGABRT natif) + re-check `≥ 2` points par ligne.

- [x] **T2 — Auto-zoom (fitBounds once)** (AC: 1)
  - [x] `computeAccessBounds(variants)` (bbox englobant toutes les variantes) → `mapRef.current.fitToBounds()` (`MapCanvasHandle`, padding clampé `safeFitPadding` ~40, durée 500 ms). **Une seule fois par jeu de variantes distinct** (`lastZoomedAccessRef`, parité web `lastZoomedRef`). Changer de variante NE re-zoome PAS (deps `[accessVariants]`).
  - [x] Factorisation MOB-4.1 : `computeAccessBounds` réutilise `computeTraceBounds`/`computeBoundingBox` (`@ridenrest/gpx`) sur les coords d'accès.

- [x] **T3 — Branchement écran carte + unicité** (AC: 1, 2, 3)
  - [x] La géométrie vient de `useAccess(selectedPoiId, { type:'nearest-trace' })` (**même query** que MOB-4.6 → dédup TanStack, un seul fetch partagé fiche↔carte). `<AccessMapLayer variants selectedIndex onSelect />` monté dans `MapCanvas`, piloté par `selectedPoiId` + `selectedVariantIndex` **liftés écran** (MOB-4.2/4.6).
  - [x] **Unicité (AC2)** : POI non-hébergement / fiche fermée → `poiId === ''` → query off → `accessVariants = null` → pas de polyline. Changer de POI → nouvelle queryKey → l'ancienne polyline disparaît, la nouvelle apparaît. Tap variante fantôme → `setSelectedVariantIndex(idx)` (synchronise les chips fiche).
  - [x] Reset `selectedVariantIndex = 0` au changement de `selectedPoiId` (déjà en place MOB-4.6, pattern « ajuster l'état au rendu »).

- [x] **T4 — Invalidation client sur changement de trace** (AC: 4)
  - [x] Invalidation **ciblée** `['poi-access']` dans les `onSuccess`/`onSettled` des mutations trace de `use-segments` : `useUploadSegment` (ajout), `useDeleteSegment` (suppression), `useReorderSegments` (réordre de la trace fusionnée). `useRenameSegment` exclu (le nom ne change pas la géométrie). Recompute d'arrière-plan = **backend** (BullMQ, event `adventure.trace-updated`) ; mobile re-fetch seulement.
  - [x] Branchée dans les handlers de mutation (jamais en boucle, jamais globale) → pas de tempête d'invalidation (leçon MOB-3.5).

- [x] **T5 — i18n + a11y** (AC: 1, 2)
  - [x] Clés a11y `pois.access.polylineA11y` + `pois.access.ghostVariantA11y` ajoutées FR/EN (parité). NB : un calque ligne MapLibre Native n'expose pas de nœud a11y RN — clés déclarées pour parité/futur.

- [x] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [x] `computeAccessBounds` + `buildAccessFeatureCollection` (purs) : bbox correct, idx d'origine préservé, filtrage coords non finies, normalisation MultiLineString.
  - [x] `access-map-layer` (mock MapLibre) : 3 couches construites ; rien si `variants` null/vide/dégénéré. Filtre `idx` + tap ghost → `onSelect(idx)` testés via helpers purs (`ghostFilter`/`selectedFilter`/`extractTappedVariantIndex`) car le mock ne transmet ni `filter` ni `onPress`.
  - [x] Invalidation : upload/suppression/réordre → `invalidateQueries(['poi-access'])` (ciblé) ; rename → PAS d'invalidation. Pas de boucle.
  - [x] Gate : `test` (443/443, 67 suites) · `typecheck` 0 · `lint` 0 · `expo export` iOS OK.

### Review Findings

- [x] [Review][Decision→Patch] **F1 — `afterId="trace-line"` : crash potentiel si données d'accès en cache TanStack mais aucun segment rendu** — Guard `hasTrace` ajouté dans `[id].tsx` : `accessVariants` n'est passé non-null que si `readySegments.length > 0`. [`apps/mobile/src/app/(app)/map/[id].tsx`]
- [x] [Review][Decision→Dismiss] **F2 — Ghost tap : wiring `handlePress → onSelect` non couvert par les tests automatisés** — Couverture actuelle acceptée : helper pur `extractTappedVariantIndex` testé, câblage trivial, pattern documenté dans le fichier test.
- [x] [Review][Patch] **F3 — `extractTappedVariantIndex` : utiliser `Number.isInteger` au lieu de `typeof idx === 'number'`** — `typeof NaN === 'number'` est `true`. Si MapLibre Native sérialise une propriété corrompue, la valeur pourrait passer le guard et sélectionner un index invalide. [`apps/mobile/src/lib/map/access-features.ts`]
- [x] [Review][Patch] **F4 — `buildAccessFeatureCollection` : aucun guard pour type géométrie inconnu** — Si `geometry.type` n'est ni `'LineString'` ni `'MultiLineString'` (type futur ou corruption), le `forEach` tombe dans la branche MultiLineString et appelle `.map()` sur `geometry.coordinates` qui peut ne pas être un tableau de tableaux. Ajout `if (geometry.type !== 'MultiLineString') return;` avant le bloc MultiLineString. [`apps/mobile/src/lib/map/access-features.ts`]
- [x] [Review][Patch] **F5 — `ACCESS_QUERY_PREFIX` dupliqué dans `use-segments.ts`** — La constante `['poi-access']` est désormais exportée depuis `use-access.ts` et importée dans `use-segments.ts`. [`apps/mobile/src/hooks/use-segments.ts`]
- [x] [Review][Defer] **F6 — `lastZoomedAccessRef` re-zoom sur background refetch** — Après invalidation via `useUploadSegment`/`useDeleteSegment`/`useReorderSegments`, TanStack retourne un nouvel objet même si les données d'accès sont identiques → identité référentielle brisée → re-zoom non souhaité si l'utilisateur avait pané la carte. Parité web (même pattern `lastZoomedRef`), trade-off accepté en l'état. [`apps/mobile/src/app/(app)/map/[id].tsx:323-335`] — deferred, parité comportement web intentionnelle

- [ ] **T7 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client (Guillaume)
  - [ ] Sélectionner un hôtel → polyline magenta + casing + fantômes gris, auto-zoom une fois.
  - [ ] Tap autre POI → l'ancienne polyline disparaît, nouvelle apparaît. Clic extérieur / fermer fiche → masquée.
  - [ ] Changer de variante (chips fiche) → la polyline suit. Tap variante fantôme → devient sélectionnée + chips synchro.
  - [ ] Ajouter/supprimer un segment puis rouvrir un POI → accès recalculé (pas l'ancien). Basculer thème → polyline réaffichée sans doublon.

## Dev Notes

### Géométrie & couches (référence web → MapLibre Native)

- `AccessMapLayer.tsx` (web) : source `poi-access-source` (1 feature/variante, `properties.idx`), 3 couches `ghost`/`casing`/`line`. **Sélection unique** via `setFilter` sur `idx` ; `setData` pour update. Insérée **avant la 1ʳᵉ couche de pins** (entre trace et pins). `fitBounds(computeBounds(variants), { padding:40, duration:500 })` **une fois** (`lastZoomedRef`). Ré-applique sur `styledata` (reload style détruit les couches custom). [Source: apps/web/src/components/poi-access/AccessMapLayer.tsx]
- **Couleur ligne sélectionnée = magenta `#e6007e`** (l'archi disait amber `#f59e0b` — le **code actuel est magenta**, cohérent avec l'accent des chips MOB-4.6). Ghost gris `#9ca3af` dash [2,2] op .55 ; casing blanc width 7. [Source: rapport agent §7]
- Géométrie = **GeoJSON** (pas polyline encodée), coords `[lon,lat]`, `LineString|MultiLineString` (le segment divergent peut être fragmenté), simplifiée serveur (~5 m). [Source: packages/shared/src/schemas/poi-access.ts:55-65]
- **`LiveAccessPolyline.tsx`** (web) = wrapper `useAccess` + `AccessMapLayer fitOnShow=false` (la caméra GPS pilote en Live). Ici Planning → `fitOnShow=true`. (Live = epic MOB-5.)

### Sélection partagée (fiche ↔ carte)

- `selectedVariantIndex` est **lifté à l'écran carte** (déjà introduit en MOB-4.6) et passé **à la fois** à `AccessMetrics` (chips) et `AccessMapLayer` (polyline) → synchro garantie. Reset au changement de POI. [Source: apps/web map-view.tsx ; rapport agent §6-7]

### Invalidation (backend déjà câblé — mobile re-fetch)

- Backend : `@OnEvent('adventure.trace-updated')` réinitialise l'accès **pour toute l'aventure** (origine `nearest-trace` = trace fusionnée) + re-enqueue (segment ajouté/supprimé). `adventure.profile-changed` idem (même si le profil n'affecte plus le routage). Invalidation version = lazy (`ACCESS_ENGINE_VERSION` vérifié au cache-hit). [Source: apps/api/src/pois/access-worker/access-worker.service.ts ; rapport agent §8]
- **Pas de push/websocket** → mobile invalide `['poi-access']` après une mutation de trace et re-fetch. Un 1ᵉʳ accès post-changement peut être `computed-fresh` (lent) → skeleton MOB-4.6 tient. **Invalidation ciblée** `['poi-access']` (éviter la tempête d'invalidation, leçon MOB-3.5).

### Réutilisation du code mobile existant

- **MOB-4.6** : `use-access` (query partagée), `selectedVariantIndex` lifté, `AccessVariant`/`AccessResponse` (`@ridenrest/shared`).
- **MOB-4.1** : `map-canvas` (children/caméra), `computeBoundingBox` (`@ridenrest/gpx`) pour le bbox, helpers fit.
- **MOB-4.2** : `selectedPoiId` lifté, `poi-detail-sheet` (fermeture → masque polyline).
- `src/hooks/use-segments.ts` (mutations trace → déclencheur d'invalidation). `@tanstack/react-query` (`useQueryClient.invalidateQueries`).

### Conventions

- Couleurs polyline = inline / expressions MapLibre. Ré-appliquer sur `styledata`. Invalidation **ciblée**. Tests hors `src/app/`, `userEvent`, mock MapLibre. i18n FR/EN parité.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/components/poi-access/access-map-layer.tsx
+ tests co-localisés (access-map-layer, computeBounds, invalidation)
```
**Modifs** :
```
apps/mobile/src/app/(app)/map/[id].tsx   (monter AccessMapLayer, unicité, auto-zoom, invalidation trace)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (labels a11y polyline)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : polyline magenta + casing + fantômes gris tapables, auto-zoom once, unicité (1 polyline), synchro `selectedVariantIndex` fiche↔carte, invalidation client `['poi-access']` sur changement de trace, robustesse reload style. i18n a11y, tests.
- **Exclu** : fiche/métriques/variantes (MOB-4.6) ; precompute/invalidation backend (déjà serveur) ; Live (camera GPS, `fitOnShow=false`) → **MOB-5** ; profil de routage (obsolète).

### References

- [Source: epics-mobile.md#Story MOB-4.7 (l.840-863)] — AC d'origine (FR-PA-007/008/009/014/015/016/017)
- [Source: apps/web/src/components/poi-access/AccessMapLayer.tsx, LiveAccessPolyline.tsx] — couches/polyline/fitBounds à porter
- [Source: packages/shared/src/schemas/poi-access.ts:55-92] — `AccessVariant.geometry` GeoJSON `[lon,lat]`
- [Source: apps/api/src/pois/access-worker/access-worker.service.ts] — invalidation backend (trace-updated)
- [Source: architecture-poi-access-routing.md] — architecture (polyline = couleur actuelle magenta vs amber doc)
- [Source: _bmad-output/implementation-artifacts/MOB-4-6-poi-access-routing-sheet-profile.md] — `use-access` + `selectedVariantIndex` (dépendance)
- [Source: _bmad-output/implementation-artifacts/MOB-4-1-maplibre-native-trace-themes-attribution.md] — caméra/bbox/fit

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / bmad-dev-story)

### Debug Log References

- Échec initial des tests `access-map-layer` : `render function has not been called`. Cause : sous RNTL v14 + React 19, `render()` est asynchrone — il faut `await render(...)` pour que `screen` soit peuplé (parité `poi-layer.test.tsx`). Corrigé en passant les `it()` en `async` + `await render`.

### Completion Notes List

- **T1 — `access-map-layer.tsx` (déclaratif)** : contrairement au web (impératif `addLayer`/`setFilter`/`styledata`), le mobile rend une `<GeoJSONSource>` + 3 `<Layer>` déclaratifs enfants du `<Map>` (gate `styleLoaded` de `MapCanvas`). Ordre interne garanti par `afterId` chaîné (ghost→`trace-line`, casing→ghost, line→casing). Sélection isolée par prop `filter` sur `idx` (pas de remove/add).
- **AC5 (reload de style)** : satisfait **par construction** via le modèle déclaratif (la lib ré-attache source+calques au reload, comme densité/étapes/corridor déjà en prod) — pas de handler `styledata` impératif. Différence assumée vs web, documentée dans le composant.
- **T2 — auto-zoom** : `computeAccessBounds` (réutilise `computeTraceBounds`/`computeBoundingBox` `@ridenrest/gpx`) → `mapRef.fitToBounds`. `lastZoomedAccessRef` garantit un fit unique par jeu de variantes (référence stable par entrée de cache TanStack). Le changement de variante ne re-zoome pas.
- **T3 — un seul fetch partagé** : `useAccess(selectedPoiId, nearest-trace)` lifté à l'écran utilise la MÊME queryKey `['poi-access', poiId, origin]` que `AccessMetrics` (fiche) → dédup TanStack, un seul HTTP. Gate accommodation + `poiId === ''` (fiche fermée) → query off → unicité AC2.
- **T4 — invalidation ciblée** : `['poi-access']` invalidée dans `useUploadSegment`/`useDeleteSegment`/`useReorderSegments` (mutations qui changent la géométrie de trace). `useRenameSegment` exclu. Jamais globale, jamais en boucle (leçon MOB-3.5). Recompute d'arrière-plan = backend (BullMQ).
- **T5 — a11y** : clés `polylineA11y`/`ghostVariantA11y` FR/EN. Un calque ligne MapLibre Native n'expose pas de nœud a11y RN → clés déclarées pour parité/futur.
- **Crash-safety natif** : toutes les coords d'accès filtrées par `isValidLngLat` au niveau du point + re-check `≥ 2` (anti-SIGABRT MapLibre Native).
- **Gate** : `npx jest` 443/443 (67 suites) · `tsc --noEmit` 0 · `eslint` 0 · `expo export --platform ios` OK (bundle 8.3 MB).
- **Reste manuel (T7, Guillaume)** : validation Dev Client (polyline magenta + fantômes + auto-zoom, unicité, synchro chips, invalidation après ajout/suppression segment, bascule thème). Tout JS (aucun module natif ajouté) → **pas de prebuild requis**, validable via `pnpm sim`.

### File List

**Ajouts :**
- `apps/mobile/src/lib/map/access-features.ts`
- `apps/mobile/src/lib/map/access-features.test.ts`
- `apps/mobile/src/components/poi-access/access-map-layer.tsx`
- `apps/mobile/src/components/poi-access/access-map-layer.test.tsx`

**Modifications :**
- `apps/mobile/src/app/(app)/map/[id].tsx` (useAccess lifté, accessVariants, auto-zoom once, montage `<AccessMapLayer>`)
- `apps/mobile/src/hooks/use-segments.ts` (invalidation ciblée `['poi-access']` sur upload/delete/reorder)
- `apps/mobile/src/hooks/use-segments.test.tsx` (tests invalidation `['poi-access']`)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (clés a11y polyline)
- `_bmad-output/implementation-artifacts/MOB-4-7-poi-access-polyline-autozoom-invalidation.md` (frontmatter baseline + suivi)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.7 (ready-for-dev) — `access-map-layer` (3 couches : ghost gris pointillé tapable / casing blanc / ligne magenta `#e6007e` pointillée), auto-zoom `fitBounds` once sur bbox variantes, unicité (1 polyline), synchro `selectedVariantIndex` fiche↔carte, invalidation client ciblée `['poi-access']` sur mutation de trace, robustesse reload style (`styledata`). Géométrie partagée via `use-access`. i18n a11y FR/EN, tests. | bmad-create-story (Story Context Engineer) |
| 2026-06-27 | 1.0 | Implémentation T1-T6 (status review). `access-map-layer.tsx` **déclaratif** (GeoJSONSource + 3 Layer, `filter` sur `idx`, `afterId` chaîné, anti-SIGABRT `isValidLngLat`) ; helpers purs `access-features.ts` (`buildAccessFeatureCollection`/`computeAccessBounds`/filtres/extract). Écran carte : `useAccess` lifté (même query que la fiche → 1 fetch), auto-zoom once (`lastZoomedAccessRef`), montage `<AccessMapLayer>` avant `<PoiLayer>`. Invalidation ciblée `['poi-access']` sur upload/delete/reorder (`use-segments`), rename exclu. AC5 par modèle déclaratif (pas de `styledata` impératif — différence assumée vs web). i18n a11y FR/EN. Gate : 443/443 tests (67 suites) · tsc 0 · lint 0 · expo export iOS OK. ⏳ T7 validation Dev Client (Guillaume) — tout JS, pas de prebuild. | bmad-dev-story (Amelia) |
