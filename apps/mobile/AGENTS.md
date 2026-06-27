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
