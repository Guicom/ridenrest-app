import { expoClient } from '@better-auth/expo/client';
import { genericOAuthClient, jwtClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

// Client Better Auth mobile (MOB-2.1 / AC1, AC2).
//
// Chaîne auth : ce client parle au **serveur Better Auth** (`apps/web`, plugin
// `expo()` ajouté en MOB-2.1), récupère la session/JWT, puis `apiFetch()`
// (src/lib/api/api-client.ts) appelle l'**API NestJS** avec `Authorization: Bearer`.
//
// `baseURL` = serveur Better Auth (`apps/web`). Sur **device physique / émulateur
// Android**, `localhost` pointe sur le device → renseigner l'IP LAN de la machine
// de dev dans `EXPO_PUBLIC_BETTER_AUTH_URL` (cf. README §Env vars).
const BETTER_AUTH_URL =
  process.env.EXPO_PUBLIC_BETTER_AUTH_URL ?? 'http://localhost:3011';

export const authClient = createAuthClient({
  baseURL: BETTER_AUTH_URL,
  plugins: [
    // `expoClient` persiste le cookie de session dans **Keychain/Keystore** via
    // `expo-secure-store` (jamais `AsyncStorage` — AC2). `scheme` doit matcher
    // `app.config.ts` (`ridenrest`) pour capturer le retour OAuth deep-link.
    expoClient({
      scheme: 'ridenrest',
      storagePrefix: 'ridenrest',
      storage: SecureStore,
    }),
    // jwtClient : infère l'endpoint `/api/auth/token` (JWT 15 min) côté serveur.
    jwtClient(),
    // genericOAuthClient : active `authClient.oauth2.link()` pour Strava (MOB-2.4).
    genericOAuthClient(),
  ],
});

// Helpers nommés (AC1). `getCookie()` (ajouté par le plugin expo) retourne l'en-tête
// Cookie de session stocké — utilisé par `apiFetch` pour authentifier l'appel au
// endpoint token du serveur Better Auth.
export const { signIn, signUp, signOut, useSession, getCookie } = authClient;
