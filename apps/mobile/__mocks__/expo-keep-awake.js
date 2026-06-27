// Mock natif expo-keep-awake (MOB-5.1). `useKeepAwake` garde l'écran allumé pendant
// la session Live (consommé par `(app)/live/_layout.tsx`). Hors device, le module natif
// est absent → no-op. On expose aussi les fonctions impératives historiques.
module.exports = {
  useKeepAwake: jest.fn(() => {}),
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(async () => {}),
  isAvailableAsync: jest.fn(async () => true),
};
