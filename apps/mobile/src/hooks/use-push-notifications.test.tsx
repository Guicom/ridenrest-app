import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { requestAndRegisterPushToken } from '@/hooks/use-push-notifications';
import { registerPushToken } from '@/lib/api/push';

// `use-push-notifications` (MOB-6.2 / T5, AC1+AC3). `expo-notifications` / `expo-device` sont
// mockés globalement (jest.setup) → on surcharge permission/token/isDevice par test. La façade
// API et expo-constants (projectId) sont mockées localement. On teste la fonction PURE
// (`requestAndRegisterPushToken`) que le hook `usePushNotifications` ne fait que mémoïser.

jest.mock('@/lib/api/push', () => ({
  registerPushToken: jest.fn(async () => ({})),
  unregisterPushToken: jest.fn(async () => ({})),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { eas: { projectId: 'test-project' } } },
    easConfig: { projectId: 'test-project' },
  },
}));

const mockRequestPermissions = Notifications.requestPermissionsAsync as jest.Mock;
const mockGetPermissions = Notifications.getPermissionsAsync as jest.Mock;
const mockGetExpoPushToken = Notifications.getExpoPushTokenAsync as jest.Mock;
const mockRegisterPushToken = registerPushToken as jest.Mock;
// Mutation de l'objet mock ORIGINAL (le code lit `Device.isDevice` via ce même objet).
const deviceMock = jest.requireMock('expo-device') as { isDevice: boolean };

const PROMPTED_KEY = 'ridenrest:push-prompted';
const TOKEN_KEY = 'ridenrest:push-token';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  deviceMock.isDevice = true;
  mockRequestPermissions.mockResolvedValue({ status: 'granted' });
  mockGetPermissions.mockResolvedValue({ status: 'granted' });
  mockGetExpoPushToken.mockResolvedValue({ data: 'ExponentPushToken[test]' });
});

describe('requestAndRegisterPushToken', () => {
  it('registers the token server-side when permission is granted (AC1)', async () => {
    await requestAndRegisterPushToken();

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
    expect(mockRegisterPushToken).toHaveBeenCalledWith({
      token: 'ExponentPushToken[test]',
      platform: 'ios',
    });
    expect(await AsyncStorage.getItem(PROMPTED_KEY)).toBe('true');
    expect(await AsyncStorage.getItem(TOKEN_KEY)).toBe('ExponentPushToken[test]');
  });

  it('is a no-op on refusal — prompt marked one-shot, no registration, no throw (AC3)', async () => {
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await requestAndRegisterPushToken();

    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    // One-shot : le refus est mémorisé → pas de re-prompt.
    expect(await AsyncStorage.getItem(PROMPTED_KEY)).toBe('true');
  });

  it('is a no-op on a simulator / emulator (!Device.isDevice) — no error (AC1)', async () => {
    deviceMock.isDevice = false;

    await requestAndRegisterPushToken();

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
    // Pas de prompt présenté → le flag reste absent (re-tentera sur un vrai device).
    expect(await AsyncStorage.getItem(PROMPTED_KEY)).toBeNull();
  });

  it('does not re-prompt when already prompted AND token is already stored (one-shot guard)', async () => {
    await AsyncStorage.setItem(PROMPTED_KEY, 'true');
    await AsyncStorage.setItem(TOKEN_KEY, 'ExponentPushToken[test]');

    await requestAndRegisterPushToken();

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('retries registration silently when prompted but token missing (recovery path)', async () => {
    // Simuler un appel précédent : dialog montré (flag posé) mais enregistrement échoué.
    await AsyncStorage.setItem(PROMPTED_KEY, 'true');
    // TOKEN_KEY absent → la fonction doit tenter de ré-inscrire sans redemander le dialog.
    mockGetPermissions.mockResolvedValue({ status: 'granted' });

    await requestAndRegisterPushToken();

    expect(mockRequestPermissions).not.toHaveBeenCalled(); // aucun dialog OS
    expect(mockRegisterPushToken).toHaveBeenCalledTimes(1); // ré-inscription silencieuse
  });

  it('no-op on retry when permission was denied (recovery path, denied)', async () => {
    await AsyncStorage.setItem(PROMPTED_KEY, 'true');
    mockGetPermissions.mockResolvedValue({ status: 'denied' });

    await requestAndRegisterPushToken();

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });

  it('never throws when token retrieval fails (best-effort)', async () => {
    mockGetExpoPushToken.mockRejectedValue(new Error('no credentials'));

    await expect(requestAndRegisterPushToken()).resolves.toBeUndefined();
    expect(mockRegisterPushToken).not.toHaveBeenCalled();
  });
});
