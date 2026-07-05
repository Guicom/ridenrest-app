import AsyncStorage from '@react-native-async-storage/async-storage';

// Persistance du consentement de géolocalisation Live (MOB-5.1 / T2) — parité web
// (`use-live-mode.ts` lit/écrit `localStorage('ridenrest:geoloc-consent')`). Sur mobile
// on persiste en **AsyncStorage** : le consentement est un flag UI **non sensible**
// (≠ token auth) → jamais `expo-secure-store` (réservé aux tokens, cf. AGENTS.md).
//
// Le store `useLiveStore` est volatil (réinitialisé à chaque lancement) — c'est ce flag
// persisté qui permet l'auto-start sans redemander le consentement au returning user
// (AC4). ⚠️ RGPD : on ne persiste QUE le booléen de consentement, JAMAIS de position GPS.

const CONSENT_KEY = 'ridenrest:geoloc-consent';

/** Lit le flag de consentement. `false` si absent ou stockage illisible (jamais de throw). */
export async function getConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(CONSENT_KEY)) === 'true';
  } catch {
    return false;
  }
}

/** Écrit le flag de consentement (best-effort — un échec n'interrompt pas le flow Live). */
export async function setConsent(consented: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(CONSENT_KEY, consented ? 'true' : 'false');
  } catch {
    // Stockage indisponible : best-effort. Le consentement reste effectif pour la
    // session courante (state écran) ; il sera redemandé au prochain lancement.
  }
}
