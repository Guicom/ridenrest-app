---
baseline_commit: 93f7e95c8507ac5d0974d2e55e6318f40293419f
---

# Story MOB-5.2 : Géolocalisation temps réel & background

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cycliste**,
I want **que ma position soit suivie même écran éteint, et que la carte me suive**,
So that **l'app continue de calculer les POIs à venir pendant que je roule**.

> **Dépend de MOB-5.1** (store `useLiveStore`, consentement, watch foreground, projection `currentKmOnRoute`). Cette story ajoute : la **géoloc background écran-éteint** (`expo-location` + `expo-task-manager` + foreground service Android + permission `Always` iOS), la **caméra auto-follow** (recentre sur le GPS avec offset look-ahead, pause sur pan manuel), le **point GPS sur la carte** (dot + halo), la **gestion `AppState`** (pause/reprise polling), et la **cible batterie ≤ 10 %/h**.
>
> ⚠️ **CONFLIT DOC À RÉSOUDRE (Doc Sync)** : `architecture-mobile.md` (l.312, 421-422) marque **« Background geolocation = ❌ skip MVP »**. Mais l'**epic MOB-5.2** (l.913-937) + **FR-MOB-011** (l.240) + **NFR-MOB-PERF-03** (l.177) **exigent** le background (écran éteint). **L'epic prime.** Mettre à jour `architecture-mobile.md` §« Native Capabilities & Background » (l.305-314, 420-424, 469-472) **pendant** l'implémentation (Doc Sync Rule), sinon la code review recommandera un rollback.
>
> ⚠️ **Module natif NEUF** `expo-task-manager` + activation background dans `app.config.ts` → **`npx expo prebuild --clean -p ios` OBLIGATOIRE**.
>
> **RGPD (NFR-012)** : la tâche background écrit **uniquement** dans `useLiveStore` (client). **Aucune coordonnée GPS n'est jamais envoyée/POST au serveur**, même en background.

## Acceptance Criteria

1. **Given** le mode Live actif
   **When** je me déplace
   **Then** la position GPS est détectée **en temps réel** via `expo-location` (foreground), `currentPosition`/`currentKmOnRoute` se mettent à jour, et la **latence position → mise à jour UI est ≤ 2 s** avec indicateur de chargement visible (FR-041, NFR-007)

2. **Given** l'app passe en arrière-plan / écran éteint
   **When** je continue de rouler
   **Then** le suivi se **poursuit** : permission `Always` iOS (`UIBackgroundModes: ['location']`) / **foreground service Android** avec **notification persistante**, via `startLocationUpdatesAsync(LIVE_LOCATION_TASK, …)` + `TaskManager.defineTask` (FR-041 background, FR-MOB-011)
   **And** la tâche background écrit la position **uniquement dans `useLiveStore`** — **aucun POST GPS au serveur** (NFR-012)

3. **Given** l'app bascule background ↔ foreground ↔ killed
   **When** l'état change (`AppState`)
   **Then** le **polling TanStack Query est mis en pause/repris** en conséquence (le GPS natif continue, mais le polling réseau POI/météo se met en pause en background) — via **extension de l'unique listener** `use-app-state-refetch.ts` (FR-MOB-014)
   **And** aucun second listener `AppState`/`NetInfo` n'est ajouté (règle projet)

4. **Given** une session Live prolongée (GPS background, écran éteint)
   **When** je mesure la consommation batterie (sprint 0)
   **Then** la consommation **vise ≤ 10 %/h** (cible initiale NFR-MOB-PERF-03), via `distanceInterval` natif, `accuracy` adaptée, `pausesUpdatesAutomatically` (iOS) et pause polling `AppState`
   **And** la cible est **figée après mesures réelles** de la beta Espagne (avril 2026) — documenter les leviers réglés, pas de promesse chiffrée dure

5. **Given** le mode Live actif avec une position GPS
   **When** la carte est affichée
   **Then** un **point GPS** (dot + halo) est rendu à ma position, et la **caméra recentre automatiquement** sur le GPS avec un **offset look-ahead** (orienté selon le cap de la trace) ; le **premier fix** zoome (`flyTo`), les suivants suivent doucement (`easeTo`/`setCamera`)
   **And** quand je **pane/zoome manuellement**, l'auto-follow se **met en pause** (`gpsTrackingActive=false`) ; un bouton « recentrer » (`centerOnGps`) le **réactive**

6. **Given** la permission background **refusée** (ou « Lorsque l'app est active » seulement)
   **When** je roule écran éteint
   **Then** le Live **foreground continue de fonctionner** (dégradation gracieuse) ; le background est désactivé sans bloquer le Live ni crasher (FR-045 / NFR-032)

## Tasks / Subtasks

- [x] **T0 — Modules natifs + config background + prebuild** (AC: 2, 4)
  - [x] `expo-task-manager` ajouté à `package.json`, **pinné EXACT `56.0.17`** (= `bundledNativeModules.json`, règle AGENTS.md anti-crash dyld) + `pnpm install`.
  - [x] `app.config.ts` plugin `expo-location` : `locationAlwaysAndWhenInUsePermission` (rationale FR), `isIosBackgroundLocationEnabled: true`, `isAndroidBackgroundLocationEnabled: true`, `isAndroidForegroundServiceEnabled: true`. `expo-task-manager` : pas de plugin (s'appuie sur `UIBackgroundModes` d'`expo-location`).
  - [x] Config native **validée non-destructivement** via `npx expo config --type introspect` : iOS `UIBackgroundModes:['location']` + `NSLocationAlwaysAndWhenInUseUsageDescription` ✓ ; Android `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` + FINE/COARSE ✓. ⏳ **Le `expo prebuild --clean -p ios` destructif (régénère `ios/` + pod install) + rebuild = step Guillaume** (T10, Xcode 26.5 OK ≥26.4) — `ios/` existant non écrasé par l'agent.
  - [x] Mocks Jest : `expo-location` étendu (requestBackgroundPermissionsAsync, startLocationUpdatesAsync, stopLocationUpdatesAsync, hasStartedLocationUpdatesAsync, Accuracy.BestForNavigation, ActivityType.Fitness) + nouveau mock `expo-task-manager` (`defineTask` capture le handler via `__getTask`) enregistré dans `jest.setup.ts`. `Camera` mock : ajout `flyTo`/`easeTo`.

- [x] **T1 — Tâche background `lib/live/location-task.ts`** (AC: 2)
  - [x] `TaskManager.defineTask(LIVE_LOCATION_TASK, async ({data,error}) => {…})` **au scope module**. Handler : `if (error) return;` (NFR-032) ; `locations.at(-1)` → garde `isValidLngLat` → `useLiveStore.getState().updateGpsPosition({lat,lng})`. **RGPD : écrit le store, ne POST jamais.** (`async` car `defineTask` exige `Promise`.)
  - [x] **Importé en tête de `app/_layout.tsx`** (effet de bord) avant la navigation — enregistrement au cold-start. `_layout.tsx` reste l'hôte de cycle de vie unique.
  - [x] `LIVE_LOCATION_TASK = 'live-location-task'` (constante exportée).

- [x] **T2 — Démarrage/arrêt background + escalade permission `Always`** (AC: 2, 6)
  - [x] `use-live-mode` étendu : après le foreground OK, **escalade** `requestBackgroundPermissionsAsync()` (« Always »). Refusé / « When In Use » → **dégradation gracieuse** (`backgroundDenied=true`, foreground seul, pas de blocage).
  - [x] `Always` accordé → `startLocationUpdatesAsync(LIVE_LOCATION_TASK, { accuracy: BestForNavigation, distanceInterval: 50, pausesUpdatesAutomatically: true, activityType: Fitness, showsBackgroundLocationIndicator: false, foregroundService: { notificationTitle, notificationBody, notificationColor: '#2D6A4A', killServiceOnDestroy: true } })`.
  - [x] Cleanup (sortie Live) : `stopLocationUpdatesAsync(LIVE_LOCATION_TASK)` gardé par `Location.hasStartedLocationUpdatesAsync` (API expo-location correcte pour « suivi démarré » ; idempotence). Pas de tâche fantôme.

- [x] **T3 — `AppState` : pause/reprise polling (extension listener unique)** (AC: 3)
  - [x] `lib/query/use-app-state-refetch.ts` : le listener unique appelle DÉJÀ `focusManager.setFocused(status === 'active')` (MOB-3.5) → pause refetch **et** polling `refetchInterval` (`refetchIntervalInBackground:false` par défaut) en background, reprise en `active`. Commentaire MOB-5.2 ajouté (intention AC3 + GPS natif background indépendant). **Aucun second listener.**
  - [x] Garde offline `isPending && fetchStatus !== 'paused'` : déjà respectée par l'écran Live (skeleton de chargement carte MOB-5.1).

- [x] **T4 — Caméra auto-follow + offset look-ahead (`MapCanvasHandle`)** (AC: 5)
  - [x] `MapCanvasHandle` étendu : `centerOnGps()` (réactive `setGpsTrackingActive(true)` + vole au GPS), `resetZoom()` (re-cadre la trace, pause le suivi). ⚠️ **API réelle `CameraRef` (maplibre-react-native 11.3.4)** = `flyTo`/`easeTo`/`fitBounds({ center, zoom, padding, duration })` — **PAS** `setCamera`/`centerCoordinate`/`zoomLevel` (qui n'existent pas dans cette version ; la story décrivait une API v10 obsolète). Premier fix : `flyTo` zoom 14 (`hasInitialZoomedRef`) ; suivants : `easeTo` doux.
  - [x] **Offset look-ahead** : `routeBearingAtPosition(waypoints, position)` (pur, porté dans `maplibre-config.ts`) + `lookAheadPadding(bearing)` → MapLibre Native n'a **pas** d'offset pixel comme le web → offset réalisé via le `padding` (`ViewPadding {top,right,bottom,left}`) de `flyTo`/`easeTo` (place le GPS hors centre, on voit devant).
  - [x] **Pause auto-follow sur pan manuel** : `onRegionIsChanging` lit `nativeEvent.userInteraction` (pas `properties.isUserInteraction`) → `setGpsTrackingActive(false)`, gardé par `currentPosition` (zéro impact Planning). `flyTo`/`easeTo` programmatiques ont `userInteraction=false` → pas de pause parasite.

- [x] **T5 — Point GPS sur la carte (dot + halo)** (AC: 5)
  - [x] `components/map/live-gps-layer.tsx` enfant de `<MapCanvas>` (gated `styleLoaded` via les `children`) : `<GeoJSONSource>` + 2 `<Layer type="circle">` (halo + dot, parité web `gps-halo`/`gps-dot`). **Coord filtrée `isValidLngLat`** (anti-SIGABRT) ; `currentPosition === null` ou non finie → FeatureCollection vide. Non interactif (`<Layer circle>`, pas `<Marker>`). Couleur de marque inline.

- [x] **T6 — Batterie : leviers + indicateur** (AC: 1, 4)
  - [x] Leviers documentés (T2 options) : `distanceInterval:50`, foreground `Accuracy.High` vs background `BestForNavigation`, `pausesUpdatesAutomatically`, pause polling `AppState` (T3). Commentés dans `use-live-mode.ts` (NFR-MOB-PERF-03, cible ≤ 10 %/h à figer post-beta Espagne).
  - [x] Indicateur « acquisition GPS… » : exposé `isAcquiring = watching && currentPosition === null` (le watch démarre avant le 1er fix → condition sensée vs littérale `&& isLiveModeActive`, qui ne flip qu'au 1er fix). Rendu dans l'écran Live (NFR-007).

- [x] **T7 — i18n + a11y** (AC: 2, 5, 6)
  - [x] `live.bg.notificationTitle/notificationBody/permissionDeniedNotice`, `live.recenter`, `live.gpsAcquiring` — FR + EN, zéro chaîne en dur. a11y : `accessibilityLabel={t('live.recenter')}` sur le bouton recentrer ; notice background `accessibilityRole="alert"`.

- [x] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 5, 6)
  - [x] `location-task.test.ts` : handler ignore `error`, écrit depuis `locations.at(-1)`, filtre coord non finie, **ne fetch jamais** (spy `global.fetch` non appelé).
  - [x] `use-live-mode.test.tsx` (extension) : escalade `Always` → start background ; refus → pas de start, foreground intact (AC6) ; idempotence ; cleanup → `stopLocationUpdatesAsync`.
  - [x] `use-app-state-refetch.test.tsx` (extension) : background → `setFocused(false)`, active → `true` ; un seul `AppState.addEventListener`.
  - [x] `route-bearing.test.ts` : `routeBearingAtPosition` (nord/est/sud, nearest) + `lookAheadPadding`.
  - [x] `live-gps-layer.test.tsx` : `buildGpsFeatureCollection` (valide/null/non-finie) + rendu dot/halo.
  - [x] Gate : `jest` 478 ✓ · `typecheck` ✓ · `lint` ✓ · `expo export -p ios` ✓ (web static-render KO **pré-existant** : `expo-file-system` non supporté web, orthogonal).

- [x] **T9 — Doc Sync `architecture-mobile.md`** (obligatoire)
  - [x] §Décisions différées + §Native Capabilities (table) + §séquence build (step 5) : background geolocation **LIVRÉ MOB-5.2** (plus « skip MVP »), `Always` iOS, foreground service Android, leviers batterie NFR-MOB-PERF-03. Aligné avec l'epic.

- [~] **T10 — Validation device (Dev Client)** (AC: 1, 2, 4, 5, 6) — **partiellement validé par l'agent** (build natif + Maestro iOS), reste le physique (Guillaume)
  - [x] **Build natif fait par l'agent** : `expo prebuild -p ios` (après workaround ENOTEMPTY : `ios/` déplacé puis prebuild fresh) → `UIBackgroundModes:[fetch,location]` + `NSLocationAlwaysAndWhenInUse…` + pods `ExpoTaskManager 56.0.17`/`ExpoLocation 56.0.16` ✓ ; `pnpm sim` (Release standalone) → **app lancée, ZÉRO crash** (modules natifs neufs OK, pin exact valide).
  - [x] **Foreground temps réel + carte suit + dot GPS + recentrer** : validé via Maestro iOS (`live-tracking.yaml`) + GPS simulé (Toulouse) + screenshot → dot vert + halo rendus, caméra centrée sur le GPS, bouton « Recentrer » présent & actionnable, badge km « 5.4 km » (projection snapToTrace), indicateur de localisation iOS actif. **Pas de SIGABRT** sur la couche GPS GeoJSON. Auto-start returning-user (AC4) confirmé (consent SKIPPED).
  - [x] Smoke + consent (`smoke.yaml`, `live.yaml`) re-validés sur iOS → **pas de régression** de l'entrée Live.
  - [ ] **Reste physique (Guillaume)** : écran éteint / app background → position continue (notification Android) + retour foreground → polling reprend ; refus `Always` → foreground continue ; mesure batterie (≈) sur une sortie réelle. _(Non automatisable : screen-off + alerte système iOS + ride réel.)_

## Dev Notes

### Conflit doc & décision (Doc Sync)

- `architecture-mobile.md` l.**312** « Background geolocation (permission `Always` iOS) » sous une section de capacités, et l.**421-422** « Background geolocation → ❌ skip MVP » / « Push notifications → skip MVP ». L'epic MOB-5.2 (l.913-937), FR-MOB-011 (l.240), NFR-MOB-PERF-03 (l.177) **exigent** le background. **Décision : l'epic prime, on livre le background.** T9 réaligne l'archi (sinon code review = rollback). [Source: architecture-mobile.md:312,421-422 ; epics-mobile.md:177,240,913-937]

### Modules natifs (SDK 56) — config exacte

- **`expo-location` (background)** : `app.config.ts` `isIosBackgroundLocationEnabled:true` → `UIBackgroundModes:['location']` + `NSLocationAlwaysAndWhenInUseUsageDescription` ; Android `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (Android 14+). API : `requestBackgroundPermissionsAsync()` (iOS « Always »), `startLocationUpdatesAsync(task, opts)` / `stopLocationUpdatesAsync(task)`. `accuracy` enum : Lowest/Low/Balanced(100m)/High(10m)/Highest/BestForNavigation.
- **`expo-task-manager`** : `defineTask` **au scope module** ; importé en tête de `app/_layout.tsx`. Pas de plugin. Expo Go ne supporte pas → dev build obligatoire.
- **Escalade iOS en 2 temps** : `requestForegroundPermissionsAsync` (« When In Use », MOB-5.1) → `requestBackgroundPermissionsAsync` (« Always »). On ne peut pas forcer « Always » directement — escalader quand l'utilisateur a besoin du screen-off. [Source: rapport recherche native §2.1, §4]

### Caméra & GPS (référence web → RN)

- `apps/web/.../live-map-canvas.tsx:229-254` (GPS dot update + flyTo/easeTo), `:386-398` (`centerOnGps`), `:734-779` (couches `gps-halo`/`gps-dot`), `:784-798` (`routeBearingAtPosition`, offset `cos(bearing)*300px`), `:136-143` (pause sur `dragstart/pitchstart/zoomstart`). [Source: apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx]
- Bug double-zoom (web 16-26) : mettre `gpsTrackingActive=false` + `userInteractedRef=true` **APRÈS** `fitBounds` dans le timer (sinon GPS easeTo se bat avec le fit). [Source: story 16-26-live-auto-zoom-search-radius-circle.md]
- Caméra MapLibre RN : `<Camera>` API v10/v11 (breaking changes vs v10) — `setCamera`/`followUserLocation`. [Source: AGENTS.md §Carte ; project-context Mobile]

### AppState / NetInfo / offline (en place — étendre)

- `lib/query/use-app-state-refetch.ts` = **unique** pont `AppState→focusManager` + `NetInfo→onlineManager`, monté une fois au root. **Interdiction d'un 2e listener.** Étendre pour pause polling en background. [Source: apps/mobile/src/lib/query/use-app-state-refetch.ts:12-15]
- GPS background **indépendant** d'`onlineManager` (location native, pas une query) → continue hors-ligne, RGPD-safe (rien transmis).
- Garde offline : `isPending && fetchStatus !== 'paused'` (sinon skeleton infini). [Source: project-context.md §Data mobile]

### Réutilisation du code mobile existant

- **MOB-5.1** : `useLiveStore` (`gpsTrackingActive`, `currentPosition`, `updateGpsPosition`, `setGpsTrackingActive`), `use-live-mode`, route Live.
- **MOB-4.1** : `map-canvas.tsx` (`MapCanvasHandle`, `fitToBounds`, `safeFitPadding`, children gated `styleLoaded`, `onRegionIsChanging/DidChange`), `maplibre-config.ts` (`isValidLngLat`, `computeBoundingBox`), `useAdventureWaypoints`.
- `lib/query/{use-app-state-refetch,query-client}.ts`, `use-network-status.ts`, `@ridenrest/gpx` (`computeBoundingBox`).

### Conventions & contraintes

- **RGPD** : background écrit le store, jamais de POST GPS. **MapLibre** : `isValidLngLat` au point, pas de source avant `styleLoaded`. **Un seul listener AppState/NetInfo.** Couleurs inline/expression. Tests hors `src/app/`. i18n FR/EN.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/lib/live/location-task.ts
apps/mobile/src/components/map/live-gps-layer.tsx
+ tests co-localisés (location-task, route-bearing, use-live-mode bg, gps-layer)
```
**Modifs** :
```
apps/mobile/app.config.ts                       (background location + foreground service)
apps/mobile/package.json                         (expo-task-manager)
apps/mobile/src/app/_layout.tsx                  (import location-task au scope module)
apps/mobile/src/hooks/use-live-mode.ts           (escalade Always + start/stop background)
apps/mobile/src/components/map/map-canvas.tsx    (centerOnGps, resetZoom, auto-follow, offset)
apps/mobile/src/app/(app)/live/[id].tsx          (couche GPS, bouton recentrer, indicateur)
apps/mobile/src/lib/query/use-app-state-refetch.ts (pause/reprise polling)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (live.bg.*, live.recenter, live.gpsAcquiring)
_bmad-output/planning-artifacts/architecture-mobile.md (Doc Sync background)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : background GPS écran-éteint (task-manager + foreground service + Always), `AppState` pause/reprise polling, dot GPS + auto-follow + offset look-ahead + pause pan + recentrer, leviers batterie, dégradation gracieuse permission, Doc Sync archi. i18n, tests.
- **Exclu** : consentement/foreground watch (MOB-5.1) ; découverte POI + cercle de recherche + cible (MOB-5.3) ; panneau (5.4) ; profil (5.5) ; météo (5.6) ; push notifications (epic MOB-6).

### Open Questions

1. **Background obligatoire MVP ?** L'epic l'exige (FR-MOB-011) mais l'archi disait skip. **Recommandation : livrer** (différenciateur natif). Si Guillaume préfère reporter le background, scinder T1-T2 en story post-MVP et garder foreground+auto-follow ici. _(Décision Guillaume.)_
2. **Notification foreground service Android** : texte + couleur à valider (`live.bg.notification*`).

### References

- [Source: epics-mobile.md#Story MOB-5.2 (l.913-937)] — AC d'origine (FR-041, FR-MOB-011, FR-MOB-014, NFR-012, NFR-MOB-PERF-03)
- [Source: epics-mobile.md (l.177,240,243)] — NFR-MOB-PERF-03, FR-MOB-011, FR-MOB-014
- [Source: architecture-mobile.md:305-314,420-424,469-472] — capacités natives (à réaligner — Doc Sync)
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx:136-143,229-254,386-398,734-798] — caméra/dot/offset/pause
- [Source: apps/mobile/src/lib/query/use-app-state-refetch.ts] — listener unique à étendre
- [Source: apps/mobile/src/components/map/map-canvas.tsx] — `MapCanvasHandle` à étendre
- [Source: _bmad-output/implementation-artifacts/MOB-5-1-live-activation-consent-permissions.md] — store/consentement/foreground (dépendance)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- `expo config --type introspect` → vérif clés natives (UIBackgroundModes/Always iOS, ACCESS_BACKGROUND_LOCATION/FOREGROUND_SERVICE Android) générées par le plugin sans prebuild destructif.
- `expo-task-manager` résolu en `56.0.17` (= `bundledNativeModules.json`) — pin exact anti-crash dyld.
- `expo export -p ios` OK ; `expo export` (toutes plateformes) échoue en **web static-render** (`expo-file-system is not supported on web`) — pré-existant, hors scope.

### Completion Notes List

- **T0–T9 livrés.** Gate statique vert : Jest **478 pass**, `typecheck` ✓, `lint` ✓, `expo export -p ios` ✓.
- **Décision API caméra** : la story décrivait `setCamera({centerCoordinate, zoomLevel, animationMode})` (API MapLibre RN v10). La version réelle du projet (`@maplibre/maplibre-react-native` 11.3.4) expose `CameraRef.flyTo/easeTo/fitBounds({center, zoom, padding, duration})` — implémenté avec l'API réelle. Offset look-ahead via `padding` (`ViewPadding`), MapLibre Native n'ayant pas d'offset pixel comme le web. (Tâches T4 mises à jour — Doc Sync.)
- **Décision pause pan** : flag réel d'interaction = `nativeEvent.userInteraction` (pas `properties.isUserInteraction`).
- **Décision idempotence/cleanup** : `Location.hasStartedLocationUpdatesAsync` (API expo-location) plutôt que `TaskManager.isTaskRegisteredAsync` (le 1er reflète précisément « suivi démarré »).
- **Décision `isAcquiring`** : `watching && currentPosition === null` (le watch démarre avant le 1er fix ; la condition littérale `&& isLiveModeActive` n'aurait jamais été vraie car `isLiveModeActive` flip au 1er fix).
- **MapCanvas partagé Planning/Live** : tout le code GPS-follow est gardé par `currentPosition` (toujours `null` en Planning) → zéro impact sur la carte de recherche.
- **RGPD (NFR-012)** : la tâche background écrit **uniquement** `useLiveStore`, vérifié par test (`global.fetch` non appelé). Aucune coordonnée GPS transmise, même écran éteint.
- **T10 — validation device faite par l'agent** (build + Maestro iOS) :
  - `expo prebuild -p ios` (workaround ENOTEMPTY AGENTS.md : `ios/` déplacé → prebuild fresh + pods) → Info.plist `UIBackgroundModes:[fetch,location]` + `Always`, pods `ExpoTaskManager 56.0.17`/`ExpoLocation 56.0.16`.
  - `pnpm sim` (Release standalone) → **app lancée sans crash** (Xcode 26.5 ≥ 26.4 ; pin exact = pas de crash dyld).
  - Maestro iOS : `smoke.yaml` + `live.yaml` (consent/refuse) **OK, pas de régression** ; nouveau `live-tracking.yaml` (consent→grant + GPS simulé Toulouse) → **dot GPS + halo rendus, caméra auto-follow, bouton Recentrer actionnable, badge km, pas de SIGABRT** (screenshot vérifié). Auto-start AC4 confirmé.
  - ⚠️ **Android EXIGE aussi un rebuild** (oubli initial : seul iOS rebuild → l'app Android tournait sur l'ancien binaire natif SANS `expo-task-manager` → crash « app died » au boot dès que la nouvelle JS charge `location-task`). Corrigé : `expo prebuild -p android` (manifeste régénéré : `ACCESS_BACKGROUND_LOCATION` + `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` + FINE) puis `expo run:android --variant release` → **APK release build, app boot proprement (écran Connexion), zéro FATAL/ANR/native-module manquant** (logcat + screenshot). Règle : **tout ajout de module natif impose un rebuild iOS ET Android** avant test.
  - **Reste manuel (Guillaume)** : background écran-éteint (continuation + notif Android), refus `Always` runtime, mesure batterie réelle — non automatisables. (Émulateur Android : session non préservée → se reconnecter `e2e@ridenrest.local` / `Test1234!` pour tester le Live ; iOS avait la session.)

### File List

**Ajouts :**
- `apps/mobile/src/lib/live/location-task.ts`
- `apps/mobile/src/lib/live/location-task.test.ts`
- `apps/mobile/src/lib/map/route-bearing.test.ts`
- `apps/mobile/src/components/map/live-gps-layer.tsx`
- `apps/mobile/src/components/map/live-gps-layer.test.tsx`
- `apps/mobile/__mocks__/expo-task-manager.js`
- `apps/mobile/.maestro/live-tracking.yaml` (flow device : consent→grant→dot GPS→recentrer)

**Modifications :**
- `apps/mobile/package.json` (`expo-task-manager@56.0.17`)
- `apps/mobile/app.config.ts` (background location + foreground service)
- `apps/mobile/jest.setup.ts` (mock `expo-task-manager`)
- `apps/mobile/__mocks__/expo-location.js` (APIs background + enums)
- `apps/mobile/__mocks__/@maplibre/maplibre-react-native.js` (`flyTo`/`easeTo` sur Camera)
- `apps/mobile/src/app/_layout.tsx` (import `location-task` au scope module)
- `apps/mobile/src/hooks/use-live-mode.ts` (escalade Always + start/stop background + `isAcquiring`/`backgroundDenied`)
- `apps/mobile/src/lib/query/use-app-state-refetch.ts` (commentaire intention AC3)
- `apps/mobile/src/lib/map/maplibre-config.ts` (`routeBearingAtPosition`, `lookAheadPadding`, `LOOK_AHEAD_PX`)
- `apps/mobile/src/components/map/map-canvas.tsx` (`centerOnGps`/`resetZoom`, auto-follow, pause pan)
- `apps/mobile/src/app/(app)/live/[id].tsx` (couche GPS, bouton recentrer, indicateur acquisition, notice background)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (`live.bg.*`, `live.recenter`, `live.gpsAcquiring`)
- `_bmad-output/planning-artifacts/architecture-mobile.md` (Doc Sync background livré)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut MOB-5-2)

### Review Findings

- [x] [Review][Decision] `killServiceOnDestroy: true` — **validé par Guillaume** : `true` maintenu (force-stop = fin du suivi, symétrique iOS où force-kill depuis app switcher stoppe aussi la localisation nativement). [`use-live-mode.ts` fonction `backgroundUpdateOptions`]
- [x] [Review][Patch] `gpsTrackingActive` non réinitialisé dans `deactivateLiveMode` — **Corrigé** : `gpsTrackingActive: true` ajouté dans `deactivateLiveMode()`. [`apps/mobile/src/lib/stores/live.store.ts`]
- [x] [Review][Patch] Race : tâche background écrit `currentPosition` après `deactivateLiveMode()` — **Corrigé** : guard `if (!isLiveModeActive) return;` ajouté dans le handler `defineTask` + test dédié ajouté. [`apps/mobile/src/lib/live/location-task.ts`]
- [x] [Review][Patch] Notice `backgroundDenied` masquée hors-ligne (`&& isOnline`) — **Corrigé** : condition réduite à `backgroundDenied && isLiveModeActive`. [`apps/mobile/src/app/(app)/live/[id].tsx`]
- [x] [Review][Patch] `collectTraceWaypoints(segments)` appelé deux fois par render dans `map-canvas.tsx` — **Corrigé** : `bounds` réutilise `bearingWaypoints`. [`apps/mobile/src/components/map/map-canvas.tsx`]
- [x] [Review][Defer] `hasInitialZoomedRef` réinitialisé sur perte GPS → re-zoom forcé après signal perdu + pan + recentrer — Après une perte de signal GPS, si l'utilisateur a pané (tracking pausé), puis le signal revient et il clique « Recentrer », le `flyTo zoom:14` se déclenche au lieu d'un `easeTo` doux. Comportement acceptable post-perte de signal. [`apps/mobile/src/components/map/map-canvas.tsx`] — deferred, cas limite acceptable
- [x] [Review][Defer] Position GPS froide (OS cold-start) persistée dans le store sans session Live active — Quand l'OS cold-start l'app pour livrer des positions background, `location-task.ts` écrit dans le store alors qu'aucun écran Live n'est monté ; `deactivateLiveMode()` ne s'exécute jamais → position potentiellement visible au prochain montage du `MapCanvas` Planning. Cas très rare, `isLiveModeActive=false` limite l'impact. — deferred, cas rare

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.2 (ready-for-dev) — géoloc background écran-éteint (`expo-task-manager` + `startLocationUpdatesAsync` + foreground service Android + permission `Always` iOS), caméra auto-follow + offset look-ahead (`routeBearingAtPosition`) + pause pan + `centerOnGps`, dot GPS, `AppState` pause/reprise polling (extension listener unique), leviers batterie NFR-MOB-PERF-03, dégradation gracieuse. **Doc Sync : background passe de « skip MVP » à livré (epic prime).** Module natif neuf (task-manager) → prebuild. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
| 2026-06-28 | 1.1 | 🐛 **Bugfix Android (découvert en validation device MOB-5.3)** : la tâche background-geo crashait l'app au 1er fix GPS en mode Live — `expo-location` `LocationTaskConsumer.reportLocationsImmediately` planifie un JobScheduler job **persisté** (`setPersisted(true)`) qui exige `RECEIVE_BOOT_COMPLETED` → sinon `IllegalArgumentException: Requested job cannot be persisted…` → crash dur (la validation MOB-5.2 d'origine n'avait pas déclenché d'update background long sur Android). **Fix** : ajout `android.permissions: ['android.permission.RECEIVE_BOOT_COMPLETED']` dans `app.config.ts` (Android-only, no-op iOS) + prebuild Android. Re-validé device Android (émulateur) : flow Live complet sans crash. | bmad-dev-story (claude-opus-4-8, via MOB-5.3) |
| 2026-06-27 | 1.0 | Implémentation T0–T9 (dev-story). `expo-task-manager@56.0.17` + config background (app.config.ts), tâche `location-task.ts` (scope module, RGPD store-only), escalade `Always` + start/stop background dans `use-live-mode` (dégradation gracieuse, `isAcquiring`/`backgroundDenied`), pause/reprise polling AppState (listener unique, AC3), caméra auto-follow + offset look-ahead via `padding` + pause pan dans `map-canvas` (`flyTo`/`easeTo` — API réelle CameraRef 11.3.4, **pas `setCamera`**), `live-gps-layer.tsx` (dot+halo, isValidLngLat), i18n FR/EN, 5 suites de tests. Doc Sync `architecture-mobile.md`. Gate : Jest 478 ✓ / typecheck ✓ / lint ✓ / `expo export -p ios` ✓. **T10 (prebuild + device Maestro + background screen-off) = manuel Guillaume.** Statut → review. | bmad-dev-story (claude-opus-4-8) |
