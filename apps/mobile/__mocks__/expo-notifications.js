// Mock natif `expo-notifications` (MOB-6.2). Module natif (permission + réception + token
// APNs/FCM) absent hors device → on stube l'API JS pour Jest. Les tests surchargent
// `requestPermissionsAsync` / `getExpoPushTokenAsync` / `getLastNotificationResponseAsync`
// au cas par cas (`mockResolvedValue` / `mockImplementation`). CommonJS, sans JSX.
module.exports = {
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'ExponentPushToken[test]' })),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  // Enum (parité runtime expo-notifications) — utilisé par le canal Android.
  AndroidImportance: {
    UNSPECIFIED: -1000,
    NONE: 0,
    MIN: 1,
    LOW: 2,
    DEFAULT: 3,
    HIGH: 4,
    MAX: 5,
  },
};
