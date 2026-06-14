# Story MOB-4.2 : Calques POI, pins, clusters & fiche détail

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **afficher des calques POI et consulter le détail d'un POI**,
So that **j'explore les services le long de ma trace**.

> **Dépend de MOB-4.1** (infra carte : `map/[id].tsx`, `map-canvas.tsx`, `maplibre-config.ts`, attribution). Cette story ajoute : les **calques POI** (4 toggles `accommodations`/`restaurants`/`supplies`/`bike`), le rendu des **pins SVG** (couleurs canon `poi-colors.ts`), le **clustering** natif MapLibre, et la **fiche détail** en bottom sheet (`@gorhom/bottom-sheet`).
>
> **Le déclenchement de la recherche POI par corridor km est MOB-4.3** — ici on pose le **modèle de calques + le rendu + la fiche**, et on consomme l'endpoint `GET /pois`. Pour cette story, prévoir un déclenchement minimal (ex. calque par défaut `accommodations` sur une plage par défaut, ou affichage des POIs déjà renvoyés) ; **le gate `searchCommitted` + slider arrivent en MOB-4.3**. Coordination : implémenter `hooks/use-pois.ts` ici de façon à ce que MOB-4.3 n'ait qu'à brancher le slider + le gate.
>
> **Backend epic 4 livré** : `GET /pois` (corridor) + `GET /pois/google-details` (enrichissement) + `GET /geo/reverse-city` — **rien à recréer**. Le **deep link booking** (FR-033) est traité en **MOB-4.5** ; la **fiche d'accès POI** (FR-PA-001) en **MOB-4.6**. Cette story rend la fiche **prête à accueillir** ces blocs (slots), sans les implémenter.

## Acceptance Criteria

1. **Given** la carte
   **When** j'active/désactive un calque POI (🏨 hébergements / 🍽️ restaurants / 🛒 ravitaillement / 🚲 vélo)
   **Then** les pins correspondants apparaissent/disparaissent **indépendamment** par calque (toggle multi-sélection ; défaut : `accommodations` actif) (FR-023, FR-034)
   **And** l'état des calques est conservé tant que l'écran carte est monté

2. **Given** des POIs dans le viewport
   **When** la carte est affichée
   **Then** les POIs sont rendus en **pins SVG** dont la couleur vient de **`POI_CATEGORY_COLORS`** (`@ridenrest/shared`, style **inline**), regroupés en **clusters** au-delà d'un seuil (clustering natif MapLibre : `cluster: true`, `clusterRadius: 50`, `clusterMaxZoom: 13` — parité web) (FR-024)
   **And** la couleur de cluster est `POI_CLUSTER_COLOR` (`#2D6A4A`)
   **And** taper un cluster zoome/écarte les pins (expansion native)

3. **Given** un pin POI
   **When** je tape dessus
   **Then** une **fiche détail** s'ouvre en **bottom sheet** (`@gorhom/bottom-sheet`) (FR-025)
   **And** elle affiche **nom, type (catégorie), distance depuis la trace (m) et kilométrage (km)** (FR-032)
   **And** le pin sélectionné est **recentré avec un offset vertical** (la caméra décale le point pour laisser la place au sheet)
   **And** fermer le sheet (drag down / backdrop) désélectionne le POI

4. **Given** une fiche POI ouverte sur un POI enrichissable (hébergement, source `overpass`/`google`)
   **When** la fiche est affichée
   **Then** un enrichissement optionnel (ville via `GET /geo/reverse-city`, détails Google via `GET /pois/google-details`) peut compléter la fiche **sans bloquer** son affichage de base (skeleton scopé sur la partie enrichie, jamais sur la fiche entière)
   **And** la fiche réserve des **slots** pour le bloc deep links booking (MOB-4.5) et le bloc itinéraire d'accès (MOB-4.6), non implémentés ici

5. **Given** la carte hors-ligne (`!isOnline`)
   **When** des POIs avaient été chargés (cache `poi-cache.ts` alimenté en ligne)
   **Then** les pins restent affichables depuis le cache `/cache/pois/{adventureId}.json` ; les enrichissements réseau (Google/ville) sont simplement omis (pas d'erreur bloquante)

## Tasks / Subtasks

- [ ] **T1 — Dépendance `@gorhom/bottom-sheet` (v5)** (AC: 3)
  - [ ] `npx expo install @gorhom/bottom-sheet` (v5, New Arch). Peers **déjà présents** : `react-native-gesture-handler ~2.31.1`, `react-native-reanimated 4.3.1` (vérifier compat v5 ↔ reanimated 4). `GestureHandlerRootView` est **déjà monté** au root `_layout.tsx` — ne pas redoubler.
  - [ ] Pas de plugin config natif additionnel attendu pour `@gorhom/bottom-sheet` (JS au-dessus de gesture-handler/reanimated). **Vérifier** : si le sheet ne s'anime pas → contrôler que reanimated babel plugin est actif (déjà le cas) ; pas de prebuild requis sauf si une dep transitive est native.
  - [ ] Mock Jest : `@gorhom/bottom-sheet` → composant passthrough sans JSX RN dans la factory (cf. règle NativeWind/jest). Réutiliser le pattern des mocks existants.

- [ ] **T2 — Modèle de calques `hooks/use-poi-layers.ts` (ou état écran)** (AC: 1)
  - [ ] État `visibleLayers: Set<MapLayer>` (défaut `{'accommodations'}`, parité web), `toggleLayer(layer)`. **`MapLayer`** et `LAYER_CATEGORIES` / `CATEGORY_TO_LAYER` importés de `@ridenrest/shared` (jamais redéfinis). 4 calques : `accommodations | restaurants | supplies | bike`.
  - [ ] Possibilité d'élargir plus tard (sous-filtre `activeAccommodationTypes`) — **hors périmètre** ici (web a un sous-filtre hébergement ; à reporter si besoin en MOB-4.x ultérieure). Garder l'API extensible.
  - [ ] **Où vit l'état** : lifté au niveau de la **route map** (`map/[id].tsx`) — pattern web « la page possède la sélection » — et passé à `layer-toggles` + `map-canvas`/`poi-layer`. (Pas de nouvelle dép store ; si l'arborescence devient lourde, un Context scopé à la route est acceptable. Zustand reste l'option parité web mais non requise.)

- [ ] **T3 — `components/map/layer-toggles.tsx`** (AC: 1)
  - [ ] 4 boutons toggle (icône + couleur de calque `POI_LAYER_COLORS`, **style inline** pour la couleur). Emojis/labels i18n. État actif/inactif visuellement distinct (bordure/fond). A11y : `accessibilityRole="switch"` + `accessibilityState={{ checked }}` + label i18n par calque.
  - [ ] Réutiliser `Button`/`cn()` pour la base ; couleur dynamique = **style inline** (pas Tailwind JIT).
  - [ ] Icônes : ajouter les icônes lucide nécessaires dans `components/ui/icon.tsx` via `cssInterop` (ex. `BedDouble`, `Utensils`, `ShoppingBasket`, `Bike` — `Bike` existe déjà). Parité web : layer→icône.

- [ ] **T4 — `hooks/use-pois.ts` + façade `lib/api/pois.ts`** (AC: 2, 4, 5)
  - [ ] Façade `lib/api/pois.ts` :
    - `findPois(params): Promise<Poi[]>` → `apiFetch('/pois?segmentId=…&fromKm=…&toKm=…&categories=…&overpassEnabled=false')` (mode corridor/planning). **JAMAIS de lat/lng dans la requête** (RGPD — archi L795/L948).
    - `getPoiGoogleDetails(externalId, segmentId): Promise<GooglePlaceDetails | null>` → `apiFetch('/pois/google-details?externalId=…&segmentId=…')`.
    - `reverseCity(lat, lng): Promise<{ city, postcode, state, country }>` → `apiFetch('/geo/reverse-city?lat=…&lng=…')`. (Coords ici = celles **du POI** retourné par le serveur, pas la position user → RGPD OK.)
  - [ ] `usedPois` (`hooks/use-pois.ts`) : une `useQuery`/`useQueries` par (`segmentId` × `layer`), **query key parité web** `['pois', { segmentId, fromKm, toKm, layer, overpassEnabled }]`, `staleTime`/`gcTime` longs (POI_BBOX_CACHE_TTL ≈ 30 j côté web ; au mobile, `staleTime` élevé + persist optionnel). **MOB-4.2** : prévoir un déclenchement minimal (plage par défaut) ; **MOB-4.3** branchera `searchCommitted` + slider `fromKm/toKm`. Exposer un flag `enabled` piloté par le gate.
  - [ ] **Catégories par calque** : dériver `categories` depuis `LAYER_CATEGORIES[layer]` (`@ridenrest/shared`).
  - [ ] **Offline (AC5)** : write-through `setCachedPois(adventureId, pois)` au succès ; lecture `getCachedPois` en fallback offline. **`poi-cache.ts` existe déjà** (squelette branché ici) : `getCachedPois`/`setCachedPois` (type `Poi[]`).
  - [ ] Enrichissement Google : hook `usePoiGoogleDetails(externalId, segmentId)` (lazy, `enabled` quand la fiche est ouverte sur un POI Google/enrichissable). Idem `useReverseCity` (key `['reverseCity', 'lat,lng(3dp)']`).

- [ ] **T5 — Pins SVG + `lib/map/pin-factory.ts`** (AC: 2)
  - [ ] `pin-factory.ts` : fabrique le marqueur SVG (forme pin + pastille couleur catégorie). Couleur = `POI_CATEGORY_COLORS[category]` **inline**. Utiliser `react-native-svg` (déjà présent) ou les `assets/icons/poi/*.svg` (partagés web — **décision** d'emplacement, cf. archi gap L1227 : `apps/mobile/assets/icons/poi/` recommandé MVP).
  - [ ] **Rendu calques** : `components/map/poi-layer.tsx` — `ShapeSource` (id par calque, ou un source unique avec `cluster: true`) + `SymbolLayer`/`CircleLayer` pour les pins, + couche cluster (cercle `POI_CLUSTER_COLOR` + `text` `point_count`). **Clustering natif MapLibre** : `cluster: true`, `clusterRadius: 50`, `clusterMaxZoom: 13` ; rayon de cercle cluster en `step` sur `point_count` (parité web : `16, 10→22, 50→28`).
  - [ ] Calques **indépendants** : un POI n'apparaît que si son calque est dans `visibleLayers`. Filtrer les POIs par `CATEGORY_TO_LAYER[poi.category] ∈ visibleLayers`.
  - [ ] Tap cluster → `getClusterExpansionZoom` (API MapLibre RN) + `camera.setCamera({ zoom })` centré sur le cluster.

- [ ] **T6 — Fiche détail `components/map/poi-detail-sheet.tsx` + `components/shared/poi-card.tsx`** (AC: 3, 4)
  - [ ] `poi-detail-sheet.tsx` : `BottomSheet`/`BottomSheetModal` (`@gorhom/bottom-sheet`), `snapPoints` ≈ `['40%', '85%']` (parité web `[0.4, 0.85]`), backdrop, drag-to-dismiss. Monté **dans la route map** (au-dessus du `MapView`).
  - [ ] Contenu (`poi-card.tsx` réutilisable) : **nom**, **catégorie** (libellé i18n), **distance depuis la trace** (`distFromTraceM` → « X m » / « X,X km »), **kilométrage** (`distAlongRouteKm` → « km X »). Réutiliser `Card`/`Text`/tokens.
  - [ ] **Recentrage avec offset (AC3)** : à l'ouverture, `camera.setCamera({ centerCoordinate: [lng, lat], padding: { paddingBottom: <hauteur sheet> } })` ou un décalage de centre vers le haut, pour que le pin reste visible au-dessus du sheet.
  - [ ] **Enrichissement (AC4)** : bloc ville (`useReverseCity`) + détails Google (`usePoiGoogleDetails`) en **skeleton scopé** (jamais bloquer la fiche de base). Erreur enrichissement → bloc simplement omis (pas d'ErrorBanner sur toute la fiche).
  - [ ] **Slots d'extension** : prévoir un emplacement clair pour `<BookingLinks />` (MOB-4.5) et `<AccessMetrics />` (MOB-4.6) — props optionnelles / `children` / sections conditionnelles non remplies ici. Documenter pour éviter une refonte en 4.5/4.6.
  - [ ] Fermeture → `onChange`/`onDismiss` → `setSelectedPoiId(null)`.

- [ ] **T7 — Intégration route map (`map/[id].tsx`)** (AC: 1, 2, 3)
  - [ ] Brancher `visibleLayers` + `layer-toggles` (overlay sur la carte), `poi-layer` (dans le `MapView`, au-dessus de la trace), `poi-detail-sheet` (sélection `selectedPoiId` liftée à la route).
  - [ ] `selectedPoiId` : state route ; tap pin → set ; sheet `onDismiss` → null. Le POI sélectionné alimente le sheet + le recentrage.
  - [ ] Ordre de rendu (z) : trace < pins/clusters < attribution toujours visible ; toggles + sheet au-dessus.

- [ ] **T8 — i18n (FR + EN)** (AC: 1, 3, 4)
  - [ ] Bloc `pois.*` (parité FR/EN) :
    - `pois.layers.accommodations` / `.restaurants` / `.supplies` / `.bike` (+ label a11y)
    - `pois.category.<PoiCategory>` (hotel, hostel, camp_site, shelter, guesthouse, restaurant, supermarket, convenience, bike_shop, bike_repair) — libellés FR/EN
    - `pois.distanceFromTrace` (« À {{value}} de la trace ») / `pois.kmMarker` (« km {{value}} »)
    - `pois.sheet.close` (a11y) / `pois.detail.loadFailedEnrichment` (optionnel)
  - [ ] **Zéro chaîne en dur**.

- [ ] **T9 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [ ] `use-poi-layers` (pur) : toggle ajoute/retire, défaut `accommodations`.
  - [ ] `use-pois` : query key stricte ; `categories` dérivées de `LAYER_CATEGORIES` ; write-through cache au succès ; fallback `getCachedPois` offline (mock `poi-cache`).
  - [ ] `pin-factory` (pur) : couleur = `POI_CATEGORY_COLORS[category]`.
  - [ ] `poi-detail-sheet`/`poi-card` : affiche nom/catégorie/distance/km ; enrichissement en skeleton, omis si erreur ; fermeture → callback. (mock `@gorhom/bottom-sheet` + `@maplibre/...`)
  - [ ] `layer-toggles` : 4 switches, `accessibilityState.checked`, toggle appelle le bon handler.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` OK.

- [ ] **T10 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client
  - [ ] Toggles → pins apparaissent/disparaissent par calque. Clusters au dézoom, expansion au tap.
  - [ ] Tap pin → bottom sheet (nom/type/distance/km), pin recentré au-dessus du sheet, fermeture désélectionne.
  - [ ] Hors-ligne après 1ʳᵉ charge → pins depuis cache, pas d'erreur bloquante.

## Dev Notes

### Backend epic 4 (POI) DÉJÀ livré — NE PAS recréer

- **`GET /pois`** (corridor/planning) — query `FindPoisDto` : `segmentId` (uuid), `fromKm`, `toKm` (toKm>fromKm, ≤50 km serveur), `categories?: PoiCategory[]` (défaut 10), `overpassEnabled?` (défaut false). Réponse `{ data: Poi[] }`. **Pas de lat/lng en planning** (RGPD). [Source: apps/api/src/pois/pois.controller.ts:27-31 ; dto/find-pois.dto.ts:8-49]
- **`GET /pois/google-details`** — `{ externalId, segmentId }` → `{ data: GooglePlaceDetails | null }`. (Il n'y a **pas** de `GET /pois/:id` — l'enrichissement passe par `externalId`.) [Source: pois.controller.ts:34-39 ; dto/get-google-details.dto.ts]
- **`GET /geo/reverse-city`** — `{ lat, lng }` → `{ data: { city, postcode, state, country } }` (chacun `string|null`, Geoapify). [Source: apps/api/src/geo/geo.controller.ts:11-15]

**Type `Poi`** (`@ridenrest/shared`, import racine — **jamais redéfini**) :
```ts
interface Poi {
  id: string; externalId: string; source: 'overpass'|'amadeus'|'google';
  category: PoiCategory; name: string; lat: number; lng: number;
  distFromTraceM: number;       // distance trace (m)  → AC3
  distAlongRouteKm: number;     // km marker          → AC3
  distFromTargetM?: number;     // live only
  bookingUrl?: string;          // (rebuild client en MOB-4.5)
  rawData?: Record<string, unknown>; // tags OSM (addr:city…)
}
type PoiCategory = 'hotel'|'hostel'|'camp_site'|'shelter'|'guesthouse'|'restaurant'|'supermarket'|'convenience'|'bike_shop'|'bike_repair';
```
[Source: packages/shared/src/types/poi.types.ts:5,7-20]

### Calques / couleurs / clusters (source de vérité partagée)

- **Couleurs canon** (`packages/shared/src/constants/poi-colors.ts`) — **mirror, ne pas redéfinir** :
  - `POI_CATEGORY_COLORS` : hotel `#F97316`, camp_site `#38BDF8`, shelter `#84CC16`, guesthouse `#EC4899`, hostel `#8B5CF6`, restaurant `#EF4444`, supermarket/convenience `#A855F7`, bike_shop/bike_repair `#14B8A6`.
  - `POI_CLUSTER_COLOR = '#2D6A4A'` (clusters + trace).
  - `POI_LAYER_COLORS` : accommodations `#F97316`, restaurants `#EF4444`, supplies `#A855F7`, bike `#14B8A6`.
- **4 calques** `MapLayer = 'accommodations'|'restaurants'|'supplies'|'bike'` ; `LAYER_CATEGORIES` / `CATEGORY_TO_LAYER` (`packages/shared/src/types/poi.types.ts:27-46`). accommodations = [hotel,hostel,camp_site,shelter,guesthouse] ; restaurants = [restaurant] ; supplies = [supermarket,convenience] ; bike = [bike_shop,bike_repair].
- **Clustering web (à porter)** : MapLibre natif `cluster:true, clusterMaxZoom:13, clusterRadius:50`, rayon cercle `['step', ['get','point_count'], 16, 10, 22, 50, 28]`. [Source: apps/web/src/hooks/use-poi-layers.ts:81-87]
- **State web** (référence) : `visibleLayers: Set<MapLayer>` défaut `{'accommodations'}`, `toggleLayer`. [Source: apps/web/src/stores/map.store.ts:66,84-93]
- **Couleurs dynamiques POI = style inline obligatoire** (Tailwind JIT KO sur `bg-[${color}]`). [Source: architecture-mobile.md#L632,#L770-773]

### Fiche détail (référence web → @gorhom/bottom-sheet)

- L'analogue RN du bottom sheet est `poi-detail-sheet.tsx` (web : vaul Drawer, `snapPoints=[0.4,0.85]`). Le popup ancré web (`poi-popup.tsx`) montre nom/type/distance/km + enrichissement Google (`usePoiGoogleDetails`) + ville (`reverseCity`). [Source: apps/web/src/.../poi-detail-sheet.tsx, poi-popup.tsx:162-166]
- **Slots** : sur web, `<AccessMetrics>` (accès POI) et le dropdown booking sont montés **uniquement pour les hébergements** (`LAYER_CATEGORIES.accommodations`). Reproduire ce gate côté slots (MOB-4.5/4.6). [Source: apps/web/.../poi-popup.tsx:498-509]
- **`@gorhom/bottom-sheet` v5** retenu par l'archi pour les fiches POI mobile. [Source: architecture-mobile.md#L332,#L1153 ; table fichiers #L824]

### Réutilisation du code mobile existant

- **MOB-4.1** : `map/[id].tsx`, `map-canvas.tsx` (props `children` + accès caméra), `maplibre-config.ts`, `osm-attribution.tsx`.
- `src/lib/cache/poi-cache.ts` — **`getCachedPois`/`setCachedPois` (type `Poi[]`) existent déjà** (squelette à brancher ici). [Source: apps/mobile/src/lib/cache/poi-cache.ts]
- `src/lib/api/api-client.ts` — `apiFetch` (préfixe `/api`, déballe `{data}`).
- `src/components/ui/icon.tsx` — ajouter icônes calques via `cssInterop` (pattern existant ; `react-native-svg` natif requis → rebuild dev client).
- `src/components/ui/card.tsx`, `skeleton.tsx`, `button.tsx`, `error-banner.tsx`, `src/lib/cn.ts`, `src/lib/i18n`, `src/lib/format/distance` (`formatKm`).
- `src/hooks/use-network-status.ts` (offline AC5).

### Conventions

- `@gorhom/bottom-sheet` JS → pas de prebuild a priori, mais **`react-native-svg` est natif** (pins SVG) → déjà dans le binaire (MOB-3.1) ; si nouvelles icônes lucide → toujours rebuild dev client pour le rendu SVG.
- **RGPD** : `GET /pois` **sans** lat/lng user (segmentId + km). `reverse-city` utilise les coords **du POI** (OK). PostHog session-replay masque les vues carte (futur MOB-6). [archi L795,#L948,#L1397]
- Loading/erreurs : skeleton scopé + ErrorBanner inline, jamais `Alert.alert`. Tests hors `src/app/`, mocks sans JSX, `userEvent`. i18n FR/EN parité.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/components/map/layer-toggles.tsx
apps/mobile/src/components/map/poi-layer.tsx
apps/mobile/src/components/map/poi-detail-sheet.tsx
apps/mobile/src/components/shared/poi-card.tsx
apps/mobile/src/lib/map/pin-factory.ts
apps/mobile/src/lib/api/pois.ts
apps/mobile/src/hooks/use-pois.ts
apps/mobile/src/hooks/use-poi-layers.ts
apps/mobile/assets/icons/poi/*.svg              (si réutilisation des SVG web — décider emplacement)
apps/mobile/__mocks__/@gorhom__bottom-sheet.ts
+ tests co-localisés (use-poi-layers, use-pois, pin-factory, poi-detail-sheet, layer-toggles)
```
**Modifs** :
```
apps/mobile/app.config.ts (?)                    (si @gorhom requiert une entrée — a priori non)
apps/mobile/package.json + pnpm-lock.yaml
apps/mobile/src/components/ui/icon.tsx           (icônes calques)
apps/mobile/src/app/(app)/map/[id].tsx           (brancher calques + pins + sheet)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (bloc pois.*)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : `@gorhom/bottom-sheet`, modèle 4 calques + toggles, façade `pois.ts` + `use-pois` (déclenchement minimal), pins SVG `pin-factory`, clustering natif, fiche détail bottom sheet (nom/type/distance/km), enrichissement non bloquant (ville/Google), recentrage offset, slots booking/accès, cache POI offline, i18n, tests.
- **Exclu** : slider corridor + gate `searchCommitted` + overlay loading + bannière « aucun résultat » → **MOB-4.3** ; deep links booking + tracking → **MOB-4.5** ; itinéraire d'accès (fiche + polyline) → **MOB-4.6/4.7** ; densité → **MOB-4.4** ; météo → **MOB-4.8** ; sous-filtre type d'hébergement → ultérieur si requis.

### References

- [Source: epics-mobile.md#Story MOB-4.2 (l.729-749)] — AC d'origine (FR-023, FR-024, FR-025, FR-032, FR-034)
- [Source: packages/shared/src/types/poi.types.ts:5,7-20,27-46] — `Poi`, `PoiCategory`, `MapLayer`, `LAYER_CATEGORIES`, `CATEGORY_TO_LAYER`
- [Source: packages/shared/src/constants/poi-colors.ts:4-26] — `POI_CATEGORY_COLORS`, `POI_CLUSTER_COLOR`, `POI_LAYER_COLORS`
- [Source: apps/api/src/pois/pois.controller.ts:27-39 ; dto/find-pois.dto.ts:8-49] — `GET /pois`, `GET /pois/google-details`
- [Source: apps/api/src/geo/geo.controller.ts:11-15] — `GET /geo/reverse-city`
- [Source: apps/web/src/hooks/use-poi-layers.ts:81-87] — clustering MapLibre (radius/maxZoom/step)
- [Source: apps/web/src/stores/map.store.ts:66,84-93] — `visibleLayers`/`toggleLayer`
- [Source: apps/web/.../poi-detail-sheet.tsx, poi-popup.tsx:162-166,498-509] — fiche détail, enrichissement, slots accommodations-only
- [Source: architecture-mobile.md#L332,#L824,#L1153] — `@gorhom/bottom-sheet` v5, fichiers `poi-layer/layer-toggles/poi-detail-sheet/pin-factory`
- [Source: architecture-mobile.md#L632,#L770-773,#L795,#L948] — couleurs inline, RGPD POI sans GPS
- [Source: apps/mobile/src/lib/cache/poi-cache.ts] — `getCachedPois`/`setCachedPois`
- [Source: _bmad-output/implementation-artifacts/MOB-4-1-maplibre-native-trace-themes-attribution.md] — infra carte (dépendance)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.2 (ready-for-dev) — `@gorhom/bottom-sheet` v5, 4 calques POI (toggles indépendants, défaut accommodations), pins SVG `pin-factory` (couleurs canon `poi-colors.ts` inline), clustering natif MapLibre (radius 50/maxZoom 13), fiche détail bottom sheet (nom/type/distance/km) + recentrage offset + enrichissement non bloquant (ville/Google), slots booking/accès, cache POI offline (poi-cache existant), i18n FR/EN, tests. Endpoints `GET /pois`,`/pois/google-details`,`/geo/reverse-city` réutilisés. | bmad-create-story (Story Context Engineer) |
