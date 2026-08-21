import '../global.css';

// MOB-6.1 — Observabilité EN TOUT PREMIER (AC1) : ce module à effet de bord appelle
// `initSentry()` PUIS `bootstrapAnalytics()`. Importé AVANT `@/lib/live/location-task`
// pour que `Sentry.init()` s'exécute avant tout autre code (l'ordre des imports dicte
// l'ordre d'exécution en ESM — cf. `src/lib/observability/boot.ts`). Key-gated : no-op
// sans DSN/clé. NE PAS déplacer sous les autres imports.
import '@/lib/observability/boot';

// MOB-5.2 — enregistre la tâche de localisation background AU SCOPE MODULE, avant toute
// navigation. `expo-task-manager` peut ré-invoquer la tâche après un cold-start de l'OS
// (app relancée pour livrer des positions écran éteint) → le handler DOIT exister dès le
// chargement du root. Import à effet de bord uniquement (le `defineTask` s'exécute à
// l'import). RGPD : la tâche écrit la position dans `useLiveStore`, jamais de POST serveur.
import '@/lib/live/location-task';

import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import * as Sentry from '@sentry/react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StatusBanner } from '@/components/shared/status-banner';
import { useNotificationObserver } from '@/hooks/use-notification-observer';
import { I18nextProvider, i18n } from '@/lib/i18n';
import { QueryProvider } from '@/lib/query/query-provider';
import { useAppStateRefetch } from '@/lib/query/use-app-state-refetch';

// Garde le splash visible tant que Montserrat n'est pas chargée (MOB-1.3).
SplashScreen.preventAutoHideAsync();

function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  // Listener de cycle de vie unique (MOB-2.1 / AC3) : refocus/refetch session +
  // bridge online. Centralisé ici — jamais dupliqué ailleurs.
  useAppStateRefetch();

  // MOB-6.2 — notifications push : handler foreground + canal Android + deep-link vers
  // `map/[id]` au tap. Monté une seule fois ici (jamais par écran). No-op sans notif.
  useNotificationObserver();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  // Providers root (MOB-2.1) : TanStack Query (socle data) au-dessus de i18n
  // (MOB-1.4). `SafeAreaProvider` (MOB-2.4) expose les insets aux écrans à header
  // custom (`headerShown: false`) — sans lui, les écrans top-alignés (ex. Paramètres)
  // chevauchent la status bar / Dynamic Island. Les routes sont auto-découvertes par
  // Expo Router (groupes `(auth)`/`(app)` + `oauth-callback`) ; le guard vit dans
  // `(app)/_layout`.
  //
  // `GestureHandlerRootView` (MOB-3.3) enveloppe TOUT l'arbre : prérequis de
  // `react-native-gesture-handler` pour que le drag-and-drop des segments
  // (`react-native-reanimated-dnd`) reçoive les gestes. Ajouté une seule fois ici,
  // jamais par écran.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <I18nextProvider i18n={i18n}>
            <Stack screenOptions={SCREEN_OPTIONS} />
            {/* Bandeau « Mode hors ligne » GLOBAL (MOB-3.5) — sous I18nextProvider
                (i18n) et au-dessus du Stack pour rester visible quel que soit
                l'écran. Visible UNIQUEMENT offline (piloté par useNetworkStatus). */}
            <StatusBanner />
          </I18nextProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// MOB-6.1 / AC1 — `Sentry.wrap()` (recette officielle expo-router) instrumente la
// navigation et capture les erreurs de rendu de l'arbre UI. No-op tant que Sentry n'est
// pas initialisé (DSN absent). L'init lui-même se fait plus haut via `@/lib/observability/boot`.
// Le retour par glissement est borné au bord gauche sur TOUS les navigateurs, pas
// seulement `(app)`. Le geste plein écran par défaut entre en conflit avec n'importe quel
// widget horizontal (sliders, bandeau météo défilant) — cf. MOB-7.1. Aucun écran à slider
// ne dépend de ce navigateur aujourd'hui, mais laisser un Stack non borné, c'est laisser
// le piège se refermer sur le prochain écran qu'on y ajoutera.
const SCREEN_OPTIONS = {
  headerShown: false,
  fullScreenGestureEnabled: false,
  gestureResponseDistance: { start: 20 },
} as const;

export default Sentry.wrap(RootLayout);
