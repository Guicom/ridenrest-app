---
baseline_commit: e8a4c35fed069188ba43d33a086d8c37fa0b818e
---

# Story MOB-4.2 : Calques POI, pins, clusters & fiche détail

Status: done

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
   **Then** une **fiche détail** s'ouvre en **popin « liquid glass »** flottante ancrée au pin (parité web `poi-popup.tsx`) (FR-025)
   > **Amendement 2026-06-14 (Guillaume, post-review)** : la fiche n'est PLUS un bottom sheet `@gorhom/bottom-sheet` mais une **popin verre dépoli** identique au web responsive (fond translucide + flou natif `expo-blur` + liseré spéculaire), ancrée au pin via un `<Marker>` natif MapLibre. Voir Completion Notes (refonte post-review).
   **And** elle affiche **nom, type (catégorie), distance depuis la trace (m) et kilométrage (km)** (FR-032), plus des **actions** Naviguer (Maps) / Téléphone / Site officiel / Copier l'adresse (parité web)
   **And** le pin sélectionné est **recentré avec un offset vertical** (la caméra décale le point pour laisser la place à la popin)
   **And** fermer la popin (croix) désélectionne le POI

4. **Given** une fiche POI ouverte sur un POI enrichissable (hébergement, source `overpass`/`google`)
   **When** la fiche est affichée
   **Then** un enrichissement optionnel (ville via `GET /geo/reverse-city`, détails Google via `GET /pois/google-details`) peut compléter la fiche **sans bloquer** son affichage de base (skeleton scopé sur la partie enrichie, jamais sur la fiche entière)
   **And** la fiche réserve des **slots** pour le bloc deep links booking (MOB-4.5) et le bloc itinéraire d'accès (MOB-4.6), non implémentés ici

5. **Given** la carte hors-ligne (`!isOnline`)
   **When** des POIs avaient été chargés (cache `poi-cache.ts` alimenté en ligne)
   **Then** les pins restent affichables depuis le cache `/cache/pois/{adventureId}.json` ; les enrichissements réseau (Google/ville) sont simplement omis (pas d'erreur bloquante)

## Tasks / Subtasks

- [x] **T1 — Dépendance `@gorhom/bottom-sheet` (v5)** (AC: 3)
  - [x] `npx expo install @gorhom/bottom-sheet` (v5, New Arch). Peers **déjà présents** : `react-native-gesture-handler ~2.31.1`, `react-native-reanimated 4.3.1` (vérifier compat v5 ↔ reanimated 4). `GestureHandlerRootView` est **déjà monté** au root `_layout.tsx` — ne pas redoubler.
  - [x] Pas de plugin config natif additionnel attendu pour `@gorhom/bottom-sheet` (JS au-dessus de gesture-handler/reanimated). **Vérifier** : si le sheet ne s'anime pas → contrôler que reanimated babel plugin est actif (déjà le cas) ; pas de prebuild requis sauf si une dep transitive est native.
  - [x] Mock Jest : `@gorhom/bottom-sheet` → composant passthrough sans JSX RN dans la factory (cf. règle NativeWind/jest). Réutiliser le pattern des mocks existants.

- [x] **T2 — Modèle de calques `hooks/use-poi-layers.ts` (ou état écran)** (AC: 1)
  - [x] État `visibleLayers: Set<MapLayer>` (défaut `{'accommodations'}`, parité web), `toggleLayer(layer)`. **`MapLayer`** et `LAYER_CATEGORIES` / `CATEGORY_TO_LAYER` importés de `@ridenrest/shared` (jamais redéfinis). 4 calques : `accommodations | restaurants | supplies | bike`.
  - [x] Possibilité d'élargir plus tard (sous-filtre `activeAccommodationTypes`) — **hors périmètre** ici (web a un sous-filtre hébergement ; à reporter si besoin en MOB-4.x ultérieure). Garder l'API extensible.
  - [x] **Où vit l'état** : lifté au niveau de la **route map** (`map/[id].tsx`) — pattern web « la page possède la sélection » — et passé à `layer-toggles` + `map-canvas`/`poi-layer`. (Pas de nouvelle dép store ; si l'arborescence devient lourde, un Context scopé à la route est acceptable. Zustand reste l'option parité web mais non requise.)

- [x] **T3 — `components/map/layer-toggles.tsx`** (AC: 1)
  - [x] 4 boutons toggle (icône + couleur de calque `POI_LAYER_COLORS`, **style inline** pour la couleur). Emojis/labels i18n. État actif/inactif visuellement distinct (bordure/fond). A11y : `accessibilityRole="switch"` + `accessibilityState={{ checked }}` + label i18n par calque.
  - [x] Réutiliser `Button`/`cn()` pour la base ; couleur dynamique = **style inline** (pas Tailwind JIT).
  - [x] Icônes : ajouter les icônes lucide nécessaires dans `components/ui/icon.tsx` via `cssInterop` (ex. `BedDouble`, `Utensils`, `ShoppingBasket`, `Bike` — `Bike` existe déjà). Parité web : layer→icône.

- [x] **T4 — `hooks/use-pois.ts` + façade `lib/api/pois.ts`** (AC: 2, 4, 5)
  - [x] Façade `lib/api/pois.ts` :
    - `findPois(params): Promise<Poi[]>` → `apiFetch('/pois?segmentId=…&fromKm=…&toKm=…&categories=…&overpassEnabled=false')` (mode corridor/planning). **JAMAIS de lat/lng dans la requête** (RGPD — archi L795/L948).
    - `getPoiGoogleDetails(externalId, segmentId): Promise<GooglePlaceDetails | null>` → `apiFetch('/pois/google-details?externalId=…&segmentId=…')`.
    - `reverseCity(lat, lng): Promise<{ city, postcode, state, country }>` → `apiFetch('/geo/reverse-city?lat=…&lng=…')`. (Coords ici = celles **du POI** retourné par le serveur, pas la position user → RGPD OK.)
  - [x] `usedPois` (`hooks/use-pois.ts`) : une `useQuery`/`useQueries` par (`segmentId` × `layer`), **query key parité web** `['pois', { segmentId, fromKm, toKm, layer, overpassEnabled }]`, `staleTime`/`gcTime` longs (POI_BBOX_CACHE_TTL ≈ 30 j côté web ; au mobile, `staleTime` élevé + persist optionnel). **MOB-4.2** : prévoir un déclenchement minimal (plage par défaut) ; **MOB-4.3** branchera `searchCommitted` + slider `fromKm/toKm`. Exposer un flag `enabled` piloté par le gate.
  - [x] **Catégories par calque** : dériver `categories` depuis `LAYER_CATEGORIES[layer]` (`@ridenrest/shared`).
  - [x] **Offline (AC5)** : write-through `setCachedPois(adventureId, pois)` au succès ; lecture `getCachedPois` en fallback offline. **`poi-cache.ts` existe déjà** (squelette branché ici) : `getCachedPois`/`setCachedPois` (type `Poi[]`).
  - [x] Enrichissement Google : hook `usePoiGoogleDetails(externalId, segmentId)` (lazy, `enabled` quand la fiche est ouverte sur un POI Google/enrichissable). Idem `useReverseCity` (key `['reverseCity', 'lat,lng(3dp)']`).

- [x] **T5 — Pins SVG + `lib/map/pin-factory.ts`** (AC: 2)
  - [x] `pin-factory.ts` : fabrique le marqueur SVG (forme pin + pastille couleur catégorie). Couleur = `POI_CATEGORY_COLORS[category]` **inline**. Utiliser `react-native-svg` (déjà présent) ou les `assets/icons/poi/*.svg` (partagés web — **décision** d'emplacement, cf. archi gap L1227 : `apps/mobile/assets/icons/poi/` recommandé MVP).
  - [x] **Rendu calques** : `components/map/poi-layer.tsx` — `ShapeSource` (id par calque, ou un source unique avec `cluster: true`) + `SymbolLayer`/`CircleLayer` pour les pins, + couche cluster (cercle `POI_CLUSTER_COLOR` + `text` `point_count`). **Clustering natif MapLibre** : `cluster: true`, `clusterRadius: 50`, `clusterMaxZoom: 13` ; rayon de cercle cluster en `step` sur `point_count` (parité web : `16, 10→22, 50→28`).
  - [x] Calques **indépendants** : un POI n'apparaît que si son calque est dans `visibleLayers`. Filtrer les POIs par `CATEGORY_TO_LAYER[poi.category] ∈ visibleLayers`.
  - [x] Tap cluster → `getClusterExpansionZoom` (API MapLibre RN) + `camera.setCamera({ zoom })` centré sur le cluster.

- [x] **T6 — Fiche détail `components/map/poi-detail-sheet.tsx` + `components/shared/poi-card.tsx`** (AC: 3, 4)
  - [x] `poi-detail-sheet.tsx` : `BottomSheet`/`BottomSheetModal` (`@gorhom/bottom-sheet`), `snapPoints` ≈ `['40%', '85%']` (parité web `[0.4, 0.85]`), backdrop, drag-to-dismiss. Monté **dans la route map** (au-dessus du `MapView`).
  - [x] Contenu (`poi-card.tsx` réutilisable) : **nom**, **catégorie** (libellé i18n), **distance depuis la trace** (`distFromTraceM` → « X m » / « X,X km »), **kilométrage** (`distAlongRouteKm` → « km X »). Réutiliser `Card`/`Text`/tokens.
  - [x] **Recentrage avec offset (AC3)** : à l'ouverture, `camera.setCamera({ centerCoordinate: [lng, lat], padding: { paddingBottom: <hauteur sheet> } })` ou un décalage de centre vers le haut, pour que le pin reste visible au-dessus du sheet.
  - [x] **Enrichissement (AC4)** : bloc ville (`useReverseCity`) + détails Google (`usePoiGoogleDetails`) en **skeleton scopé** (jamais bloquer la fiche de base). Erreur enrichissement → bloc simplement omis (pas d'ErrorBanner sur toute la fiche).
  - [x] **Slots d'extension** : prévoir un emplacement clair pour `<BookingLinks />` (MOB-4.5) et `<AccessMetrics />` (MOB-4.6) — props optionnelles / `children` / sections conditionnelles non remplies ici. Documenter pour éviter une refonte en 4.5/4.6.
  - [x] Fermeture → `onChange`/`onDismiss` → `setSelectedPoiId(null)`.

- [x] **T7 — Intégration route map (`map/[id].tsx`)** (AC: 1, 2, 3)
  - [x] Brancher `visibleLayers` + `layer-toggles` (overlay sur la carte), `poi-layer` (dans le `MapView`, au-dessus de la trace), `poi-detail-sheet` (sélection `selectedPoiId` liftée à la route).
  - [x] `selectedPoiId` : state route ; tap pin → set ; sheet `onDismiss` → null. Le POI sélectionné alimente le sheet + le recentrage.
  - [x] Ordre de rendu (z) : trace < pins/clusters < attribution toujours visible ; toggles + sheet au-dessus.

- [x] **T8 — i18n (FR + EN)** (AC: 1, 3, 4)
  - [x] Bloc `pois.*` (parité FR/EN) :
    - `pois.layers.accommodations` / `.restaurants` / `.supplies` / `.bike` (+ label a11y)
    - `pois.category.<PoiCategory>` (hotel, hostel, camp_site, shelter, guesthouse, restaurant, supermarket, convenience, bike_shop, bike_repair) — libellés FR/EN
    - `pois.distanceFromTrace` (« À {{value}} de la trace ») / `pois.kmMarker` (« km {{value}} »)
    - `pois.sheet.close` (a11y) / `pois.detail.loadFailedEnrichment` (optionnel)
  - [x] **Zéro chaîne en dur**.

- [x] **T9 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [x] `use-poi-layers` (pur) : toggle ajoute/retire, défaut `accommodations`.
  - [x] `use-pois` : query key stricte ; `categories` dérivées de `LAYER_CATEGORIES` ; write-through cache au succès ; fallback `getCachedPois` offline (mock `poi-cache`).
  - [x] `pin-factory` (pur) : couleur = `POI_CATEGORY_COLORS[category]`.
  - [x] `poi-detail-sheet`/`poi-card` : affiche nom/catégorie/distance/km ; enrichissement en skeleton, omis si erreur ; fermeture → callback. (mock `@gorhom/bottom-sheet` + `@maplibre/...`)
  - [x] `layer-toggles` : 4 switches, `accessibilityState.checked`, toggle appelle le bon handler.
  - [x] Gate : `test|typecheck|lint` verts + `expo export` OK.

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

claude-opus-4-8[1m] (bmad-dev-story)

### Debug Log References

- Gate finale verte : `tsc --noEmit` 0 erreur ; `expo lint` 0 erreur ; **269 tests / 45 suites** passants ; `expo export --platform ios` OK (bundle hbc 8.3 MB).
- Itérations notables :
  - RNTL v14 : `render()` doit être **await** avant d'utiliser `screen` (sinon « render function has not been called ») — corrigé dans `layer-toggles.test.tsx`.
  - `tsc` : `circle-color` (CircleLayer) exige `ExpressionSpecification` (style-spec) → cast typé de `buildCategoryColorExpression()`.
  - `expo lint` (react-hooks plugin strict) : refus d'écrire une ref au rendu + `setState` synchrone en effet → `use-pois` refactoré (signature d'écriture en **effet**, `setOfflinePois` uniquement dans le callback async, `pois` mémoïsé avec `EMPTY_POIS` stable).

### Completion Notes List

**Implémenté (T1–T9, AC1–AC5)** :
- **T1** `@gorhom/bottom-sheet@^5.2.14` (peers gesture-handler/reanimated déjà présents ; `GestureHandlerRootView` déjà au root — non redoublé ; aucun plugin natif additionnel). Mock Jest `__mocks__/@gorhom/bottom-sheet.js` (passe-plats sans JSX + ref impérative stubée + backdrop pressable) câblé dans `jest.setup.ts`.
- **T2** `use-poi-layers` : `visibleLayers: Set<MapLayer>` défaut `{accommodations}` + `toggleLayer` immuable (parité web). État lifté à la route.
- **T3** `layer-toggles` : 4 switches a11y (`role=switch` + `checked` + label i18n), couleur de calque `POI_LAYER_COLORS` en **style inline**, icônes lucide ajoutées (`BedDouble`/`Utensils`/`ShoppingBasket`/`Bike`, + `X` pour la fiche).
- **T4** façade `lib/api/pois.ts` (`findPois`/`getPoiGoogleDetails`/`reverseCity`, chemins propres sans `/api`, **RGPD : zéro lat/lng user**) + `use-pois` (`useQueries` par segment×calque, **query key parité web** `['pois',{segmentId,fromKm,toKm,layer,overpassEnabled}]`, `categories` dérivées de `LAYER_CATEGORIES`, write-through `setCachedPois` dédoublonné, fallback `getCachedPois` offline) + `usePoiGoogleDetails`/`useReverseCity` (lazy, désactivés hors-ligne → pas de skeleton `paused` infini).
- **T5** `pin-factory` (couleur canon `POI_CATEGORY_COLORS` + expression `match`) + `poi-layer` (un `GeoJSONSource` clusterisé par calque visible, `cluster`/`clusterRadius:50`/`clusterMaxZoom:13`, calque cluster `POI_CLUSTER_COLOR` + compteur + points colorés ; tap cluster → `getClusterExpansionZoom` + recentrage caméra ; tap pin → sélection ; filtrage par `visibleLayers`).
- **T6** `poi-detail-sheet` (BottomSheet `snapPoints ['40%','85%']`, backdrop, drag-to-dismiss → `onChange(-1)` → désélection, recentrage offset `easeTo padding.bottom`) + `poi-card` réutilisable (nom / catégorie i18n / distance trace / km ; enrichissement ville+Google en **skeleton scopé**, omis si absent ; **slots** booking 4.5 / accès 4.6 via `children`).
- **T7** route `map/[id].tsx` : `LayerToggles` overlay bas, `PoiLayer` dans le `<Map>`, `PoiDetailSheet` au-dessus ; `selectedPoiId` lifté ; déclenchement **minimal** (plage défaut 0–15 km, gate `enabled=traceReady`) — MOB-4.3 branchera slider + `searchCommitted`.
- **T8** i18n `pois.*` FR/EN (parité 18 clés vérifiée) — zéro chaîne en dur.
- **T9** tests co-localisés : `use-poi-layers` (5), `pin-factory` (13), `use-pois` (6), `layer-toggles` (3), `poi-card` (5), `poi-detail-sheet` (4), `poi-layer` (3) + `map-screen` route mis à jour (mock façade POI). Gate verte.

**⚠️ Divergence d'implémentation assumée (AC2 « pins SVG ») — DÉCISION** :
Les POIs individuels sont rendus en **`CircleLayer`** (pastille couleur catégorie), **pas** en `SymbolLayer` SVG goutte. Raison technique : MapLibre **Native** (RN v11) n'offre **aucun** chemin runtime SVG→image de style (le web rastérise SVG → `addImage`), et le **clustering natif exigé par l'AC2** (`cluster:true`) n'opère que sur des calques Circle/Symbol d'un `GeoJSONSource`. Les deux exigences fortes de l'AC2 sont **respectées** : couleur **source de vérité** (`POI_CATEGORY_COLORS`, canon partagé) + **clustering natif** (radius 50 / maxZoom 13 / step de rayon, parité web). La **goutte SVG teardrop** est un raffinement visuel **reporté à la validation Dev Client (T10)** — il nécessitera l'enregistrement d'images raster via `<Images>`. Documenté dans `pin-factory.ts` et `poi-layer.tsx`.

**🎨 Refonte fiche détail « liquid glass » (post-review, 2026-06-14 — demande Guillaume)** :
À la review visuelle, le bottom sheet blanc plein (`@gorhom/bottom-sheet`) a été **remplacé** par une **popin « liquid glass »** identique au web responsive (capture de référence fournie). Décisions validées par Guillaume : (1) **flou natif** via `expo-blur` (`BlurView`) ; (2) **ancrage au pin** via un `<Marker>` natif MapLibre (suivi natif fluide — `getPointInView`/projection JS **n'existe pas** dans cette build v11) ; (3) **actions disponibles** câblées (Naviguer/Téléphone/Site officiel/Copier l'adresse via `Linking`/`expo-clipboard`), le CTA booking « Rechercher sur » restant un **slot réservé MOB-4.5**.
- Nouveau composant `poi-popup.tsx` (`Marker` ancré `anchor="bottom"`/`offset`, `BlurView` verre + liseré + ombre + triangle pointeur, enrichissement gaté offline, recentrage `easeTo`).
- `poi-card.tsx` **refondu** au layout web (badge+croix, nom+navigate, téléphone, adresse copiable, distance/km, enrichissement skeleton, slots 4.5/4.6, site officiel) — présentationnel pur.
- `poi-detail-sheet.tsx` **supprimé** (+ son test). `@gorhom/bottom-sheet` reste installé (mock Jest conservé) — réutilisable pour d'éventuels sheets futurs, sans dépendance résiduelle dans l'écran carte.
- Tests : `poi-popup.test.tsx` (9, mocks Marker/BlurView/Clipboard/Linking) ; `poi-card.test.tsx` étendu (13). **Leçon RNTL v14** : un `await rerender` laisse `screen` pointer un arbre périmé pour les `it` suivants → un rendu frais par cas. Timer de feedback copie nettoyé au démontage (anti-fuite worker).
- Modules natifs ajoutés (`expo-blur`, `expo-clipboard`) → **rebuild Dev Client requis** (intégré au reste de T10).
- **Correctif device (crash « `id` cannot be changed »)** : le `Marker` MapLibre **gèle** son prop `id` au montage (`useFrozenId`) → un `id` dérivé de `poi.id` jetait au changement de POI. Fix : `id="poi-popup"` **constant** (une seule popin à la fois) ; `lngLat` (non gelé) se met à jour → la fiche se repositionne sur le nouveau pin sans remount. Test de non-régression dans `poi-popup.test.tsx`.
- **Correctif device (zoom-out intermittent au tap POI, 2026-06-14)** : le recentrage de la fiche appelait `easeTo({ center, padding:{top:300}, duration })` **sans `zoom`** → le SDK natif recalculait le zoom pour faire tenir le centre dans la zone non-paddée (zoom arrière par à-coups). Fix : suppression du `padding` ; lecture du **zoom courant** (`getMap().getZoom()`) passé **explicitement** à `easeTo` (zoom préservé à l'identique), et décalage du pin en moitié basse via **projection** (`project`/`unproject` — qui **existent** dans cette build v11, contrairement à `getPointInView`), reproduisant le `offset:[0,100]` web. Repli si projection indispo : `easeTo` sans `zoom` conserve le zoom courant. 2 tests anti-régression dans `poi-popup.test.tsx`. `PoiPopup` reçoit désormais `getMap` (via `MapCanvasHandle.getMap`).
- **🩹 Gouttes POI (parité web, 2026-06-14 — demande Guillaume, lève la divergence v1.0)** : les pins individuels passent de la **pastille `CircleLayer`** à la **goutte** identique au web. Les 8 SVG web (`apps/web/public/images/poi-icons/*.svg`) sont **rastérisés** (via `sharp`, 180×225 px, net jusqu'au @3x) en PNG dans `apps/mobile/assets/poi-pins/`, enregistrés par `<Images>` (`require`), référencés par un `SymbolLayer icon-image` data-driven (`buildCategoryIconExpression`, `icon-anchor:'bottom'` → pointe sur le point GPS, `icon-allow-overlap`). **Clustering natif inchangé** (clusters = cercle + compteur). **Pas de rebuild natif** (aucun module natif ajouté — juste des assets bundlés, validé `expo export`). Dégradation gracieuse si image manquante (parité web). `buildCategoryColorExpression` conservée (repli/usage générique).

**⏳ Reste manuel (T10 — délégué à Guillaume, non automatisable ici)** :
- Build Dev Client requis (`@gorhom/bottom-sheet` est JS au-dessus de gesture-handler/reanimated — pas de prebuild a priori ; mais les **nouvelles icônes lucide** dépendent de `react-native-svg` natif → **rebuild dev client** pour le rendu). Si `ios/` antérieur aux icônes → `expo prebuild --clean -p ios` puis `run:ios`.
- Validation device : toggles → **gouttes** par calque (couleur catégorie, pointe sur le point GPS — affiner `PIN_ICON_SIZE` si besoin) / clusters, expansion au tap cluster, **popin « liquid glass »** (recentrage **sans zoom-out**, zoom préservé) (flou natif rendu, fiche ancrée au pin qui suit la carte, nom/type/distance/km, actions Naviguer/Téléphone/Site/Copier) + recentrage offset + croix désélectionne, offline (pins depuis cache, fiche affichée sans enrichissement, pas d'erreur bloquante).
- ⚠️ Modules natifs `expo-blur`/`expo-clipboard` ajoutés → `npx expo prebuild --clean -p ios` puis `run:ios` (sinon `Cannot find native module ExpoBlur`).

### File List

**Ajouts** :
- `apps/mobile/src/hooks/use-poi-layers.ts` (+ `.test.tsx`)
- `apps/mobile/src/hooks/use-pois.ts` (+ `.test.tsx`)
- `apps/mobile/src/lib/api/pois.ts`
- `apps/mobile/src/lib/map/pin-factory.ts` (+ `.test.ts`)
- `apps/mobile/src/components/map/layer-toggles.tsx` (+ `.test.tsx`)
- `apps/mobile/src/components/map/poi-layer.tsx` (+ `.test.tsx`)
- `apps/mobile/src/components/map/poi-popup.tsx` (+ `.test.tsx`) — refonte « liquid glass » (remplace `poi-detail-sheet`)
- `apps/mobile/src/components/shared/poi-card.tsx` (+ `.test.tsx`)
- `apps/mobile/__mocks__/@gorhom/bottom-sheet.js`
- `apps/mobile/__mocks__/expo-blur.js`, `apps/mobile/__mocks__/expo-clipboard.js` (refonte)
- `apps/mobile/assets/poi-pins/{hotel,camp-site,shelter,guesthouse,hostel,restaurant,supplies,bike}.png` (gouttes — rastérisation des SVG web)

**Suppressions (refonte 2026-06-14)** :
- `apps/mobile/src/components/map/poi-detail-sheet.tsx` (+ `.test.tsx`) — remplacé par `poi-popup.tsx`

**Modifications** :
- `apps/mobile/package.json` + `pnpm-lock.yaml` (`@gorhom/bottom-sheet@^5.2.14` ; refonte : `expo-blur@~56.0.3`, `expo-clipboard@~56.0.4`)
- `apps/mobile/jest.setup.ts` (`jest.mock('@gorhom/bottom-sheet')` ; refonte : `jest.mock('expo-blur')` + `jest.mock('expo-clipboard')`)
- `apps/mobile/src/components/ui/icon.tsx` (icônes `BedDouble`/`Utensils`/`ShoppingBasket`/`X` ; refonte : `Navigation`/`Phone`/`Globe`/`Copy`/`Check`)
- `apps/mobile/src/lib/format/distance.ts` (`formatDistanceM`)
- `apps/mobile/src/app/(app)/map/[id].tsx` (calques + pins + popin `PoiPopup` enfant du `<Map>` ; gouttes : `getMap` passé à `PoiPopup`)
- `apps/mobile/src/lib/map/pin-factory.ts` (+ `.test.ts`) (gouttes : `CATEGORY_PIN_FILE`/`PIN_IMAGE_SOURCES`/`buildCategoryIconExpression`)
- `apps/mobile/src/components/map/poi-layer.tsx` (gouttes : `<Images>` + `SymbolLayer icon-image` à la place du `CircleLayer`)
- `apps/mobile/src/components/map/poi-popup.tsx` (+ `.test.tsx`) (correctif zoom-out : recentrage par projection, zoom préservé)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (bloc `pois.*` ; refonte : `pois.actions.*`)
- `apps/mobile/src/__tests__/map-screen.test.tsx` (mock façade POI)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (MOB-4-2 → in-progress/review)

## Review Findings

> Code review du 2026-06-14 — 3 agents parallèles (Blind Hunter + Edge Case Hunter + Acceptance Auditor). 2 decision_needed, 10 patch, 4 defer, 5 dismiss.

### Décisions requises

*(toutes résolues — 2026-06-14)*

### Patches

- [x] [Review][Patch] **`buildCategoryIconExpression` : supprimer le fallback `hotel`, pin invisible pour catégorie inconnue (décision Guillaume B — parité web)** [`apps/mobile/src/lib/map/pin-factory.ts:73-78`]
- [x] [Review][Patch] **`BlurView` : passer `tint="systemChromeMaterial"` pour le vrai liquid glass iOS 26 (décision Guillaume B)** [`apps/mobile/src/components/map/poi-popup.tsx`]
- [x] [Review][Patch] **`formatDistanceM` ne transmet pas `locale` à `formatKm`** — `formatKm(m / 1000, locale)` manque le second argument `locale` → le séparateur décimal est toujours en français pour les distances ≥ 1 km, quel que soit le paramètre passé. [`apps/mobile/src/lib/format/distance.ts`]
- [x] [Review][Patch] **`handleCopyAddress` avale silencieusement le rejet de `Clipboard.setStringAsync`** — pas de `.catch()`, donc sur Android (clipboard service indisponible) la promesse est rejetée sans feedback ni log. [`apps/mobile/src/components/map/poi-popup.tsx:171`]
- [x] [Review][Patch] **Query key non-canonique pour `usePoiGoogleDetails`** — `['pois', externalId, 'google-details', segmentId]` ne respecte pas la convention CLAUDE.md. Renommer en `['poi-details', externalId, segmentId]` pour éviter collision avec les keys `['pois', ...]` du corridor search. [`apps/mobile/src/hooks/use-pois.ts:222`]
- [x] [Review][Patch] **`handlePress` async sans guard double-tap ni try/catch global** — deux taps rapides sur un cluster lancent deux `getClusterExpansionZoom` concurrents ; la rejection hors du `.catch(() => null)` existant (ex. `camera.setStop`) est non gérée. Ajouter un `tapping` ref guard + `try/catch` englobant. [`apps/mobile/src/components/map/poi-layer.tsx:84-110`]
- [x] [Review][Patch] **Fermeture stale de `poi` dans le `useEffect` de recentrage** — `poi` et `recenterOnPoi` sont exclus de la dep array (`// eslint-disable-next-line`) mais lus en fermeture. Sur POI switch rapide, `recenterOnPoi(poi)` peut appeler `easeTo` vers les coordonnées du POI précédent avant de se corriger. Ajouter `poi` ou `poi?.id` comme dépendance. [`apps/mobile/src/components/map/poi-popup.tsx:143-149`]
- [x] [Review][Patch] **Write-through vide écrase un cache offline valide** — `setCachedPois(adventureId, [])` est appelé quand la recherche renvoie zéro POI, effaçant les données mises en cache pour d'autres plages du même `adventureId`. Skiper l'écriture si `pois.length === 0`. [`apps/mobile/src/hooks/use-pois.ts:175-181`]
- [x] [Review][Patch] **`selectedPoiId` non réinitialisé au toggle de calque → popup rouvre automatiquement** — si l'utilisateur a un popup ouvert (ex. hébergement), désactive le calque accommodations puis le réactive, `selectedPoiId` est toujours défini et le popup rouvre sans action délibérée. Réinitialiser `selectedPoiId` dans `toggleLayer` (ou dans un `useEffect` sur `visibleLayers`). [`apps/mobile/src/app/(app)/map/[id].tsx:77`]
- [x] [Review][Patch] **Aucun skeleton pour les slots enrichissement Google (adresse / téléphone / site)** — AC4 exige un skeleton scopé à la partie enrichie. `poi-card.tsx` affiche un skeleton pour la ville mais pas pour les slots adresse/téléphone/site pendant `googlePending`. Ajouter des placeholders skeleton pour ces slots. [`apps/mobile/src/components/shared/poi-card.tsx`]
- [x] [Review][Patch] **`findSegmentIdForKm` sensible aux virgules flottantes aux jonctions de segments** — `km >= s.cumulativeStartKm && km <= s.cumulativeStartKm + s.distanceKm` peut manquer un POI exactement à la jonction (float drift serveur). Ajouter une tolérance ε = 0.001 km sur les deux bornes. [`apps/mobile/src/app/(app)/map/[id].tsx:43`]
- [x] [Review][Patch] **`setCachedPois` peut throw silencieusement** — `void setCachedPois(...)` avale l'exception si `File.write()` échoue (stockage plein). Ajouter `.catch(() => { /* best-effort */ })` explicite pour clarifier l'intention. [`apps/mobile/src/hooks/use-pois.ts:180`]

### Différés

- [x] [Review][Defer] **`RECENTER_OFFSET_Y = 150` vs. spec web `offset: [0, 100]`** [`poi-popup.tsx:41`] — deferred, tunable lors de la validation device (T10) ; valeur mobile intentionnellement différente du web
- [x] [Review][Defer] **Granularité skeleton AC4 (un flag combiné Google+ville vs. skeleton par slot)** — deferred, AC4 est satisfait au niveau global (pas de blocage fiche entière) ; affinement visuel reporté
- [x] [Review][Defer] **`<Images>` style-load timing** [`poi-layer.tsx:181`] — deferred, MapLibre RN `<Images>` gère le re-register au rechargement de style via le contexte interne
- [x] [Review][Defer] **`dedupePois` avec POIs sans `id`** [`use-pois.ts:63-65`] — deferred, `Poi.id` est `string` non-optionnel dans le type partagé ; ne peut survenir qu'avec données serveur corrompues

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.2 (ready-for-dev) — `@gorhom/bottom-sheet` v5, 4 calques POI (toggles indépendants, défaut accommodations), pins SVG `pin-factory` (couleurs canon `poi-colors.ts` inline), clustering natif MapLibre (radius 50/maxZoom 13), fiche détail bottom sheet (nom/type/distance/km) + recentrage offset + enrichissement non bloquant (ville/Google), slots booking/accès, cache POI offline (poi-cache existant), i18n FR/EN, tests. Endpoints `GET /pois`,`/pois/google-details`,`/geo/reverse-city` réutilisés. | bmad-create-story (Story Context Engineer) |
| 2026-06-14 | 1.2 | **Correctifs device + gouttes POI (demande Guillaume)**. (1) **Zoom-out intermittent** au tap POI corrigé : recentrage `easeTo` sans `padding`, zoom courant lu (`getMap().getZoom()`) et passé explicitement, décalage du pin par projection (`project`/`unproject`, parité web `offset`) ; `PoiPopup` reçoit `getMap`. (2) **Gouttes POI** (parité web, lève la divergence v1.0) : 8 SVG web rastérisés (`sharp`, 180×225) → PNG `assets/poi-pins/`, `<Images>` + `SymbolLayer icon-image` data-driven (`buildCategoryIconExpression`, `icon-anchor:bottom`), clustering natif inchangé, **pas de rebuild natif**. Gate : tsc 0, lint 0, **290 tests/45 suites**, expo export iOS OK (8 PNG bundlés). | bmad-dev-story (claude-opus-4-8[1m]) |
| 2026-06-14 | 1.1 | **Refonte fiche détail « liquid glass » (post-review, demande Guillaume)**. Le bottom sheet `@gorhom/bottom-sheet` est remplacé par une **popin verre dépoli** identique au web responsive : nouveau `poi-popup.tsx` (`<Marker>` natif ancré au pin — pas de projection JS, absente en v11 ; `BlurView` `expo-blur` + liseré spéculaire + triangle pointeur ; recentrage `easeTo`), `poi-card.tsx` refondu au layout web + **actions** Naviguer/Téléphone/Site officiel/Copier (`Linking`/`expo-clipboard`), CTA booking laissé en slot MOB-4.5. `poi-detail-sheet.tsx` supprimé. Modules natifs `expo-blur@~56.0.3`/`expo-clipboard@~56.0.4` ajoutés (+ mocks Jest), icônes `Navigation`/`Phone`/`Globe`/`Copy`/`Check`, i18n `pois.actions.*`. Gate : tsc 0, lint 0, **282 tests/45 suites**, expo export iOS OK. ⏳ T10 inchangé + `prebuild --clean` requis (modules natifs). | bmad-dev-story (claude-opus-4-8[1m]) |
| 2026-06-14 | 1.0 | Implémentation T1–T9 (status → review). `@gorhom/bottom-sheet@^5.2.14` + mock Jest ; `use-poi-layers` (défaut accommodations) ; `layer-toggles` (4 switches a11y, couleur calque inline) ; façade `pois.ts` (RGPD sans GPS) + `use-pois` (useQueries segment×calque, query key parité web, write-through + fallback offline) + enrichissement lazy ville/Google ; `pin-factory` (couleur canon) + `poi-layer` (clustering natif radius50/maxZoom13, tap cluster→expansion, tap pin→sélection) ; `poi-detail-sheet` + `poi-card` (nom/catégorie/distance/km, enrichissement skeleton scopé, slots 4.5/4.6, recentrage offset) ; route câblée (déclenchement minimal, gate `enabled`) ; i18n `pois.*` FR/EN. **Divergence assumée** : pins rendus en CircleLayer (couleur catégorie canon) et non SymbolLayer SVG — contrainte MapLibre Native (pas de SVG→image runtime) + clustering natif Circle/Symbol only ; couleur source-de-vérité + clustering conformes ; goutte SVG reportée à T10. Gate : tsc 0, lint 0, 269 tests/45 suites, expo export iOS OK. ⏳ Reste : build Dev Client + validation device (T10, Guillaume). | bmad-dev-story (claude-opus-4-8[1m]) |
