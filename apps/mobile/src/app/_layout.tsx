import '../global.css';

import {
  Montserrat_400Regular,
  Montserrat_500Medium,
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  useFonts,
} from '@expo-google-fonts/montserrat';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nextProvider, i18n } from '@/lib/i18n';
import { QueryProvider } from '@/lib/query/query-provider';
import { useAppStateRefetch } from '@/lib/query/use-app-state-refetch';

// Garde le splash visible tant que Montserrat n'est pas chargée (MOB-1.3).
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_400Regular,
    Montserrat_500Medium,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
  });

  // Listener de cycle de vie unique (MOB-2.1 / AC3) : refocus/refetch session +
  // bridge online. Centralisé ici — jamais dupliqué ailleurs.
  useAppStateRefetch();

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
            <Stack screenOptions={{ headerShown: false }} />
          </I18nextProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
