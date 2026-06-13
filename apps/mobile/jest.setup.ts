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
