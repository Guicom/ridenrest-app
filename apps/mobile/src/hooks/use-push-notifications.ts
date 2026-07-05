import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useCallback } from 'react';
import { Platform } from 'react-native';

import { registerPushToken } from '@/lib/api/push';
import {
  getPushPrompted,
  getStoredPushToken,
  setPushPrompted,
  setStoredPushToken,
} from '@/lib/notifications/push-storage';

// Permission + enregistrement du token push (MOB-6.2 / T5, AC1). S'inspire des patterns de
// `use-live-mode.ts` (gestion du refus sans blocage). Points clés :
//
// - **Timing (AC1)** : `requestAndRegister()` est appelé APRÈS la 1re analyse de densité
//   (`sidebar-density-section.tsx`), jamais au boot/onboarding → maximise le taux d'accord.
// - **One-shot** : garde via le flag AsyncStorage `push-prompted` — on ne présente le prompt
//   OS qu'une seule fois. Un refus ne re-prompte pas (pas d'Alert intrusive).
//   ⚠️ Si le flag est posé mais qu'aucun token n'est stocké (échec réseau lors d'un appel
//   précédent), la fonction tente silencieusement une ré-inscription SANS redemander le
//   prompt OS (`getPermissionsAsync` renvoie le statut courant sans dialog).
// - **No-op sûr sans credentials** : `!Device.isDevice` (simulateur iOS / émulateur) →
//   `getExpoPushTokenAsync` échouerait faute de credentials APNs/FCM → on court-circuite,
//   AUCUNE erreur émise (AC1). Sans `projectId`, idem.
// - **Best-effort** : toute la fonction est enveloppée dans un try/catch — un échec réseau,
//   un refus, ou l'absence de credentials ne doit JAMAIS remonter à l'appelant (le flux
//   densité + fallback in-app polling restent intacts, AC3).
// - **Guard in-flight** : évite la race condition si deux appels simultanés passent avant
//   que le flag AsyncStorage soit posé (ex. deux composants déclenchant l'analyse).

/** `projectId` EAS requis par `getExpoPushTokenAsync` (route APNs/FCM via Expo). */
function getProjectId(): string | undefined {
  const eas = Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined;
  return eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Plateforme normalisée sur l'enum serveur (`push_platform`). */
function currentPlatform(): 'ios' | 'android' {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

// Guard in-flight : empêche la race condition si deux appels simultanés passent avant que
// le flag AsyncStorage soit posé (les appels après le 1er sont ignorés jusqu'à la fin).
let _registrationInFlight = false;

/**
 * Demande la permission (une seule fois) puis enregistre le token côté serveur. No-op non
 * bloquant en cas de refus / simulateur / absence de credentials. Ne throw JAMAIS. Fonction
 * pure (hors React) → testable directement ; le hook ne fait que la mémoïser.
 */
export async function requestAndRegisterPushToken(): Promise<void> {
  if (_registrationInFlight) return;
  _registrationInFlight = true;
  try {
    // Simulateur iOS / émulateur : pas de credentials push → no-op sûr (AC1).
    if (!Device.isDevice) return;

    const alreadyPrompted = await getPushPrompted();

    if (alreadyPrompted) {
      // Le prompt OS a déjà été présenté. Si le token est déjà enregistré → rien à faire.
      if (await getStoredPushToken()) return;
      // Token absent (ex. échec réseau lors d'un appel précédent) → tentative de
      // ré-inscription SANS redemander le dialog OS (getPermissionsAsync = lecture seule).
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
    } else {
      // 1ère fois : affiche le prompt OS, puis pose le flag (accordé ou non).
      const { status } = await Notifications.requestPermissionsAsync();
      await setPushPrompted(true);
      if (status !== 'granted') return; // refus → no-op non bloquant
    }

    const projectId = getProjectId();
    if (!projectId) return; // pas de projectId (dev sans EAS) → no-op sûr

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    if (!token) return;

    await registerPushToken({ token, platform: currentPlatform() });
    await setStoredPushToken(token);
  } catch {
    // Best-effort total : réseau coupé, credentials absents, refus OS… → silencieux.
    // Le fallback in-app (polling `useDensity`) informe quand même l'utilisateur (AC3).
  } finally {
    _registrationInFlight = false;
  }
}

export interface UsePushNotificationsResult {
  /**
   * Demande la permission (une seule fois) puis enregistre le token côté serveur.
   * No-op non bloquant en cas de refus / simulateur / absence de credentials. Ne throw jamais.
   */
  requestAndRegister: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsResult {
  const requestAndRegister = useCallback(() => requestAndRegisterPushToken(), []);
  return { requestAndRegister };
}
