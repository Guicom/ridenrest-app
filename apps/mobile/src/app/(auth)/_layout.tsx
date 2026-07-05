import { Redirect, Stack } from 'expo-router';

import { SessionLoading } from '@/components/auth/session-loading';
import { useSession } from '@/lib/auth/client';

// Guard inverse du groupe d'authentification (MOB-2.1 / AC4). Si l'utilisateur est
// **déjà** connecté, on le sort des écrans login vers l'app — évite d'afficher le
// login à une session active.
//   - session non résolue (`isPending`) → loader (AC3)
//   - déjà connecté                      → redirige vers `(app)/adventures`
//   - non connecté                       → rend les écrans d'auth (login…)
export default function AuthLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <SessionLoading />;
  }

  if (session) {
    return <Redirect href="/(app)/adventures" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
