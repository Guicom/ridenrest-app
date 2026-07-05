import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Configuration des notifications reçues (MOB-6.2 / T5). Séparé du hook observer pour rester
// testable et n'exécuter les effets de bord qu'au montage du root.

/**
 * Comportement d'affichage quand une notif arrive **app au premier plan** : bannière + liste,
 * sans son ni badge (une analyse densité terminée n'est pas urgente). Sans handler, iOS
 * n'affiche RIEN en foreground.
 */
export function configureForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Canal Android `default` (obligatoire Android 8+ pour afficher une notif). No-op iOS. */
export async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Général',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  } catch {
    // Best-effort : l'absence de canal n'empêche pas le boot.
  }
}

/**
 * Extrait l'`adventureId` du `data` d'une réponse de notification (deep-link). `null` si
 * absent/malformé. Pur → testable isolément.
 */
export function extractAdventureId(
  response: Notifications.NotificationResponse | null | undefined,
): string | null {
  const data = response?.notification?.request?.content?.data as
    | { adventureId?: unknown }
    | undefined;
  const id = data?.adventureId;
  return typeof id === 'string' && id.trim().length > 0 ? id : null;
}
