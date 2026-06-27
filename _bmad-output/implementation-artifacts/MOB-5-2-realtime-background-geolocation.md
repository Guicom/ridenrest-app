# Story MOB-5.2 : Géolocalisation temps réel & background

Status: ready-for-dev

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

- [ ] **T0 — Modules natifs + config background + prebuild** (AC: 2, 4)
  - [ ] `npx expo install expo-task-manager` (SDK 56).
  - [ ] `app.config.ts` plugin `expo-location` : **activer** `locationAlwaysAndWhenInUsePermission` (rationale FR), `isIosBackgroundLocationEnabled: true` (→ `UIBackgroundModes:['location']` + `NSLocationAlwaysAndWhenInUseUsageDescription`), `isAndroidBackgroundLocationEnabled: true` (→ `ACCESS_BACKGROUND_LOCATION`), `isAndroidForegroundServiceEnabled: true` (→ `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION`, requis Android 14+). `expo-task-manager` : **pas de plugin** (s'appuie sur `UIBackgroundModes` d'`expo-location`).
  - [ ] `npx expo prebuild --clean -p ios`. Vérifier `Podfile.lock` + Info.plist (clés Always + UIBackgroundModes) + AndroidManifest (background + foreground service).
  - [ ] Étendre les mocks Jest `expo-location` (request**Background**PermissionsAsync, startLocationUpdatesAsync, stopLocationUpdatesAsync) + mock `expo-task-manager` (defineTask, isTaskRegisteredAsync).

- [ ] **T1 — Tâche background `lib/live/location-task.ts`** (AC: 2)
  - [ ] `TaskManager.defineTask(LIVE_LOCATION_TASK, ({data,error}) => {…})` **au scope module** (PAS dans un composant). Handler : `if (error) return;` (jamais de crash silencieux NFR-032) ; `locations.at(-1)` → `useLiveStore.getState().updateGpsPosition({lat,lng})`. **RGPD : écrit le store, ne POST jamais.**
  - [ ] **Importer ce fichier en tête de `app/_layout.tsx`** (racine) avant la navigation — sinon la tâche n'est pas enregistrée au cold-start. `_layout.tsx` reste l'hôte de cycle de vie unique (règle archi).
  - [ ] `LIVE_LOCATION_TASK = 'live-location-task'` (constante exportée).

- [ ] **T2 — Démarrage/arrêt background + escalade permission `Always`** (AC: 2, 6)
  - [ ] Étendre `use-live-mode` (MOB-5.1) : après le foreground OK, **escalade** optionnelle `requestBackgroundPermissionsAsync()` (iOS « Always »). Si refusé / « When In Use » → **dégradation gracieuse** (AC6) : foreground seul, background off, pas de blocage.
  - [ ] Si `Always` accordé → `startLocationUpdatesAsync(LIVE_LOCATION_TASK, { accuracy: BestForNavigation, distanceInterval: 50, pausesUpdatesAutomatically: true, activityType: Fitness, foregroundService: { notificationTitle, notificationBody, notificationColor: '#2D6A4A', killServiceOnDestroy: true } })`.
  - [ ] Cleanup (sortie Live) : `stopLocationUpdatesAsync(LIVE_LOCATION_TASK)` (garder `isTaskRegisteredAsync` pour idempotence). Ne PAS laisser de tâche fantôme.

- [ ] **T3 — `AppState` : pause/reprise polling (extension listener unique)** (AC: 3)
  - [ ] **Étendre** `lib/query/use-app-state-refetch.ts` (l'unique listener `AppState`/`NetInfo`→`focusManager`/`onlineManager`) — **ne PAS** ajouter de second listener. En background : `focusManager.setFocused(false)` (pause refetch/polling) ; en `active` : `setFocused(true)` (reprise). Le **GPS natif background continue** (indépendant d'`onlineManager`).
  - [ ] Garde offline : query bloquée à `fetchStatus:'paused'` → `isPending` éternel → tout overlay de chargement gate `isPending && fetchStatus !== 'paused'` (sinon skeleton infini hors-ligne).

- [ ] **T4 — Caméra auto-follow + offset look-ahead (`MapCanvasHandle`)** (AC: 5)
  - [ ] Étendre `MapCanvasHandle` (`components/map/map-canvas.tsx`) : `centerOnGps()` (réactive le suivi, `setGpsTrackingActive(true)`), `resetZoom()`. Caméra MapLibre RN `<Camera>` impérative (`setCamera`) — **API v10/v11, breaking changes** (AGENTS.md) : utiliser `ref.setCamera({ centerCoordinate:[lng,lat], zoomLevel, animationDuration })`.
  - [ ] **Offset look-ahead** : porter `routeBearingAtPosition(waypoints, position)` (pur, web `live-map-canvas.tsx:784-798`) → cap radian du waypoint le plus proche ; offset caméra orienté (place le GPS en bas du viewport, laisse voir devant). Premier fix : `flyTo`/zoom 10 (`hasInitialZoomedRef`) ; suivants : `easeTo`/`setCamera` doux.
  - [ ] **Pause auto-follow sur pan manuel** : sur `onRegionIsChanging` avec `isUserInteraction` (ou geste) → `setGpsTrackingActive(false)`. Re-fit programmatique (auto-zoom) doit aussi mettre `gpsTrackingActive=false` (sinon le GPS easeTo se bat avec le fit 1-3 s plus tard — bug web 16-26).

- [ ] **T5 — Point GPS sur la carte (dot + halo)** (AC: 5)
  - [ ] Couche GPS enfant de `<MapCanvas>` (gated `styleLoaded`) : `<ShapeSource>` + `<CircleLayer>` halo + dot (parité web `gps-halo`/`gps-dot`). **Coord filtrée `isValidLngLat`** (anti-SIGABRT). Le marqueur GPS est **non-interactif** → `<CircleLayer>` (ou `<MarkerView>` non interactif acceptable). Source vidée quand `currentPosition === null` (GPS perdu).

- [ ] **T6 — Batterie : leviers + indicateur** (AC: 1, 4)
  - [ ] Régler les leviers documentés (T2 options) : `distanceInterval`, `accuracy` (adaptative : `High`/`Balanced` en croisière vs `BestForNavigation` en recherche), `pausesUpdatesAutomatically`, pause polling `AppState`. Documenter chaque réglage (NFR-MOB-PERF-03, à figer post-beta).
  - [ ] Indicateur GPS « acquisition… » tant que `currentPosition === null && isLiveModeActive` (NFR-007, ≤ 2 s perçu).

- [ ] **T7 — i18n + a11y** (AC: 2, 5, 6)
  - [ ] `live.bg.notificationTitle/notificationBody` (foreground service Android), `live.bg.permissionDeniedNotice` (dégradation AC6), `live.recenter` (bouton centerOnGps), `live.gpsAcquiring`. a11y bouton recentrer. FR/EN parité, zéro chaîne en dur.

- [ ] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 5, 6)
  - [ ] `location-task` : handler ignore `error`, écrit `updateGpsPosition` depuis `locations.at(-1)`, **ne POST jamais** (vérifier qu'aucun `apiFetch` n'est appelé).
  - [ ] `use-live-mode` (extension) : escalade `Always` → start background si accordé ; refus → pas de start, foreground intact (AC6) ; cleanup → `stopLocationUpdatesAsync`.
  - [ ] `use-app-state-refetch` (extension) : background → `setFocused(false)`, active → `true` ; pas de second listener.
  - [ ] `routeBearingAtPosition` (pur) : cap correct ; offset.
  - [ ] couche GPS : dot rendu, source vidée si position null, coord invalide filtrée.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [ ] **T9 — Doc Sync `architecture-mobile.md`** (obligatoire)
  - [ ] Mettre à jour §Native Capabilities (l.305-314, 420-424, 469-472) : background geolocation **livré** (plus « skip MVP »), permission `Always`, foreground service Android, leviers batterie NFR-MOB-PERF-03. Aligner avec l'epic.

- [ ] **T10 — Validation manuelle (Dev Client)** (AC: 1, 2, 4, 5, 6) — ⏳ build Dev Client (Guillaume)
  - [ ] Rouler foreground → position temps réel, carte suit, offset look-ahead. Pan manuel → suivi en pause ; bouton recentrer → reprend.
  - [ ] Écran éteint / app background → position continue (notification Android visible). Revenir foreground → polling reprend, position à jour.
  - [ ] Refuser `Always` → foreground continue sans crash. Mesurer la batterie (≈) sur une sortie.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.2 (ready-for-dev) — géoloc background écran-éteint (`expo-task-manager` + `startLocationUpdatesAsync` + foreground service Android + permission `Always` iOS), caméra auto-follow + offset look-ahead (`routeBearingAtPosition`) + pause pan + `centerOnGps`, dot GPS, `AppState` pause/reprise polling (extension listener unique), leviers batterie NFR-MOB-PERF-03, dégradation gracieuse. **Doc Sync : background passe de « skip MVP » à livré (epic prime).** Module natif neuf (task-manager) → prebuild. i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
