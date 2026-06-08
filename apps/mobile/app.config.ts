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
