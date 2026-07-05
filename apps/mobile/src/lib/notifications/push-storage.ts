import AsyncStorage from '@react-native-async-storage/async-storage';

// Persistance des flags de notifications push (MOB-6.2 / T5) — même pattern best-effort que
// `src/lib/live/consent-storage.ts`. Ce sont des flags UI **non sensibles** (≠ token auth)
// → **AsyncStorage**, JAMAIS `expo-secure-store` (réservé aux tokens d'auth, cf. AGENTS.md).
//
// - `push-prompted` : le prompt OS de permission a déjà été présenté une fois → garde
//   one-shot pour ne demander la permission qu'une seule fois (après la 1re analyse densité).
// - `push-token`    : le dernier token Expo enregistré côté serveur. Persisté pour pouvoir
//   le désinscrire à la déconnexion (AC4) — le token seul, aucune donnée de position (RGPD).
//
// Toutes les fonctions sont best-effort (jamais de throw) : un stockage illisible ne doit
// jamais casser le flux densité ni la déconnexion.

const PROMPTED_KEY = 'ridenrest:push-prompted';
const TOKEN_KEY = 'ridenrest:push-token';

/** Le prompt de permission a-t-il déjà été montré ? `false` si absent/illisible. */
export async function getPushPrompted(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PROMPTED_KEY)) === 'true';
  } catch {
    return false;
  }
}

/** Marque le prompt comme montré (garde one-shot). */
export async function setPushPrompted(prompted: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(PROMPTED_KEY, prompted ? 'true' : 'false');
  } catch {
    // Best-effort : au pire on redemande au prochain lancement (non bloquant).
  }
}

/** Token Expo enregistré côté serveur, ou `null` si aucun/illisible. */
export async function getStoredPushToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Mémorise le token enregistré (pour la désinscription au logout, AC4). */
export async function setStoredPushToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Best-effort.
  }
}

/** Efface les flags push (déconnexion / suppression de compte). */
export async function clearPushStorage(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([PROMPTED_KEY, TOKEN_KEY]);
  } catch {
    // Best-effort.
  }
}
