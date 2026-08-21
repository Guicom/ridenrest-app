import { Redirect, Stack } from 'expo-router';
import { Fragment } from 'react';

import { AnalyticsIdentity } from '@/components/providers/analytics-identity';
import { SessionLoading } from '@/components/auth/session-loading';
import { useSession } from '@/lib/auth/client';

// GUARD centralisé du groupe authentifié (MOB-2.1 / AC4). **Un seul** point de
// contrôle pour tout le groupe `(app)` — jamais dupliqué par écran.
//   - session non résolue (`isPending`) → loader (AC3, pas de flash)
//   - non connecté                      → redirige vers `(auth)/login`
//   - connecté                          → rend les écrans enfants
/**
 * Le retour par glissement ne doit répondre QU'AU BORD gauche.
 *
 * Par défaut le geste couvre toute la largeur de l'écran : n'importe quel glissement horizontal
 * dépile l'écran. Or les écrans carte et live sont construits autour de gestes horizontaux —
 * sliders de plage, de position, de rayon. Le geste utile et le geste de retour ont exactement
 * la même direction, et le slider de position est au repos tout à gauche, là où le retour est
 * le plus sensible : l'utilisateur ne pouvait quasiment pas déplacer une poignée sans quitter
 * l'écran. Reproduit sur simulateur le 2026-08-21 (iPhone 17 Pro) — deux glissements sur trois
 * dépilaient l'écran avant que la poignée ne bouge.
 *
 * Vu de l'utilisateur, le panneau glisse hors de l'écran : d'où « il n'y a plus d'action sur le
 * slider mais sur le volet latéral ».
 *
 * `gestureResponseDistance: { start: 20 }` conserve l'affordance iOS (retour depuis le bord) et rend
 * l'écran utilisable. À ne pas relâcher sans revérifier les sliders sur device.
 */
const SCREEN_OPTIONS = {
  headerShown: false,
  fullScreenGestureEnabled: false,
  gestureResponseDistance: { start: 20 },
} as const;

export default function AppLayout() {
  const { data: session, isPending } = useSession();

  if (isPending) {
    return <SessionLoading />;
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  // Session garantie ici → `<AnalyticsIdentity>` (identify(user.id), MOB-6.1) monté une
  // seule fois pour tout le groupe authentifié, jamais par écran.
  return (
    <Fragment>
      <AnalyticsIdentity />
      <Stack screenOptions={SCREEN_OPTIONS} />
    </Fragment>
  );
}
