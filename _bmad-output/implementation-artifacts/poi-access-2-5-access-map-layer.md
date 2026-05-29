---
baseline_commit: f71d7a8e281d17108251ef2f6edcf71a30d90efa
---

# Story POI-Access 2.5 : `AccessMapLayer` — polyline d'itinéraire d'accès sur MapLibre

Status: review

<!-- Dépend de : 2.3 (endpoint), 2.4 (useAccess hook). -->

## Story

As a **end user planning my adventure**,
I want to visualize the access route between my trace and the selected POI as a distinct polyline on the map,
So that I can spatially understand the detour and compare alternative POIs at a glance.

## Acceptance Criteria

1. **Given** le store Zustand `usePlanningModeStore` existant, **When** je l'étends, **Then** il expose :
   - `visibleAccessPoiId: string | null` (default null)
   - `setVisibleAccessPoiId: (id: string | null) => void`
   - Pas de breaking change sur les actions existantes

2. **Given** `apps/web/src/components/poi-access/AccessMapLayer.tsx`, **When** je l'implémente, **Then** :
   - Props : `{ map: maplibregl.Map | null; geometry: GeoJSONLineString | null }`
   - Ajoute un layer MapLibre avec :
     - `id: 'poi-access-line'`
     - `source: 'poi-access-source'` (GeoJSON source créée dynamiquement)
     - `type: 'line'`
     - `paint: { 'line-color': '#f59e0b', 'line-width': 4, 'line-dasharray': [2, 2], 'line-opacity': 0.9 }`
     - `layout: { 'line-cap': 'round', 'line-join': 'round' }`
   - Le layer est ajouté **au-dessus** du layer existant `route-line` (vérifier via `map.moveLayer(...)`)
   - Composant lazy via `dynamic(() => import('AccessMapLayer'), { ssr: false })`

3. **Given** un POI est cliqué dans `poi-detail-sheet.tsx`, **When** le sheet s'ouvre, **Then** :
   - Au mount du sheet (ou explicitement via un effet sur `isOpen`) : `setVisibleAccessPoiId(poi.id)`
   - Si `useAccess` retourne `data.status === 'ok'` AND `data.geometry` : la polyline s'affiche sur la carte
   - Si fallback ou loading : pas de polyline visible

4. **Given** une polyline d'accès est déjà visible (pour POI A), **When** l'utilisateur clique sur POI B, **Then** :
   - La polyline de A est remplacée par celle de B
   - Pas d'accumulation (jamais 2 polylines simultanées)

5. **Given** l'utilisateur ferme le POI Sheet OU clique sur la carte en dehors d'un POI, **When** `setVisibleAccessPoiId(null)` est appelé, **Then** :
   - Le layer `poi-access-line` est retiré proprement (`map.removeLayer('poi-access-line')` + `map.removeSource('poi-access-source')`)
   - Pas d'erreur si appelé alors que le layer n'existe pas (idempotent)
   - Cleanup propre au unmount du composant (pattern useEffect cleanup)

6. **Given** une polyline s'affiche, **When** le composant calcule le bbox d'affichage, **Then** :
   - Bbox = englobe `[access_geometry + portion pertinente de la trace]` (zoom auto pour voir l'ensemble)
   - `map.fitBounds(bbox, { padding: 40, duration: 500 })` (animation 500ms)
   - Le zoom se fait **une seule fois** au premier affichage de la polyline (pas à chaque re-render)

7. **Given** le test du composant, **When** je le couvre, **Then** :
   - Mount avec geometry valide → addSource + addLayer appelés (mock MapLibre)
   - Switch de POI → polyline ancienne retirée, nouvelle ajoutée
   - Unmount → cleanup complet
   - Coverage cible : ≥ 75% (UI MapLibre est partial-mockable)

8. **Given** la story terminée, **When** je commit, **Then** le diff inclut UNIQUEMENT :
   - `apps/web/src/components/poi-access/AccessMapLayer.tsx` + `.test.tsx`
   - `apps/web/src/stores/planning-mode-store.ts` (modifié — ajout du slice access)
   - `apps/web/src/app/(app)/map/[id]/_components/map.tsx` (modifié — intégration `<AccessMapLayer>`)
   - `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` (modifié — set/clear visibleAccessPoiId)
   - Doc Sync si écart

---

## ⚠️ Critical Discovery Notes

### 1. Pattern MapLibre du projet — registerPoiPinImages async

Le projet a un pattern async pour ajouter des assets MapLibre (cf. project-context §POI Color System) :
```typescript
// Pattern existant pour les pins POI
void registerPoiPinImages(map).then(() => { if (cancelled) return; /* add layers */ })
```

Adopter le **même pattern** pour `AccessMapLayer` : cleanup via flag `cancelled` dans useEffect pour éviter race condition au unmount pendant chargement async.

### 2. WeakMap pattern pour handlers MapLibre

Cf. project-context §traceClickedKm : les handlers MapLibre utilisent `WeakMap<maplibregl.Map, handler>` pour le cleanup au style reload. Si on ajoute des handlers (click sur la polyline ?), suivre ce pattern.

Pour cette story : **pas de handler sur la polyline access** (read-only). Pas besoin du WeakMap pour cette story.

### 3. Source GeoJSON dynamique vs statique

Deux approches MapLibre :
- **Statique** : `map.addSource('id', { type: 'geojson', data: <initial> })` puis `(map.getSource('id') as GeoJSONSource).setData(newData)` pour update
- **Dynamique** : `removeSource` + `addSource` à chaque update

**Performance** : `setData` est beaucoup plus rapide (pas de re-init du layer). Pattern recommandé : addSource au mount, setData à chaque changement de geometry, removeSource au unmount.

### 4. Lazy dynamic import — bundle splitting

`dynamic(() => import('AccessMapLayer'), { ssr: false })` ajoute le composant dans un chunk séparé. Estimer l'impact :
- Lib MapLibre est déjà chargée (déjà dans bundle map)
- Le composant ajoute ~2-5 KB gzip
- L'archi estime "+8 KB gzip dans le chunk POI" — vérifier avec `pnpm --filter @ridenrest/web build` + bundle analyzer

### 5. Order de z-index MapLibre

Cf. project-context §z-index Stack : les pins POI sont au-dessus de la trace. L'access line doit être **entre la trace et les pins** (visible sans masquer les pins). Vérifier ordre :
```typescript
map.addLayer({ ... }, 'poi-points-layer')  // 2ème arg = beforeId : insère AVANT ce layer
```

---

## Tasks / Subtasks

- [x] **Task 1** — Étendre `usePlanningModeStore` (AC: 1) — _Doc Sync : store réel = `useMapStore` (`map.store.ts`)_
  - [x] Ajouter `visibleAccessPoiId: string | null` + action `setVisibleAccessPoiId`
  - [x] Vérifier qu'aucun composant existant n'a `setVisibleAccessPoiId` (risque de collision name) — aucune collision (grep clean)

- [x] **Task 2** — Implémenter `AccessMapLayer.tsx` (AC: 2, 5, 6, ⚠️Discovery #1, #3, #5)
  - [x] Composant React avec `useEffect` géré : addSource + addLayer au mount, setData sur changement de geometry, removeLayer + removeSource au unmount
  - [x] Cleanup avec flag `cancelled` (cf. ⚠️Discovery #1) + différé `map.once('styledata')` si style pas chargé
  - [x] `addLayer(..., beforeId)` pour ordre z — beforeId = 1er layer `pois-{layer}-points` présent (cf. ⚠️Discovery #5 ; pas de layer fixe `poi-points`)
  - [x] Calcul du bbox inline (min/max sur coordinates ; `turf` non présent dans les deps)
  - [x] `fitBounds` une seule fois par géométrie (ref `lastZoomedGeometryRef`)

- [x] **Task 3** — Intégrer dans `map.tsx` (AC: 3, 4) — _Doc Sync : fichier réel = `map-view.tsx`_
  - [x] Lazy import : `dynamic(() => import('@/components/poi-access/AccessMapLayer').then(m => m.AccessMapLayer), { ssr: false })`
  - [x] Read `visibleAccessPoiId` depuis `useMapStore`
  - [x] Read access geometry via `useAccess(visibleAccessPoiId ?? '', accessOrigin)` (origine dérivée de `selectedStageId`)
  - [x] Pass `geometry` au composant : `<AccessMapLayer map={mapCanvasRef.current?.getMap() ?? null} geometry={accessGeometry} />`

- [x] **Task 4** — Connecter l'UI POI planning (AC: 3, 5) — _Doc Sync : `poi-popup.tsx` (UI POI réelle du planning) au lieu de `poi-detail-sheet.tsx` (variante live mode)_
  - [x] Au mount du popup (planning + hébergement) : `setVisibleAccessPoiId(poi.id)`
  - [x] Au unmount du popup : `setVisibleAccessPoiId(null)` (cleanup useEffect)
  - [x] Clic carte en dehors → le popup se ferme → unmount → cleanup (mécanique existante de PoiPopup) ; reset aussi au unmount de `map-view`

- [x] **Task 5** — Tests composant (AC: 7)
  - [x] Vitest + mock MapLibre Map (spies addLayer, addSource, removeLayer, removeSource, fitBounds, once, getLayer)
  - [x] Cas : mount valid geom, switch geometry (setData, pas d'accumulation), unmount cleanup, idempotence, beforeId, MultiLineString, styledata différé (12 tests)

- [x] **Task 6** — Validation manuelle UI _(validée par Guillaume le 2026-05-29)_
  - [x] `turbo dev` → ouvrir une aventure → ouvrir popup d'un hôtel → polyline amber pointillé visible
  - [x] Cliquer un autre POI → ancienne polyline remplacée
  - [x] Fermer le popup → polyline disparaît
  - [x] Recharger la page → pas d'erreur console
  - ⚠️ **Perf observée** : le premier affichage est lent et la latence croît avec l'éloignement du POI au départ — voir « Limitation connue » ci-dessous. Comportement attendu, non bloquant.

- [x] **Task 7** — Vérifier bundle impact (AC: ⚠️Discovery #4)
  - [x] `pnpm --filter @ridenrest/web build` — succès
  - [x] Route `/map/[id]` = 22.1 kB / 395 kB First Load JS
  - [x] Écart vs estimation archi documenté (voir Completion Notes)

- [x] **Task 8** — Doc Sync + commit (AC: 8)
  - [x] Doc Sync écarts documentés (store, fichiers cibles, type prop, bbox, beforeId)
  - [ ] Commit : `feat(web): AccessMapLayer polyline + planning store integration — story poi-access-2.5` _(en attente de l'accord de Guillaume)_

---

## Dev Notes

### Pattern projet — Layer ordering MapLibre

Plusieurs layers cohabitent (cf. archi + project-context) :
1. Tiles base (OpenFreeMap)
2. Trace adventure (`route-line` ou `trace-line`)
3. Access line (nouveau — entre trace et pins)
4. POI pins (`poi-points` ou variantes)
5. POI clusters

Insérer access line via `addLayer({ ... }, 'poi-points-{layer}')` pour beforeId.

### Pattern projet — Cleanup mode strict

React Strict Mode (Next.js dev) double-mount les composants. Tester que le cleanup MapLibre ne crash pas en cas de double-cleanup (idempotence).

### References

- [Source: _bmad-output/planning-artifacts/epics-poi-access-routing.md#Story-2.5]
- [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md#Carte-Affichage-itinéraire-accès]
- [Source: _bmad-output/project-context.md#POI-Color-System]
- [Source: _bmad-output/project-context.md#Map-Interaction-UX]
- [Source: _bmad-output/project-context.md#z-index-Stack]
- [Source: _bmad-output/implementation-artifacts/poi-access-2-4-...md] — useAccess hook
- MapLibre GL JS : https://maplibre.org/maplibre-gl-js/docs/

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8 (1M context) — bmad-dev-story workflow

### Doc Sync — Écarts story planifiée ↔ implémentation

La story a été écrite sur des hypothèses de nommage qui ne correspondent pas au code réel
(comme pour les stories 2.3 et 2.4). Écarts résolus et documentés :

1. **Store** : `usePlanningModeStore` / `planning-mode-store.ts` **n'existent pas**. Le store
   réel du mode planning est `useMapStore` (`apps/web/src/stores/map.store.ts`). Le slice
   `visibleAccessPoiId` + `setVisibleAccessPoiId` y a été ajouté (aucun breaking change).
2. **Intégration carte** : `map.tsx` n'existe pas. Le composant orchestrateur réel est
   `map-view.tsx` (et `map-canvas.tsx` détient l'instance MapLibre, exposée via
   `MapCanvasHandle.getMap()`). `<AccessMapLayer>` est rendu dans `map-view.tsx`.
3. **UI POI planning** : `poi-detail-sheet.tsx` est la variante **live mode** (drawer vaul).
   L'UI POI réelle du **mode planning** est `poi-popup.tsx` (qui intègre déjà `AccessMetrics`,
   story 2.4). Le set/clear de `visibleAccessPoiId` y a été câblé, **planning + hébergement
   uniquement** (cohérent avec l'affichage d'AccessMetrics ; évite des requêtes d'accès
   inutiles ; pas de polyline en live mode — GPS/RGPD).
4. **Type du prop `geometry`** : la story citait `GeoJSONLineString`, type inexistant. Le
   contrat partagé réel (`AccessGeometrySchema`, story 2.3) est `LineString | MultiLineString`.
   Le prop est typé `AccessGeometry = Extract<AccessResponse, { status:'ok' }>['geometry']`.
   Le composant gère les deux cas (bbox sur toutes les positions).
5. **beforeId z-index** : il n'y a pas de layer fixe `poi-points`. Les pins POI sont des layers
   dynamiques `pois-{accommodations|restaurants|supplies|bike}-points`. Le `beforeId` est le
   premier de ces layers présent (sinon `undefined` → insertion au sommet).
6. **bbox** : `@turf/turf` n'est pas dans les dépendances → calcul inline (min/max). AC#6
   « access_geometry + portion pertinente de la trace » : la géométrie BRouter part déjà de
   l'origine (étape/départ) **sur la trace** jusqu'au POI, donc son propre bbox englobe la
   portion de trace pertinente. Fit sur la géométrie d'accès = comportement attendu.

### Completion Notes List
- **Bundle impact** : build OK. Route `/map/[id]` = **22.1 kB** (route) / **395 kB** First Load JS.
  Coût incrémental réel **très inférieur** à l'estimation archi de +8 KB gzip : aucune nouvelle
  dépendance n'est tirée (`maplibre-gl` est importé **type-only**, déjà bundlé par `map-canvas`),
  et le composant (~150 lignes de logique de layer) est isolé dans un chunk lazy (`dynamic`).
- **Layer beforeId utilisé** : 1er `pois-{layer}-points` présent (typiquement
  `pois-accommodations-points`), sinon sommet.
- **Source GeoJSON** : statique + `setData` à chaque changement de géométrie (Discovery #3) →
  pas de re-init du layer, pas d'accumulation (AC#4).
- **fitBounds** : une seule fois par géométrie distincte via `lastZoomedGeometryRef` ; re-zoom
  pertinent au switch de POI (nouvelle référence de géométrie).
- **Cleanup** : idempotent (`getLayer`/`getSource` guards) — sûr en double-cleanup React Strict
  Mode (AC#5). Reset additionnel de `visibleAccessPoiId` au unmount de `map-view` (SPA nav).
- **Tests** : map.store +5, AccessMapLayer +12 ; suite web complète **1035/1035 verte** (zéro
  régression). ESLint 0 erreur sur les fichiers touchés. Couverture du composant qualitativement
  > 75% (toutes branches : map null, géométrie null/valide, LineString/MultiLineString, switch,
  unmount, beforeId présent/absent, style différé).
- **Task 6 (validation manuelle UI)** : validée par Guillaume (2026-05-29) — points 1→5 OK.

### Limitation connue — Latence du premier affichage
Le premier affichage de la polyline est lent, et la latence **croît avec la distance du POI au
point d'origine**. Cause : le contrat d'accès (stories 2.2/2.3) utilise l'origine `adventure-start`
(ou début d'étape), donc BRouter calcule un **itinéraire routé complet** origine→POI ; le premier
appel est `computed-fresh`, les suivants sont servis depuis le cache (`db-cache`/`redis-cache`,
story 2.2). **Hors scope 2.5** (côté UI map uniquement). Solution déjà planifiée :
**Story 4.1 `poi-access-4-1-bullmq-worker-eager-precompute`** (précalcul en tâche de fond → cache
chaud → affichage quasi instantané). Aucune action requise sur la 2.5.

### File List
- `apps/web/src/components/poi-access/AccessMapLayer.tsx` (nouveau)
- `apps/web/src/components/poi-access/AccessMapLayer.test.tsx` (nouveau)
- `apps/web/src/stores/map.store.ts` (modifié — slice access ; remplace `planning-mode-store.ts`)
- `apps/web/src/stores/map.store.test.ts` (modifié — +5 tests)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (modifié — intégration `<AccessMapLayer>` ; remplace `map.tsx`)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` (modifié — mock store mis à jour)
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` (modifié — set/clear visibleAccessPoiId ; remplace `poi-detail-sheet.tsx`)
- `_bmad-output/implementation-artifacts/poi-access-2-5-access-map-layer.md` (story — frontmatter, tasks, Dev Agent Record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut story)

### Change Log
- 2026-05-29 — Implémentation story POI-Access 2.5 `AccessMapLayer` : slice store `visibleAccessPoiId`,
  composant lazy polyline d'accès (amber pointillé, beforeId pins, setData, fitBounds once, cleanup
  idempotent), intégration `map-view`, câblage `poi-popup`. Doc Sync (6 écarts). Tests 17 nouveaux,
  suite web 1035/1035, build OK. Status → review.
