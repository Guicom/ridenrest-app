import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { authClient } from '@/lib/auth/client';

// Écran de TRANSITION du deep link `ridenrest://oauth-callback` (MOB-2.3 / AC2,
// AC3). Remplace le placeholder debug MOB-1.4.
//
// En flow nominal server-mediated, `@better-auth/expo` capte le retour DANS
// `openAuthSessionAsync` (le navigateur d'auth se ferme, cette route n'est pas
// montée). Cet écran est un FILET DE SÉCURITÉ : si l'OS route quand même le deep
// link vers l'app (cold start / dismiss), il NE traite aucun token — il valide
// les params puis route selon la session déjà persistée. JAMAIS d'état partiel.
export default function OAuthCallbackScreen() {
  const params = useLocalSearchParams<{ error?: string | string[] }>();
  const errorParam = params.error;

  // Validation des params du deep link (déférée de MOB-1.4) : `error` peut être
  // string | string[] | undefined (param dupliqué → tableau). On normalise en
  // booléen STABLE *avant* l'effet : un tableau est une référence neuve à chaque
  // rendu, donc instable comme dépendance (re-déclencherait `router.replace`).
  // Tout `error` (ex. `access_denied`) ⇒ échec → retour login.
  const hasError = Array.isArray(errorParam)
    ? errorParam.length > 0
    : Boolean(errorParam);

  useEffect(() => {
    // Succès = session persistée par le plugin expo (cookie en secure-store).
    const hasSession = Boolean(authClient.getCookie());

    router.replace(
      hasSession && !hasError ? '/(app)/adventures' : '/(auth)/login',
    );
  }, [hasError]);

  return (
    <View className="flex-1 items-center justify-center bg-background-page">
      <ActivityIndicator testID="oauth-callback-loader" />
    </View>
  );
}
