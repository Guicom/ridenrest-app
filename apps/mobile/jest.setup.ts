// Setup Jest global (MOB-1.4). RNTL v14 enregistre ses matchers automatiquement.
// On garde ce fichier comme point d'extension (mocks globaux futurs : reanimated…)
// au fur et à mesure des epics MOB-2+.

// NativeWind en environnement Node (jsdom-less) : pas d'injection de styles, mais
// le rendu RN reste valide pour les assertions de contenu/rôle.

// AsyncStorage : mock officiel (sinon `NativeModule: AsyncStorage is null` hors
// runtime natif). Requis dès qu'un composant touche le thème (`use-color-scheme`
// lit la préférence persistée) — ex. `PoweredByStrava` sur la carte (MOB-3.1).
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- mock jest officiel (CommonJS)
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// NetInfo (MOB-3.5) : mock pilotable global (`fetch`/`addEventListener`/`__emit`).
// Jest résout automatiquement `__mocks__/@react-native-community/netinfo.js`.
// Sans ce mock, le module natif est `null` hors runtime (boot offline non testable).
jest.mock('@react-native-community/netinfo');

// MapLibre Native (MOB-4.1) : module natif absent hors device → mock manuel global
// (`__mocks__/@maplibre/maplibre-react-native.js`, API v11 `Map`/`Camera`/
// `GeoJSONSource`/`Layer`). Pour un package node_modules, le manual mock n'est pris
// que sur `jest.mock` explicite (comme NetInfo).
jest.mock('@maplibre/maplibre-react-native');

// @gorhom/bottom-sheet (MOB-4.2) : s'appuie sur gesture-handler/reanimated (gestes
// natifs) → mock manuel global (`__mocks__/@gorhom/bottom-sheet.js`, passe-plats +
// ref impérative stubée). `jest.mock` explicite requis (package node_modules scopé).
jest.mock('@gorhom/bottom-sheet');

// expo-blur / expo-clipboard (MOB-4.2 fiche « liquid glass ») : modules natifs (flou de
// fond + presse-papiers) absents hors device → mocks manuels globaux
// (`__mocks__/expo-blur.js`, `__mocks__/expo-clipboard.js`). `jest.mock` explicite requis.
jest.mock('expo-blur');
jest.mock('expo-clipboard');
