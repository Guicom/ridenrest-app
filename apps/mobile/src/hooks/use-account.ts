import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';

import { invalidateAuthTokenCache } from '@/lib/api/api-client';
import { unregisterPushToken } from '@/lib/api/push';
import { resetAnalytics } from '@/lib/analytics/posthog';
import { authClient, signOut } from '@/lib/auth/client';
import {
  clearPushStorage,
  getStoredPushToken,
} from '@/lib/notifications/push-storage';

// Actions de compte (MOB-2.5 / AC1, AC2) : déconnexion et suppression définitive.
// La purge LOCALE est identique dans les deux cas — factorisée ici pour qu'aucun
// résidu (token JWT en mémoire, server-state TanStack) ne fuite entre deux comptes
// sur le même appareil (cf. Dev Notes « Purge locale complète »).
//
// - `signOut()` (@better-auth/expo) purge la session du **secure-store**
//   (Keychain/Keystore) — preuve : relaunch déconnecté (AC1).
// - `invalidateAuthTokenCache()` vide le cache JWT mémoire d'`apiFetch` (MOB-2.1).
// - `queryClient.clear()` jette tout le server-state (aventures, session…).
//
// Le guard `(app)/_layout` redirige déjà dès que `useSession()` repasse non
// connecté ; le `router.replace('/(auth)/login')` rend la transition immédiate et
// empêche le retour arrière vers une page authentifiée.

const LOGIN_ROUTE = '/(auth)/login';

// MOB-6.2 / AC4 — désinscrit le token push du device côté serveur AVANT `signOut` (le JWT
// est encore valide). Best-effort : un échec réseau ne doit JAMAIS bloquer la déconnexion.
async function unregisterPushBeforeSignOut(): Promise<void> {
  try {
    const token = await getStoredPushToken();
    if (token) await unregisterPushToken(token);
  } catch {
    // Non bloquant : au pire le token expirera / sera purgé au 1er DeviceNotRegistered.
  }
}

export interface UseAccountActions {
  /** Déconnecte : purge secure-store + caches, puis redirige vers login (AC1). */
  logout: () => Promise<void>;
  /** Déconnexion en cours (anti double-submit / spinner bouton). */
  isLoggingOut: boolean;
  /**
   * Supprime définitivement le compte (`authClient.deleteUser()`), puis purge local
   * + redirige (AC2). Lève en cas d'échec serveur/réseau — l'appelant garde alors
   * l'utilisateur connecté, données intactes (aucun état partiel).
   */
  deleteAccount: () => Promise<void>;
  /** Suppression en cours. */
  isDeleting: boolean;
}

export function useAccountActions(): UseAccountActions {
  const queryClient = useQueryClient();

  // Purge mémoire/cache local + redirection. Appelée UNIQUEMENT après une
  // opération serveur réussie (signOut / deleteUser) — jamais sur échec.
  const finishSession = () => {
    invalidateAuthTokenCache();
    // Dissocie la session analytique de l'utilisateur (MOB-6.1 / T4, parité web
    // sign-out-button.tsx). Appelé APRÈS signOut, pour la déconnexion ET la
    // suppression de compte (les deux passent par `finishSession`). No-op sans PostHog.
    resetAnalytics();
    // MOB-6.2 — efface les flags push locaux (token + prompt one-shot) pour ne pas fuiter
    // entre deux comptes sur le même appareil. Best-effort, non bloquant.
    void clearPushStorage();
    queryClient.clear();
    router.replace(LOGIN_ROUTE);
  };

  const logout = useMutation({
    mutationFn: async () => {
      // MOB-6.2 / AC4 — désinscription du token push AVANT signOut (JWT encore valide).
      await unregisterPushBeforeSignOut();
      // Purge la session du secure-store côté plugin expo.
      await signOut();
    },
    onSuccess: finishSession,
  });

  const deleteAccount = useMutation({
    mutationFn: async () => {
      // MOB-6.2 / AC4 — désinscription du token push AVANT deleteUser (JWT encore valide).
      // La cascade DB (FK onDelete: cascade) efface le token en base, mais l'AC exige aussi
      // la désinscription active côté serveur. Best-effort : n'arrête pas la suppression.
      await unregisterPushBeforeSignOut();
      // `user.deleteUser.enabled: true` côté serveur (auth.ts) + aucune
      // `sendDeleteAccountVerification`/`beforeDelete` configurée → la suppression
      // est immédiate, sans session fraîche ni lien email. Les cascades DB
      // (`adventures`, segments, `account`, `profiles`, sessions) tombent
      // server-side (story web 2.4) ; le hook `user.delete.before` deauthorise
      // Strava au passage. Aucune suppression de données à coder ici.
      const res = (await authClient.deleteUser()) as
        | { error?: { message?: string } | null }
        | undefined;
      // Better Auth renvoie `{ data, error }` — un `error` non nul = échec : on
      // jette pour NE PAS purger la session locale (l'utilisateur reste connecté).
      if (res?.error) {
        throw new Error(res.error.message ?? 'Account deletion failed');
      }
      // Le compte (et sa session serveur) sont supprimés ; on purge aussi
      // explicitement le secure-store local au cas où `deleteUser` ne l'efface
      // pas — best-effort, l'échec réseau ici ne doit pas bloquer la sortie.
      await signOut().catch(() => {});
    },
    onSuccess: finishSession,
  });

  return {
    logout: () => logout.mutateAsync(),
    isLoggingOut: logout.isPending,
    deleteAccount: () => deleteAccount.mutateAsync(),
    isDeleting: deleteAccount.isPending,
  };
}
