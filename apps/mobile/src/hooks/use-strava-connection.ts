import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';

import { authClient } from '@/lib/auth/client';

// État + actions de connexion Strava (MOB-2.4 / AC2, AC3). Strava est de
// l'**account-linking** : l'utilisateur est DÉJÀ connecté (route `(app)` gardée) et
// lie une intégration — jamais un sign-in (cf. story Dev Notes).
//
// Lecture de l'état : `authClient.listAccounts()` (endpoint Better Auth core
// `GET /api/auth/list-accounts`, authentifié par le cookie de session stocké en
// secure-store). La présence d'un compte `providerId === 'strava'` = connecté.
// On NE lit PAS `profiles.stravaAthleteId` côté serveur ici : pas de nouveau code
// API mobile, la ligne `account` est la source de vérité côté client.
//
// Connect : `authClient.oauth2.link()` (plugin `genericOAuthClient`, MOB-2.1) ouvre
// le navigateur d'auth via `@better-auth/expo`. Disconnect : `unlinkAccount()`
// supprime la ligne `account` ; le hook serveur `databaseHooks.account.delete`
// (auth.ts) révoque le token Strava + remet `stravaAthleteId` à null (parité web).

export const STRAVA_CONNECTION_QUERY_KEY = ['strava-connection'] as const;

// `callbackURL` final capté par le plugin expo. Doit matcher le scheme app
// (`app.config.ts` → `ridenrest`) ET figurer dans `trustedOrigins` serveur (MOB-2.1).
const STRAVA_CALLBACK_URL = 'ridenrest://oauth-callback';

// Serveur Better Auth (`apps/web`). Aligné sur api-client.ts / client.ts.
const BETTER_AUTH_URL =
  process.env.EXPO_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011';

/**
 * Extrait la valeur du cookie `*.oauth_state` du jar stocké en secure-store
 * (`authClient.getCookie()` renvoie l'en-tête Cookie « k=v; k2=v2 »). Le serveur
 * pose ce cookie sur la réponse `oauth2.link` ; il vit côté fetch RN, PAS dans le
 * navigateur — d'où le besoin de le repasser au proxy (cf. `connect`).
 */
function readOAuthStateValue(): string | null {
  const cookieHeader = authClient.getCookie?.() ?? '';
  const match = /(?:^|;\s*)[^=;\s]*oauth_state=([^;]+)/.exec(cookieHeader);
  return match ? match[1] : null;
}

/**
 * Levée quand `oauth2.link` RÉSOUT sans avoir lié de compte (annulation/dismiss du
 * navigateur d'auth) — distingue « annulé » d'un échec réseau pour le message UI.
 */
export class StravaLinkCancelledError extends Error {
  constructor() {
    super('Strava linking cancelled');
    this.name = 'StravaLinkCancelledError';
  }
}

/** `true` si la liste des comptes liés contient un provider Strava. */
async function fetchStravaConnected(): Promise<boolean> {
  const result = await authClient.listAccounts();
  const accounts = (result?.data ?? []) as { providerId?: string }[];
  return accounts.some((account) => account.providerId === 'strava');
}

export interface UseStravaConnection {
  /** État connecté résolu (false tant que la requête n'a pas abouti). */
  isConnected: boolean;
  /** Chargement initial de l'état (→ `<Skeleton />`). */
  isLoading: boolean;
  /** La lecture de l'état a échoué (réseau/serveur). */
  isError: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Flow de liaison Strava en cours (navigateur d'auth ouvert). */
  isConnecting: boolean;
  /** Déliaison en cours. */
  isDisconnecting: boolean;
}

export function useStravaConnection(): UseStravaConnection {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: STRAVA_CONNECTION_QUERY_KEY,
    queryFn: fetchStravaConnected,
  });

  const connect = useMutation({
    mutationFn: async () => {
      // ⚠️ `@better-auth/expo` 1.5.5 n'ouvre le navigateur d'auth QUE pour les
      // requêtes `/sign-in*` et `/link-social` (client.js) — PAS pour `/oauth2/link`
      // (genericOAuth). `authClient.oauth2.link()` se contente donc de RENVOYER
      // l'URL d'autorisation sans ouvrir de browser. On l'ouvre nous-mêmes avec
      // `expo-web-browser` (même mécanique que le plugin en interne).
      //
      // L'appel `oauth2.link` est authentifié (cookie de session injecté par le
      // plugin expo) → le serveur enregistre l'état de liaison rattaché à
      // l'utilisateur courant avant de renvoyer l'URL Strava.
      const res = await authClient.oauth2.link({
        providerId: 'strava',
        callbackURL: STRAVA_CALLBACK_URL,
      });
      const authorizationUrl = res?.data?.url;
      if (!authorizationUrl) {
        // Pas d'URL = échec serveur (session absente, provider mal configuré…) →
        // remonté comme erreur générique → message « échec » (pas « annulé »).
        throw new Error('No Strava authorization URL returned');
      }

      // ⚠️ On NE peut PAS ouvrir `authorizationUrl` directement : le cookie
      // `oauth_state` posé par `oauth2.link` vit dans le jar **fetch RN**, pas dans le
      // **navigateur** → le callback serveur échouerait sur `state_mismatch`. On passe
      // donc par le **proxy `expo-authorization-proxy`** du plugin expo (server-side),
      // qui réinjecte `oauth_state` comme cookie **navigateur** avant de rediriger vers
      // Strava. C'est exactement ce que `@better-auth/expo` fait pour le social-login
      // (`client.js`), répliqué ici pour le linking genericOAuth (`/oauth2/link`,
      // non géré par le plugin en 1.5.5).
      const oauthState = readOAuthStateValue();
      const proxyUrl =
        `${BETTER_AUTH_URL}/api/auth/expo-authorization-proxy` +
        `?authorizationURL=${encodeURIComponent(authorizationUrl)}` +
        (oauthState ? `&oauthState=${encodeURIComponent(oauthState)}` : '');

      // Ouvre le consentement Strava (via proxy) ; se ferme au retour
      // `ridenrest://oauth-callback` (server-mediated : liaison faite côté serveur).
      const result = await WebBrowser.openAuthSessionAsync(
        proxyUrl,
        STRAVA_CALLBACK_URL,
      );
      // Annulation/dismiss du navigateur → aucune liaison (AC3, aucun état partiel).
      if (result.type !== 'success') throw new StravaLinkCancelledError();

      // Vérité re-lue côté serveur : un retour `success` sans compte lié (erreur
      // OAuth renvoyée dans l'URL) est traité comme annulation — jamais « connecté »
      // sans compte réel.
      const connected = await fetchStravaConnected();
      if (!connected) throw new StravaLinkCancelledError();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: STRAVA_CONNECTION_QUERY_KEY }),
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      await authClient.unlinkAccount({ providerId: 'strava' });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: STRAVA_CONNECTION_QUERY_KEY }),
  });

  return {
    isConnected: query.data ?? false,
    isLoading: query.isPending,
    isError: query.isError,
    isConnecting: connect.isPending,
    isDisconnecting: disconnect.isPending,
    connect: () => connect.mutateAsync(),
    disconnect: () => disconnect.mutateAsync(),
  };
}
