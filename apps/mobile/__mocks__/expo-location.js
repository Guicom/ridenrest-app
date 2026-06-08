// Placeholder de mock natif (MOB-1.4) — consommé par les epics MOB-5 (mode Live,
// géolocalisation temps réel). Étoffer quand expo-location sera réellement utilisé.
module.exports = {
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 0, longitude: 0, accuracy: 5 },
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  Accuracy: { High: 4, Balanced: 3 },
};
