---
baseline_commit: 0cafb234bedfd9b62c90c849aac764622b3076b5
---

# Story MOB-5.1 : Activation du mode Live, consentement & permissions

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cycliste**,
I want **activer le mode Live après avoir donné mon consentement de géolocalisation**,
So that **l'app me localise pendant que je roule, en respectant ma vie privée**.

> **Première story de l'epic MOB-5 (mode Live) — FONDATION.** Elle pose : le **store `useLiveStore`** (porté verbatim du web), la **route Live** (`(app)/live/[id].tsx` + `live/_layout.tsx`), le **flow de consentement RGPD** (`<GeolocationConsent />` non-dismissible), la **permission foreground** (`expo-location`), le **suivi GPS foreground** + la **projection `snapToTrace` → `currentKmOnRoute`** (client-side), et **`expo-keep-awake`** (écran allumé). **Background GPS / caméra auto-follow / découverte POI / météo = stories suivantes (5.2→5.6).**
>
> ⚠️ **Modules natifs NEUFS** : `expo-location` + `expo-keep-awake` doivent être installés → **`npx expo prebuild --clean -p ios` OBLIGATOIRE** avant tout `run:ios`/`pnpm sim` (sinon `Cannot find native module` au boot). Voir AGENTS.md §toolchain native.
>
> **Aucun appel serveur** dans cette story (100% client-side). La position GPS **ne sort jamais du device** (RGPD, NFR-012/NFR-LP-001).

## Acceptance Criteria

1. **Given** une aventure
   **When** je tente d'activer le mode Live (CTA « Démarrer en Live » depuis la liste/détail des aventures)
   **Then** un **consentement explicite de géolocalisation** est demandé **AVANT** toute activation et **AVANT** le prompt OS (dialog in-app `<GeolocationConsent />`, **non-dismissible** : pas de fermeture au backdrop/échap, pas de bouton ✕) (FR-040, NFR-013)
   **And** au refus, le mode Live **n'est pas activé** et un message explique pourquoi la géoloc est nécessaire

2. **Given** le consentement in-app accordé
   **When** le flow continue
   **Then** la **permission runtime foreground** iOS/Android est demandée via `expo-location.requestForegroundPermissionsAsync()` (iOS « Lorsque l'app est active », Android `ACCESS_FINE_LOCATION`), avec une **justification (rationale)** déclarée dans `app.config.ts` (FR-MOB-015)
   **And** si la permission OS est refusée, un message explicatif propose d'ouvrir les Réglages (`Linking.openSettings()`) — **jamais de cul-de-sac** ; le Live ne démarre pas

3. **Given** la permission foreground accordée
   **When** le mode Live démarre
   **Then** `expo-location.watchPositionAsync` émet la position en continu (foreground), `updateGpsPosition({lat,lng})` alimente `useLiveStore.currentPosition`, et **`snapToTrace` (client-side)** projette la position sur la trace → `currentKmOnRoute` (FR-041 foreground, NFR-LP-001)
   **And** `expo-keep-awake` (`useKeepAwake` dans `live/_layout.tsx`) **empêche l'écran de s'éteindre** pendant la session Live (FR-044 support)

4. **Given** un **utilisateur déjà consentant** (flag persisté)
   **When** il rouvre l'écran Live
   **Then** le suivi GPS **démarre automatiquement** sans réafficher le dialog de consentement (parité web AC#5)

5. **Given** le mode Live actif
   **When** je quitte l'écran Live (navigation retour / unmount)
   **Then** le watcher GPS est **arrêté** (`subscription.remove()`), `deactivateLiveMode()` nettoie `currentPosition`/`currentKmOnRoute`, et keep-awake est **relâché** (auto via unmount du layout) — pas de suivi fantôme (le background GPS écran-éteint = **MOB-5.2**)

## Tasks / Subtasks

- [x] **T0 — Installer les modules natifs + prebuild** (AC: 2, 3)
  - [x] `npx expo install expo-location expo-keep-awake`. ⚠️ **DÉVIATION** : `expo install` a résolu `expo-location@56.0.18` (plage `~56.0.16`) qui **crashe au lancement** (symbole Swift `ExpoModulesCore.Record.from` absent du core **précompilé** 56.0.15). → **pin EXACT `expo-location: "56.0.16"`** (= `bundledNativeModules.json`). `expo-keep-awake@56.0.3` OK. (Gotcha durable ajouté à AGENTS.md.)
  - [x] `app.config.ts` : ajouter le plugin `expo-location` avec `locationWhenInUsePermission` (rationale FR). **Foreground uniquement ici** — `isIosBackgroundLocationEnabled`/`UIBackgroundModes` = **MOB-5.2** (ne PAS les activer dans cette story).
  - [x] `npx expo prebuild --clean -p ios` (obligatoire — nouveaux modules natifs). Vérifier `Podfile.lock`.
  - [x] Mock Jest `expo-location` dans `__mocks__/` (requestForegroundPermissionsAsync, watchPositionAsync → `{ remove }`). Mock `expo-keep-awake` (`useKeepAwake` no-op).

- [x] **T1 — `lib/stores/live.store.ts` (`useLiveStore`)** (AC: 1, 3, 4, 5)
  - [x] **Porter verbatim** le store web `apps/web/src/stores/live.store.ts` (flat, parité 1:1). State : `isLiveModeActive` (false), `geolocationConsented` (false), `currentPosition: {lat,lng}|null`, `currentKmOnRoute: number|null`, `speedKmh` (15), `targetAheadKm` (30), `searchRadiusKm` (5), `weatherDepartureTime: string|null`, `stageLayerActive` (false), `gpsTrackingActive` (true).
  - [x] Actions : `activateLiveMode`, `deactivateLiveMode` (**nulle `currentPosition` + `currentKmOnRoute`**), `setGeolocationConsent`, `updateGpsPosition`, `setCurrentKm`, `setSpeedKmh`, `setTargetAheadKm`, `setSearchRadius`, `setWeatherDepartureTime`, `setStageLayerActive`, `setGpsTrackingActive`.
  - [x] **RGPD** : `currentPosition` reste en mémoire client uniquement — **jamais persisté, jamais sérialisé, jamais envoyé**. Ne PAS l'ajouter au persister TanStack/AsyncStorage.
  - [x] Convention projet : `use{Domain}Store`, fichier `lib/stores/{domain}.store.ts`, actions verbes impératifs (cf. `map.store.ts`).

- [x] **T2 — Persistance du consentement** (AC: 1, 4)
  - [x] Flag `geolocationConsented` persisté hors-store (le store est volatil) — clé `ridenrest:geoloc-consent` (parité web `localStorage`). Sur mobile : **`@react-native-async-storage/async-storage`** (déjà présent ; le consentement n'est pas une donnée sensible → pas besoin de SecureStore). Helper `lib/live/consent-storage.ts` (`getConsent`/`setConsent`).
  - [x] Au mount de `use-live-mode` : lire le flag ; si consenti → auto-start (AC4) ; sinon → exposer l'état pour afficher `<GeolocationConsent />`.

- [x] **T3 — `hooks/use-live-mode.ts`** (AC: 1, 2, 3, 4, 5)
  - [x] **Ré-implémenter** le web `apps/web/src/hooks/use-live-mode.ts` avec `expo-location` (PAS `navigator.geolocation`). Lifecycle :
    - `startWatching()` : `requestForegroundPermissionsAsync()` → si `status !== 'granted'` → état `permissionDenied` (AC2) ; sinon `watchPositionAsync({ accuracy: High, timeInterval: 5000, distanceInterval: 25 }, cb)` → `updateGpsPosition` + `activateLiveMode`. Garder la `subscription` en ref.
    - **Projection** : sur changement de `currentPosition`, `snapToTrace(position, kmWaypoints)` (`@ridenrest/gpx`) → `setCurrentKm(result.kmAlongRoute)`. ⚠️ Convertir `MapWaypoint.distKm → KmWaypoint.km` (le champ s'appelle `km`, pas `distKm`).
    - `grantConsent()` : `setConsent(true)` + `setGeolocationConsent(true)` + `startWatching()`.
    - Cleanup (unmount) : `subscription.remove()` + `deactivateLiveMode()` (AC5).
  - [x] Exposer : `{ needsConsent, permissionDenied, grantConsent, openSettings, isLiveModeActive }`. `openSettings = Linking.openSettings`.
  - [x] **Pas de background** ici (`watchPositionAsync` foreground seul) — `startLocationUpdatesAsync`/task-manager = MOB-5.2.

- [x] **T4 — `components/live/geolocation-consent.tsx`** (AC: 1)
  - [x] Porter le web `geolocation-consent.tsx`. ⚠️ **DÉVIATION** : **overlay RN absolu**, PAS le `Dialog`/RN `Modal`. Raison : sur iOS le contenu d'un `<Modal>` est rendu dans une **fenêtre séparée non introspectable par XCUITest/Maestro** (le flow device ne pouvait ni asserter ni taper le dialog ; hiérarchie = barre de statut seule). Même pattern iOS que la fiche POI (overlay absolu, cf. AGENTS.md). **Non-dismissible** par construction : fond assombri = `<View>` inerte (aucun Pressable), pas de ✕. Texte : pourquoi la géoloc, RGPD, boutons « Activer » (→ `grantConsent`) / « Refuser » (→ ferme, Live non activé + message AC1).
  - [x] Boutons `size="lg"` (44px WCAG, règle dialog projet). i18n.

- [x] **T5 — Route Live + keep-awake + branchement CTA** (AC: 1, 3, 5)
  - [x] `app/(app)/live/_layout.tsx` : `useKeepAwake()` (écran allumé tant que le layout Live est monté ; relâché auto au unmount). `<Slot />`.
  - [x] `app/(app)/live/[id].tsx` : **shell** de l'écran Live. `id` durci (`(rawId ?? '').trim()`, gate `Boolean(id)`). Monte `<MapCanvas>` (carte + trace, MOB-4.1 réutilisé), `useAdventureMap` + `useAdventureWaypoints`, `use-live-mode`. Si `needsConsent` → `<GeolocationConsent />`. Si `permissionDenied` → message + bouton Réglages. Sinon → carte + position (le reste = 5.2→5.6 : pins, contrôles, météo, profil).
  - [x] Brancher le CTA « Démarrer en Live » (liste/détail aventures, actuellement disabled — `adventures.intro.live*` / carte aventure) → `router.push('/live/{id}')`. Retirer le `disabled`.
  - [x] Auth guard déjà centralisé dans `(app)/_layout.tsx` — ne PAS ré-implémenter.

- [x] **T6 — i18n + a11y** (AC: 1, 2)
  - [x] Bloc `live.*` (FR/EN parité) : `live.consent.title/body/rgpd/accept/refuse`, `live.permissionDenied.title/body/openSettings`, `live.refusedNotice`, `live.start` (CTA). **Zéro chaîne en dur.**
  - [x] a11y : dialog `accessibilityViewIsModal`, boutons labellisés, message live-region.

- [x] **T7 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [x] `live.store` : defaults, `deactivateLiveMode` nulle position+km, actions.
  - [x] `consent-storage` : get/set AsyncStorage.
  - [x] `use-live-mode` (mock `expo-location`) : refus consentement → pas d'activation ; consentement → permission demandée ; refus permission → `permissionDenied`, pas de watch ; succès → watch + `updateGpsPosition` ; consentement déjà persisté → auto-start sans dialog (AC4) ; unmount → `subscription.remove` + `deactivateLiveMode` (AC5). Projection `snapToTrace` → `setCurrentKm`.
  - [x] `geolocation-consent` : non-dismissible (backdrop no-op), boutons.
  - [x] **Test route** (`live/[id]`) → **`src/__tests__/`** (jamais sous `src/app/`).
  - [x] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [~] **T8 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ run interactif (Guillaume)
  - [x] **Maestro `smoke.yaml` (device iOS) : PASSÉ** — app lance + planning s'ouvre + carte/trace sans crash (build standalone `pnpm sim`, ExpoLocation **56.0.16** + ExpoKeepAwake 56.0.3, `NSLocationWhenInUseUsageDescription` FR). ⚠️ `maestro` cible le 1er device : 2 devices up (sim iOS + émulateur Android) → `maestro --device <udid-iOS> test` requis.
  - [x] **Validation device visuelle (build Modal initial)** : deep link `ridenrest://live/<id>` + `simctl io screenshot` (`.maestro/screenshots/mob51-live-consent-device.png`) → écran Live = **carte + trace GPX** (AC3) + **dialog consentement** + mention RGPD + boutons (AC1), sans crash.
  - [~] **Maestro `live.yaml` : refonte consentement (Modal → overlay absolu) validée en Jest** (le RN `Modal` était opaque à Maestro/XCUITest iOS). Le re-run device de `live.yaml` est **bloqué par le disque plein** (volume données à 100%, 478 Mo libres, 398 Go de données utilisateur → rebuild iOS impossible). DerivedData (cache) purgé par l'agent ; **libérer de l'espace puis** `maestro --device <udid-iOS> test live.yaml`.
  - [ ] **À faire par Guillaume (interactif)** : Accepter le consentement → **prompt OS de permission** (alerte système, hors Maestro auto).
  - [ ] Refuser la permission OS → message + bouton Réglages (ouvre Réglages). Accepter → position projetée sur la trace, écran reste allumé.
  - [ ] Rouvrir Live (déjà consenti) → démarre direct sans dialog. Quitter → suivi arrêté, écran peut s'éteindre.

## Dev Notes

### Référence web → mobile

- **Store** : `apps/web/src/stores/live.store.ts` (58 l) — **porter verbatim** (flat, mêmes champs/actions). `deactivateLiveMode()` nulle `currentPosition` + `currentKmOnRoute`. [Source: apps/web/src/stores/live.store.ts:44-45]
- **Hook lifecycle** : `apps/web/src/hooks/use-live-mode.ts` (77 l) — **ré-implémenter** : `navigator.geolocation.watchPosition` → `Location.watchPositionAsync` ; `clearWatch` → `subscription.remove()` ; `PERMISSION_DENIED` → `status !== 'granted'` ; `localStorage('ridenrest:geoloc-consent')` → AsyncStorage. Web : `enableHighAccuracy:true, timeout:10000, maximumAge:5000` ↔ RN `accuracy: High, timeInterval, distanceInterval`. [Source: apps/web/src/hooks/use-live-mode.ts:19-67]
- **Consent dialog** : `apps/web/.../live/[id]/_components/geolocation-consent.tsx` (42 l) — non-dismissible (`onOpenChange` no-op + `showCloseButton={false}`). [Source: apps/web/src/app/(app)/live/[id]/_components/geolocation-consent.tsx:21]
- **Orchestration** : `apps/web/.../live/[id]/page.tsx:46-117,284-308` — bug historique « bouton mort » : `startWatching()` doit être appelé directement (pas juste un flag de modal). Returning user (consent stocké) → auto-start sans modal. [Source: page.tsx:290-297,461-479]

### Projection GPS → km (client-side, RGPD)

- `snapToTrace(position: LatLng, waypoints: KmWaypoint[]): { nearestWaypoint, distanceKm, kmAlongRoute } | null` — **pur, client-side** (`@ridenrest/gpx`). Haversine plus proche waypoint. **La position ne sort JAMAIS du device.** [Source: packages/gpx/src/snap-to-trace.ts:15 ; index.ts:14]
- ⚠️ **`KmWaypoint.km` (pas `distKm`)** : convertir `MapWaypoint.distKm → KmWaypoint.km` avant l'appel (le web fait cette conversion). `KmWaypoint = GpxPoint & { km }`. [Source: packages/gpx/src/cumulative-distances.ts:7]
- `useAdventureWaypoints` (mobile, existe déjà) aplatit les segments → waypoints cumulés + filtre `isValidLngLat` (anti-SIGABRT). Alimente la projection. [Source: apps/mobile/src/hooks/use-adventure-waypoints.ts]

### Modules natifs (SDK 56)

- **`expo-location`** : plugin `app.config.ts` avec `locationWhenInUsePermission` (FR) → ajoute `NSLocationWhenInUseUsageDescription` (iOS) + `ACCESS_FINE/COARSE_LOCATION` (Android). **Foreground seul ici.** API : `requestForegroundPermissionsAsync()` (iOS « When In Use »), `watchPositionAsync({accuracy, timeInterval, distanceInterval}, cb)` → `{ remove }`.
- **`expo-keep-awake`** : aucun plugin/permission. `useKeepAwake()` dans `live/_layout.tsx` (relâché auto au unmount). Décision archi : keep-awake **uniquement** dans le layout Live. [Source: architecture-mobile.md:305,470,686]
- **Prebuild OBLIGATOIRE** après install + edit plugin (AGENTS.md §toolchain). Tester via `pnpm sim` (build Release standalone, zéro Metro).

### Réutilisation du code mobile existant

- **MOB-4.1** : `map-canvas.tsx` (`MapCanvasHandle`, children gated `styleLoaded`), `maplibre-config.ts` (`isValidLngLat`, bounds), `useAdventureMap`/`useAdventureWaypoints`, `osm-attribution.tsx`.
- **UI** : `components/ui/dialog.tsx` (`Dialog`/`DialogTitle`/`DialogBody`/`DialogFooter`), `button.tsx` (`size="lg"` 44px). `@react-native-async-storage/async-storage` (consentement). `expo-secure-store` réservé aux tokens auth — **pas** pour le consentement.
- **i18n** (`lib/i18n`), `use-network-status.ts`, `cn.ts`.

### Conventions & contraintes critiques

- **RGPD** : position client-only, jamais envoyée/persistée/loggée (NFR-012, NFR-LP-001). Aucun appel serveur dans cette story.
- **MapLibre Native** : toute coord → `isValidLngLat` au niveau du point (anti-SIGABRT C++). Pas de `<GeoJSONSource>` avant `styleLoaded`. Overlays interactifs = overlays RN projetés (pas `<Marker>`).
- **Tests hors `src/app/`** (route → `src/__tests__/`). Mocks sans JSX RN dans les factories `jest.mock`. i18n FR/EN parité.
- **AppState** : ne PAS ajouter de listener ici (le listener unique `use-app-state-refetch.ts` existe ; l'extension = MOB-5.2).

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/lib/stores/live.store.ts
apps/mobile/src/lib/live/consent-storage.ts
apps/mobile/src/hooks/use-live-mode.ts
apps/mobile/src/components/live/geolocation-consent.tsx
apps/mobile/src/app/(app)/live/_layout.tsx
apps/mobile/src/app/(app)/live/[id].tsx
apps/mobile/__mocks__/expo-location.js (+ expo-keep-awake)
+ tests co-localisés (live.store, consent-storage, use-live-mode, geolocation-consent) ; test route → src/__tests__/live-screen.test.tsx
```
**Modifs** :
```
apps/mobile/app.config.ts                 (plugin expo-location foreground)
apps/mobile/package.json                  (expo-location, expo-keep-awake)
apps/mobile/src/app/(app)/adventures/*    (activer le CTA « Démarrer en Live »)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (bloc live.*)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : store `useLiveStore`, consentement RGPD (dialog non-dismissible), permission **foreground**, watch GPS foreground, projection `snapToTrace` → `currentKmOnRoute`, keep-awake, route Live (shell), CTA, auto-start returning user, cleanup. i18n, tests.
- **Exclu** : **background GPS écran-éteint / foreground service / permission `Always`** → **MOB-5.2** ; caméra auto-follow + dot GPS → **MOB-5.2** ; découverte POI → **MOB-5.3** ; panneau de recherche refondu → **MOB-5.4** ; profil d'élévation → **MOB-5.5** ; météo → **MOB-5.6**.

### Open Questions

1. **Route Live séparée vs toggle dans `map/[id].tsx`** : recommandé **route séparée** `(app)/live/[id].tsx` (parité web, store + lifecycle + panneau distincts). _(À confirmer Guillaume.)_
2. **Analytics `live_mode_activated`** : le web track `trackLiveModeActivated({ adventure_id_hash })` (hash, jamais GPS). Mobile n'a pas encore PostHog (epic MOB-6) → **ne pas brancher** ici, slot futur.

### References

- [Source: epics-mobile.md#Story MOB-5.1 (l.892-911)] — AC d'origine (FR-040, NFR-013, FR-044 support)
- [Source: epics-mobile.md FR/NFR (l.100,104,177,194-195,244)] — FR-040/044, NFR-012/013, FR-MOB-015
- [Source: apps/web/src/stores/live.store.ts] — store à porter verbatim
- [Source: apps/web/src/hooks/use-live-mode.ts] — lifecycle à ré-implémenter (expo-location)
- [Source: apps/web/src/app/(app)/live/[id]/_components/geolocation-consent.tsx] — dialog RGPD non-dismissible
- [Source: packages/gpx/src/snap-to-trace.ts:15 ; cumulative-distances.ts:7] — `snapToTrace`, `KmWaypoint.km`
- [Source: architecture-mobile.md:98,105,305,470,679,686] — permission Always (5.2), RGPD, keep-awake layout, consent rationale
- [Source: apps/mobile/src/lib/stores/map.store.ts] — convention store mobile
- [Source: apps/mobile/src/components/ui/dialog.tsx] — primitive Dialog
- [Source: _bmad-output/implementation-artifacts/MOB-4-1-maplibre-native-trace-themes-attribution.md] — carte/trace/waypoints (dépendance)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- **Typed routes** : `router.push('/(app)/live/${id}')` échouait au typecheck (route neuve absente de `.expo/types/router.d.ts`, généré par Metro et NON par `expo export`). Fix : `expo start` ~3 s en arrière-plan régénère les types → typecheck vert.
- **Test `use-live-mode` unmount (AC5)** : `subscriptionRef.current` est affecté **après** l'`await watchPositionAsync` ; le cleanup au unmount s'exécutait avant l'affectation. Fix test : capturer le cb + `await act(async () => …)` pour flusher l'affectation, puis `await act(async () => view.unmount())` (le cleanup React 19 est batché).
- **CocoaPods / `pod install`** : `Encoding::CompatibilityError` (Ruby 4.0.5 ASCII-8BIT) sur locale non-UTF-8 → `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` requis devant `pod install` / `pnpm sim`. (Env machine, indépendant du code.)
- **Crash dyld au lancement (régression résolue)** : 1er build standalone crashait au boot — `Symbol not found: ExpoModulesCore.Record.from(dictionary:appContext:)` (DYLD). Cause : `expo-location@56.0.18` (résolu par `expo install`) référence un symbole absent de l'`ExpoModulesCore` **précompilé** 56.0.15. Fix : pin exact `expo-location@56.0.16` (= `bundledNativeModules.json`) + `pod update ExpoLocation` + rebuild → app lancée sans crash. (Gotcha ajouté à AGENTS.md.)
- **`prebuild --clean`** : échec `ENOTEMPTY ios/Pods` (verrou) → `ios/` déplacé puis `prebuild -p ios` + `pod install` (UTF-8).
- **Maestro + RN `Modal` (iOS)** : le 1er flow `live.yaml` échouait (« Activer la géolocalisation » introuvable) alors que le dialog s'affichait — un RN `<Modal>` rend son contenu dans une fenêtre séparée non introspectable par XCUITest (hiérarchie = barre de statut seule). Fix : `geolocation-consent` réécrit en **overlay RN absolu** → Maestro lit/tape le dialog. Effet de bord : `accessibilityViewIsModal` masque les frères en RNTL → tests `live-screen` restructurés (consentement ouvert vs returning user). (Gotcha ajouté à AGENTS.md.)

### Completion Notes List

Implémentée la FONDATION de l'epic Live (MOB-5.1), 100% client-side, **aucun appel serveur GPS** (RGPD NFR-LP-001).

- **AC1** (consentement explicite, non-dismissible, refus géré) : `<GeolocationConsent />` via `Dialog` mobile (`onClose` no-op au backdrop, pas de ✕, boutons `lg`). Refus → `live.refusedNotice` affiché, Live non activé. ✅ tests `geolocation-consent` + `live-screen`.
- **AC2** (permission OS foreground + sortie cul-de-sac) : `requestForegroundPermissionsAsync()` ; refus → `permissionDenied` + bouton `Linking.openSettings()`. Plugin `expo-location` (foreground only) → `NSLocationWhenInUseUsageDescription` FR dans Info.plist. ✅ tests `use-live-mode`.
- **AC3** (watch foreground + projection + keep-awake) : `watchPositionAsync({accuracy:High, timeInterval:5000, distanceInterval:25})` → `updateGpsPosition` + `activateLiveMode` ; `snapToTrace(currentPosition, kmWaypoints)` → `setCurrentKm` (conversion `distKm→km`) ; `useKeepAwake()` dans `live/_layout.tsx`. ✅ test projection → km.
- **AC4** (returning user auto-start sans dialog) : flag `ridenrest:geoloc-consent` en AsyncStorage ; au mount, si consenti → `startWatching()` sans afficher le dialog. ✅ test auto-start.
- **AC5** (cleanup au unmount) : `subscription.remove()` + `deactivateLiveMode()` (nulle position/km) ; gardes anti-double-watch (`startingRef`) et anti-watcher-fantôme (`cancelledRef`). ✅ test unmount.
- **CTA** « Démarrer en Live » activé dans `adventure-card.tsx` → `router.push('/(app)/live/{id}')` (test mis à jour).

**Gate (0) standard — VERT** : `jest` 451/451 (dont 22 nouveaux + 1 test card mis à jour), `tsc --noEmit` OK, `expo lint` OK, `expo export -p ios` OK.

**Gate (1) device Maestro** : `prebuild` iOS + `pod install` (ExpoLocation **56.0.16** + ExpoKeepAwake 56.0.3, locale UTF-8) + build standalone `pnpm sim`. **`smoke.yaml` (iOS) PASSÉ** (`maestro --device <udid-iOS>` — 2 devices up). Le 1er flow `live.yaml` a révélé que le **RN `Modal` est opaque à Maestro/XCUITest sur iOS** → consentement **réécrit en overlay RN absolu** (pattern projet iOS, cf. AGENTS.md), validé en Jest (453 verts) + visuellement (screenshots `mob51-live-consent-device.png`). **Re-run device de `live.yaml` bloqué par le disque plein** (volume données 100%, ~478 Mo libres, 398 Go de données utilisateur — rebuild iOS impossible) : à relancer après libération d'espace (`maestro --device <udid-iOS> test live.yaml`). Le prompt OS de permission (alerte système) reste un check interactif Guillaume.

### File List

**Ajouts :**
- `apps/mobile/src/lib/stores/live.store.ts`
- `apps/mobile/src/lib/live/consent-storage.ts`
- `apps/mobile/src/hooks/use-live-mode.ts`
- `apps/mobile/src/components/live/geolocation-consent.tsx`
- `apps/mobile/src/app/(app)/live/_layout.tsx`
- `apps/mobile/src/app/(app)/live/[id].tsx`
- `apps/mobile/__mocks__/expo-keep-awake.js`
- `apps/mobile/.maestro/live.yaml`
- `apps/mobile/.maestro/android/live.yaml`
- `apps/mobile/src/lib/stores/live.store.test.ts`
- `apps/mobile/src/lib/live/consent-storage.test.ts`
- `apps/mobile/src/hooks/use-live-mode.test.tsx`
- `apps/mobile/src/components/live/geolocation-consent.test.tsx`
- `apps/mobile/src/__tests__/live-screen.test.tsx`

**Modifications :**
- `apps/mobile/app.config.ts` (plugin `expo-location` foreground + rationale FR)
- `apps/mobile/package.json` (deps `expo-location`, `expo-keep-awake`)
- `apps/mobile/jest.setup.ts` (`jest.mock('expo-location'|'expo-keep-awake')`)
- `apps/mobile/src/components/adventure/adventure-card.tsx` (CTA Live activé)
- `apps/mobile/src/components/adventure/adventure-card.test.tsx` (test CTA Live)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (bloc `live.*`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut)

> `apps/mobile/ios/**` régénéré par `prebuild` (non commité, comme `android/`).

### Review Findings

- [x] [Review][Patch] Exception non catchée dans `startWatching` : si `requestForegroundPermissionsAsync` ou `watchPositionAsync` throw (erreur OS/plateforme), l'erreur est silencieusement avalée via `void`, laissant l'UI dans un état incohérent (dialog caché via `hasConsented=true` mais GPS non démarré, aucun message d'erreur). **Fix :** ajouter un bloc `catch` dans `startWatching` qui appelle `setPermissionDenied(true)`. [use-live-mode.ts:284]
- [x] [Review][Defer] RGPD Art. 7 — absence d'UI de révocation du consentement : une fois accordé, le consentement persiste indéfiniment sans possibilité de retrait dans l'app. Légalement requis, mais hors scope 5.1 (appartient à une story Settings). — deferred, hors scope story
- [x] [Review][Defer] Pas de retry automatique après retour des Réglages iOS/Android : si l'utilisateur refuse la permission OS, ouvre les Réglages, l'active, et revient — l'écran affiche toujours le panel `permissionDenied` (pas d'`AppState` listener). L'utilisateur doit re-naviguer. Gestion AppState = MOB-5.2. [use-live-mode.ts, [id].tsx] — deferred, MOB-5.2

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.1 (ready-for-dev) — FONDATION epic Live : `useLiveStore` (port verbatim web), consentement RGPD (`<GeolocationConsent />` non-dismissible), permission foreground `expo-location`, watch GPS foreground + projection `snapToTrace` → `currentKmOnRoute` (client-side), `expo-keep-awake`, route `(app)/live/[id].tsx` + `_layout.tsx`, CTA « Démarrer en Live ». Modules natifs neufs (expo-location/expo-keep-awake) → prebuild obligatoire. i18n FR/EN, tests. Background/caméra/POI/profil/météo = 5.2→5.6. | bmad-create-story (Story Context Engineer) |
| 2026-06-27 | 1.0 | Implémentation MOB-5.1 (→ review). Store `useLiveStore`, `consent-storage`, `use-live-mode` (expo-location foreground + projection RGPD), `<GeolocationConsent />`, route Live `_layout` (keep-awake) + `[id]` shell, CTA activé, i18n FR/EN `live.*`, mock `expo-keep-awake` + setup. 5 suites tests (22 nouveaux) + test card mis à jour : `jest` 451/451, typecheck/lint/expo export verts. Prebuild iOS + flows Maestro (iOS/Android) préparés ; run device interactif différé (maestro non installé). | bmad-dev-story (claude-opus-4-8) |
