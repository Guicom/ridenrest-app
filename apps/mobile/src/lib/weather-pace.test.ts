import AsyncStorage from '@react-native-async-storage/async-storage';

import { getStoredWeatherPace, setStoredWeatherPace } from './weather-pace';

// Pace store météo (MOB-4.8 / T2) — round-trip AsyncStorage + lectures robustes.
// AsyncStorage est mocké globalement (jest.setup) par le mock officiel en mémoire.

const KEY = 'ridenrest:weather-pace';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('weather-pace', () => {
  it('set → get round-trip (departureTime + speedKmh)', async () => {
    await setStoredWeatherPace({ departureTime: '2026-06-15 07:30', speedKmh: 18 });
    expect(await getStoredWeatherPace()).toEqual({
      departureTime: '2026-06-15 07:30',
      speedKmh: 18,
    });
  });

  it('clé de persistance = ridenrest:weather-pace (parité web)', async () => {
    await setStoredWeatherPace({ departureTime: '2026-06-15 07:30' });
    expect(await AsyncStorage.getItem(KEY)).toContain('2026-06-15 07:30');
  });

  it('absence → {} (pas de throw)', async () => {
    expect(await getStoredWeatherPace()).toEqual({});
  });

  it('JSON corrompu → {} (lecture robuste)', async () => {
    await AsyncStorage.setItem(KEY, 'not-json{');
    expect(await getStoredWeatherPace()).toEqual({});
  });
});
