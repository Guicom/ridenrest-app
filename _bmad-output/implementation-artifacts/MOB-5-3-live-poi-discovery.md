# Story MOB-5.3 : Découverte de POIs en mode Live

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cycliste fatigué**,
I want **voir les hébergements sur mes prochains X km selon mon allure**,
So that **je décide rapidement où m'arrêter**.

> **Dépend de MOB-5.1** (store, `currentKmOnRoute`) **et MOB-5.2** (position temps réel, caméra). Cœur fonctionnel du Live : **recherche POI par `targetKm`/`radiusKm`** (≠ corridor `fromKm/toKm` du planning), **cercle de rayon + point cible** sur la carte, **panneau de contrôle Live** (slider allure/distance, RECHERCHER, ETA/D+), **filtres** (rayon, vitesse, calques, sous-types) persistés à la fermeture, **auto-zoom**, **bannière « aucun résultat »**, **dégradation gracieuse** (résultats partiels + message).
>
> **Backend Live déjà livré (web `done`) — rien à recréer côté serveur.** L'endpoint `GET /pois` accepte **déjà** `targetKm`/`radiusKm` (mutuellement exclusifs avec `fromKm`/`toKm`). **RGPD : le client n'envoie QUE `targetKm` (km relatif à la trace) + `radiusKm` — jamais de lat/lng.** Le serveur résout le point cible via `getWaypointAtKm` (interpolation des waypoints stockés) (NFR-012).
>
> **Cette story livre le panneau Live FONCTIONNEL** (slider/RECHERCHER/filtres, parité web 7-2). **Le re-design du layout + section PROFIL repliable = MOB-5.4** ; **le profil d'élévation = MOB-5.5**.

## Acceptance Criteria

1. **Given** le mode Live actif
   **When** je saisis mon **allure** (km/h) et ma **distance cible** (prochains X km)
   **Then** la fenêtre de recherche est calibrée : `targetKm = round((currentKmOnRoute + targetAheadKm) * 10) / 10` (FR-042)
   **And** le **max du slider** s'adapte dynamiquement à la **distance restante** (`maxAheadKm = ceil(totalDistKm − currentKmOnRoute)`, jamais 100 fixe), `targetAheadKm` clampé quand le max rétrécit (parité web 16-20)

2. **Given** ma position et mon allure
   **When** je clique **RECHERCHER**
   **Then** seuls les POI situés sur les **prochains X km** (rayon `searchRadiusKm` autour du point cible) sont affichés (filtrage côté serveur via `targetKm`/`radiusKm`, **sans GPS**) (FR-043)
   **And** la latence GPS → POIs est **≤ 2 s** avec un **indicateur de chargement** visible (NFR-007)
   **And** la recherche est **explicite** (`enabled: false` + `refetch()`) — jamais déclenchée automatiquement au déplacement du slider

3. **Given** une recherche effectuée
   **When** la carte se met à jour
   **Then** un **cercle de rayon** (`searchRadiusKm`) + un **point cible** sont rendus sur la carte, et la carte **auto-zoome** sur la zone cible±rayon **une fois** par recherche (sans re-zoomer en boucle)

4. **Given** ma position évolue
   **When** j'avance
   **Then** je peux relancer la recherche (les résultats ne se rafraîchissent pas silencieusement — recherche explicite) ; le slider et la cible se recalent sur la nouvelle `currentKmOnRoute` (FR-044)

5. **Given** une recherche qui ne retourne **aucun POI**
   **When** elle se termine
   **Then** une **bannière « Aucun résultat »** s'affiche, conditionnée par **`hasFetched` (= `data !== undefined`)** — **JAMAIS `pois.length === 0` seul** (qui est vrai avant toute recherche). La bannière se masque dès que `targetKm` change (nouvelle queryKey → `data` redevient `undefined`)

6. **Given** une **connexion instable**
   **When** le chargement est partiel
   **Then** les POI partiellement chargés restent affichés avec un **message d'état clair** (`<StatusBanner>` « Connexion instable »), **sans crash silencieux**, et la dernière liste en cache reste consultable hors-ligne (FR-045, NFR-032)

7. **Given** le tiroir de filtres Live (rayon, vitesse, calques, sous-types hébergement, départ météo)
   **When** je le ferme (✕, swipe, overlay) **sans relancer la recherche**
   **Then** les valeurs `searchRadiusKm`/`speedKmh`/`weatherDepartureTime` sont **persistées dans le store** (parité web 16-25) ; les toggles calques/sous-types sont **immédiats** (pas de bouton Appliquer)

## Tasks / Subtasks

- [ ] **T1 — Façade `lib/api/pois.ts` : `getLivePois`** (AC: 2)
  - [ ] Ajouter `getLivePois({ segmentId, targetKm, radiusKm, categories, overpassEnabled }): Promise<Poi[]>` → `apiFetch('/pois?segmentId=…&targetKm=…&radiusKm=…&categories=…&overpassEnabled=…')` (chemin **propre**, `apiFetch` préfixe `/api`). `categories` = répétés. **RGPD : aucune lat/lng.** `radiusKm` cap `MAX_LIVE_RADIUS_KM` (20, `@ridenrest/shared`).
  - [ ] **Backend inchangé** : `targetKm`/`radiusKm` mutuellement exclusifs avec `fromKm`/`toKm` (DTO `find-pois.dto.ts`). Google Places primaire + Overpass si `overpassEnabled` (fix 16-19 déjà serveur).

- [ ] **T2 — Hook `hooks/use-live-poi-search.ts`** (AC: 1, 2, 4, 5)
  - [ ] **Porter** `apps/web/src/hooks/use-live-poi-search.ts`. Query key `['pois', 'live', { segmentId, targetKm, radiusKm: searchRadiusKm, overpassEnabled }]`. **`categories` EXCLU du queryKey** (recherche toujours explicite via closure ; exclure évite d'effacer les compteurs affichés au changement de filtre). `enabled: false`, `staleTime: Infinity` → fetch **uniquement** sur `refetch()`.
  - [ ] `targetKm = round((currentKmOnRoute + targetAheadKm) * 10) / 10` ou `null`. `canSearch = isLiveModeActive && targetKm !== null && !!segmentId`.
  - [ ] `categories` = `[...visibleLayers].flatMap(l => l==='accommodations' ? cats.filter(c => activeAccommodationTypes.has(c)) : LAYER_CATEGORIES[l])`.
  - [ ] Retour `{ pois, hasFetched, isFetching, targetKm, isError, refetch, canSearch }`. **`hasFetched = data !== undefined`** (AC5).
  - [ ] **Offline (AC6)** : write-through `setCachedPois` au succès ; fallback `getCachedPois` hors-ligne (réutiliser `lib/cache/poi-cache.ts`, comme `use-pois`).

- [ ] **T3 — Calques POI Live (pins + clusters)** (AC: 2, 3)
  - [ ] **Mirror** `use-poi-layers.ts` (planning) → variante Live : `<ShapeSource cluster>` + couches cluster/dot, couleur catégorie canon (`POI_CATEGORY_COLORS`, `pin-factory.ts`), cluster `POI_CLUSTER_COLOR`. Tap pin → `setSelectedPoiId` ; tap cluster → expansion zoom + recentrage. Filtrage `visibleLayers`.
  - [ ] Réutiliser `poi-popup.tsx` (overlay RN projeté, MOB-4.2 — **PAS** `<Marker>` interactif). Recentrage `easeTo({offset:[0,100]})` programmatique (ne déclenche pas la détection de pan manuel).

- [ ] **T4 — Cercle de rayon + point cible (`createCirclePolygon`)** (AC: 3)
  - [ ] Porter `createCirclePolygon(center, radiusKm, steps=64)` (pur, web `live-map-canvas.tsx:680-709`) — destination Haversine, **fermeture explicite de l'anneau** `coords.push(coords[0])` (évite la dérive flottante, fix 16-26). Centre = `findPointAtKm(waypoints, targetKm)` (`@ridenrest/gpx`).
  - [ ] Couches enfant `<MapCanvas>` (gated `styleLoaded`) : fill+stroke cercle + dot cible. **Coord `isValidLngLat`** (anti-SIGABRT). Source **vidée** quand `targetKm` null / GPS perdu.

- [ ] **T5 — Auto-zoom sur la zone de recherche** (AC: 3)
  - [ ] `fitToSearchZone(targetKm, radiusKm, segments, waypoints)` sur `MapCanvasHandle` : bbox des waypoints `[targetKm − radius, targetKm + radius]` (réutiliser `computeCorridorBounds` de `maplibre-config.ts`) + padding bas pour laisser place au panneau Live. Zoom **une fois** par recherche (détection transition `isFetching true→false` OU `searchTrigger` incrémenté pour cache chaud).
  - [ ] ⚠️ **Détection de transition (leçon project-context + web 16-15)** : mettre à jour le ref de transition **à la FIN du corps de l'effet, SANS reset en cleanup** (les deps mobiles changent souvent ; un reset en cleanup remettrait `prev=false` avant le check `true→false` → le zoom ne partirait jamais). NE PAS copier le pattern cleanup-reset du web.
  - [ ] Le fit programmatique met `gpsTrackingActive=false` **après** le fit (sinon le GPS easeTo se bat avec lui, bug 16-26).

- [ ] **T6 — Panneau de contrôle Live `components/live/live-controls.tsx`** (AC: 1, 2, 4)
  - [ ] Slider distance cible (`Slider` mobile, `value=targetAheadKm`, `min=5`, `max=effectiveMax`, `step=5`) + **boutons −/+** (parité 16-24, désactivés aux bornes). `effectiveMax = max(5, roundDownToStep(maxAheadKm ?? 100, 5))` ; valeur slider gardée `min(targetAheadKm, effectiveMax)` (anti stale > max, 16-20).
  - [ ] Bouton **RECHERCHER** → `refetch()`. ⚠️ La queryKey change quand le store change → appeler le refetch **après re-render** (web `setTimeout(0)` + `refetchPoisRef` via `useLayoutEffect`) pour éviter une clé périmée.
  - [ ] Ligne ETA/D+ : `formatEtaSummary(distanceKm, speedKmh)` (→ `~Xh MM` / `~Mmin`). (Le D+/D- et la mise en forme « ↑D+ · ↓D- · ~ETA » + slot RECHERCHER SUR = re-design **MOB-5.4** ; ici, version fonctionnelle minimale.)
  - [ ] Champ allure (numérique) → `setSpeedKmh`. **Layout simple ici** ; le re-design = 5.4.

- [ ] **T7 — Tiroir de filtres Live `components/live/live-filters-drawer.tsx`** (AC: 7)
  - [ ] `@gorhom/bottom-sheet` (déjà présent). Contenu : rayon (`searchRadiusKm`, step 0.5, min 0.5, max `MAX_LIVE_RADIUS_KM`=20), vitesse, calques (`Switch` × calques), sous-types hébergement (`accommodation-sub-types.tsx` avec `onlyCountActive` — masque `(0)` en live), départ météo (slot 5.6).
  - [ ] **Persistance à la fermeture (16-25)** : sur **toute** fermeture (✕/swipe/overlay), commit `localRadius/localSpeed/localDeparture` → store. Toggles calques/sous-types **immédiats** (état local éphémère pour rayon/vitesse, immédiat pour toggles).

- [ ] **T8 — Bannière « Aucun résultat » + dégradation** (AC: 5, 6)
  - [ ] Bannière conditionnée : `isLiveModeActive && !isFetching && !isError && hasFetched && pois.length === 0` (positionnée au-dessus du panneau Live, parité web `top-16` / au-dessus des contrôles). **JAMAIS `pois.length===0` seul.**
  - [ ] `<StatusBanner message="Connexion instable" />` (`components/shared/status-banner.tsx`) sur réseau instable ; POI partiels conservés. Ne PAS effacer le cache POI sur erreur. Bannière offline si hors-ligne (réutiliser `use-network-status`). Garde `isPending && fetchStatus !== 'paused'` pour l'overlay.

- [ ] **T9 — Intégration route `(app)/live/[id].tsx` + i18n** (AC: tous)
  - [ ] Monter calques POI/cercle/cible dans `<MapCanvas>`, `live-controls` + bouton filtres (overlay), `live-filters-drawer`, bannières. `selectedPoiId`/`targetAheadKm`/`searchRadiusKm`/`speedKmh` via store. Lifter `searchTrigger` local (auto-zoom cache chaud).
  - [ ] i18n `live.search.*` : `targetLabel` (« Mon hôtel dans X km »), `speedLabel`, `radiusLabel`, `searchButton`, `noResults`, `unstableConnection`, `eta`. FR/EN parité, zéro chaîne en dur.

- [ ] **T10 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 5, 6, 7)
  - [ ] `use-live-poi-search` : queryKey (categories exclu), `enabled:false`, `targetKm` arrondi, `canSearch`, `hasFetched = data !== undefined`, write-through/fallback cache.
  - [ ] `createCirclePolygon` (pur) : 64 pts + anneau fermé, rayon correct ; coords filtrées.
  - [ ] slider math : `effectiveMax`, clamp `targetAheadKm` quand max rétrécit, garde stale > max.
  - [ ] auto-zoom : transition `true→false` déclenche une fois ; **pas** de cleanup-reset (régression interdite) ; fit met `gpsTrackingActive=false`.
  - [ ] filtres : persistance sur toute fermeture (16-25), toggles immédiats.
  - [ ] bannière : `hasFetched` requis (pas `pois.length===0` seul) ; masquée quand `targetKm` change.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [ ] **T11 — Validation manuelle (Dev Client)** (AC: tous) — ⏳ build Dev Client (Guillaume)
  - [ ] Saisir allure + distance → RECHERCHER → POI dans le rayon, cercle + cible affichés, auto-zoom une fois. Avancer → recaler + re-rechercher.
  - [ ] Zéro résultat → bannière (pas avant la 1ʳᵉ recherche). Couper réseau → POI cache + bannière, pas de crash.
  - [ ] Filtres : changer rayon/vitesse puis fermer sans rechercher → valeurs gardées. Toggle calque → immédiat.

## Dev Notes

### Endpoint Live (backend livré — RGPD-safe)

- `GET /api/pois?segmentId={uuid}&targetKm={km}&radiusKm={km}&categories={cat}&categories={cat}&overpassEnabled={bool}`. `targetKm`/`radiusKm` **exclusifs** avec `fromKm`/`toKm` (`find-pois.dto.ts:13-37`). `radiusKm` max `MAX_LIVE_RADIUS_KM=20`, `@Min(0)`. [Source: apps/api/src/pois/dto/find-pois.dto.ts ; packages/shared/src/constants/gpx.constants.ts:14]
- Serveur `findLiveModePois` (`pois.service.ts:226-311`) : `getWaypointAtKm(segmentId, targetKm, userId)` résout le point (ownership check, **pas de GPS en entrée**) → bbox `radiusKm/111.0` deg → Overpass (si opt-in) + Google Places (primaire) → `findPoisNearPoint` (POI avec `distFromTargetM`). Cache Redis géo par bbox arrondie. [Source: apps/api/src/pois/pois.service.ts:226-311]
- `Poi.distFromTargetM?` n'existe **que** en réponse live. [Source: packages/shared/src/types/poi.types.ts:7]

### Hook Live (référence web)

- `apps/web/src/hooks/use-live-poi-search.ts` (57 l) : key `['pois','live',{segmentId,targetKm,radiusKm,overpassEnabled}]`, **categories hors clé** (`:35-44`), `enabled:false`+`staleTime:Infinity` (`:45-46`), `targetKm` arrondi (`:29-31`), `canSearch` (`:54`), `hasFetched = data !== undefined` (`:52`). [Source: apps/web/src/hooks/use-live-poi-search.ts]
- `getLivePois`/`GetLivePoisParams` : `apps/web/src/lib/api-client.ts:283-304`.

### Slider / cercle / auto-zoom (référence web + fixes 16.x)

- `live-controls.tsx` : `roundDownToStep` (`:12`), `effectiveMax`/clamp (`:61-68`), garde `min(targetAheadKm, effectiveMax)` (`:157`), `formatEtaSummary` (`:213-219`). [Source: apps/web/.../live-controls.tsx]
- `maxAheadKm = ceil(totalDistKm − currentKmOnRoute)` (16-20, `page.tsx:207-212`). [Source: story 16-20-live-slider-dynamic-max-remaining-km.md]
- `createCirclePolygon(center, radiusKm, 64)` + fermeture anneau (16-26, `live-map-canvas.tsx:680-709`). `fitToSearchZone` (`:400-439`) ; padding bas = hauteur panneau (`searchZoneBottomPadding`, `:25-30`). [Source: story 16-26-live-auto-zoom-search-radius-circle.md]
- **Auto-zoom dual-path** + refs de transition (`page.tsx:248-282`). ⚠️ Le cleanup-reset web ne marche QUE car deps limitées — **sur mobile, update du ref en fin d'effet, pas de cleanup-reset** (project-context §auto-zoom ; régression réelle 2026-06-16). [Source: project-context.md ; CLAUDE.md §Auto-zoom after POI search]
- `handleSearch` : `setTimeout(0)` + `refetchPoisRef` (`useLayoutEffect`) car la queryKey change sur update store (`page.tsx:104-117`).

### Filtres + persistance + bannière (référence web)

- `live-filters-drawer.tsx` (470 l) : rayon step 0.5 / min 0.5 / max 20 (`:188-203`), persist-on-close (`:114-128`, 16-25), toggles immédiats. [Source: apps/web/.../live-filters-drawer.tsx]
- Bannière no-results : `isLiveModeActive && !poisFetching && !poisError && poisHasFetched && pois.length===0` (`page.tsx:122`). **`hasFetched` obligatoire** — pas `pois.length===0` seul (project-context §No-Results). [Source: CLAUDE.md §"Aucun résultat" — live mode]

### Réutilisation du code mobile existant

- **MOB-5.1/5.2** : `useLiveStore` (`currentKmOnRoute`, `targetAheadKm`, `searchRadiusKm`, `speedKmh`, `gpsTrackingActive`), `MapCanvasHandle` (à étendre `fitToSearchZone`), waypoints.
- **MOB-4.2** : `use-poi-layers.ts` (mirror pour live), `poi-layer.tsx`, `pin-factory.ts` (`POI_CATEGORY_COLORS`/`POI_CLUSTER_COLOR`), `poi-popup.tsx` (overlay projeté), `accommodation-sub-types.tsx` (`onlyCountActive`).
- **MOB-4.3** : `useMapStore` (`visibleLayers`/`activeAccommodationTypes`/toggles), `poi-layer-grid.tsx`, `corridor-pill.tsx`, `lib/cache/poi-cache.ts`.
- `Slider`/`Switch`/`Dialog` (ui), `@gorhom/bottom-sheet`, `findPointAtKm`/`computeBoundingBox` (`@ridenrest/gpx`), `maplibre-config.computeCorridorBounds`, `use-network-status`, `status-banner`, `useProfile` (`overpassEnabled`).

### Conventions & contraintes

- **RGPD** : `targetKm`/`radiusKm` seuls, jamais de lat/lng. Recherche **explicite** (`refetch`), `hasFetched` (pas `length===0`). `isValidLngLat` au point. Pas de source avant `styleLoaded`. Overlays interactifs ≠ `<Marker>`. Auto-zoom : ref en fin d'effet (pas de cleanup-reset). Couleurs inline/expr. Tests hors `src/app/`. i18n FR/EN.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/hooks/use-live-poi-search.ts
apps/mobile/src/hooks/use-live-poi-layers.ts
apps/mobile/src/components/live/live-controls.tsx
apps/mobile/src/components/live/live-filters-drawer.tsx
apps/mobile/src/components/map/live-search-zone-layer.tsx  (cercle + cible)
apps/mobile/src/components/live/live-no-results-banner.tsx
+ tests co-localisés
```
**Modifs** :
```
apps/mobile/src/lib/api/pois.ts                  (getLivePois)
apps/mobile/src/components/map/map-canvas.tsx    (fitToSearchZone)
apps/mobile/src/app/(app)/live/[id].tsx          (calques + contrôles + filtres + bannières)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (live.search.*)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : `getLivePois`, `use-live-poi-search` (explicite, hasFetched, offline), calques POI live + popup, cercle rayon + cible, auto-zoom once, panneau Live **fonctionnel** (slider −/+, max dynamique, RECHERCHER, ETA), tiroir filtres persist-on-close, bannière no-results, dégradation gracieuse. i18n, tests.
- **Exclu** : **re-design layout panneau + section PROFIL repliable** → **MOB-5.4** ; **profil d'élévation** (contenu PROFIL) → **MOB-5.5** ; **météo Live** → **MOB-5.6** ; GPS/caméra (5.2) ; consentement (5.1).

### Open Questions

1. **Calque étapes Live** (`stageLayerActive`, web 16-9) : inclure ici ou différer ? _(Recommandation : différer hors epic Live MVP ou story dédiée — l'epic MOB-5 ne le liste pas explicitement.)_
2. **Popup POI Live** : réutiliser tel quel `poi-popup.tsx` (planning) — vérifier que les slots Booking (MOB-4.5) + accès (MOB-4.6/4.7) y fonctionnent en Live (`page:'live'` déjà supporté par `booking-links`).

### References

- [Source: epics-mobile.md#Story MOB-5.3 (l.939-962)] — AC d'origine (FR-042/043/044/045, NFR-007/032)
- [Source: apps/api/src/pois/pois.service.ts:226-311 ; dto/find-pois.dto.ts] — endpoint live (targetKm/radiusKm)
- [Source: apps/web/src/hooks/use-live-poi-search.ts ; lib/api-client.ts:283-304] — hook + façade à porter
- [Source: apps/web/.../live-controls.tsx ; live-filters-drawer.tsx ; live-map-canvas.tsx:400-439,680-709] — panneau/filtres/cercle/zoom
- [Source: story 16-19/16-20/16-24/16-25/16-26 *.md] — fixes live (Google Places, max dynamique, −/+, persist, auto-zoom+cercle)
- [Source: CLAUDE.md §"Aucun résultat" / §Auto-zoom] — hasFetched, ref en fin d'effet (régression)
- [Source: _bmad-output/implementation-artifacts/MOB-4-2-poi-layers-pins-clusters-detail-sheet.md ; MOB-4-3-corridor-km-search.md] — calques POI + store + cache (réutilisation)
- [Source: MOB-5-1-…md ; MOB-5-2-…md] — store/GPS/caméra (dépendances)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.3 (ready-for-dev) — découverte POI Live : `getLivePois` (targetKm/radiusKm, RGPD sans GPS), `use-live-poi-search` (recherche explicite `enabled:false`/`refetch`, `hasFetched`, categories hors clé, offline cache), calques POI live + popup, cercle rayon + point cible (`createCirclePolygon` anneau fermé), auto-zoom once (ref en fin d'effet, pas de cleanup-reset), panneau Live fonctionnel (slider −/+ max dynamique, RECHERCHER, ETA), tiroir filtres persist-on-close, bannière no-results (`hasFetched`), dégradation gracieuse. Backend live déjà serveur. i18n FR/EN, tests. Re-design panneau = 5.4, profil = 5.5, météo = 5.6. | bmad-create-story (Story Context Engineer) |
