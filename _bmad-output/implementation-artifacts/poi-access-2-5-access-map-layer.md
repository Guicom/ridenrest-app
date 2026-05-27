# Story POI-Access 2.5 : `AccessMapLayer` — polyline d'itinéraire d'accès sur MapLibre

Status: ready-for-dev

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

- [ ] **Task 1** — Étendre `usePlanningModeStore` (AC: 1)
  - [ ] Ajouter `visibleAccessPoiId: string | null` + action `setVisibleAccessPoiId`
  - [ ] Vérifier qu'aucun composant existant n'a `setVisibleAccessPoiId` (risque de collision name)

- [ ] **Task 2** — Implémenter `AccessMapLayer.tsx` (AC: 2, 5, 6, ⚠️Discovery #1, #3, #5)
  - [ ] Composant React avec `useEffect` géré : addSource + addLayer au mount, setData sur changement de geometry, removeLayer + removeSource au unmount
  - [ ] Cleanup avec flag `cancelled` (cf. ⚠️Discovery #1)
  - [ ] `addLayer(..., beforeId='poi-points')` pour ordre z (cf. ⚠️Discovery #5)
  - [ ] Calcul du bbox via `turf.bbox(geometry)` ou inline (min/max sur coordinates)
  - [ ] `fitBounds` une seule fois (ref `hasZoomedRef`)

- [ ] **Task 3** — Intégrer dans `map.tsx` (AC: 3, 4)
  - [ ] Lazy import : `const AccessMapLayer = dynamic(() => import('@/components/poi-access/AccessMapLayer'), { ssr: false })`
  - [ ] Read `visibleAccessPoiId` depuis store
  - [ ] Read access geometry via `useAccess(visibleAccessPoiId, derivedOrigin)` (si visibleAccessPoiId !== null)
  - [ ] Pass `geometry` au composant : `<AccessMapLayer map={mapRef.current} geometry={accessData?.geometry ?? null} />`

- [ ] **Task 4** — Connecter `poi-detail-sheet.tsx` (AC: 3, 5)
  - [ ] Au mount du sheet : `setVisibleAccessPoiId(poi.id)`
  - [ ] Au unmount du sheet : `setVisibleAccessPoiId(null)` (cleanup)
  - [ ] Bonus : sur clic carte en dehors → cleanup (handler existant `traceClickedKm` peut être réutilisé)

- [ ] **Task 5** — Tests composant (AC: 7)
  - [ ] Vitest + mock MapLibre Map (objet avec spies sur addLayer, addSource, removeLayer, removeSource, fitBounds)
  - [ ] Cas : mount valid geom, switch geometry, unmount cleanup

- [ ] **Task 6** — Validation manuelle UI
  - [ ] `turbo dev` → ouvrir une aventure → ouvrir POI Sheet d'un hôtel → polyline amber pointillé visible
  - [ ] Cliquer un autre POI → ancienne polyline remplacée
  - [ ] Fermer le sheet → polyline disparaît
  - [ ] Recharger la page → pas d'erreur console

- [ ] **Task 7** — Vérifier bundle impact (AC: ⚠️Discovery #4)
  - [ ] `pnpm --filter @ridenrest/web build`
  - [ ] Lire la sortie : taille du chunk POI ou Map
  - [ ] Documenter l'écart vs estimation archi

- [ ] **Task 8** — Doc Sync + commit (AC: 8)
  - [ ] Commit : `feat(web): AccessMapLayer polyline + planning store integration — story poi-access-2.5`

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
_(À renseigner)_

### Completion Notes List
- Bundle impact mesuré : +`___` KB gzip sur le chunk map/POI
- Layer beforeId utilisé : `___`

### File List
- [ ] `apps/web/src/components/poi-access/AccessMapLayer.tsx` + `.test.tsx`
- [ ] `apps/web/src/stores/planning-mode-store.ts` (modifié)
- [ ] `apps/web/src/app/(app)/map/[id]/_components/map.tsx` (modifié)
- [ ] `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` (modifié)
