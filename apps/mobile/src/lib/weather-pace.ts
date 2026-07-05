import AsyncStorage from '@react-native-async-storage/async-storage';

// Pace météo persisté (MOB-4.8 / T2) — port iso du web `lib/weather-pace.ts`.
// Le web persiste en `localStorage` ; sur mobile on persiste en **AsyncStorage**
// (donnée NON sensible, UI uniquement → jamais `expo-secure-store`, réservé à l'auth).
// Même clé que le web (`ridenrest:weather-pace`) et même forme (`{ departureTime?,
// speedKmh? }`) pour cohérence conceptuelle inter-plateformes.
//
// Sur mobile, l'allure (`speedKmh`) vient de `adventure.avgSpeedKmh` (pas de champ
// dédié dans l'UI carte) → en pratique seul `departureTime` est écrit ici, mais on
// garde le contrat complet pour la parité. `departureTime` est le **texte de saisie**
// brut (« AAAA-MM-JJ HH:MM ») pour round-tripper le champ tel quel.

const WEATHER_PACE_KEY = 'ridenrest:weather-pace';

export interface StoredWeatherPace {
  departureTime?: string;
  speedKmh?: number;
}

/** Lit le pace persisté. `{}` si absent, JSON illisible ou non-objet (jamais de throw). */
export async function getStoredWeatherPace(): Promise<StoredWeatherPace> {
  try {
    const raw = await AsyncStorage.getItem(WEATHER_PACE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as StoredWeatherPace)
      : {};
  } catch {
    return {};
  }
}

/** « 2026-06-15 07:30 » (texte de saisie) → ISO 8601, sinon `null`. Partagé entre la
 *  carte planning et la météo Live (saisie d'une heure de départ override). */
export function parseDeparture(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed.replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Écrit le pace persisté (best-effort — un échec d'écriture n'interrompt pas l'UI).
 *  Merge avec la valeur existante pour ne pas écraser les champs non fournis. */
export async function setStoredWeatherPace(pace: StoredWeatherPace): Promise<void> {
  try {
    const existing = await getStoredWeatherPace();
    await AsyncStorage.setItem(
      WEATHER_PACE_KEY,
      JSON.stringify({ ...existing, ...pace }),
    );
  } catch {
    // Stockage indisponible/plein : best-effort, la saisie reste en mémoire (state écran).
  }
}
