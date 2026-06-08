import { Redirect, Stack } from 'expo-router';

import { SessionLoading } from '@/components/auth/session-loading';
import { useSession } from '@/lib/auth/client';

// GUARD centralisé du groupe authentifié (MOB-2.1 / AC4). **Un seul** point de
// contrôle pour tout le groupe `(app)` — jamais dupliqué par écran.
//   - session non résolue (`isPending`) → loader (AC3, pas de flash)
//   - non connecté                      → redirige vers `(auth)/login`
//   - connecté                          → rend les écrans enfants
export default function AppLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <SessionLoading />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
