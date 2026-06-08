# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

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
