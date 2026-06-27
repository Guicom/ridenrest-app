# Story MOB-5.1 : Activation du mode Live, consentement & permissions

Status: ready-for-dev

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

- [ ] **T0 — Installer les modules natifs + prebuild** (AC: 2, 3)
  - [ ] `npx expo install expo-location expo-keep-awake` (versions pinnées SDK 56 — laisser `expo install` choisir).
  - [ ] `app.config.ts` : ajouter le plugin `expo-location` avec `locationWhenInUsePermission` (rationale FR). **Foreground uniquement ici** — `isIosBackgroundLocationEnabled`/`UIBackgroundModes` = **MOB-5.2** (ne PAS les activer dans cette story).
  - [ ] `npx expo prebuild --clean -p ios` (obligatoire — nouveaux modules natifs). Vérifier `Podfile.lock`.
  - [ ] Mock Jest `expo-location` dans `__mocks__/` (requestForegroundPermissionsAsync, watchPositionAsync → `{ remove }`). Mock `expo-keep-awake` (`useKeepAwake` no-op).

- [ ] **T1 — `lib/stores/live.store.ts` (`useLiveStore`)** (AC: 1, 3, 4, 5)
  - [ ] **Porter verbatim** le store web `apps/web/src/stores/live.store.ts` (flat, parité 1:1). State : `isLiveModeActive` (false), `geolocationConsented` (false), `currentPosition: {lat,lng}|null`, `currentKmOnRoute: number|null`, `speedKmh` (15), `targetAheadKm` (30), `searchRadiusKm` (5), `weatherDepartureTime: string|null`, `stageLayerActive` (false), `gpsTrackingActive` (true).
  - [ ] Actions : `activateLiveMode`, `deactivateLiveMode` (**nulle `currentPosition` + `currentKmOnRoute`**), `setGeolocationConsent`, `updateGpsPosition`, `setCurrentKm`, `setSpeedKmh`, `setTargetAheadKm`, `setSearchRadius`, `setWeatherDepartureTime`, `setStageLayerActive`, `setGpsTrackingActive`.
  - [ ] **RGPD** : `currentPosition` reste en mémoire client uniquement — **jamais persisté, jamais sérialisé, jamais envoyé**. Ne PAS l'ajouter au persister TanStack/AsyncStorage.
  - [ ] Convention projet : `use{Domain}Store`, fichier `lib/stores/{domain}.store.ts`, actions verbes impératifs (cf. `map.store.ts`).

- [ ] **T2 — Persistance du consentement** (AC: 1, 4)
  - [ ] Flag `geolocationConsented` persisté hors-store (le store est volatil) — clé `ridenrest:geoloc-consent` (parité web `localStorage`). Sur mobile : **`@react-native-async-storage/async-storage`** (déjà présent ; le consentement n'est pas une donnée sensible → pas besoin de SecureStore). Helper `lib/live/consent-storage.ts` (`getConsent`/`setConsent`).
  - [ ] Au mount de `use-live-mode` : lire le flag ; si consenti → auto-start (AC4) ; sinon → exposer l'état pour afficher `<GeolocationConsent />`.

- [ ] **T3 — `hooks/use-live-mode.ts`** (AC: 1, 2, 3, 4, 5)
  - [ ] **Ré-implémenter** le web `apps/web/src/hooks/use-live-mode.ts` avec `expo-location` (PAS `navigator.geolocation`). Lifecycle :
    - `startWatching()` : `requestForegroundPermissionsAsync()` → si `status !== 'granted'` → état `permissionDenied` (AC2) ; sinon `watchPositionAsync({ accuracy: High, timeInterval: 5000, distanceInterval: 25 }, cb)` → `updateGpsPosition` + `activateLiveMode`. Garder la `subscription` en ref.
    - **Projection** : sur changement de `currentPosition`, `snapToTrace(position, kmWaypoints)` (`@ridenrest/gpx`) → `setCurrentKm(result.kmAlongRoute)`. ⚠️ Convertir `MapWaypoint.distKm → KmWaypoint.km` (le champ s'appelle `km`, pas `distKm`).
    - `grantConsent()` : `setConsent(true)` + `setGeolocationConsent(true)` + `startWatching()`.
    - Cleanup (unmount) : `subscription.remove()` + `deactivateLiveMode()` (AC5).
  - [ ] Exposer : `{ needsConsent, permissionDenied, grantConsent, openSettings, isLiveModeActive }`. `openSettings = Linking.openSettings`.
  - [ ] **Pas de background** ici (`watchPositionAsync` foreground seul) — `startLocationUpdatesAsync`/task-manager = MOB-5.2.

- [ ] **T4 — `components/live/geolocation-consent.tsx`** (AC: 1)
  - [ ] Porter le web `geolocation-consent.tsx` via le **`Dialog` mobile** (`components/ui/dialog.tsx`). **Non-dismissible** : `onClose` no-op au backdrop, pas de ✕ (gate RGPD délibérée). Texte : pourquoi la géoloc, RGPD (position jamais envoyée au serveur), boutons « Activer » (→ `grantConsent`) / « Refuser » (→ ferme, Live non activé + message AC1).
  - [ ] Boutons `size="lg"` (44px WCAG, règle dialog projet). i18n.

- [ ] **T5 — Route Live + keep-awake + branchement CTA** (AC: 1, 3, 5)
  - [ ] `app/(app)/live/_layout.tsx` : `useKeepAwake()` (écran allumé tant que le layout Live est monté ; relâché auto au unmount). `<Slot />`.
  - [ ] `app/(app)/live/[id].tsx` : **shell** de l'écran Live. `id` durci (`(rawId ?? '').trim()`, gate `Boolean(id)`). Monte `<MapCanvas>` (carte + trace, MOB-4.1 réutilisé), `useAdventureMap` + `useAdventureWaypoints`, `use-live-mode`. Si `needsConsent` → `<GeolocationConsent />`. Si `permissionDenied` → message + bouton Réglages. Sinon → carte + position (le reste = 5.2→5.6 : pins, contrôles, météo, profil).
  - [ ] Brancher le CTA « Démarrer en Live » (liste/détail aventures, actuellement disabled — `adventures.intro.live*` / carte aventure) → `router.push('/live/{id}')`. Retirer le `disabled`.
  - [ ] Auth guard déjà centralisé dans `(app)/_layout.tsx` — ne PAS ré-implémenter.

- [ ] **T6 — i18n + a11y** (AC: 1, 2)
  - [ ] Bloc `live.*` (FR/EN parité) : `live.consent.title/body/rgpd/accept/refuse`, `live.permissionDenied.title/body/openSettings`, `live.refusedNotice`, `live.start` (CTA). **Zéro chaîne en dur.**
  - [ ] a11y : dialog `accessibilityViewIsModal`, boutons labellisés, message live-region.

- [ ] **T7 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5)
  - [ ] `live.store` : defaults, `deactivateLiveMode` nulle position+km, actions.
  - [ ] `consent-storage` : get/set AsyncStorage.
  - [ ] `use-live-mode` (mock `expo-location`) : refus consentement → pas d'activation ; consentement → permission demandée ; refus permission → `permissionDenied`, pas de watch ; succès → watch + `updateGpsPosition` ; consentement déjà persisté → auto-start sans dialog (AC4) ; unmount → `subscription.remove` + `deactivateLiveMode` (AC5). Projection `snapToTrace` → `setCurrentKm`.
  - [ ] `geolocation-consent` : non-dismissible (backdrop no-op), boutons.
  - [ ] **Test route** (`live/[id]`) → **`src/__tests__/`** (jamais sous `src/app/`).
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [ ] **T8 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client (Guillaume)
  - [ ] Démarrer Live → dialog consentement (non fermable au backdrop). Refuser → pas d'activation + message. Accepter → prompt OS iOS/Android.
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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.1 (ready-for-dev) — FONDATION epic Live : `useLiveStore` (port verbatim web), consentement RGPD (`<GeolocationConsent />` non-dismissible), permission foreground `expo-location`, watch GPS foreground + projection `snapToTrace` → `currentKmOnRoute` (client-side), `expo-keep-awake`, route `(app)/live/[id].tsx` + `_layout.tsx`, CTA « Démarrer en Live ». Modules natifs neufs (expo-location/expo-keep-awake) → prebuild obligatoire. i18n FR/EN, tests. Background/caméra/POI/profil/météo = 5.2→5.6. | bmad-create-story (Story Context Engineer) |
