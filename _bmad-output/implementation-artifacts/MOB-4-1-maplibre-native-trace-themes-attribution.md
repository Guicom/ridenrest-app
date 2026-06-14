---
baseline_commit: d14571068405bbb2c3afb1208e0da7023ee3e33b
---

# Story MOB-4.1 : Carte MapLibre Native (trace, thèmes, centrage, attribution OSM)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **voir ma trace sur une carte interactive native avec thème clair/sombre**,
So that **je visualise mon itinéraire**.

> **PREMIÈRE story de l'epic MOB-4 (Carte & Planification POI)** — elle pose **toute l'infrastructure carte** réutilisée par MOB-4.2→4.8 : le module natif `@maplibre/maplibre-react-native` (v11.3.4, **Dev Client requis**), la route dédiée `app/(app)/map/[id].tsx`, le composant `components/map/map-canvas.tsx`, la config `lib/map/maplibre-config.ts` (style/tiles light+dark), l'attribution OSM permanente, le rendu de la **trace GPX** (LineString) et le centrage auto. **Aucune** logique POI / densité / météo ici (stories suivantes).
>
> **Dépend de MOB-3.x (livré)** : `app/(app)/adventures/[id].tsx` (écran détail réel), `components/adventure/adventure-card.tsx` (boutons **Planning**/**Live** actuellement `disabled`), `hooks/use-adventures.ts`, `lib/api/api-client.ts` (`apiFetch`), `lib/cache/gpx-cache.ts` (`loadSegmentGpx` write-through offline), `hooks/use-network-status.ts`, `hooks/use-color-scheme.ts`. Le **backend epic 4 web est 100 % livré** : l'endpoint carte `GET /adventures/:id/map` renvoie segments + waypoints — **rien à recréer côté serveur**.
>
> **Point d'entrée** : cette story **active le bouton « Planning »** (carte) de `adventure-card.tsx` et/ou ajoute un CTA « Voir sur la carte » dans `adventures/[id].tsx`, qui `router.push('/(app)/map/{id}')`. Le bouton **Live** reste `disabled` (epic MOB-5).

## Acceptance Criteria

1. **Given** une aventure avec au moins un segment parsé (`parseStatus === 'done'`, waypoints disponibles)
   **When** j'ouvre la carte via le bouton **Planning** (route `app/(app)/map/[id].tsx`, MapLibre Native — **Dev Client requis**)
   **Then** la **trace GPX** s'affiche sur la carte sous forme de `LineString` (couleur de marque `TRACE_COLOR = #2D6A4A`, largeur 3) (FR-020)
   **And** la carte effectue un **centrage/fit automatique** sur le bounding box de la trace (padding ≈ 40 px) au premier rendu (FR-026)
   **And** le **chargement carte + trace s'effectue en < 3 s** sur l'aventure de référence (NFR-006), sans bloquer l'UI (skeleton/overlay scopé, jamais d'overlay plein écran bloquant)

2. **Given** la carte affichée
   **When** je bascule le thème de l'app (clair ↔ sombre, via `useColorScheme`)
   **Then** le **style de carte** passe en variante sombre ou claire de façon cohérente (le `styleURL`/`mapStyle` suit `colorScheme`) (FR-021)
   **And** la trace et l'attribution restent visibles et lisibles dans les deux thèmes

3. **Given** n'importe quelle vue carte
   **When** elle est affichée
   **Then** l'**attribution OpenStreetMap** (et du fournisseur de tuiles) est **visible en permanence** (composant `osm-attribution.tsx`), non masquée par les autres overlays (FR-036, NFR-044)

4. **Given** une aventure **sans segment parsé** (aucun waypoint) **ou** une erreur de chargement de `GET /adventures/:id/map`
   **When** j'ouvre la carte
   **Then** un **état vide explicite** (« Aucune trace à afficher — ajoutez un segment GPX ») ou un `<ErrorBanner />` est affiché à la place de la trace (jamais `Alert.alert`), la carte restant affichée (fond + attribution)

5. **Given** la carte ouverte **hors-ligne** (`!isOnline`)
   **When** la trace a déjà été consultée en ligne (cache GPX `loadSegmentGpx` / cache map alimenté)
   **Then** la trace reste affichable depuis le cache local ; **And** le fond de carte (tuiles) peut être indisponible offline (comportement dégradé accepté MVP : afficher la trace + un état « tuiles indisponibles hors-ligne » non bloquant)

## Tasks / Subtasks

- [x] **T1 — Dépendance native MapLibre + Dev Client** (AC: 1, 2)
  - [x] Installé via `npx expo install @maplibre/maplibre-react-native` → **`^11.3.4`** (PAS v10 : la v10 ne supporte pas RN 0.85/React 19 ; v11.3.4 a les peer deps exactes `expo>=54 / react>=19.1 / react-native>=0.80` et **requiert la New Architecture**, déjà activée SDK 56). **API v11 ≠ v10** : `Map`/`Camera`/`GeoJSONSource`/`Layer` (renommés depuis `MapView`/`ShapeSource`/`LineLayer`).
  - [x] Plugin ajouté dans `app.config.ts` `plugins: [...]` (`'@maplibre/maplibre-react-native'`, défauts).
  - [ ] **CRITIQUE build natif (À FAIRE PAR GUILLAUME)** : module natif + modif `app.config.ts` → `npx expo prebuild --clean -p ios` (vérifier MapLibre dans `ios/Podfile.lock`) **puis** `npx expo run:ios` (Xcode 26.4). Sinon `Cannot find native module …` au boot. Non exécutable dans cet environnement (pas de device/build).
  - [x] Mock Jest natif `__mocks__/@maplibre/maplibre-react-native.js` **réécrit pour l'API v11** (factory CommonJS sans JSX) : passe-plats `Map`/`Camera`/`GeoJSONSource`/`Layer` (+ Marker/ViewAnnotation/… extensibles), `testID` dérivé de `id`, `forwardRef` + handle impératif stubé (`fitBounds`…). Enregistré via `jest.mock('@maplibre/maplibre-react-native')` dans `jest.setup.ts`.

- [x] **T2 — Config carte `lib/map/maplibre-config.ts`** (AC: 1, 2, 3)
  - [x] Centralisé : `TRACE_COLOR = '#2D6A4A'`, `TRACE_WIDTH = 3`, `FIT_PADDING = 40`, `CAMERA_ANIMATION_MS = 500`.
  - [x] **Style light + dark** : `getMapStyle(colorScheme)` → **OpenFreeMap vectoriel** (parité web `lib/map-styles.ts`) light=`liberty` / dark=`dark`. **DÉCISION (Open Questions tranchées)** : vectoriel OpenFreeMap, **zéro clé API** (attribution OSM suffisante) — pas d'`EXPO_PUBLIC_*`.
  - [x] Aucune lecture de clé tuiles requise (OpenFreeMap sans clé).
  - [x] `computeTraceBounds(waypoints)` → `LngLatBounds [w,s,e,n]` en **réutilisant** `computeBoundingBox` de `@ridenrest/gpx`. + helpers `buildTraceFeatureCollection` / `collectTraceWaypoints` / `hasTrace` (purs).

- [x] **T3 — Données carte : façade API + hook** (AC: 1, 4, 5)
  - [x] Façade `src/lib/api/map.ts` : `getAdventureMapData(adventureId)` → `apiFetch('/adventures/${id}/map')` (chemin propre). `AdventureMapResponse` importé racine de `@ridenrest/shared`.
  - [x] Hook `src/hooks/use-adventure-map.ts` : `useQuery({ queryKey: ['adventures', id, 'map'], … })` + **polling conditionnel** `mapPollInterval` (3000 ms si segment `pending`/`processing`, `false` sinon — parité `segmentsPollInterval`). `enabled: Boolean(id)`.
  - [x] **Offline (AC5)** : trace dérivée des `waypoints` de `AdventureMapResponse` (persistée TanStack Query N1) → `buildTraceFeatureCollection`.

- [x] **T4 — Composant `components/map/map-canvas.tsx`** (AC: 1, 2, 3, 4)
  - [x] `<Map>` (plein écran) + `<Camera ref>` ; `mapStyle = getMapStyle(colorScheme)` (réagit au thème via `useColorScheme`).
  - [x] **Trace** : `<GeoJSONSource id="trace" data>` + `<Layer type="line" paint={{'line-color','line-width','line-opacity'}} layout={{'line-cap','line-join':'round'}}>`. Coordonnées **`[lng, lat]`**.
  - [x] **Fit auto (FR-026)** : `cameraRef.fitBounds([w,s,e,n], {padding, duration})` au chargement du style ET à chaque nouveau bbox, **zoom-once par bbox** (`lastFitRef`, parité `lastZoomedRef` ; pas de re-fit au changement de thème).
  - [x] **Attribution** : `<OsmAttribution />` overlay **frère** du `<Map>` (les enfants de `<Map>` sont du contenu carte natif, pas des Views RN) — toujours visible.
  - [x] **États** : déplacés dans l'écran route (séparation nette) — MapCanvas reste un rendu pur carte+trace+attribution.
  - [x] **Pas de Storybook** (composant natif). Tests via mock natif (T8).
  - [x] Props extensibles : `children` inséré dans `<Map>` (calques futurs) + `MapCanvasHandle` (`getCamera`/`getMap`) via `forwardRef` pour l'auto-zoom POI/accès (MOB-4.2/4.7).

- [x] **T5 — `components/shared/osm-attribution.tsx`** (AC: 3)
  - [x] Overlay coin bas-gauche « © OpenStreetMap contributors » (nom propre non traduit), label a11y via `t('map.attributionA11y')`, `accessibilityRole="text"`, fond `bg-card/80` thème-safe, `pointerEvents="none"`, position absolue. Toujours rendu.

- [x] **T6 — Route `app/(app)/map/[id].tsx` + point d'entrée** (AC: 1, 4)
  - [x] Route : `useLocalSearchParams` + `useAdventure(id)` (titre) + `useAdventureMap(id)`. **`id` durci** : falsy → aucune query (hooks `enabled:false`) + état neutre.
  - [x] Header flottant : retour (`router.back()`) + nom de l'aventure (pastilles `bg-card/80`). Carte plein écran dessous.
  - [x] **État vide (AC4)** : aucun waypoint → message `map.empty` + CTA `map.emptyCta` (retour). Carte (fond + attribution) reste visible (overlay centré, jamais bloquant).
  - [x] **Point d'entrée** : bouton **Planning** de `adventure-card.tsx` **activé** → `router.push('/(app)/map/${id}')` ; **+ CTA « Voir sur la carte »** dans `adventures/[id].tsx`. **Live reste `disabled`** (MOB-5). `typedRoutes` : OK sans cast (route régénérée à l'export, typecheck vert).
  - [x] **Tests de route → `src/__tests__/map-screen.test.tsx`** (hors `src/app/`).

- [x] **T7 — i18n (FR + EN)** (AC: 1, 3, 4, 5)
  - [x] Bloc `map.*` dans `fr.json` **et** `en.json` (parité vérifiée) : `title`, `back`, `openButton`, `empty`, `emptyCta`, `loadFailed`, `tilesOffline`, `attributionA11y`.
  - [x] Zéro chaîne en dur (sauf le nom propre « © OpenStreetMap contributors »).

- [x] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4)
  - [x] `lib/map/__tests__/maplibre-config.test.ts` (pur) : style light ≠ dark, `computeTraceBounds` bbox cohérent `[w,s,e,n]`, GeoJSON `[lng,lat]`, `hasTrace`.
  - [x] `src/hooks/__tests__/use-adventure-map.test.ts` : `mapPollInterval` 3000/false, query key stricte, **aucune requête si id falsy**.
  - [x] `src/components/map/__tests__/map-canvas.test.tsx` (mock natif) : trace rendue si waypoints, absente sinon, `<OsmAttribution>` **toujours** présent. `userEvent`.
  - [x] `src/__tests__/map-screen.test.tsx` : id falsy → pas de query ; titre + trace ; erreur → ErrorBanner (carte conservée) ; vide → message.
  - [x] Gate : `test` (230/230, 38 suites) + `typecheck` + `lint` (0) verts + `expo export --platform ios` **OK** (bundle, aucun test bundlé).

- [ ] **T9 — Validation manuelle (device/Dev Client) — À FAIRE PAR GUILLAUME** (AC: 1, 2, 3, 4, 5) — ⏳ **build Dev Client requis** (MapLibre ne tourne PAS dans Expo Go) — non exécutable dans cet environnement.
  - [ ] Ouvrir une aventure avec trace → trace affichée, carte centrée, < 3 s, attribution visible.
  - [ ] Basculer le thème app → style carte clair/sombre, trace lisible.
  - [ ] Aventure sans segment / endpoint en erreur → état vide / ErrorBanner, carte de fond visible.
  - [ ] Couper le réseau après une 1ʳᵉ consultation → trace toujours affichée (cache), message tuiles offline non bloquant.

### Review Findings

_Code review 2026-06-14 (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor). 1 decision-needed, 5 patch, 2 defer, 4 dismiss._

- [x] [Review][Decision] Modif hors-périmètre `apps/web/src/hooks/use-network-status.ts` — **RÉSOLU (option 1, 2026-06-14)** : conservé dans MOB-4.1, ajouté à la File List + note de divergence assumée (Doc Sync Rule).

- [x] [Review][Patch] Offline sans cache → skeleton infini (AC5) — **CORRIGÉ** : garde `map.fetchStatus !== 'paused'` sur la branche skeleton → retombe sur l'état vide (+ bandeau tuiles offline) [apps/mobile/src/app/(app)/map/[id].tsx]
- [x] [Review][Patch] État « parsing en cours » manquant — **CORRIGÉ** : branche `isMapParsing(map.data)` (i18n `map.parsing`) insérée avant l'état vide [apps/mobile/src/app/(app)/map/[id].tsx]
- [x] [Review][Patch] `id` blanc contourne le guard falsy — **CORRIGÉ** : `const id = (rawId ?? '').trim()` → un id blanc retombe falsy (pas de requête `/adventures/%20/map`) [apps/mobile/src/app/(app)/map/[id].tsx]
- [x] [Review][Patch] Doc — chemin du mock **CORRIGÉ** dans Project Structure Notes (`@maplibre/maplibre-react-native.js`)
- [x] [Review][Patch] Doc — version **CORRIGÉE** ligne 17 (v11.3.4)

- [x] [Review][Defer] AC5 (trace offline depuis cache) + AC2 (swap thème) sans test automatisé — délégué à la validation manuelle device T9 — deferred, couvert par T9
- [x] [Review][Defer] `computeTraceBounds` bbox dégénéré (point unique / antiméridien) — comportement pré-existant `@ridenrest/gpx` (buffer ≥1 km atténue) [apps/mobile/src/lib/map/maplibre-config.ts:53] — deferred, pre-existing

## Dev Notes

### Backend epic 4 (carte) DÉJÀ livré — NE PAS recréer

**Endpoint carte** (web, `done`) : `GET /adventures/:id/map` → `{ data: AdventureMapResponse }` (enveloppe `ResponseInterceptor` → `apiFetch` déballe `.data`). Web le poll 3000 ms tant qu'un segment est `pending`/`processing`.

- `AdventureMapResponse` / `MapSegmentData` / `MapWaypoint { lat, lng, ele?, distKm }` : **types `@ridenrest/shared`** (import racine). `MapSegmentData` porte `cumulativeStartKm` + `waypoints` (déjà simplifiés RDP côté serveur, ≤ `MAX_GPX_POINTS = 2000`). [Source: `packages/shared/src/types/adventure.types.ts`]
- **Attention nommage** : `@ridenrest/gpx` utilise `km`, `@ridenrest/shared` `MapWaypoint` utilise `distKm` — ne pas confondre. Pour la trace, seuls `lat`/`lng` sont nécessaires.

### Choix techniques carte (source : architecture-mobile.md)

- **Lib** : `@maplibre/maplibre-react-native` — APIs **distinctes de MapLibre GL JS web** (Layers, sources, click handlers à adapter). New Architecture (déjà activée SDK 56). **Dev Client obligatoire** (Expo Go ne charge pas les plugins natifs). [Source: architecture-mobile.md#L103, #L138, #L258, #L464, #L872, #L884]
- **Fichiers cibles (table FR→fichiers)** : `app/(app)/map/[id].tsx`, `components/map/map-canvas.tsx`, `components/shared/osm-attribution.tsx`, `lib/map/maplibre-config.ts`. [Source: architecture-mobile.md#L824]
- **Trace web (référence à porter)** : GeoJSON `LineString` source `'trace'`, couleur **uniforme `#2D6A4A`**, largeur 3 ; fit caméra une fois par jeu de waypoints. [Source: `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx:541-592`]
- **Caméra** : `Camera` ref + `fitBounds(ne, sw, padding=40, duration=500)`. Porter la logique `lastZoomedRef` (zoom-once) du web.
- **Style light/dark** : suivre `useColorScheme()` (hook existant `hooks/use-color-scheme.ts`). Le **mécanisme de swap de style carte n'est PAS spécifié** par l'archi → décision MOB-4.1 (cf. Open Questions). [Source: architecture-mobile.md#L633, gap §5 du rapport archi]
- **Couleurs dynamiques** : pour les overlays futurs (pins POI, densité), **style inline obligatoire** (Tailwind JIT ne génère pas `bg-[${color}]`). Pas concerné par la trace (couleur statique), mais à garder en tête pour la suite. [Source: architecture-mobile.md#L632, #L770-773]

### Réutilisation du code mobile existant (lis-les avant d'écrire)

- `src/lib/api/api-client.ts` — `apiFetch` (Bearer, `401→refresh→retry`, déballe `{data}`, `ApiError`). **Préfixe `/api` déjà ajouté** → façade `map.ts` utilise `/adventures/:id/map`.
- `src/hooks/use-adventures.ts` — `useAdventure(id)` (titre/stats). Réutiliser, ne pas refaire.
- `src/hooks/use-segments.ts` — `segmentsPollInterval(data)` (helper pur) : **réutiliser** pour le polling carte (peuplement dès parse terminé).
- `src/hooks/use-color-scheme.ts` — `useColorScheme()` → `colorScheme` pilote `getMapStyle`.
- `src/hooks/use-network-status.ts` — `useNetworkStatus()` → message tuiles offline (AC5).
- `src/lib/cache/gpx-cache.ts` — `loadSegmentGpx(segmentId, fetcher, isOnline)` (write-through + fallback cache). Disponible si besoin du GPX brut ; ici on s'appuie sur les waypoints de l'endpoint map (persistés N1).
- `@ridenrest/gpx` — `computeBoundingBox(points, bufferKm)` : **réutiliser** pour le bbox de fit (ne pas recoder).
- `src/components/ui/error-banner.tsx`, `skeleton.tsx`, `button.tsx`, `card.tsx` — réutiliser pour états/CTA. `src/lib/cn.ts` (`cn()`), `src/lib/i18n` (`useTranslation`).
- `src/components/adventure/adventure-card.tsx` — bouton **Planning** `disabled` à activer (point d'entrée).

### Conventions (archi + AGENTS.md)

- **Module natif** → `expo prebuild --clean -p ios` + `run:ios` (Xcode 26.4) après ajout + modif `app.config.ts`. EAS cloud = prebuild propre.
- **`apiFetch` chemins propres** (`/adventures/...`, jamais `/api/...`).
- **Loading/erreurs** : `<Skeleton>`/overlay scopé, `<ErrorBanner>` inline — **jamais** `Alert.alert` pour une erreur réseau. Pas de blocage UI total. [archi §Loading states L713-719]
- **Tests** : co-localisés ; tests de **route** sous `src/__tests__/` (gotcha `require.context`) ; mocks natifs dans `__mocks__/` sans JSX RN ; `userEvent` (RNTL v14 + React 19).
- **i18n** : FR défaut + EN parité (gate). Zéro chaîne en dur.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/app/(app)/map/[id].tsx
apps/mobile/src/components/map/map-canvas.tsx
apps/mobile/src/components/shared/osm-attribution.tsx
apps/mobile/src/lib/map/maplibre-config.ts
apps/mobile/src/lib/api/map.ts
apps/mobile/src/hooks/use-adventure-map.ts
apps/mobile/__mocks__/@maplibre/maplibre-react-native.js
apps/mobile/src/lib/map/__tests__/maplibre-config.test.ts
apps/mobile/src/hooks/__tests__/use-adventure-map.test.ts
apps/mobile/src/components/map/__tests__/map-canvas.test.tsx
apps/mobile/src/__tests__/map-screen.test.tsx
```
**Modifs** :
```
apps/mobile/app.config.ts                         (plugin @maplibre/maplibre-react-native)
apps/mobile/package.json + pnpm-lock.yaml         (expo install)
apps/mobile/src/components/adventure/adventure-card.tsx   (activer bouton Planning)
apps/mobile/src/app/(app)/adventures/[id].tsx     (optionnel : CTA « Voir sur la carte »)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (bloc map.*)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : module MapLibre + Dev Client, config style light/dark, route map, map-canvas, trace LineString + fit auto, attribution OSM permanente, états vide/erreur/offline-tuiles, point d'entrée Planning, i18n FR/EN, tests (avec mock natif).
- **Exclu** (stories suivantes) : calques POI / pins / clusters / fiche détail → **MOB-4.2** ; slider corridor + recherche → **MOB-4.3** ; densité colorisée + légende → **MOB-4.4** ; deep links booking → **MOB-4.5** ; fiche accès POI + variantes → **MOB-4.6** ; polyline accès + auto-zoom → **MOB-4.7** ; météo planifiée → **MOB-4.8** ; mode Live → **epic MOB-5**.

### Open Questions (à trancher au dev, non bloquantes pour la rédaction)

1. **Source de tuiles + clé API** : OSM raster (sans clé, simple, licence OSM) vs fournisseur vectoriel (MapTiler/Protomaps, clé `EXPO_PUBLIC_*`, styles light/dark natifs). L'archi ne tranche pas (gap). Recommandation MVP : démarrer en **raster OSM** (zéro clé, attribution OSM suffisante) puis évaluer un style vectoriel si rendu insuffisant.
2. **Style sombre** : style vectoriel sombre dédié, ou raster + couche d'assombrissement. Dépend du choix (1).

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-4.1 (l.707-727)] — AC d'origine (FR-020, FR-021, FR-026, FR-036, NFR-006, NFR-044)
- [Source: architecture-mobile.md#L824] — table FR→fichiers carte (`map/[id].tsx`, `map-canvas.tsx`, `osm-attribution.tsx`, `maplibre-config.ts`)
- [Source: architecture-mobile.md#L103,#L138,#L258,#L464,#L872,#L884] — MapLibre RN, New Arch, Dev Client requis, plugins natifs
- [Source: architecture-mobile.md#L115] — attribution OSM permanente
- [Source: architecture-mobile.md#L633,#L770-773] — theming `useColorScheme`, couleurs dynamiques = style inline
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx:541-592] — trace `LineString` `#2D6A4A` w3, fit caméra (référence à porter, API GL JS → MapLibre Native)
- [Source: packages/shared/src/types/adventure.types.ts] — `AdventureMapResponse`, `MapSegmentData`, `MapWaypoint { lat, lng, ele?, distKm }`
- [Source: packages/shared (@ridenrest/gpx)] — `computeBoundingBox(points, bufferKm)`
- [Source: apps/mobile/src/lib/api/api-client.ts] — `apiFetch` (préfixe `/api`, déballe `{data}`)
- [Source: apps/mobile/src/hooks/use-segments.ts] — `segmentsPollInterval` (helper polling à réutiliser)
- [Source: apps/mobile/src/hooks/use-color-scheme.ts] — `useColorScheme()` (light/dark runtime)
- [Source: apps/mobile/src/lib/cache/gpx-cache.ts] — `loadSegmentGpx` (offline write-through)
- [Source: apps/mobile/AGENTS.md] — prebuild natif, tests hors `src/app/`, mocks sans JSX, `/api` préfixe
- [Source: _bmad-output/implementation-artifacts/MOB-3-2-gpx-upload-segments-parse-notification.md] — modèle de story mobile (format, polling, gate)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (1M context) — dev-story workflow

### Debug Log References

- **Version MapLibre** : `@maplibre/maplibre-react-native@^11.3.4` retenue (PAS v10). La v10 ne supporte pas RN 0.85 / React 19 ; la v11.3.4 a les peer deps exactes (`expo>=54`, `react>=19.1`, `react-native>=0.80`) et requiert la New Architecture (déjà activée SDK 56). L'API v11 a **renommé** les composants v10 : `MapView→Map`, `ShapeSource→GeoJSONSource` (prop `data`), `LineLayer→Layer type="line"` (props `paint`/`layout` en clés style-spec kebab-case), `fitBounds([w,s,e,n], { padding, duration })`. Types réels lus dans `node_modules/@maplibre/.../lib/typescript`.
- **Mock natif réécrit** pour l'API v11 (l'ancien squelette MOB-1.4 ciblait les noms v10) ; `jest.mock('@maplibre/maplibre-react-native')` ajouté à `jest.setup.ts` (un manual mock de package node_modules n'est pris que sur `jest.mock` explicite, comme NetInfo).
- **Tests RNTL** : `render()` est **asynchrone** dans ce repo (RNTL v14 + React 19) → il faut `await render(...)` avant d'utiliser `screen` (sinon « render function has not been called »). `useColorScheme` (NativeWind) jette en jest (`setColorScheme` sans `darkMode:class`) → mocké en valeur statique dans les tests carte (parité `segment-list.test`).
- **Régression** : `adventure-card.test.tsx` (« Planning désactivé ») mis à jour — Planning navigue désormais vers la carte ; Live reste désactivé.

### Completion Notes List

- ✅ **AC1** : trace GPX `LineString` (`#2D6A4A`, largeur 3) via `GeoJSONSource`+`Layer`, fit caméra auto (`fitBounds`, padding 40, zoom-once par bbox), endpoint `GET /adventures/:id/map` réutilisé (façade + hook avec polling 3000 ms conditionnel).
- ✅ **AC2** : `mapStyle` suit `useColorScheme` (OpenFreeMap `liberty`/`dark`) ; pas de re-fit au switch de thème.
- ✅ **AC3** : `<OsmAttribution>` overlay permanent (frère du `<Map>`), toujours rendu, label a11y i18n.
- ✅ **AC4** : états vide (`map.empty` + CTA) / erreur (`ErrorBanner`) superposés et centrés, fond de carte + attribution conservés.
- ✅ **AC5** : trace persistée (TanStack Query N1) consultable offline ; bandeau `map.tilesOffline` non bloquant quand `!isOnline`.
- ✅ **Décision Open Questions** : tuiles **OpenFreeMap vectorielles** (parité web), **zéro clé API** — pas d'`EXPO_PUBLIC_*` ajoutée.
- ✅ **Points d'entrée** : bouton **Planning** (carte d'aventure) activé + CTA « Voir sur la carte » (écran détail). Bouton **Live** laissé `disabled` (MOB-5).
- ✅ **Gate** : 230/230 tests (38 suites), `typecheck` 0, `lint` 0, `expo export --platform ios` OK.
- ⏳ **RESTE-À-FAIRE GUILLAUME (manuel, hors environnement)** :
  1. **Rebuild natif obligatoire** (nouveau module natif + plugin `app.config.ts`) : `npx expo prebuild --clean -p ios` (vérifier MapLibre dans `ios/Podfile.lock`) **puis** `npx expo run:ios` (Xcode 26.4). Sans ça → crash boot `Cannot find native module`.
  2. **T9 — validation device/Dev Client** (Expo Go incompatible) : trace+centrage <3 s, switch thème, état vide/erreur, offline (tuiles indispo non bloquant).

### File List

**Ajouts** :
- `apps/mobile/src/app/(app)/map/[id].tsx`
- `apps/mobile/src/components/map/map-canvas.tsx`
- `apps/mobile/src/components/shared/osm-attribution.tsx`
- `apps/mobile/src/lib/map/maplibre-config.ts`
- `apps/mobile/src/lib/api/map.ts`
- `apps/mobile/src/hooks/use-adventure-map.ts`
- `apps/mobile/src/lib/map/__tests__/maplibre-config.test.ts`
- `apps/mobile/src/hooks/__tests__/use-adventure-map.test.ts`
- `apps/mobile/src/components/map/__tests__/map-canvas.test.tsx`
- `apps/mobile/src/__tests__/map-screen.test.tsx`

**Modifications** :
- `apps/mobile/package.json` + `pnpm-lock.yaml` (`@maplibre/maplibre-react-native@^11.3.4` via expo install)
- `apps/mobile/app.config.ts` (plugin `@maplibre/maplibre-react-native`)
- `apps/mobile/jest.setup.ts` (`jest.mock('@maplibre/maplibre-react-native')`)
- `apps/mobile/__mocks__/@maplibre/maplibre-react-native.js` (réécrit API v11)
- `apps/mobile/src/components/ui/icon.tsx` (`ChevronLeftIcon`, `MapIcon`)
- `apps/mobile/src/components/adventure/adventure-card.tsx` (bouton Planning → carte)
- `apps/mobile/src/components/adventure/adventure-card.test.tsx` (test Planning maj)
- `apps/mobile/src/app/(app)/adventures/[id].tsx` (CTA « Voir sur la carte »)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (bloc `map.*`)
- `apps/web/src/hooks/use-network-status.ts` (**divergence assumée** — fix d'hydratation SSR web, voir note ci-dessous)

### Divergence assumée (Doc Sync Rule)

- **`apps/web/src/hooks/use-network-status.ts`** : fix d'hydratation SSR **côté web** (lecture de `navigator.onLine` déplacée du `useState` initializer vers `useEffect` post-montage → 1er rendu client identique au HTML serveur). **Hors périmètre nominal** de MOB-4.1 (story mobile-only), mais conservé et documenté ici à la demande de Guillaume (revue 2026-06-14, option 1). N'impacte pas le mobile.

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.1 (ready-for-dev) — infra carte MapLibre Native (Dev Client), route `map/[id].tsx`, `map-canvas` (trace LineString `#2D6A4A` + fit auto), style light/dark via `useColorScheme`, attribution OSM permanente, endpoint `GET /adventures/:id/map` réutilisé, polling parse, états vide/erreur/offline, point d'entrée Planning, i18n FR/EN, tests (mock natif). Open questions : source tuiles + clé API. | bmad-create-story (Story Context Engineer) |
| 2026-06-14 | 1.1 | Code review (3 couches). 1 decision résolue (modif web `use-network-status.ts` conservée + divergence documentée), 5 patches appliqués : skeleton infini offline-sans-cache (`fetchStatus !== 'paused'`), branche « parsing en cours » (`isMapParsing` + i18n `map.parsing`), trim de `id`, 2 corrections doc (chemin mock, version v11.3.4). 2 deferred (tests AC5/AC2 → T9 ; bbox dégénéré pré-existant). Gate post-patch verte (tsc 0, lint 0, map suites 21/21). Status → done. ⏳ reste manuel : rebuild natif + T9 device. | code-review (claude-opus-4-8) |
| 2026-06-13 | 1.0 | Implémentation T1-T8 (status → review). **MapLibre v11.3.4** (API `Map`/`Camera`/`GeoJSONSource`/`Layer` ≠ v10), mock natif réécrit. Config (`getMapStyle` OpenFreeMap light/dark, `computeTraceBounds`, GeoJSON helpers), façade `map.ts` + hook `use-adventure-map` (polling 3000 ms), `map-canvas` (trace + fit zoom-once + attribution), `osm-attribution`, route `map/[id]` (id durci + états vide/erreur/offline), points d'entrée Planning + CTA détail, i18n FR/EN, 4 suites de tests. **Open Questions tranchées** : tuiles OpenFreeMap vectorielles sans clé. Gate verte (230 tests, tsc, lint, expo export iOS). ⏳ Reste manuel Guillaume : rebuild natif (`prebuild --clean`/`run:ios`) + T9 validation device. | dev-story (claude-opus-4-8) |
