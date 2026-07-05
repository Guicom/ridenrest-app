import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { ErrorBanner } from '@/components/ui/error-banner';
import { cn } from '@/lib/cn';
import { authClient } from '@/lib/auth/client';
import { useTranslation } from '@/lib/i18n';

// Bouton « Continuer avec Google » réutilisable login + signup (MOB-2.3 / AC1-3).
//
// Flow **server-mediated** (cf. Dev Notes story) : `signIn.social` ouvre le
// navigateur d'auth sur le serveur Better Auth (`socialProviders.google`, story
// web 2.2), Google redirige vers `{baseURL}/api/auth/callback/google`, puis le
// serveur redirige vers `ridenrest://oauth-callback` (autorisé par
// `trustedOrigins`, MOB-2.1). `@better-auth/expo` capture ce retour via
// `openAuthSessionAsync` et persiste le cookie de session en secure-store.
//
// ⚠️ AUCUN identifiant Google n'est exposé au client (secret côté serveur).
// Le redirect URI à whitelister dans Google Cloud Console est celui du SERVEUR.

// `callbackURL` final capté par le plugin expo. Doit matcher le scheme app
// (`app.config.ts` → `ridenrest`) ET être listé dans `trustedOrigins` serveur.
const OAUTH_CALLBACK_URL = 'ridenrest://oauth-callback';

export interface GoogleSignInButtonProps {
  /** Classes du conteneur (le bouton occupe toujours `w-full`). */
  className?: string;
}

export function GoogleSignInButton({ className }: GoogleSignInButtonProps) {
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePress = async () => {
    setError(null);
    setPending(true);
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: OAUTH_CALLBACK_URL,
      });

      // ⚠️ `signIn.social` RÉSOUT même sur annulation : `openAuthSessionAsync`
      // renvoie `cancel`/`dismiss` → le plugin `return` sans throw ni session.
      // Le SEUL signal fiable de succès est le cookie de session persisté
      // (AC2). Sans cookie ⇒ annulé/échoué : on ne route JAMAIS sans session
      // confirmée (AC3 — aucun état partiel).
      if (authClient.getCookie()) {
        // Succès : on navigue. On NE remet PAS `pending` à false — l'écran est
        // remplacé ; un reset ici ferait flasher le spinner → « G » avant unmount
        // (et serait un no-op sur un composant qui s'en va).
        router.replace('/(app)/adventures');
        return;
      }
      setError(t('auth.errors.oauthCancelled'));
    } catch {
      // Rejet réseau ou erreur du navigateur d'auth → bouton réactivé, aucune
      // session laissée (AC3).
      setError(t('auth.errors.oauthFailed'));
    }
    // Atteint UNIQUEMENT sur annulation/échec (le succès a `return` plus haut) :
    // bouton réactivé, aucun état partiel (AC3).
    setPending(false);
  };

  return (
    <View className={cn('gap-2', className)}>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        loading={pending}
        onPress={handlePress}
        accessibilityLabel={t('auth.google.continue')}
      >
        {pending ? (
          <ActivityIndicator size="small" className="text-foreground" />
        ) : (
          <GoogleMark />
        )}
        <Text className="text-sm font-montserrat-semibold text-foreground">
          {t('auth.google.continue')}
        </Text>
      </Button>
      {error ? <ErrorBanner message={error} /> : null}
    </View>
  );
}

// Marque Google décorative (pas de dépendance SVG native → pas de prebuild).
// Masquée aux lecteurs d'écran : le libellé du bouton porte déjà l'intention.
function GoogleMark() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="h-5 w-5 items-center justify-center rounded-full bg-white"
    >
      <Text className="text-sm font-montserrat-bold text-[#4285F4]">G</Text>
    </View>
  );
}
