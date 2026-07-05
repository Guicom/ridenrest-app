---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.1 : Client Better Auth, stockage sécurisé & session persistante

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **rester connecté entre les lancements de l'app de manière sécurisée**,
So that **je n'ai pas à me ré-authentifier à chaque ouverture et que mon token est protégé (Keychain/Keystore)**.

> **Première story de l'Epic MOB-2 (Authentification & Onboarding).** C'est la **fondation auth** : elle pose le client `@better-auth/expo`, le stockage sécurisé, le client API authentifié, et la structure de routes `(auth)`/`(app)` avec auth-gating. Toutes les stories suivantes (MOB-2.2 email, MOB-2.3 Google, MOB-2.4 Strava, MOB-2.5 logout/delete, et **tous les epics MOB-3→6**) consomment ce socle. **Aucun écran de login fonctionnel n'est livré ici** — uniquement l'infra + des placeholders `(auth)/login` et `(app)/adventures` prouvant le guard et la persistance. Le formulaire email réel est en **MOB-2.2**.

## Acceptance Criteria

1. **Given** l'app mobile
   **When** je configure le client Better Auth mobile (`@better-auth/expo`)
   **Then** les appels API NestJS sont authentifiés via le JWT Better Auth (secret partagé inchangé côté serveur — `BETTER_AUTH_SECRET`)
   **And** le serveur Better Auth (`apps/web`) déclare le plugin `expo()` et fait confiance au scheme `ridenrest://` (`trustedOrigins`)

2. **Given** une session établie
   **When** le JWT / cookie de session est persisté
   **Then** il est stocké via `expo-secure-store` (Keychain iOS / Keystore Android)
   **And** il n'est **jamais** écrit en clair dans `AsyncStorage`

3. **Given** un utilisateur connecté
   **When** il relance l'app (cold start)
   **Then** la session est restaurée automatiquement sans nouvelle saisie (FR-006)
   **And** un état de chargement (`<Skeleton />`/`<ActivityIndicator />`) est affiché tant que la session n'est pas résolue (jamais de flash login → app)

4. **Given** la structure de routes
   **When** un utilisateur non connecté ouvre l'app
   **Then** il est redirigé vers `app/(auth)/login.tsx`
   **And** un utilisateur connecté est redirigé vers `app/(app)/adventures` (guard dans `app/(app)/_layout.tsx`)
   **And** le guard est **centralisé** (pas dupliqué par écran)

## Tasks / Subtasks

- [x] **T1 — Serveur Better Auth : plugin `expo()` + trustedOrigins** (AC: 1) **[backend `apps/web` — coordination]**
  - [x] `pnpm --filter @ridenrest/web add @better-auth/expo` — **pinné exact `1.5.5`** (peer `better-auth: 1.5.5` strict ; cf. Completion Notes §compat)
  - [x] Dans `apps/web/src/lib/auth/auth.ts` : ajouter `expo()` au tableau `plugins` (après `jwt()`), **sans toucher** à la config existante (`jwt`, `emailAndPassword`, `databaseHooks`, `socialProviders.google`, `genericOAuth` Strava)
  - [x] Ajouter `trustedOrigins: ['ridenrest://', 'ridenrest://*']` à la config `betterAuth({...})` (autorise les redirections deep-link vers l'app)
  - [x] Vérifier que le secret `BETTER_AUTH_SECRET` reste **identique** entre `apps/web/.env.local`, `apps/api/.env` et le serveur — **aucune** régénération (non touché ; aucune modif d'env)
  - [x] ⚠️ Ne pas modifier le comportement web : le web continue d'utiliser les cookies de session ; l'ajout du plugin `expo()` est additif (web `next build` + 1154 tests verts)

- [x] **T2 — Client `@better-auth/expo` + secure-store** (AC: 1, 2)
  - [x] `pnpm --filter @ridenrest/mobile add better-auth@1.5.5 @better-auth/expo@1.5.5 @tanstack/react-query` + `expo install expo-secure-store expo-web-browser expo-network @react-native-community/netinfo` (versions SDK 56 alignées)
  - [x] Créer `src/lib/auth/client.ts` : `createAuthClient({ baseURL, plugins: [expoClient({ scheme: 'ridenrest', storagePrefix: 'ridenrest', storage: SecureStore }), jwtClient(), genericOAuthClient()] })`
  - [x] `baseURL` = `process.env.EXPO_PUBLIC_BETTER_AUTH_URL` (URL du serveur Better Auth = `apps/web`) — documenté README §Env vars (gotcha device physique vs `localhost`)
  - [x] Exporter les helpers nommés : `export const { signIn, signUp, signOut, useSession, getCookie } = authClient`
  - [x] Ajouter les plugins Expo dans `app.config.ts` : `'expo-secure-store'` + `'expo-web-browser'`
  - [x] **Interdit** : stocker quoi que ce soit d'auth dans `AsyncStorage` ; le `storage` du `expoClient` **est** `expo-secure-store` (vérifié : `grep AsyncStorage` → seul `use-color-scheme` thème, jamais l'auth)

- [x] **T3 — Client API NestJS authentifié (`apiFetch`)** (AC: 1)
  - [x] Créer `src/lib/api/api-client.ts` exportant `apiFetch()` : wrapper `fetch` natif (jamais `axios`/`ky`) qui injecte `Authorization: Bearer <JWT>` ; le cookie de session (`authClient.getCookie()`) authentifie l'appel à l'endpoint token
  - [x] Récupération du JWT : `GET {EXPO_PUBLIC_BETTER_AUTH_URL}/api/auth/token` — **cache ~13 min** (exp − 2 min buffer, capé 13 min) ; un `401` vide le cache, force un refresh, puis **un** retry (testé)
  - [x] Base URL des données = `process.env.EXPO_PUBLIC_API_URL` (NestJS). NB : `api.constants.ts` ne contient **pas** de chemins d'endpoints (TTL/limites only) ; MOB-2.1 n'appelle aucun endpoint de données (placeholders) — `apiFetch` est le wrapper seul
  - [x] Format d'erreur attendu : `{ error: { code, message, details } }` (ResponseInterceptor NestJS, identique web) → `ApiError`

- [x] **T4 — Structure de routes `(auth)` / `(app)` + guard centralisé** (AC: 3, 4)
  - [x] Créer les groupes : `src/app/(auth)/_layout.tsx`, `src/app/(auth)/login.tsx` (placeholder), `src/app/(app)/_layout.tsx`, `src/app/(app)/adventures/index.tsx` (placeholder)
  - [x] `(app)/_layout.tsx` = **guard** : lit `useSession()` ; si non connecté → `<Redirect href="/(auth)/login" />` ; si connecté → `<Stack>`. **Un seul** point de contrôle (testé)
  - [x] `(auth)/_layout.tsx` = guard inverse : si **déjà** connecté → `<Redirect href="/(app)/adventures" />`
  - [x] Gérer l'état `isPending`/restauration : tant que la session n'est pas résolue → `<SessionLoading>` (ActivityIndicator, AC3), **jamais** de flash login→app
  - [x] Adapter le root `src/app/_layout.tsx` : `<QueryProvider>` + `<I18nextProvider>` au-dessus du `<Stack>` ; `index.tsx` → `<Redirect href="/(app)/adventures" />` ; `explore.tsx` (démo MOB-1.1) **supprimé** ; `useTranslation` au root retiré (corrige bug latent obs 5601)

- [x] **T5 — Provider TanStack Query + AppState (socle data)** (AC: 3)
  - [x] `@tanstack/react-query` + `@react-native-community/netinfo` installés (cf. T2). `src/lib/query/query-client.ts` (staleTime 30s, retry 2)
  - [x] Monter `<QueryProvider>` (`QueryClientProvider`) dans le root `_layout.tsx` (query keys cohérentes web documentées dans query-client.ts)
  - [x] **Un seul** listener `AppState` centralisé via `useAppStateRefetch()` monté au root (`src/lib/query/use-app-state-refetch.ts`) — `focusManager` + refetch session foreground + bridge `onlineManager`/netinfo. Purge offline déférée MOB-3.5 (points d'extension posés)

- [x] **T6 — i18n auth + tests** (AC: tous)
  - [x] Ajouter les clés i18n `auth.*` dans `src/lib/i18n/locales/fr.json` (+ `en.json`) — **aucune chaîne en dur** dans les écrans/loader auth
  - [x] `__mocks__/` : `expo-secure-store` enrichi (variantes sync `setItem`/`getItem`), `expo-web-browser` ajouté. NB : les tests mockent le wrapper `@/lib/auth/client` (isole `@better-auth/expo` ; sous-chemin `/client` peu fiable en auto-mock)
  - [x] Tests : `src/lib/api/api-client.test.ts` (Bearer + cache token + `401→refresh→1 retry` + erreur typée, 4 tests) ; guard `src/__tests__/app-group-guard.test.tsx` (loader isPending / redirect non-connecté / Stack connecté, 3 tests, `useSession` mocké)
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts (14 tests) + **gate CI globale verte** : `turbo lint/typecheck/test/build --filter='*'` = 23/23, web 1154 tests + `next build` OK

- [x] **T7 — Validation manuelle persistance** (AC: 2, 3) — ✅ **VALIDÉE sur simulateur iOS** (iPhone 17 Pro, iOS 26.5, build dev-client locale après `expo prebuild --clean`). Preuves logs ci-dessous (Completion Notes §T7).
  - [x] Sur device/simulateur : session de test établie (auto-`signIn` temporaire contre le serveur Better Auth `:3011`), app **tuée** (`simctl terminate`) puis relancée → logs au relaunch : `✅ ADVENTURES monté → session active` **sans** `⚠️ LOGIN` ni `signIn` → session **restaurée** sans saisie (AC3)
  - [x] Token dans le **Keychain** (`expo-secure-store`) : `🔐 SecureStore[ridenrest_cookie]: PRESENT (156 chars)` + `[ridenrest_session_data]: PRESENT` ; **absent** d'AsyncStorage : `📦 AsyncStorage keys: []` (AC2)

### Review Findings (code review 2026-06-08)

> 3 couches adversariales (Blind Hunter / Edge Case Hunter / Acceptance Auditor). Tous les AC (1–4), le pin `1.5.5` et la frontière de story sont **satisfaits** (audit conforme). Findings ci-dessous = robustesse de la fondation `apiFetch` (consommée par toutes les stories suivantes) + sécurité OAuth à durcir plus tard. 1 décision, 7 patchs, 3 différés, ~13 écartés (bruit).

**Décision tranchée (→ patch)**

- [x] [Review][Patch] 401 terminal de l'API → bridge `apiFetch` vers `signOut()` (décision : **option 1**) — Sur un 401 persistant après le retry, `requestWithAuth` invalide la session Better Auth (`authClient.signOut()` / invalidation `['session']`) avant de lever `ApiError(401)`, pour que le guard `(app)/_layout` redirige vers login au lieu de laisser un état « zombie » (UI connectée, API 401). [apps/mobile/src/lib/api/api-client.ts:104]

**Patchs (fix non ambigu)**

- [x] [Review][Patch] `apiFetch` lève sur une réponse 2xx sans corps (204) — `await res.json()` non gardé sur le chemin succès ; un 204 (ex. logout/delete MOB-2.5) fait throw `SyntaxError` sur un appel pourtant réussi [apps/mobile/src/lib/api/api-client.ts:122]
- [x] [Review][Patch] Erreur réseau (`fetch` qui *reject*) non convertie en `ApiError` — un `TypeError` brut « Network request failed » remonte au lieu du contrat `{ error }` typé, sur l'appel API comme sur `fetchFreshToken` [apps/mobile/src/lib/api/api-client.ts:57-65,94]
- [x] [Review][Patch] `parseJwtExp` : base64url non normalisé avant `atob` — les segments JWT (base64url, `-`/`_`) font échouer `atob` → `exp=0` → TTL retombe silencieusement sur le cap 13 min (dégradation *safe* mais l'`exp` réel est ignoré) [apps/mobile/src/lib/api/api-client.ts:43-50]
- [x] [Review][Patch] Pas de déduplication des refresh de token concurrents — N `apiFetch` simultanés à cache vide (cold start) déclenchent N `GET /api/auth/token` ; ajouter une promesse `inflight` partagée [apps/mobile/src/lib/api/api-client.ts:33-34,68]
- [x] [Review][Patch] `void authClient.getSession()` sans `.catch` — rejet non géré (red-box RN) au retour foreground hors-ligne [apps/mobile/src/lib/query/use-app-state-refetch.ts:23]
- [x] [Review][Patch] Deps de test sous `dependencies` — `jest`, `jest-expo`, `@testing-library/react-native` à déplacer en `devDependencies` (`@types/jest` y est déjà) [apps/mobile/package.json]
- [x] [Review][Patch] Test manquant pour le guard inverse `(auth)/_layout` — la moitié d'AC4 (redirect « déjà connecté → adventures ») n'a aucun test unitaire ; symétrie de `app-group-guard.test.tsx` [apps/mobile/src/__tests__/]

**Différés**

- [x] [Review][Defer] Durcissement OAuth deep-link (`trustedOrigins: ridenrest://*` + PKCE / interception de scheme custom) [apps/web/src/lib/auth/auth.ts:27] — deferred → MOB-2.3/2.4 (flux OAuth réellement implémenté là-bas)
- [x] [Review][Defer] `EXPO_PUBLIC_BETTER_AUTH_URL` doit être **HTTPS** en prod (cookie de session envoyé en header `Cookie`) — garde-fou config/ops [apps/mobile/src/lib/api/api-client.ts:58] — deferred, hygiène d'environnement
- [x] [Review][Defer] État online initial non seedé + `isInternetReachable` ignoré (boot hors-ligne → requêtes vouées à échouer consommant `retry: 2`) [apps/mobile/src/lib/query/use-app-state-refetch.ts:31-38] — deferred → affiné avec le cache offline MOB-3.5

## Dev Notes

### ⚠️ Architecture du flow auth (à NE PAS se tromper)

Le serveur Better Auth vit dans **`apps/web`** (Next.js, route catch-all `app/api/auth/[...all]/route.ts`, base URL dev `http://localhost:3011`). Il émet un **JWT** (15 min) + **refresh token** (30 j) via le plugin `jwt()` déjà configuré (story web 2.1). L'**API NestJS** (`apps/api`) valide ce JWT (secret partagé `BETTER_AUTH_SECRET`).

**Chaîne mobile :** `@better-auth/expo` (client) → parle au serveur Better Auth (`apps/web`) → obtient session/JWT → stockés en `expo-secure-store` → `apiFetch()` appelle l'**API NestJS** avec `Authorization: Bearer <JWT>`.

```
Mobile (@better-auth/expo)  ──sign-in──▶  apps/web /api/auth/*  (Better Auth + jwt plugin)
        │  session → SecureStore                     │
        │                                            ▼
        └── apiFetch(Bearer JWT) ──────────▶  apps/api (NestJS, valide JWT)  ──▶  PostgreSQL
```

> **Backend inchangé**, à **une** exception additive : ajouter le plugin `expo()` + `trustedOrigins` au serveur (`apps/web/src/lib/auth/auth.ts`). C'est ce qui permet à Better Auth de rediriger vers `ridenrest://` et de traiter les cookies de session pour un client natif.

### `@better-auth/expo` — ce qu'il fait pour nous

- **Persistance session** : le plugin `expoClient({ storage: SecureStore })` stocke automatiquement le cookie de session dans **Keychain/Keystore** (pas d'`AsyncStorage`). Restauration au cold start = automatique (`useSession()` réhydrate). → satisfait AC2 + AC3.
- **OAuth deep-link** : `signIn.social()` / `oauth2.link()` ouvrent `expo-web-browser` (`openAuthSessionAsync`) et capturent le retour `ridenrest://` — **consommé en MOB-2.3/2.4**, pas ici. Mais le `scheme` et `trustedOrigins` posés ici en sont le prérequis.
- **Version** : archi cible `@better-auth/expo` v1.6+. Le serveur web est en **better-auth v1.5.5** (story 2.1). ⚠️ **Vérifier la compat** client/serveur : aligner `better-auth` mobile sur la version serveur ou monter le serveur à la version requise par le plugin expo. Documenter la version réellement installée dans les Completion Notes.

### Env vars (gotcha critique device physique)

- `EXPO_PUBLIC_BETTER_AUTH_URL` — base URL du serveur Better Auth (`apps/web`). Dev simulateur iOS : `http://localhost:3011`. **Device physique / émulateur Android** : `localhost` pointe sur le device lui-même → utiliser l'**IP LAN** de la machine de dev (ex. `http://192.168.x.x:3011`). Documenter dans `README.md`.
- `EXPO_PUBLIC_API_URL` — base URL de l'API NestJS (données).
- **Secrets** (`BETTER_AUTH_SECRET`, OAuth client secrets) : **jamais** dans le bundle JS. Seules les `EXPO_PUBLIC_*` non sensibles sont exposées (archi §Auth & Security).
- Convention : `app.config.ts` (TS), jamais `app.json`.

### Patterns API (source : architecture-mobile.md §API & Communication Patterns)

- `lib/api/api-client.ts` exporte `apiFetch()` — wrapper `fetch` + Bearer auto + interceptor `401 → refresh → retry`. **Aucun** `axios`/`ky`.
- Server state = **TanStack Query v5** (identique web). Query keys cohérentes : `['adventures']`, `['adventures', id]`, `['adventures', id, 'segments']`, `['pois', { segmentId, fromKm, toKm, layer }]`, `['session']`.
- Erreur API : `{ error: { code, message, details } }`. Pas de `try/catch` sauf aux frontières.
- Types/DTOs depuis `packages/shared/` ; constantes d'endpoints depuis `packages/shared/constants/api.constants.ts`. **Jamais** redéfinir localement.

### Routing & guard (source : architecture-mobile.md §Routing & deep links)

- Auth gating = `_layout.tsx` du groupe `(app)/` vérifie la session → `<Redirect href="/(auth)/login" />` si non connecté. **Centralisé**, jamais par écran.
- Navigation programmatique : `useRouter()` + `router.replace('/adventures')` (replace pour ne pas empiler login dans l'historique après auth).
- Structure cible (archi §Structure Patterns) :

```
src/app/
  _layout.tsx                 ← root : Providers (i18n ✓, QueryClient, AppState listener unique)
  (auth)/
    _layout.tsx               ← redirect si DÉJÀ connecté → (app)/adventures
    login.tsx                 ← placeholder ici ; formulaire réel en MOB-2.2
  (app)/
    _layout.tsx               ← GUARD : redirect si NON connecté → (auth)/login
    adventures/index.tsx      ← placeholder ici ; liste réelle en MOB-3.1
```

### Loading / error UX (source : architecture-mobile.md §Loading states & errors)

- `isPending`/restauration session → `<Skeleton />`/`<ActivityIndicator />`. **Jamais** blocage UI total ni flash login→app (AC3).
- Erreurs réseau → `<ErrorBanner />` inline, **jamais** `Alert.alert`.
- Offline → `<StatusBanner message="Mode hors ligne" />` (déclenché par `useNetworkStatus` ; le hook complet arrive avec le cache MOB-3.5, ici poser seulement netinfo + provider).

### Sécurité (Enforcement Guidelines archi)

- Tokens **toujours** dans `expo-secure-store` (Keychain/Keystore) — **jamais** `AsyncStorage` en clair. (`@react-native-async-storage/async-storage` est présent comme dep transitive ; ne **jamais** l'utiliser pour l'auth.)
- `BETTER_AUTH_SECRET` partagé, jamais exposé au client.

### Previous story intelligence (MOB-1.4 — done)

- **Scheme `ridenrest://` déjà déclaré** dans `app.config.ts` (`scheme: 'ridenrest'`) + route placeholder `src/app/oauth-callback.tsx` existante (affiche les params reçus). Le deep link `ridenrest://oauth-callback` **ouvre déjà l'app** (vérifié runtime iOS 26.5). → MOB-2.1 n'a **pas** à reconfigurer le scheme ; juste à ajouter `trustedOrigins` côté serveur.
- **i18n opérationnel** : `src/lib/i18n/` (`i18n.config.ts`, `locales/{fr,en}.json`), `<I18nextProvider>` monté au root, FR par défaut + fallback FR. Ajouter les clés `auth.*`, jamais de chaîne en dur.
- **Tests** : preset `jest-expo`, `__mocks__/` racine avec déjà `expo-secure-store`, `expo-location`, `expo-localization`, `@maplibre/...`. `transformIgnorePatterns` étendu (nativewind, `@ridenrest/*`). Gate CI lint/test/typecheck **bloquante** (ne pas la rendre rouge).
- **Toolchain** : Expo SDK 56 / RN 0.85.3 / React 19.2.3 (versions réelles, plancher archi = SDK 55). Build natif local exige **Xcode 26.4+**. Path alias `@/*` → `./src/*`.
- ⚠️ **Migration `app.json` → `app.config.ts` déjà faite** : ne pas recréer `app.json`. Préserver `projectId` EAS + bloc `updates` (OTA).

### Git intelligence

- `ac20da8` MOB-1.3 design system (Button/Card/Skeleton primitifs — réutiliser `<Button>`, `<Skeleton>` pour les placeholders/loaders auth).
- Stories web `2-1`→`2-4` (done) : backend Better Auth **déjà configuré** (jwt 15m/refresh 30j, `emailAndPassword` minPwd 8, `socialProviders.google`, `genericOAuth` Strava, `sendResetPassword`, `deleteUser`). **Réutiliser**, ne rien recréer côté serveur sauf le plugin `expo()`.

### Latest tech information

- **`@better-auth/expo`** (sortie ~2026-05) : client `expoClient({ scheme, storagePrefix, storage })` + plugin serveur `expo()`. Dépend de `expo-secure-store`, `expo-web-browser`, `expo-linking` (déjà présent). Le `scheme` doit matcher `app.config.ts` (`ridenrest`).
- **Better Auth jwt plugin** : récupération du JWT via `GET /api/auth/token`. En v1.5.5 `authClient.getToken()` peut ne pas exister → fetch direct sur l'endpoint token (cf. note réelle story web 2.1). Reproduire ce pattern mobile.
- **TanStack Query v5** : `QueryClientProvider` + `refetchOnAppFocus` via le listener `AppState` (RN n'a pas `window.focus`).

### Project Structure Notes

- **Ajouts** : `src/lib/auth/client.ts`, `src/lib/api/api-client.ts` (+ `.test.ts`), `src/app/(auth)/_layout.tsx`, `src/app/(auth)/login.tsx`, `src/app/(app)/_layout.tsx` (+ test), `src/app/(app)/adventures/index.tsx`, clés `auth.*` i18n, mocks `@better-auth/expo`/`expo-web-browser`.
- **Modifs** : `src/app/_layout.tsx` (QueryClientProvider + AppState + routing groupes), `app.config.ts` (plugin `expo-secure-store`), `package.json` (deps), `apps/web/src/lib/auth/auth.ts` (plugin `expo()` + `trustedOrigins`), `README.md`/`AGENTS.md` (env vars, IP LAN device).
- **Décision à confirmer** : sort des écrans placeholder MOB-1.1 (`index.tsx`, `explore.tsx`). Recommandé : faire de `index` une redirection vers `(app)/adventures` (le guard gère ensuite), retirer `explore` (démo MOB-1.1 obsolète) — ou les déplacer hors du chemin de prod. Documenter le choix.
- Aucune migration DB. Backend : **une** modif additive (`expo()` plugin).

### Frontière de story

- **Inclus** : client `@better-auth/expo` + secure-store, plugin serveur `expo()` + trustedOrigins, `apiFetch()` Bearer/refresh, groupes `(auth)`/`(app)` + guard centralisé, persistance/restauration session, providers root (Query, AppState), placeholders `login`/`adventures`, clés i18n auth.
- **Exclu** : formulaire email/login réel → **MOB-2.2** ; Google → **MOB-2.3** ; Strava → **MOB-2.4** ; logout/suppression → **MOB-2.5** ; liste aventures réelle → **MOB-3.1** ; purge cache offline → **MOB-3.5** ; toute modif du flow auth web existant.

### Testing standards

- Unit co-localisés `*.test.ts(x)` (jest-expo + RNTL). Mocker `@better-auth/expo`, `expo-secure-store`, `expo-web-browser`.
- Cas requis : `apiFetch` injecte Bearer + cache token (~13 min) + `401 → refresh → 1 retry` ; guard `(app)/_layout` (non-connecté → Redirect login, connecté → enfants, isPending → loader).
- Validation manuelle : cold-start restore (AC3) + token en Keychain/Keystore et absent d'AsyncStorage (AC2).
- `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts ; gate CI globale non cassée (web/api intacts).

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-2.1] — AC d'origine (l.470-503)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Authentication & Security] — `@better-auth/expo` v1.6+, secure-store, secret partagé (l.360-380)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#API & Communication Patterns] — `apiFetch` Bearer/refresh, query keys, format erreur (l.654-672, 382-394)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Routing & deep links] — guard `(app)/_layout`, structure groupes (l.650-660, 541-588)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Loading states & errors / Enforcement] — loaders, ErrorBanner, secure-store obligatoire (l.690-705, 760-775)
- [Source: _bmad-output/implementation-artifacts/2-1-email-password-registration-login.md] — config serveur Better Auth (jwt 15m/refresh 30j, baseURL), pattern token via `/api/auth/token`, api-client Bearer (l.145-230)
- [Source: _bmad-output/implementation-artifacts/MOB-1-4-cross-config-i18n-tests-ci-deeplink-scheme.md] — scheme `ridenrest://`, i18n, gate CI, mocks natifs, app.config.ts
- [Source: apps/mobile/app.config.ts] — `scheme: 'ridenrest'`, projectId EAS, updates OTA (état actuel)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (Claude Opus 4.8, 1M context) — bmad-dev-story

### Debug Log References

- **Compat better-auth client/serveur** : `@better-auth/expo` se résout par défaut en `1.6.14` (peer `better-auth: ^1.6.14`), mais le serveur tourne en `better-auth@1.5.5`. Résolu en **pinant exact `@better-auth/expo@1.5.5` + `better-auth@1.5.5`** (web ET mobile), peer `better-auth: 1.5.5` strict satisfait. Voir Completion Notes §compat.
- **Jest — factory `jest.mock` + NativeWind** : un mock `expo-router` rendant du JSX RN (`React.createElement(Text)`) échoue (`Invalid variable access: _ReactNativeCSSInterop` — le transform NativeWind injecte une variable de module-scope, interdite dans une factory jest). Corrigé en `jest.fn(() => null)` + assertions sur appels/props.
- **`expo export` + tests sous `src/app`** : le `require.context` d'Expo Router bundle tout `.tsx` sous `src/app` (test inclus) → build cassé sur `@testing-library/react-native`. Test du guard **déplacé** sous `src/__tests__/`.
- **Typed routes locaux périmés** : `.expo/types/router.d.ts` (gitignored) périmé faisait échouer `tsc` local sur les nouveaux hrefs. Supprimé (régénéré au prochain `expo start`). Vérifié : sans ce fichier (état CI), `tsc --noEmit` = 0 erreur.

### Completion Notes List

✅ **Fondation auth mobile livrée** (T1–T6). Aucun écran de login fonctionnel (frontière respectée — MOB-2.2).

**§compat (décision clé)** — `@better-auth/expo` et `better-auth` **pinnés exact `1.5.5`** côté web + mobile, alignés sur le serveur Better Auth existant (`apps/web@1.5.5`). Le plugin 1.6.x aurait exigé de monter le serveur en 1.6.x → risque de casser **toutes les sessions web en prod**. Choix conservateur, 100 % additif (web `next build` + 1154 tests verts). Pin **sans `^`** car le peer du plugin est `better-auth: 1.5.5` strict (un caret laisserait dériver vers 1.6.14 et re-casserait le peer).

**T1 (serveur, additif)** — `apps/web/src/lib/auth/auth.ts` : `expo()` ajouté après `jwt()` + `trustedOrigins: ['ridenrest://','ridenrest://*']`. Config existante (jwt, emailAndPassword, databaseHooks, google, genericOAuth Strava) **intacte**. `BETTER_AUTH_SECRET` non touché.

**T2/T3 (client + apiFetch)** — `client.ts` : `expoClient({ scheme:'ridenrest', storagePrefix:'ridenrest', storage: SecureStore })` + `jwtClient()` + `genericOAuthClient()`. `api-client.ts` : Bearer auto, cache JWT (exp−2min, capé 13min), `401→refresh→1 retry`, `ApiError` typée. **AC2 vérifié** : `grep AsyncStorage src/` → seul `use-color-scheme` (thème, non-auth) ; l'auth est exclusivement en `expo-secure-store`.

**T4 (routes + guard)** — groupes `(auth)`/`(app)`, guard centralisé `(app)/_layout` (loader isPending / redirect login / Stack), guard inverse `(auth)/_layout`. Root `_layout` : `QueryProvider > I18nextProvider > Stack` (headerShown:false). `index.tsx` → redirect `(app)/adventures` ; `explore.tsx` supprimé ; `useTranslation` retiré du root (corrige bug latent obs 5601).

**T5 (socle data)** — `QueryProvider` + `useAppStateRefetch` (un seul listener AppState : `focusManager` + refetch session foreground + bridge `onlineManager`/netinfo). Purge offline → MOB-3.5.

**T6 (i18n + tests)** — clés `auth.*` (fr+en). Mocks : `expo-secure-store` (sync `setItem`/`getItem`), `expo-web-browser`. 14 tests verts (api-client 4, guard 3, + existants). **Gate CI globale verte** : `turbo lint/typecheck/test/build --filter='*'` = 23/23, frozen-lockfile OK.

**Docs** — README mobile (env vars + gotcha IP LAN, section Auth & session, convention tests hors `src/app`), AGENTS.md (compat versions, secure-store, tests routes), `.env.example` créé.

**§T7 — VALIDÉE sur simulateur iOS** (iPhone 17 Pro, iOS 26.5, Xcode 26.5, build dev-client locale). Stack de test : Postgres (docker `db`) + serveur Better Auth `apps/web` `:3011` + user `t7-test@ridenrest.app` créé via `sign-up/email`.

⚠️ **Gotcha build natif rencontré** : le `ios/` sur disque était périmé (généré avant l'ajout des modules natifs) → `expo run:ios` réinstallait un binaire sans `ExpoSecureStore`/`ExpoLocalization` (crash `Cannot find native module`). **Fix : `expo prebuild --clean -p ios`** (régénère + `pod install`, 116 pods, 5 modules autolinkés vérifiés dans `Podfile.lock`) puis recompilation. Règle ajoutée à AGENTS.md.

Preuves runtime (logs Metro, build fraîche, simulateur unique) :
- **1ʳᵉ ouverture (signIn)** : `⚠️ LOGIN monté → auto signIn` → `signIn résultat: "ok"` (AC1, serveur :3011) → `✅ ADVENTURES monté → session active` (AC4) → `🔐 SecureStore[ridenrest_cookie]: PRESENT (156 chars)` + `[ridenrest_session_data]: PRESENT` + `📦 AsyncStorage keys: []` (AC2).
- **Cold restart** (`simctl terminate` + relaunch) : `✅ ADVENTURES monté → session active` **sans** `⚠️ LOGIN` ni `signIn` → **session restaurée depuis le Keychain** (AC3). Confirmé visuellement (écran « Mes aventures » au boot, pas de flash login).

Patches d'instrumentation temporaires (auto-signIn + logs SecureStore/AsyncStorage) **retirés** après validation (working tree propre, gate mobile re-vérifiée verte 14/14).

### File List

**Ajoutés (mobile)**
- `apps/mobile/src/lib/auth/client.ts`
- `apps/mobile/src/lib/api/api-client.ts`
- `apps/mobile/src/lib/api/api-client.test.ts`
- `apps/mobile/src/lib/query/query-client.ts`
- `apps/mobile/src/lib/query/query-provider.tsx`
- `apps/mobile/src/lib/query/use-app-state-refetch.ts`
- `apps/mobile/src/components/auth/session-loading.tsx`
- `apps/mobile/src/app/(auth)/_layout.tsx`
- `apps/mobile/src/app/(auth)/login.tsx`
- `apps/mobile/src/app/(app)/_layout.tsx`
- `apps/mobile/src/app/(app)/adventures/index.tsx`
- `apps/mobile/src/__tests__/app-group-guard.test.tsx`
- `apps/mobile/__mocks__/expo-web-browser.js`
- `apps/mobile/.env.example`

**Modifiés (mobile)**
- `apps/mobile/package.json` (deps : better-auth, @better-auth/expo, @tanstack/react-query, expo-secure-store, expo-web-browser, expo-network, @react-native-community/netinfo)
- `apps/mobile/app.config.ts` (plugins `expo-secure-store` + `expo-web-browser`)
- `apps/mobile/src/app/_layout.tsx` (providers Query/i18n + routing groupes)
- `apps/mobile/src/app/index.tsx` (redirect `(app)/adventures`)
- `apps/mobile/src/lib/i18n/locales/fr.json` (clés `auth.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (clés `auth.*`)
- `apps/mobile/__mocks__/expo-secure-store.js` (variantes sync)
- `apps/mobile/README.md` (env, auth, convention tests)
- `apps/mobile/AGENTS.md` (compat, secure-store, tests routes)

**Supprimés (mobile)**
- `apps/mobile/src/app/explore.tsx` (démo MOB-1.1 obsolète)

**Modifiés (backend / monorepo)**
- `apps/web/src/lib/auth/auth.ts` (plugin `expo()` + `trustedOrigins` — additif)
- `apps/web/package.json` (`@better-auth/expo@1.5.5`)
- `pnpm-lock.yaml`

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.1 (ready-for-dev) — fondation auth : client `@better-auth/expo` + secure-store, plugin serveur `expo()` + trustedOrigins, `apiFetch` Bearer/refresh, groupes `(auth)`/`(app)` + guard centralisé, persistance session, providers root. | bmad-create-story |
| 2026-06-08 | 1.0 | Implémentation T1–T6 (code + tests). Serveur : `expo()` + `trustedOrigins` (additif). Mobile : client `@better-auth/expo` (secure-store), `apiFetch` (Bearer/cache/401-retry), groupes `(auth)`/`(app)` + guard centralisé + loader, providers Query/AppState, clés i18n `auth.*`, mocks, 14 tests. Versions better-auth pinnées exact `1.5.5` (alignées serveur). Gate CI globale verte (23/23, web 1154). Docs README/AGENTS/.env.example. Statut → review. | claude-opus-4-8[1m] |
| 2026-06-08 | 1.1 | **T7 validée sur simulateur iOS** (iPhone 17 Pro / iOS 26.5). Stack de test montée (docker `db` + Better Auth `:3011` + user de test). Preuves logs : signIn serveur OK (AC1), token+session_data en SecureStore/Keychain & AsyncStorage vide (AC2), cold-restart → adventures sans re-login (AC3), guard (AC4). Gotcha `expo prebuild --clean` requis (modules natifs absents du `ios/` périmé) → documenté AGENTS.md. Patches d'instrumentation temporaires retirés, gate mobile re-vérifiée 14/14. Toutes les tâches T1–T7 cochées. | claude-opus-4-8[1m] |
