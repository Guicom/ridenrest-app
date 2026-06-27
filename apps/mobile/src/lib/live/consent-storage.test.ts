import AsyncStorage from '@react-native-async-storage/async-storage';

import { getConsent, setConsent } from '@/lib/live/consent-storage';

// Persistance du consentement (MOB-5.1 / T2). AsyncStorage est mocké globalement
// (jest.setup, mock officiel en mémoire) → on le vide entre tests.

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('consent-storage', () => {
  it('getConsent → false par défaut (flag absent)', async () => {
    await expect(getConsent()).resolves.toBe(false);
  });

  it('setConsent(true) puis getConsent → true', async () => {
    await setConsent(true);
    await expect(getConsent()).resolves.toBe(true);
    // Parité web : on persiste sous la clé `ridenrest:geoloc-consent`.
    await expect(
      AsyncStorage.getItem('ridenrest:geoloc-consent'),
    ).resolves.toBe('true');
  });

  it('setConsent(false) puis getConsent → false', async () => {
    await setConsent(true);
    await setConsent(false);
    await expect(getConsent()).resolves.toBe(false);
  });
});
