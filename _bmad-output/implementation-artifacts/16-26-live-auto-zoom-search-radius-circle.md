# Story 16.26: Live Mode — Auto-Zoom Slider + Cercle de Rayon de Recherche

Status: done

## Story

As a **cyclist in Live mode**,
I want the map to auto-adjust its zoom when I change the "Mon hotel dans X km" slider, and to see a geographic circle showing the search radius around the target point,
so that I always see both my GPS position and the target point, and I can visualize the search area before launching a search.

## Acceptance Criteria

1. **Given** l'utilisateur est en mode Live avec GPS actif et `targetAheadKm` change (slider ou boutons − / +),
   **When** la valeur de `targetAheadKm` se met a jour dans le store,
   **Then** la carte ajuste automatiquement son zoom pour montrer a la fois la position GPS actuelle et le point cible (target dot), avec un padding suffisant pour que le cercle de rayon de recherche soit entierement visible.

2. **Given** la carte s'auto-zoom apres un changement de slider,
   **When** l'ajustement est termine,
   **Then** l'animation est fluide (`easeTo` avec duration ~400ms), le GPS tracking est temporairement pause (`userInteractedRef = true`), et le panneau LiveControls en bas n'occulte pas le point cible (padding bottom ~240px comme `fitToSearchZone`).

3. **Given** un cercle geographique est rendu autour du target point,
   **When** `targetKm` et `searchRadiusKm` sont definis,
   **Then** un polygone circulaire semi-transparent (fill `#2D6A4A` opacity 0.08, stroke `#2D6A4A` opacity 0.3, stroke-width 1.5) est affiche sur la carte, centre sur le target point, avec un rayon correspondant a `searchRadiusKm` en km reels.

4. **Given** le cercle de rayon est affiche,
   **When** `searchRadiusKm` change (via le drawer filtres),
   **Then** le cercle se met a jour immediatement (meme source GeoJSON, `setData()`).

5. **Given** l'utilisateur pan ou zoom manuellement la carte,
   **When** il interagit avec la carte (drag, pinch, scroll wheel),
   **Then** l'auto-zoom du slider est inhibe tant que `userInteractedRef.current === true`. Seul un clic sur "Recentrer GPS" (`centerOnGps`) reactive le tracking ET le prochain changement de slider relancera l'auto-zoom.

6. **Given** `currentPosition` est `null` (GPS pas encore acquis),
   **When** le slider bouge,
   **Then** aucun auto-zoom ne se produit (guard early return). Le cercle de rayon est toujours affiche si `targetKm` est defini.

7. **Given** l'auto-zoom est actif,
   **When** le slider est manipule rapidement (plusieurs changements en <300ms),
   **Then** seul le dernier changement declenche un `fitBounds` (debounce ou check `targetAheadKm` dans un ref pour eviter les animations en cascade).

## Tasks / Subtasks

- [x] Task 1: Ajouter le cercle geographique `search-radius-circle` (AC: #3, #4, #6)
  - [x] 1.1 Dans `live-map-canvas.tsx`, creer une fonction `addSearchRadiusLayer(map)` qui ajoute une source GeoJSON `search-radius` (type `geojson`, data: empty FeatureCollection) et deux layers : `search-radius-fill` (type `fill`, paint ci-dessous) et `search-radius-stroke` (type `line`, paint ci-dessous)
  - [x] 1.2 Creer une fonction utilitaire `createCirclePolygon(center: {lat, lng}, radiusKm: number, steps?: number): GeoJSON.Feature<Polygon>` qui genere un polygone circulaire (64 segments par defaut) en utilisant la formule Haversine inverse (destination point)
  - [x] 1.3 Dans le `useEffect` qui met a jour `live-target-point` (lignes 208-230), ajouter la mise a jour de `search-radius` source avec `createCirclePolygon(point, searchRadiusKm)` — le centre est le meme `findPointAtKm(kmWaypoints, targetKm)`
  - [x] 1.4 Ajouter `searchRadiusKm` comme prop ou le lire depuis `useLiveStore` dans le composant

- [x] Task 2: Auto-zoom sur changement de `targetAheadKm` (AC: #1, #2, #5, #6, #7)
  - [x] 2.1 Ajouter un `useEffect` dans `LiveMapCanvas` qui reagit a `targetKm` + `currentPosition` + `mapReady`
  - [x] 2.2 Guard: si `!mapReady || !currentPosition || targetKm == null || userInteractedRef.current` → return
  - [x] 2.3 Calculer les bounds englobant GPS position + target point + searchRadiusKm d'expansion
  - [x] 2.4 Appeler `map.fitBounds(bounds, { padding: { top: 60, right: 60, bottom: 240, left: 60 }, maxZoom: 16, animate: true, duration: 400 })`
  - [x] 2.5 Debounce : utiliser un `setTimeout` de 150ms + cleanup pour eviter les animations en cascade lors de manipulations rapides du slider
  - [x] 2.6 NE PAS mettre `userInteractedRef = true` dans cet effet — l'auto-zoom EST le comportement automatique, pas une interaction manuelle. L'auto-zoom ne doit pas briser le GPS tracking.

- [x] Task 3: Integration dans `page.tsx` (AC: #1, #4)
  - [x] 3.1 Passer `searchRadiusKm` comme prop a `LiveMapCanvas` (deja lu via `liveSearchRadiusKm` dans page.tsx ligne 134)

- [x] Task 4: Tests unitaires
  - [x] 4.1 Test `createCirclePolygon`: verifie que le polygone a 65 coordonnees (64 segments + fermeture), que le premier et dernier point sont identiques, et que le rayon approximatif est correct
  - [x] 4.2 Test LiveMapCanvas: quand `targetKm` change et `currentPosition` est defini → `fitBounds` est appele
  - [x] 4.3 Test LiveMapCanvas: quand `currentPosition` est `null` → `fitBounds` n'est pas appele
  - [x] 4.4 Test LiveMapCanvas: le cercle de rayon est mis a jour quand `searchRadiusKm` change

## Dev Notes

### Fichiers a modifier

| Fichier | Action |
|---------|--------|
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` | Ajouter `addSearchRadiusLayer()`, `createCirclePolygon()`, useEffect auto-zoom, prop `searchRadiusKm` |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Passer `searchRadiusKm={liveSearchRadiusKm}` a `<LiveMapCanvas>` |
| `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` | Tests cercle + auto-zoom |

### Pattern du cercle geographique

```typescript
// Polygone circulaire via Haversine inverse (destination point)
function createCirclePolygon(
  center: { lat: number; lng: number },
  radiusKm: number,
  steps = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = []
  const R = 6371 // Earth radius km
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const lat1 = center.lat * Math.PI / 180
    const lng1 = center.lng * Math.PI / 180
    const d = radiusKm / R
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing))
    const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
    coords.push([lng2 * 180 / Math.PI, lat2 * 180 / Math.PI])
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  }
}
```

### Layers MapLibre pour le cercle

```typescript
function addSearchRadiusLayer(map: maplibregl.Map) {
  if (map.getSource('search-radius')) return

  map.addSource('search-radius', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  })

  map.addLayer({
    id: 'search-radius-fill',
    type: 'fill',
    source: 'search-radius',
    paint: {
      'fill-color': '#2D6A4A',
      'fill-opacity': 0.08,
    },
  })

  map.addLayer({
    id: 'search-radius-stroke',
    type: 'line',
    source: 'search-radius',
    paint: {
      'line-color': '#2D6A4A',
      'line-opacity': 0.3,
      'line-width': 1.5,
    },
  })
}
```

### Auto-zoom — pattern avec debounce

```typescript
// Dans LiveMapCanvas, nouveau useEffect
useEffect(() => {
  const map = mapRef.current
  if (!map || !mapReady || targetKm == null) return
  const pos = currentPositionRef.current
  if (!pos) return
  // Pas d'auto-zoom si l'utilisateur a interagi manuellement
  if (userInteractedRef.current) return

  const timer = setTimeout(() => {
    const targetPoint = findPointAtKm(kmWaypointsRef.current, targetKm)
    if (!targetPoint) return

    const minLat = Math.min(pos.lat, targetPoint.lat)
    const maxLat = Math.max(pos.lat, targetPoint.lat)
    const minLng = Math.min(pos.lng, targetPoint.lng)
    const maxLng = Math.max(pos.lng, targetPoint.lng)

    // Expand by searchRadiusKm pour inclure le cercle
    const expandLat = searchRadiusKm / 111.32
    const avgLat = (minLat + maxLat) / 2
    const expandLng = searchRadiusKm / (111.32 * Math.cos(avgLat * Math.PI / 180))

    map.fitBounds(
      [[minLng - expandLng, minLat - expandLat], [maxLng + expandLng, maxLat + expandLat]],
      { padding: { top: 60, right: 60, bottom: 240, left: 60 }, maxZoom: 16, animate: true, duration: 400 },
    )
  }, 150) // Debounce 150ms

  return () => clearTimeout(timer)
}, [targetKm, mapReady]) // currentPosition via ref, searchRadiusKm via ref ou prop
```

**IMPORTANT** : `currentPosition` est lu via `currentPositionRef` (pas dans les deps) pour eviter que chaque update GPS (toutes les 1-3s) declenche un auto-zoom. Seul le changement de `targetKm` (= slider bouge) declenche l'effet.

### Ordre des layers

Le cercle de rayon doit etre ajoute **avant** les layers de POI et **apres** la trace :
1. `live-trace` (line)
2. `search-radius-fill` + `search-radius-stroke` (fill + line) ← NOUVEAU
3. `target-dot` (circle)
4. POI layers (via `useLivePoiLayers`)
5. `gps-halo` + `gps-dot` (circle)

Appeler `addSearchRadiusLayer(map)` dans `initMapLayers()` apres `addTraceLine()` et avant `addTargetPointLayer()`.

### Interaction avec `fitToSearchZone` existant

`fitToSearchZone` (appele apres recherche POI) fait deja un `fitBounds` similaire mais centre sur la zone target uniquement (pas GPS→target). L'auto-zoom du slider est complementaire : il montre GPS + target. Apres une recherche POI, `fitToSearchZone` prend le relais et zoom plus serre sur la zone de resultats.

### Regressions a eviter

- Ne PAS modifier `fitToSearchZone` — il reste inchange pour le zoom post-recherche
- Ne PAS casser le GPS tracking — l'auto-zoom ne doit pas setter `userInteractedRef = true`
- Ne PAS ajouter `currentPosition` dans les deps du useEffect auto-zoom (sinon zoom a chaque GPS update)
- Le cercle doit disparaitre proprement si `targetKm` passe a `null` (GPS perdu) → `setData({ type: 'FeatureCollection', features: [] })`
- Respecter le guard `if (map.getSource('search-radius')) return` dans `addSearchRadiusLayer` pour le style switch

### References

- [Source: apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx] — composant principal, layers, fitToSearchZone
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx] — slider targetAheadKm
- [Source: apps/web/src/stores/live.store.ts] — targetAheadKm, searchRadiusKm
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx] — orchestration, liveSearchRadiusKm
- [Source: story 16.25] — persistance searchRadiusKm dans le store
- [Source: story 16.24] — boutons − / + du slider
- [Source: story 16.20] — max dynamique du slider

### Review Findings (2026-04-06)

- [x] [Review][Patch] fitToSearchZone bloque l'auto-zoom slider définitivement [live-map-canvas.tsx:248] — FIXED: slider move reset userInteractedRef=false
- [x] [Review][Patch] searchRadiusKm absent des deps auto-zoom [live-map-canvas.tsx:283] — FIXED: ajouté aux deps + lecture directe prop
- [x] [Review][Patch] Ring closure flottante createCirclePolygon [live-map-canvas.tsx:618] — FIXED: boucle i<steps + push coords[0]
- [x] [Review][Defer] Race centerOnGps + slider double animation — edge case rare, deferred
- [x] [Review][Defer] Cercle perdu après style switch si targetKm null au reload — edge case timing, deferred
- [x] [Review][Defer] Test négatif setTimeout(200) fragile en CI — amélioration qualité, deferred
- [x] [Review][Defer] fitToSearchZone appelée avec targetKm??0 quand GPS perdu — pré-existant dans page.tsx, deferred

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
