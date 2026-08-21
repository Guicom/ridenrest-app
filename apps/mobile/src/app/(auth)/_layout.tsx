import { Redirect, Stack } from 'expo-router';

import { SessionLoading } from '@/components/auth/session-loading';
import { useSession } from '@/lib/auth/client';

// Guard inverse du groupe d'authentification (MOB-2.1 / AC4). Si l'utilisateur est
// **déjà** connecté, on le sort des écrans login vers l'app — évite d'afficher le
// login à une session active.
//   - session non résolue (`isPending`) → loader (AC3)
//   - déjà connecté                      → redirige vers `(app)/adventures`
//   - non connecté                       → rend les écrans d'auth (login…)
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

export default function AuthLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <SessionLoading />;
  }

  if (session) {
    return <Redirect href="/(app)/adventures" />;
  }

  return <Stack screenOptions={SCREEN_OPTIONS} />;
}
