// Mock natif `expo-location` (MOB-1.4 → câblé MOB-5.1 foreground, MOB-5.2 background).
// Module natif (GPS) absent hors device → on stube l'API JS pour Jest. Les tests
// `use-live-mode` surchargent `requestForegroundPermissionsAsync` /
// `requestBackgroundPermissionsAsync` / `watchPositionAsync` / `startLocationUpdatesAsync`
// au cas par cas (`mockResolvedValue` / `mockImplementation`).
module.exports = {
  // Permissions
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  // Foreground watch (MOB-5.1)
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 0, longitude: 0, accuracy: 5 },
  })),
  watchPositionAsync: jest.fn(async () => ({ remove: jest.fn() })),
  // Background task-based updates (MOB-5.2)
  startLocationUpdatesAsync: jest.fn(async () => undefined),
  stopLocationUpdatesAsync: jest.fn(async () => undefined),
  hasStartedLocationUpdatesAsync: jest.fn(async () => false),
  // Enums (parité runtime expo-location)
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  ActivityType: {
    Other: 1,
    AutomotiveNavigation: 2,
    Fitness: 3,
    OtherNavigation: 4,
    Airborne: 5,
  },
};
