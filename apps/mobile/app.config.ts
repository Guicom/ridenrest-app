import type { ExpoConfig } from 'expo/config';

// Configuration Expo en TypeScript (MOB-1.4 / archi mobile §Configuration) —
// remplace `app.json` (convention : **jamais** de `app.json` à terme).
// Préserve le `projectId` EAS + la config `updates` (OTA) créés en MOB-1.2.
//
// `scheme: 'ridenrest'` génère au prebuild Expo :
//   - iOS    : `CFBundleURLTypes` (Info.plist)
//   - Android: un intent filter `ridenrest://` (AndroidManifest)
// → prérequis des callbacks OAuth `ridenrest://oauth-*` consommés en MOB-2.3/2.4.
const config: ExpoConfig = {
  name: "Ride'n'Rest",
  slug: 'ridenrest',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'ridenrest',
  userInterfaceStyle: 'automatic',
  ios: {
    bundleIdentifier: 'app.ridenrest',
    icon: './assets/expo.icon',
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      // ATS : autorise le HTTP cleartext vers `localhost`/`*.local` (API NestJS
      // `http://localhost:3010` + Better Auth `:3011`) en build **Release autonome**
      // (cf. `scripts/sim-build.sh`). Sans cette exception, iOS bloque le cleartext en
      // Release → l'app se lance mais TOUS les appels API échouent. Inoffensif en prod
      // (api.ridenrest.app est en HTTPS) : `NSAllowsLocalNetworking` ne relâche QUE le
      // réseau local, pas les chargements arbitraires. (Découvert MOB-4.6, 2026-06-27.)
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
      },
    },
  },
  android: {
    package: 'app.ridenrest',
    adaptiveIcon: {
      backgroundColor: '#E6F4FE',
      foregroundImage: './assets/images/android-icon-foreground.png',
      backgroundImage: './assets/images/android-icon-background.png',
      monochromeImage: './assets/images/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: 'static',
    favicon: './assets/images/favicon.png',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#208AEF',
        android: {
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      },
    ],
    'expo-font',
    // MOB-2.1 — Better Auth native client : session en Keychain/Keystore
    // (`expo-secure-store`) + retour OAuth deep-link via le navigateur système
    // (`expo-web-browser`, consommé en MOB-2.3/2.4). Config plugins requise au prebuild.
    'expo-secure-store',
    'expo-web-browser',
    // MOB-4.1 — MapLibre Native (carte interactive). Le plugin config branche au
    // prebuild la distribution native MapLibre (SPM iOS / Gradle Android). **Dev
    // Client obligatoire** : MapLibre ne charge PAS dans Expo Go. Après cet ajout :
    // `expo prebuild --clean -p ios` PUIS `expo run:ios` (cf. AGENTS.md, sinon
    // `Cannot find native module`). v11 requiert la New Architecture (déjà activée SDK 56).
    '@maplibre/maplibre-react-native',
    // MOB-5.1 (foreground) → MOB-5.2 (background écran-éteint). Le plugin injecte au
    // prebuild les permissions de localisation :
    //   - iOS : `NSLocationWhenInUseUsageDescription` (« Lorsque l'app est active ») +
    //     `NSLocationAlwaysAndWhenInUseUsageDescription` (« Toujours », escalade MOB-5.2)
    //     via `locationAlwaysAndWhenInUsePermission` ; `isIosBackgroundLocationEnabled:true`
    //     ajoute `UIBackgroundModes:['location']` (suivi GPS écran-éteint, support
    //     `expo-task-manager` qui n'a PAS de plugin propre).
    //   - Android : `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION` (foreground) +
    //     `ACCESS_BACKGROUND_LOCATION` (`isAndroidBackgroundLocationEnabled:true`) +
    //     `FOREGROUND_SERVICE`/`FOREGROUND_SERVICE_LOCATION`
    //     (`isAndroidForegroundServiceEnabled:true`, requis Android 14+ pour la
    //     notification persistante du suivi en arrière-plan).
    // La rationale (FR) est affichée par l'OS au prompt runtime (FR-MOB-015 / NFR-013).
    // RGPD (NFR-012) : la position reste sur le device — la tâche background n'écrit que
    // dans `useLiveStore`, aucun POST GPS serveur, même écran éteint.
    // ⚠️ Module natif neuf (`expo-task-manager`) + nouvelles clés Info.plist/Manifest →
    // `expo prebuild --clean -p ios` OBLIGATOIRE avant `run:ios`/`pnpm sim`
    // (sinon « Cannot find native module » / permissions Always absentes).
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'Ride’n’Rest utilise votre position pour vous situer sur votre trace pendant que vous roulez. Votre position reste sur votre appareil et n’est jamais envoyée à nos serveurs.',
        locationAlwaysAndWhenInUsePermission:
          'Ride’n’Rest suit votre position même écran éteint pour continuer à calculer les points d’intérêt à venir pendant que vous roulez. Votre position reste sur votre appareil et n’est jamais envoyée à nos serveurs.',
        isIosBackgroundLocationEnabled: true,
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: '4548dbd0-ee0d-4ba7-8acb-e42469ec1ec3',
    },
  },
  owner: 'ridenrest',
  runtimeVersion: {
    policy: 'appVersion',
  },
  updates: {
    url: 'https://u.expo.dev/4548dbd0-ee0d-4ba7-8acb-e42469ec1ec3',
  },
};

export default config;
