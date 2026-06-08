---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.3 : Authentification Google OAuth (deep link)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **me connecter via Google en un geste**,
So that **l'onboarding est sans friction**.

> **Dépend de MOB-2.1** (client `@better-auth/expo` + `expo-web-browser`, secure-store, scheme `ridenrest://`, `trustedOrigins`) et **MOB-2.2** (écran login avec slot OAuth réservé). Google = **sign-in / registration** (crée l'utilisateur si nouveau). Le provider `socialProviders.google` est **déjà configuré côté serveur** (story web 2.2). Strava (account-linking, différent) → MOB-2.4.

## Acceptance Criteria

1. **Given** l'écran de connexion
   **When** je tape « Continuer avec Google »
   **Then** le flow OAuth s'ouvre (navigateur d'auth sécurisé)
   **And** après autorisation, le callback `ridenrest://` ramène l'utilisateur dans l'app (FR-002, FR-MOB-010)

2. **Given** un retour de callback OAuth réussi
   **When** le token/session est reçu
   **Then** la session est établie et persistée (secure-store, MOB-2.1)
   **And** l'utilisateur est redirigé vers `adventures`

3. **Given** un flow OAuth annulé ou échoué
   **When** l'utilisateur revient dans l'app
   **Then** un message d'erreur clair est affiché et **aucun état partiel** n'est laissé (pas de session corrompue, bouton ré-utilisable)

## Tasks / Subtasks

- [ ] **T1 — Serveur : redirect URI Google + (rappel) provider déjà en place** (AC: 1) **[MANUEL — Guillaume + vérif]**
  - [ ] **Vérifier** `apps/web/src/lib/auth/auth.ts` : `socialProviders.google` est **déjà** configuré (story web 2.2) — `clientId`/`clientSecret` via env serveur. **Ne pas dupliquer.**
  - [ ] **Google Cloud Console** : ajouter le redirect URI du serveur Better Auth si manquant — `{BETTER_AUTH_URL}/api/auth/callback/google` (dev `http://localhost:3011/api/auth/callback/google`). ⚠️ Avec le flow **server-mediated** (recommandé, voir Dev Notes), le redirect Google pointe vers le **serveur**, PAS vers `ridenrest://`
  - [ ] Confirmer que `trustedOrigins` inclut `ridenrest://` (fait MOB-2.1) — c'est ce qui autorise la redirection finale serveur → app

- [ ] **T2 — Client : plugin Google + bouton « Continuer avec Google »** (AC: 1, 2)
  - [ ] `src/lib/auth/client.ts` : s'assurer que le client supporte le social sign-in (le plugin `expoClient` gère le deep-link ; ajouter le plugin client Google si l'API Better Auth l'exige pour le typage — sinon `signIn.social` suffit)
  - [ ] Créer `src/components/shared/google-sign-in-button.tsx` (réutilisable login + signup) — primitif `<Button>` MOB-1.3, icône Google, label i18n `auth.google.continue`
  - [ ] Handler : `authClient.signIn.social({ provider: 'google', callbackURL: 'ridenrest://oauth-callback' })` — `@better-auth/expo` ouvre `expo-web-browser` (`openAuthSessionAsync`) et capture le retour `ridenrest://`
  - [ ] Brancher le bouton dans le slot OAuth réservé de `(auth)/login.tsx` (et `signup.tsx`)

- [ ] **T3 — Traitement du callback + redirection** (AC: 2, 3)
  - [ ] **Cas nominal `@better-auth/expo`** : `signIn.social()` est awaitable — au retour, la session est déjà persistée par le plugin (secure-store). Pas besoin de parser manuellement le deep link. Sur succès → `router.replace('/(app)/adventures')` (ou laisser le guard `(app)/_layout` rediriger via `useSession`)
  - [ ] **Route `oauth-callback.tsx`** (placeholder MOB-1.4) : adapter en écran de transition (loader) qui finalise/route si le flow repose sur un retour de deep link explicite ; sinon la garder minimale. **Remplacer** l'affichage debug des params par un `<ActivityIndicator />` + redirection
  - [ ] **Annulation/échec** (AC3) : `openAuthSessionAsync` renvoie `{ type: 'cancel' | 'dismiss' }` ou `signIn.social` throw → afficher `<ErrorBanner />` i18n (`auth.errors.oauthFailed` / `auth.errors.oauthCancelled`), **réactiver** le bouton, ne laisser **aucune** session partielle. Validation des params du deep link (déféré MOB-1.4) à traiter ici si parsing manuel

- [ ] **T4 — i18n + tests** (AC: tous)
  - [ ] Clés `auth.google.*`, `auth.errors.oauth*` (`fr.json` + `en.json` squelette)
  - [ ] Mock `@better-auth/expo` (`signIn.social`) et `expo-web-browser` (`openAuthSessionAsync`) dans `__mocks__/` / tests
  - [ ] Tests : bouton appelle `signIn.social({ provider: 'google', ... })` ; succès → redirection ; cancel/échec → ErrorBanner + bouton réactivé + pas de session
  - [ ] `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts (gate CI)

- [ ] **T5 — Validation manuelle device** (AC: 1, 2, 3)
  - [ ] Tap « Continuer avec Google » → navigateur d'auth → consentement Google → retour app → session persistée (kill/relaunch OK) → écran `adventures`
  - [ ] Annuler le consentement → retour app → message clair, bouton ré-utilisable, toujours sur `login`

## Dev Notes

### 🚨 Décision d'architecture CRITIQUE : flow server-mediated vs PKCE natif

L'archi mentionne deux pistes (`@better-auth/expo` ET `expo-auth-session PKCE`). **Choix recommandé : server-mediated via `@better-auth/expo`** — et voici pourquoi (à NE PAS contourner sans raison) :

| | **Server-mediated (recommandé)** | PKCE natif (`expo-auth-session`) |
|---|---|---|
| Réutilise le backend `socialProviders.google` (story 2.2) | ✅ 100 % | ❌ flow parallèle à maintenir |
| Secret OAuth Google | Reste **côté serveur** (sécurisé, store-friendly) | Client public, pas de secret (PKCE) |
| Redirect URI Google | `{baseURL}/api/auth/callback/google` (serveur) | `ridenrest://oauth-google` (app) |
| Deep-link de retour app | `ridenrest://oauth-callback` (final, via `trustedOrigins`) | géré par `expo-auth-session` |
| Effort mobile | Faible (`signIn.social`) | Élevé (config endpoints, échange token) |

**Flow server-mediated :**
```
Bouton → authClient.signIn.social({ provider:'google', callbackURL:'ridenrest://oauth-callback' })
  → expo-web-browser ouvre {baseURL}/api/auth/sign-in/social → Google
  → Google redirige → {baseURL}/api/auth/callback/google  (serveur traite, crée/connecte user)
  → serveur redirige → ridenrest://oauth-callback  (autorisé par trustedOrigins)
  → expo-web-browser capture, ferme, @better-auth/expo persiste la session en secure-store
  → app : session active → guard route vers /adventures
```

> ⚠️ Conséquence : le redirect URI à whitelister dans **Google Cloud Console** est celui du **serveur** (`/api/auth/callback/google`), **pas** `ridenrest://`. L'AC1 (« le callback `ridenrest://` ramène l'utilisateur ») est satisfaite par la **redirection finale serveur → app**, pas par un redirect Google direct. Documenter ce point pour éviter une mauvaise config Google.
>
> L'`EXPO_PUBLIC_GOOGLE_OAUTH_CLIENT_ID` évoqué dans l'archi n'est nécessaire **que** pour le flow PKCE natif (Option B). En server-mediated, **aucun** identifiant Google n'est exposé au client.

### Google = sign-in (≠ Strava = linking) — source : story web 2.3

| | Google (cette story) | Strava (MOB-2.4) |
|---|---|---|
| But | **Sign-in / registration** | **Account linking** (import) |
| État user | Anonyme → authentifié | Déjà authentifié |
| Méthode Better Auth | `signIn.social()` | `linkSocial()` / `oauth2.link()` |
| Plugin serveur | `socialProviders` (built-in) | `genericOAuth` |
| Crée un user ? | Oui (si nouveau) | Non |

Ne pas copier le pattern Google vers Strava — ce sont des mécaniques différentes.

### Backend déjà fait — NE PAS recréer (story web 2.2, done)

`apps/web/src/lib/auth/auth.ts` a déjà `socialProviders.google` (clientId/secret env). `databaseHooks.user.create.after` crée le `profiles`. Le hook a un `try/catch` (ajouté au code review 2.2). → **Mobile = client uniquement** + (manuel) vérifier le redirect URI Google Console.

### Gestion robuste annulation/échec (AC3)

- `openAuthSessionAsync` (sous-jacent à `signIn.social`) retourne `{ type }` : `success` | `cancel` | `dismiss`. Traiter explicitement `cancel`/`dismiss` → message i18n + **aucune** session.
- Sur throw réseau : `<ErrorBanner />`, bouton réactivé (gérer `isPending` local).
- **Aucun état partiel** : ne pas appeler de logique « connecté » avant que `useSession()` confirme une session valide.
- Le param du deep link doit être **validé** (le placeholder MOB-1.4 a déféré cette validation ici) — gérer `error=access_denied`, params manquants, arrays.

### Previous story intelligence

- **MOB-2.1** : `expo-web-browser` installé, scheme + `trustedOrigins` posés, secure-store actif, guard `(app)/_layout`. `oauth-callback.tsx` existe (placeholder debug MOB-1.4) → **à transformer** en écran de transition (loader + redirect), retirer le `JSON.stringify(params)` de debug.
- **MOB-2.2** : `(auth)/login.tsx` et `signup.tsx` exposent un **slot OAuth réservé** → y brancher le bouton Google.
- **MOB-1.3** : `<Button>` réutilisable.
- **MOB-1.4** : deep link `ridenrest://oauth-callback` **vérifié fonctionnel** runtime (iOS 26.5) ; validation des params **déférée à cette story**.

### Latest tech information

- `@better-auth/expo` gère le social sign-in via `expo-web-browser` `openAuthSessionAsync` + capture du `scheme`. Pas besoin de `expo-auth-session` si on reste server-mediated.
- iOS : `ASWebAuthenticationSession` (sous `openAuthSessionAsync`) partage les cookies Safari → SSO Google natif possible. Android : Custom Tabs.

### Project Structure Notes

- **Ajouts** : `src/components/shared/google-sign-in-button.tsx` (+ `.test.tsx`, éventuellement `.stories.tsx`), clés i18n `auth.google.*`/`auth.errors.oauth*`, mock `expo-web-browser`.
- **Modifs** : `src/app/(auth)/login.tsx` + `signup.tsx` (brancher le bouton), `src/app/oauth-callback.tsx` (placeholder debug → transition/loader + validation params), `src/lib/auth/client.ts` (si plugin client requis), `locales/{fr,en}.json`.
- Aucune migration DB. Serveur : **vérification** config Google (pas de nouveau code).

### Frontière de story

- **Inclus** : bouton Google sur login/signup, `signIn.social('google')` server-mediated, capture deep-link + persistance session, redirection `adventures`, gestion cancel/échec sans état partiel, validation params callback, i18n.
- **Exclu** : Strava → **MOB-2.4** ; logout/suppression → **MOB-2.5** ; flow PKCE natif (`expo-auth-session`) sauf si Option B retenue ; toute logique d'import GPX Strava (epic MOB-3).

### Testing standards

- RNTL : bouton appelle `signIn.social({ provider:'google' })` (mocké) ; succès → `router.replace('/adventures')` ; `cancel`/throw → `<ErrorBanner />` + bouton réactivé + `signOut`/pas de session. Mock `@better-auth/expo` + `expo-web-browser`.
- Validation manuelle device : flow complet + persistance + annulation propre.
- `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-2.3] — AC d'origine (l.537-560)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Authentication & Security] — OAuth Google scheme `ridenrest://oauth-google`, `@better-auth/expo` (l.360-380)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Routing & deep links / Loading states] — deep link callback `oauth-callback`, ErrorBanner (l.650-660, 690-705)
- [Source: _bmad-output/implementation-artifacts/2-2-google-oauth-sign-in.md] — `socialProviders.google`, redirect URI `{BETTER_AUTH_URL}/api/auth/callback/google`, `signIn.social`
- [Source: _bmad-output/implementation-artifacts/2-3-strava-oauth-connection.md#CRITICAL Architecture Distinction] — Google (sign-in) ≠ Strava (linking)
- [Source: _bmad-output/implementation-artifacts/MOB-2-1-better-auth-client-secure-store-session.md] — client expo, trustedOrigins, secure-store, guard
- [Source: _bmad-output/implementation-artifacts/MOB-1-4-cross-config-i18n-tests-ci-deeplink-scheme.md] — deep link vérifié runtime, validation params déférée ici

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.3 (ready-for-dev) — Google OAuth sign-in server-mediated via `@better-auth/expo` (`signIn.social`), capture deep-link `ridenrest://`, persistance, gestion cancel/échec. Backend `socialProviders.google` réutilisé. | bmad-create-story |
