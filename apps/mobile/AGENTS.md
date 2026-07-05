# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## MapLibre Native : GeoJSON à coordonnées finies OBLIGATOIRE (CRITIQUE)

MapLibre **Native** parse la GeoJSON via `mapbox::geojson` (C++) qui **lève une
exception C++ non rattrapée → `SIGABRT` (crash dur de l'app)** dès qu'une coordonnée
est non numérique (`null`/`NaN`/`±Infinity`) — un seul point GPX corrompu suffit.
MapLibre GL **JS** (web) tolère et ignore silencieusement → symptôme classique
« ok sur le web, **crash sur iOS** » à l'ouverture de *certaines* aventures
(signature : `__cxa_throw` → `MapLibre` → `-[MLRNGeoJSONSource setShape:]`).

→ **Toute** coordonnée passée à un `<GeoJSONSource>` ou `<Marker lngLat>` DOIT être
filtrée par `isValidLngLat(lng, lat)` (`src/lib/map/maplibre-config.ts`) AVANT de
bâtir la feature. Filtrer **au niveau du point** (pas seulement « segment ≥ 2 wp »),
puis re-vérifier `coords.length >= 2`. Points de filtrage : `buildTraceFeatureCollection`,
`collectTraceWaypoints`, `useAdventureWaypoints` (alimente étapes/météo/corridor/marqueurs),
`buildDensityColoredFeatures`, `buildPoiFeatureCollection`, `buildCorridorFeature`,
`buildStageColoredFeatures`, `buildWindArrowPoints`. (Régression réelle 2026-06-16.)

### Ne JAMAIS monter une `<GeoJSONSource>` avant que le style soit chargé (CRITIQUE)

Même cause racine (`-[MLRNGeoJSONSource setShape:]` → `mbgl` → `__cxa_throw` → SIGABRT),
**autre déclencheur** : appeler `setShape` **pendant le chargement du style** plante,
indépendamment de la validité des coordonnées.

- Le cas se déclenche surtout quand la `data` d'une source est disponible **synchrone**
  au 1er rendu — typiquement **cache TanStack chaud** : on ouvre une aventure déjà
  visitée → la source se monte avec sa donnée **avant** `onDidFinishLoadingStyle`.
- À froid (fetch async, donnée arrivant **après** le style) le bug ne se voit pas →
  symptôme « **crash intermittent à l'ouverture du planning** » (et pas en deep-link à froid).
- ⇒ Dans `map-canvas.tsx`, **trace + `children` (tous les calques GeoJSON) ne sont rendus
  que lorsque `styleLoaded === true`** (`onDidFinishLoadingStyle`). Tout nouveau calque
  carte doit rester enfant de ce gate. (Crash réel + fix 2026-06-27, diagnostiqué via
  `simctl launch --console-pty` — le `what()` C++ n'est ni dans le `.ips` ni dans le
  `log show` unifié ; il faut capturer **stderr du process**.)

## Contenu interactif sur la carte : JAMAIS dans un `<Marker>` sur iOS (CRITIQUE)

Sur **iOS**, le `Marker` de `@maplibre/maplibre-react-native` est implémenté via
`ViewAnnotation` → `MLNPointAnnotation`, qui **rend ses enfants sur un BITMAP** (cf. source
lib : *« child views are rendered onto a bitmap »*, *« To rerender the image … call
refresh »*). Conséquences pour tout contenu **interactif** dans un `<Marker>` :

- Les `Pressable`/boutons ne reçoivent **pas** les taps de façon fiable (taps avalés /
  « ça marche une fois sur trois »).
- L'image **ne se redessine pas** quand l'état React change → un bouton sélectionné « ne
  change pas d'état » tant que le marker n'est pas re-rendu pour une autre raison.

→ **Toute fiche/contrôle interactif au-dessus de la carte = overlay RN absolu**, PAS un
`<Marker>`. Pattern (cf. `poi-popup.tsx` + `map/[id].tsx`, refonte 2026-06-27) :

1. Rendre la fiche comme une `<View pointerEvents="box-none" style={{ position:'absolute', … }}>`
   **sœur** de la carte (pas enfant du `<Map>`).
2. Calculer sa position en projetant la coordonnée : `await getMap().project([lng, lat])`
   → pixels écran (origine = coin haut-gauche de la carte plein écran).
3. La faire **suivre** la carte via les events `onRegionIsChanging` / `onRegionDidChange`
   de `<MapCanvas>` (re-projection ; guard in-flight pour ne pas empiler les appels async).
4. Ancrer le bas de la fiche au pin : `top = anchor.y - hauteurMesurée - gap` (mesure via
   `onLayout`, `opacity:0` tant que non mesurée pour éviter un flash).

`<Marker>` reste OK pour du **non-interactif** (ex. marqueurs d'étape `stage-markers.tsx`).
Note : `setState` issu de la projection (asynchrone) doit vivre dans le callback `.then`
d'un effet (ou un handler d'event), jamais en synchrone dans le corps d'un `useEffect`
(règle `react-hooks/set-state-in-effect`).

**Corollaire RN `<Modal>` + Maestro/XCUITest (iOS)** : un RN `<Modal>` rend son contenu
dans une **fenêtre UIKit séparée** que XCUITest (donc Maestro) **n'introspecte pas** sur
iOS — la hiérarchie ne remonte que la barre de statut, et le contenu derrière le Modal est
masqué aussi. Symptôme : un flow Maestro qui lit/tape un dialog échoue (« element not
found ») alors que le dialog est bien visible à l'écran. → Pour tout overlay qui doit être
**testable par Maestro** (ou simplement fiable au tap iOS), préférer une **`<View>` absolue
plein écran** (`absolute inset-0`, fond `bg-black/40` inerte, `accessibilityViewIsModal`)
plutôt qu'un `<Modal>`. Vécu en MOB-5.1 (`geolocation-consent.tsx` : Modal → overlay
absolu). ⚠️ `accessibilityViewIsModal` **masque les frères** aux requêtes a11y (VoiceOver,
Maestro **et RNTL**) → en test, asserter le contenu de l'overlay quand il est ouvert, et le
contenu derrière (header/trace) dans un scénario où l'overlay est fermé.

## Toolchain de build natif (CRITIQUE)

**Expo SDK 56 exige Xcode 26.4** (et iOS deployment target **16.4**) pour compiler le
projet iOS natif. Une version inférieure (ex. Xcode 26.1) **échoue à la compilation** :
le code Swift d'Expo (`expo-modules-jsi`, ex. `weak let`) n'est compilable que par la
toolchain de Xcode 26.4. Symptôme typique avec un Xcode trop ancien :

```
expo-modules-jsi/.../HostFunctionContext.swift: error: 'weak' must be a mutable variable
xcodebuild exited with error code 65
```

Vérifier avant tout build local : `xcodebuild -version` → doit afficher `Xcode 26.4`.
Mettre à jour via l'App Store si besoin, puis `sudo xcodebuild -runFirstLaunch`.

## `expo export` : gate CI **natif-only** (`-p ios -p android`) — le web est hors cible (CRITIQUE)

Ride'n'Rest est **native-first** : le **web n'est PAS une cible de shipping**. Le script `build`
(`package.json`) est donc **`expo export -p ios -p android`** — **jamais** `expo export` tout court
(qui exporterait aussi le web).

Pourquoi : `web.output: 'static'` (`app.config.ts`) fait **pré-rendre chaque route côté Node**
(`getBuildTimeServerManifestAsync`). Or l'app charge, **au niveau module** (à l'import, AVANT tout
effet React — les `useEffect` ne s'exécutent pas au pré-rendu SSR), des modules **natif-only** qui
appellent une API native immédiatement et **crashent** sous Node :

- **`expo-notifications`** — son entrée web lit `localStorage` (`getRegistrationInfoAsync`) →
  `TypeError: localStorage.getItem is not a function` (MOB-6.2, via `_layout` → `use-notification-observer`).
- **`expo-file-system`** (API `File`/`Directory`/`Paths`) — `src/lib/cache/cache-manager.ts` fait
  `export const CACHE_ROOT = Paths.cache.uri` **à l'import** (atteint depuis `_layout` via
  `useAppStateRefetch` → couche de cache offline) → `this.validatePath is not a function`
  (« expo-file-system is not supported on web »).
- **`expo-task-manager`** — `src/lib/live/location-task.ts` fait `TaskManager.defineTask(...)` à
  l'import. Et ainsi de suite (MapLibre, expo-location…).

Ces crashs surviennent **à l'import**, pas dans un effet → un garde runtime `Platform.OS !== 'web'`
dans le corps d'une fonction **ne suffit pas** (le module est déjà évalué). Gater un module en
révèle un autre : c'est une **cascade** accumulée sur MOB-3→6 (la CI ne tourne que sur `main`/PR
vers `main`, donc `expo export` complet n'a jamais été exercé pendant le dev de la branche). Comme
le web n'est pas livré, on **exclut le web du build** plutôt que de maintenir des stubs `.web.ts`
pour toute la surface native.

> **CI alignée automatiquement** : `.github/workflows/ci.yml` exécute `pnpm turbo run build --filter='*'`,
> qui appelle ce même script `build` → il n'y a plus de web à pré-rendre. `-p ios -p android`
> **bundle** le JS par plateforme (smoke-test de bundling), **sans** compiler du natif — la
> compilation native réelle reste sur EAS Build (cloud). Pour un besoin web ponctuel (Storybook web
> reste OK), il faudrait d'abord rendre la surface native web-SSR-safe (`.web.ts`) — hors périmètre.

## `expo start` vs `expo run:ios` vs EAS Build (ne pas confondre)

| Commande | Ce que ça fait | Compile du natif ? |
|---|---|---|
| `expo start` (+ `i`/`a`) | Sert le bundle **JS** (Metro) à une app **déjà installée** | ❌ Non |
| `expo run:ios` / `run:android` | **Compile** l'app nativement **en local** (Xcode/Gradle) puis l'installe | ✅ Oui — exige Xcode 26.4 + runtime sim |
| `eas build` | **Compile** sur le **cloud EAS** (image avec la bonne toolchain) | ✅ Oui — mais sur les serveurs Expo, pas en local |

Conséquence : tant qu'on ne fait que `expo start` ou des builds **EAS cloud**, la toolchain
de build **locale** n'est jamais sollicitée — un Xcode local périmé passe inaperçu. Il ne se
révèle qu'au premier `expo run:ios`. Pour tester un **deep link à scheme custom**
(`ridenrest://`), un dev build est obligatoire (Expo Go ne gère pas les schemes custom) :
soit `expo run:ios` (local, Xcode 26.4), soit un build EAS dev-client installé sur le simulateur.

## Ajout d'un module natif Expo : versions précompilées & locale CocoaPods (CRITIQUE)

Vécu en MOB-5.1 (ajout `expo-location` + `expo-keep-awake`). Deux pièges natifs durables :

**1. Version d'un module Expo : suivre `bundledNativeModules.json`, PAS le max de la plage.**
`npx expo install <module>` résout parfois un **patch plus récent** que celui testé par le
SDK (ex. `expo install expo-location` → `~56.0.18`, alors que
`node_modules/expo/bundledNativeModules.json` épingle `expo-location: ~56.0.16`). Or les
binaires **précompilés** d'Expo (ex. `ExpoModulesCore` 56.0.15, log `[Expo-precompiled]`)
sont figés à la version du SDK. Un module trop récent référence un symbole Swift absent du
core précompilé → **crash dyld au lancement** :
```
EXC_CRASH (SIGABRT) — DYLD, "Symbol not found:
  _$s15ExpoModulesCore6RecordPAAE4from10dictionary10appContextxSDySSypG_AA03AppH0CtKFZ"
  (terminated at launch; ignore backtrace)
```
→ **Pin la version EXACTE de `bundledNativeModules.json`** (ex. `"expo-location": "56.0.16"`,
sans `~` — sinon pnpm re-résout 56.0.18). Puis `pnpm install` + `cd ios && pod update
ExpoLocation --no-repo-update` + rebuild. Diagnostic : crash report
`~/Library/Logs/DiagnosticReports/RidenRest-*.ips` (`reasons[0]` = le symbole manquant).

**2. `pod install` / `pnpm sim` exigent une locale UTF-8.**
CocoaPods + Ruby 4.0.x plante en `Encoding::CompatibilityError` (« Unicode Normalization not
appropriate for ASCII-8BIT ») si `LANG`/`LC_ALL` ne sont pas UTF-8 :
```bash
LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install      # ou devant `pnpm sim`
```
`pnpm sim` relance `pod install` en interne → préfixer la commande entière par la locale.
(Si `prebuild --clean` échoue sur `ENOTEMPTY ios/Pods`, déplacer `ios/` puis `prebuild -p ios`.)

## Tester l'app sur simulateur — LE FLUX STABLE : `pnpm sim` (build standalone)

> **C'est la méthode par défaut pour tester en local. Validée le 2026-06-27.**
> Avant ça, on perdait un temps fou sur des erreurs récurrentes (« Cannot find native
> module », « Could not connect to development server », cache Metro). **Cause racine :**
> le couple **dev-client (Debug) + Metro** est fragile, et `expo-dev-client` est une
> dépendance → tout build se branche par défaut sur Metro.

**La solution : un build Release avec le bundle JS EMBARQUÉ → l'app est autonome, ZÉRO
Metro, donc zéro écran rouge possible.** Le JS est compilé avec le natif → toujours synchro.

```bash
cd apps/mobile && pnpm sim            # build + install + lance en standalone sur le simu booté
cd apps/mobile && pnpm sim "iPhone 17 Pro"   # cibler un device (nom ou UDID)
```

`pnpm sim` (= `scripts/sim-build.sh`) fait : `expo run:ios --configuration Release
--no-bundler`, **puis relance l'app via `simctl launch`** (car `expo run:ios` ouvre sinon
l'app via le deep-link dev-client → Metro ; on force le chargement du bundle embarqué).

**Répartition des rôles** : l'agent (Claude) lance `pnpm sim` **en fin de dev quand
c'est utile** ; l'humain n'a plus qu'à **rouvrir « Ride'n'Rest »** sur le simu pour tester.
Aucun terminal/serveur à garder ouvert.

**Prérequis réseau** : le backend local doit tourner (`docker compose up -d` à la racine +
API NestJS :3010 + Better Auth :3011). L'ATS localhost est autorisée via
`app.config.ts` → `ios.infoPlist.NSAppTransportSecurity.NSAllowsLocalNetworking = true`
(sinon iOS bloque le HTTP cleartext en Release → l'app s'ouvre mais les appels API
échouent). ⚠️ La phase Xcode « [Expo Dev Launcher] Strip Local Network Keys for Release »
ne retire QUE les clés *privacy* du réseau local, **pas** l'ATS — vérifié, la clé survit.

**Coût** : 1re compilation longue (Release), incrémentale ensuite (~1-2 min, surtout le
bundle Hermes). Tradeoff assumé : **stabilité > Fast Refresh** pour le cycle « je teste ».

### Flux alternatif (rapide mais fragile) — Fast Refresh

Pour de l'itération JS très rapide pendant un co-dev actif, le dev-client + Metro reste
possible (`expo start` → `i`, Fast Refresh ~1 s). **Mais** il exige un dev-client **à jour**
(rebuild natif si un module natif/plugin a changé) et un Metro vivant. En cas de moindre
doute / erreur, **retomber sur `pnpm sim`** (déterministe). Ne pas y passer des heures.

## Runtime simulateur iOS (gotcha)

Un runtime simulateur peut suffire à **faire tourner** un simulateur (`simctl boot`) sans
suffire à **compiler vers lui**. Si `xcodebuild -showdestinations` ne liste **aucun**
simulateur (« iOS X is not installed »), installer le bon runtime de build :

```
xcodebuild -downloadPlatform iOS
```

## Après ajout d'un module NATIF : `expo prebuild --clean` OBLIGATOIRE (CRITIQUE)

Si un `ios/` (ou `android/`) existe déjà sur disque, `expo run:ios` **ne refait pas**
l'autolinking : il recompile/réinstalle le projet natif tel quel. Donc après
`expo install <module-natif>` (ex. `expo-secure-store`, `expo-web-browser`,
`@react-native-community/netinfo`…) **et** un changement de `app.config.ts` (plugins),
il faut **régénérer** le projet natif sinon le module manque du binaire :

```
ERROR  Cannot find native module 'ExpoSecureStore'   # crash au boot
```

Fix : `npx expo prebuild --clean -p ios` (régénère `ios/` + `pod install` complet ;
vérifier le module dans `ios/Podfile.lock`) **puis** `npx expo run:ios`. Vécu en MOB-2.1
(le `ios/` datait d'avant l'ajout des modules secure-store/localization). Une build
**EAS cloud** fait toujours un prebuild propre → le souci n'arrive qu'en build locale.

**Re-vécu en MOB-3.1** avec `react-native-svg` (peer de `lucide-react-native` + rendu
du wordmark Strava) : les composants SVG s'affichaient en boîtes roses *« Unimplemented
component: RNSVG… »* tant que `RNSVG` n'était pas dans `Podfile.lock`. Même fix
(`prebuild --clean -p ios` + `run:ios`). Règle : **toute icône lucide / SVG sur mobile
dépend de `react-native-svg` (natif)** — pas de rendu sans rebuild du dev client.

### Module natif neuf = rebuild iOS **ET** Android, sinon crash au boot (CRITIQUE)

Vécu en MOB-5.2 (ajout `expo-task-manager`) : **ne rebuilder qu'une seule plateforme** laisse
l'autre app sur son **ancien binaire natif sans le module** → dès que la nouvelle JS charge le
module (ex. `import '@/lib/live/location-task'` → `TaskManager.defineTask`), **crash dur au
boot** (« app died » Android / dyld iOS). Le piège : le bundle JS est partagé, mais le binaire
natif ne l'est PAS.

→ **Tout ajout/màj de module natif OU changement de `app.config.ts` (plugins, permissions)
impose un rebuild des DEUX plateformes avant de déclarer quoi que ce soit testé :**
- iOS : `expo prebuild -p ios` (workaround ENOTEMPTY : déplacer `ios/` puis prebuild) + `pnpm sim`
- Android : `expo prebuild -p android` (régénère AndroidManifest = nouvelles permissions) + `expo run:android --variant release`
- **Vérifier le boot de chaque plateforme** (logcat Android `pidof`/pas de FATAL ; `.ips` iOS), pas seulement « le process est vivant ».

**Règle de reporting (anti-arrondi)** : ne JAMAIS écrire un « ✓ » global. Toujours nommer
l'état **réel par plateforme** : « iOS ✓ / Android **non testé** » est une réponse valide et
honnête ; « tout est ok » alors qu'une seule plateforme a été buildée ne l'est pas. Un
comportement bizarre sur un device (même « le mauvais device ») = **on s'arrête et on creuse**,
on ne contourne pas.

## Tests de routes : JAMAIS sous `src/app/` (CRITIQUE)

Expo Router découvre les routes via `require.context(process.env.EXPO_ROUTER_APP_ROOT, …)`
avec une regex qui matche **tout** `.[tj]sx` sous `src/app` (seuls `+api`/`+html`/
`+middleware`/`+native-intent` sont exclus — **pas** les `*.test.tsx`). Conséquence : un
`*.test.tsx` placé sous `src/app` est **bundlé** par `expo export`, qui casse alors sur
l'import de `@testing-library/react-native` (`import "console"` non résolu côté Metro) :

```
@ridenrest/mobile:build:  apps/mobile/src/app (require.context)
The package "console" wasn't found... | import "@testing-library/react-native"
```

→ Les tests qui doivent **importer un fichier de route** vivent sous `src/__tests__/`
(ex. `src/__tests__/app-group-guard.test.tsx` qui importe `@/app/(app)/_layout`). Les
tests de logique/composants restent co-localisés ailleurs (`src/lib/**`, `src/components/**`).
La regex `require.context` est figée dans `expo-router/_ctx.js` — non configurable.

## Auth Better Auth mobile (MOB-2.1)

- Versions **pinées exactement** : `better-auth@1.5.5` + `@better-auth/expo@1.5.5`,
  **alignées sur le serveur** (`apps/web`, `better-auth@1.5.5`). Le plugin a un peer
  `better-auth: 1.5.5` strict (pas `^`). **Ne pas** bumper en 1.6.x sans monter aussi le
  serveur — ça casserait les sessions web en prod. Modif serveur = **additive** (`expo()`
  plugin + `trustedOrigins`), comportement web cookies inchangé.
- Tokens **toujours** en `expo-secure-store` (Keychain/Keystore) — **jamais** `AsyncStorage`
  (présent en dep transitive, ne jamais l'utiliser pour l'auth).
- Guard d'auth **centralisé** dans `src/app/(app)/_layout.tsx` — un seul point, jamais par écran.
- Mocks Jest auth : on mocke le wrapper `@/lib/auth/client` (pas `@better-auth/expo`
  directement — sous-chemin `/client` peu fiable en auto-mock). Dans une factory `jest.mock`,
  **pas** de JSX RN (le transform NativeWind injecte une variable hors-scope interdite par
  jest) → utiliser `jest.fn(() => null)` + assertions sur les appels/props.

## API NestJS : préfixe global `/api` (CRITIQUE)

L'API NestJS monte **toutes** ses routes sous le préfixe global `/api`
(`app.setGlobalPrefix('api')`, `apps/api/src/main.ts`). `apiFetch` le préfixe
**déjà** (`API_BASE = ${EXPO_PUBLIC_API_URL}/api`) → les façades utilisent des
chemins **propres** (`/adventures`, **pas** `/api/adventures`). `EXPO_PUBLIC_API_URL`
ne contient que l'**hôte** (`http://localhost:3010`, sans chemin). Oublier ce préfixe
= **404** sur toutes les routes data (découvert en MOB-3.1, 1er consommateur réel).

## Screenshots simulateur iOS : la roue dentée ⚙️ n'est PAS de l'app

La **roue dentée** visible en haut à droite des captures du **simulateur iOS** est un
**overlay système du simulateur**, pas un composant de l'app Ride'n'Rest. Ne jamais
l'interpréter comme un bouton Settings, un bug de layout ou un élément d'UI.

## Android : build local + test (émulateur) — validé 2026-06-27

Premier build Android du projet (jusque-là iOS only). **Le Play Store n'est PAS requis**
pour tester en local (uniquement pour publier).

**Toolchain** (Homebrew, pas Android Studio) :
- SDK : `/opt/homebrew/share/android-commandlinetools` (cask `android-commandlinetools`).
  Exporter `ANDROID_HOME`/`ANDROID_SDK_ROOT` dessus (non exporté par défaut dans le shell).
- **JDK 17 obligatoire** (`brew install openjdk@17`) → `JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`.
  Gradle/AGP **refuse** un JDK trop récent (26).
- Composants : `sdkmanager "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1"`
  (`newArchEnabled=true` + Hermes → compilation NDK des modules natifs : reanimated,
  worklets, maplibre… 1er build long). Accepter les licences (`sdkmanager --licenses`).
- AVD existant : `ridenrest_pixel` (`emulator @ridenrest_pixel`).
- Prebuild : `npx expo prebuild -p android` (génère `android/`, **non commité** comme `ios/`).
- Build : `npx expo run:android` (PAS `--device <serial>` — passe un **nom** d'AVD ou rien ;
  auto-détecte l'émulateur booté).

**Réseau émulateur (CRITIQUE)** : `localhost` = l'émulateur, pas l'hôte.
`adb reverse tcp:8081 tcp:8081` (Metro) **+ `tcp:3010` (API) + `tcp:3011` (auth)** —
sinon login « Connexion impossible. Vérifiez votre réseau ».

**Cleartext** : OK en debug (config réseau RN autorise localhost). Pas de blocage observé.

**`INSTALL_FAILED_UPDATE_INCOMPATIBLE`** : un `app.ridenrest` d'une signature différente
était déjà installé → `adb uninstall app.ridenrest` puis réinstaller.

**Disque** : le build NDK consomme plusieurs Go. Surveiller l'espace ; `Xcode DerivedData`
(`~/Library/Developer/Xcode/DerivedData`, cache pur) est récupérable (~9 Go). ⚠️ disque
plein → **OrbStack redémarre** → Postgres/Redis remontent mais les serveurs node
`pnpm dev` (API 3010 / web 3011) **tombent** et ne sont pas relancés (symptôme : auth KO).

**Tests Maestro Android** — voir `.maestro/README.md` §Android. Points durs :
- Build debug = **dev-launcher Expo** au lancement (sélection du serveur Metro) → étape
  manuelle, ou build `--variant release` (bundle embarqué, sans Metro) pour s'en passer.
- 2 devices up (iOS sim + émulateur) → `maestro --device emulator-5554 test …`.
- Locale en-US par défaut → app en anglais. Pour FR : `adb root && adb shell setprop persist.sys.locale fr-FR && adb reboot`.
- **Bounds `[0,0][0,0]` (RN Fabric)** : un `Pressable` en position absolue + transform
  (chevron drawer) a des bounds nulles dans l'arbre a11y → Maestro ne le trouve NI par
  `id` NI par label (alors que `adb shell uiautomator dump` le voit) → le taper par
  **coordonnée**. `testID` ne surface PAS en `resource-id` sur cette archi → cibler par
  **label** sur Android, pas par id.

## Géoloc background Android : `RECEIVE_BOOT_COMPLETED` OBLIGATOIRE (CRITIQUE)

Vécu en validation device MOB-5.3 (mode Live, émulateur). Dès le **1er fix GPS background**,
`expo-location` (`LocationTaskConsumer.reportLocationsImmediately`) planifie via
`expo-task-manager` un **JobScheduler job persisté** (`setPersisted(true)`). Android **exige**
alors la permission `RECEIVE_BOOT_COMPLETED`, sinon **crash dur** :

```
FATAL EXCEPTION: java.lang.IllegalArgumentException:
  Requested job cannot be persisted without holding android.permission.RECEIVE_BOOT_COMPLETED
  at expo.modules.taskManager.TaskManagerUtils.updateOrScheduleJob
  at expo.modules.location.taskConsumers.LocationTaskConsumer.reportLocationsImmediately
```

→ Toute app avec une **tâche de localisation background** (`startLocationUpdatesAsync` +
`TaskManager`) DOIT déclarer la permission. Le plugin `expo-location` ne l'ajoute PAS tout
seul. Fix : `app.config.ts` → `android.permissions: ['android.permission.RECEIVE_BOOT_COMPLETED']`
puis `expo prebuild -p android`. Permission **Android-only** (no-op iOS). Diagnostic :
`adb logcat -d -b crash`. (Le crash n'apparaît que quand un update GPS background est
réellement délivré → un test court qui n'atteint pas ce point le rate.)

## Tester Android en local : DEBUG + Metro (le release bloque le login localhost)

Contrairement à iOS (`pnpm sim` = build **release** standalone autonome), le build
**release Android NE marche PAS** pour tester le login en local : le manifest *release*
n'a **pas** `usesCleartextTraffic="true"` (seul le manifest *debug* l'a) → Android **bloque
le HTTP cleartext vers `localhost`** → l'auth (`http://localhost:3011`) échoue
(« Connexion impossible »). L'app release boote et affiche le login, mais ne peut pas se
connecter à l'API/auth locale.

→ Pour une validation device Android **avec login**, utiliser le build **debug + Metro** :
1. `adb reverse tcp:8081 tcp:8081` + `tcp:3010` + `tcp:3011`.
2. Metro : `npx expo start --dev-client` (laisser tourner).
3. Build/install debug : `npx expo run:android` (signature debug ≠ release →
   `adb uninstall app.ridenrest` d'abord si un release était installé).
4. **Charger depuis Metro** (sinon l'app tente le bundle embarqué inexistant →
   « Unable to load script » : `loadJSBundleFromAssets`) — lancer le deep-link
   dev-client en `localhost` (PAS l'IP LAN que `expo run:android` ouvre par défaut,
   injoignable depuis l'émulateur) :
   `adb shell am start -a android.intent.action.VIEW -d "exp+ridenrest://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081" app.ridenrest`
   (force-stop d'abord, sinon l'intent est avalé par l'instance déjà ouverte).
5. GPS : `adb emu geo fix <lng> <lat>` (ordre **lng lat**), à **renvoyer en boucle**
   (le fix décroît ; un seul envoi ne suffit pas à alimenter `watchPositionAsync`).
6. Permissions localisation : le prompt runtime ouvre la **page Réglages** (radios
   « Toujours autoriser » / « …si l'appli est utilisée ») — la sélection ne ferme pas la
   page, il faut **revenir en arrière** (`KEYCODE_BACK`). Pré-accorder évite le détour :
   `adb shell pm grant app.ridenrest android.permission.ACCESS_FINE_LOCATION`
   (+ `ACCESS_COARSE_LOCATION` + `ACCESS_BACKGROUND_LOCATION`).

## Observabilité : Sentry + PostHog (MOB-6.1)

Deux SDK natifs neufs : `@sentry/react-native` (crash reporting JS + natif, source maps Metro)
et `posthog-react-native` (analytics produit, branché sur la façade **existante**
`@ridenrest/analytics` — ne PAS recréer la taxonomie). Points durs :

- **Modules natifs neufs + plugin `@sentry/react-native/expo` dans `app.config.ts`** →
  `expo prebuild --clean -p ios` ET `-p android` OBLIGATOIRE avant `pnpm sim`/`run:android`,
  sinon « Cannot find native module » / crash au boot. (ENOTEMPTY sur `ios/Pods` → déplacer
  `ios/` puis `expo prebuild -p ios`.) Le pod **RNSentry** + **Sentry/HybridSDK** apparaissent
  dans `ios/Podfile.lock` après prebuild ; PostHog core est **pur JS** (pas de pod).
- **`check:native-config`** encode l'invariant « plugin Sentry présent » → échoue (sans device)
  si on retire le plugin de `app.config.ts`.
- **Tout est key-gated** : `initSentry()` no-op sans `EXPO_PUBLIC_SENTRY_DSN` ; le bootstrap
  PostHog n'instancie rien sans `EXPO_PUBLIC_POSTHOG_KEY` → la façade reste `null`, helpers
  no-op. Donc en dev/CI **sans clés**, l'app boote et ne crashe pas, mais n'émet rien.
- **Ordre de boot (AC1)** : `Sentry.init()` doit s'exécuter **avant tout** (avant
  `@/lib/live/location-task`). Réalisé par `import '@/lib/observability/boot'` en **1ère**
  ligne d'effet de `src/app/_layout.tsx` (l'ordre des imports ESM dicte l'exécution ; un
  appel de fonction après les imports tournerait APRÈS `location-task`). Ne pas réordonner.
- **RGPD** : aucun bandeau de consentement mobile (zéro cookie, `distinct_id` AsyncStorage,
  pas d'IDFA → pas d'ATT). Le **session replay** est **beta-only** (`EXPO_PUBLIC_APP_ENV !==
  'production'`) et masque la carte MapLibre via `accessibilityLabel="ph-no-capture"` sur le
  conteneur de `map-canvas.tsx` (NE PAS retirer — règle « GPS jamais hors device » étendue à
  l'écran enregistré). Le replay **prod** = story dédiée MOB-6.6.
- **Mocks Jest** : `__mocks__/@sentry/react-native.js` + `__mocks__/posthog-react-native.js`
  (CommonJS, sans JSX ; `wrap` = HOC identité, `PostHogProvider`/`PostHogMaskView` =
  `jest.fn(() => null)`), activés dans `jest.setup.ts`.

## Notifications push : APNs / FCM (MOB-6.2)

Notification « analyse de densité terminée » via `expo-notifications` + `expo-device` (mobile)
et un `PushModule` NestJS (envoi serveur via **Expo Push API**, `expo-server-sdk` — un endpoint
route APNs **et** FCM). Points durs :

- **Timing permission (AC1)** : le prompt OS n'est demandé **ni au boot ni à l'onboarding**,
  mais **après la 1re analyse de densité** (`sidebar-density-section.tsx` → `onConfirm` après
  `trigger()`). Demander trop tôt = refus systématique = feature morte. Garde one-shot via
  un flag **AsyncStorage** (`push-storage.ts`) — **jamais** `expo-secure-store` (réservé aux
  tokens d'auth). Le token Expo enregistré est aussi persisté (AsyncStorage) pour la
  désinscription au logout (AC4). RGPD : un token push **n'est pas** une donnée de position.
- **Module natif neuf + plugin `expo-notifications` dans `app.config.ts`** →
  `expo prebuild --clean -p ios` ET `-p android` OBLIGATOIRE avant `pnpm sim`/`run:android`,
  sinon « Cannot find native module » / crash au boot. Pin **exact** de `expo-notifications`
  (`56.0.16`) et `expo-device` (`56.0.4`) — `bundledNativeModules.json`, sans `~` (gotcha dyld
  « Symbol not found »). Le plugin ajoute `POST_NOTIFICATIONS` (Android 13+) au manifest.
- **`check:native-config`** encode l'invariant « plugin `expo-notifications` présent » → échoue
  (sans device) si on retire le plugin de `app.config.ts`.
- **No-op sûr sans credentials / sur simulateur** : `!Device.isDevice` (simulateur iOS,
  émulateur Android) → `getExpoPushTokenAsync` échouerait faute de credentials APNs/FCM → on
  court-circuite sans AUCUNE erreur. Le **push réel n'arrive PAS sur simulateur iOS** → tester
  le flux permission/registration sur sim, l'envoi réel sur **device physique**.
- **Envoi best-effort (AC2)** : le processor densité **émet** `density.completed` (EventEmitter,
  après `setDensityStatus('success')`) ; `PushService.@OnEvent` résout l'owner (le payload du
  job **n'a pas** de `userId` → lookup `adventures.userId`) puis envoie. Une erreur d'envoi
  **ne fait jamais échouer le job densité** ; un `DeviceNotRegistered` purge le token en base.
- **Fallback (AC3)** : si permission refusée, le **polling `useDensity` (3 s)** existant informe
  quand même l'utilisateur — comportement MOB-4.4 intact, rien à recréer.
- **Deep-link** : le tap sur la notif ouvre `map/[id]` avec l'`adventureId` du `data`
  (`use-notification-observer.ts`, monté une fois dans le root layout : handler foreground +
  canal Android `default` + listener réponse + cold-start `getLastNotificationResponseAsync`).
- **Credentials (hors-code)** : clé APNs `.p8` (EAS), `google-services.json` + clé FCM V1 (EAS),
  `EXPO_ACCESS_TOKEN` optionnel côté API (jamais dans le bundle). Détails : `README.md`.
- **Mocks Jest** : `__mocks__/expo-notifications.js` + `__mocks__/expo-device.js` (CommonJS,
  sans JSX), activés dans `jest.setup.ts`. ⚠️ `isDevice` du mock **doit être un getter/setter**
  (pas une valeur brute) : l'interop wildcard de Babel **fige** les propriétés-valeur (snapshot
  à l'import) → un test ne pourrait pas surcharger `Device.isDevice`. Getter accesseur = lecture
  live.
