---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.3 : Authentification Google OAuth (deep link)

Status: done

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

- [x] **T1 — Serveur : redirect URI Google + (rappel) provider déjà en place** (AC: 1) **[vérifié — déjà en place via prod web]**
  - [x] **Vérifier** `apps/web/src/lib/auth/auth.ts` : `socialProviders.google` est **déjà** configuré (story web 2.2) — confirmé `apps/web/src/lib/auth/auth.ts:88-89` (`clientId`/`clientSecret` via env serveur). **Non dupliqué.**
  - [x] **Google Cloud Console** : redirect URI serveur `{baseURL}/api/auth/callback/google` **déjà whitelisté** — le flow server-mediated réutilise **le même endpoint serveur** que le sign-in Google web, fonctionnel en prod (`baseURL = https://ridenrest.app`, `auth.ts:22`). Aucun redirect URI mobile/`ridenrest://` requis (le retour app est géré par `trustedOrigins`, pas par Google). ⚠️ Nuance dev local : pour tester contre `http://localhost:3011`, ce redirect doit aussi être whitelisté (probablement déjà fait côté web) ; tester contre la prod le contourne.
  - [x] Confirmer que `trustedOrigins` inclut `ridenrest://` (fait MOB-2.1) — confirmé `apps/web/src/lib/auth/auth.ts:27` (`['ridenrest://', 'ridenrest://*']`) — autorise la redirection finale serveur → app

- [x] **T2 — Client : bouton « Continuer avec Google »** (AC: 1, 2)
  - [x] `src/lib/auth/client.ts` : social sign-in supporté **sans plugin client supplémentaire** — `signIn.social` suffit (le plugin `expoClient` gère le deep-link). **Aucune modif** de `client.ts` requise (vérifié au typecheck).
  - [x] Créé `src/components/shared/google-sign-in-button.tsx` (réutilisable login + signup) — primitif `<Button>` MOB-1.3, marque Google décorative (pas de dép SVG native → pas de prebuild), label i18n `auth.google.continue`
  - [x] Handler : `authClient.signIn.social({ provider: 'google', callbackURL: 'ridenrest://oauth-callback' })` — `@better-auth/expo` ouvre `openAuthSessionAsync` et capture le retour `ridenrest://`
  - [x] Bouton branché dans le slot OAuth de `(auth)/login.tsx` (slot désactivé MOB-2.2 remplacé) **et** `signup.tsx` (slot + séparateur ajoutés)

- [x] **T3 — Traitement du callback + redirection** (AC: 2, 3)
  - [x] **Cas nominal `@better-auth/expo`** : `signIn.social()` awaité ; succès détecté via le **cookie de session persisté** (`authClient.getCookie()`) car `signIn.social` RÉSOUT aussi sur annulation → `router.replace('/(app)/adventures')`
  - [x] **Route `oauth-callback.tsx`** : placeholder debug MOB-1.4 → **écran de transition** (filet de sécurité) — `JSON.stringify(params)` retiré, remplacé par `<ActivityIndicator />` + redirection selon session
  - [x] **Annulation/échec** (AC3) : pas de cookie → `oauthCancelled` ; `signIn.social` throw → `oauthFailed` ; `<ErrorBanner />` i18n **rendu par `GoogleSignInButton`** (pas par `oauth-callback`), bouton **réactivé** (`setPending(false)` sur les branches annulation/échec uniquement — le succès navigue sans reset), **aucune** session partielle (pas de `signOut` : aucune session n'est créée à l'annulation, donc rien à révoquer). Params deep-link **validés** (`error`/`access_denied`, tableaux) dans `oauth-callback.tsx` — écran de **transition** (`ActivityIndicator` + redirection selon session, sans ErrorBanner). (validation déférée MOB-1.4 traitée)

- [x] **T4 — i18n + tests** (AC: tous)
  - [x] Clés `auth.google.continue`, `auth.errors.oauthCancelled`, `auth.errors.oauthFailed` (`fr.json` + `en.json`) ; clés mortes `auth.login.googleCta`/`googleSoon` retirées
  - [x] Mock `expo-web-browser` déjà présent (`__mocks__/`) ; tests mockent le wrapper `@/lib/auth/client` (`signIn.social`, `getCookie`) — cf. AGENTS.md (pas `@better-auth/expo` direct)
  - [x] Tests : bouton appelle `signIn.social({ provider:'google', ... })` ; succès → redirection ; cancel/échec → ErrorBanner + bouton réactivé + pas de session (6 tests bouton) ; transition callback (5 tests)
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` **verts** : 50 tests (10 suites), typecheck clean, lint exit 0

- [x] **T5 — Validation manuelle device** (AC: 1, 2, 3) **[validé device — Guillaume, 2026-06-12, dev build iOS sim iPhone 17 Pro]**
  - [x] Tap « Continuer avec Google » → navigateur d'auth → consentement Google → retour app → session persistée (kill/relaunch → arrive direct sur `adventures`) → ✅ validé sur dev build `expo run:ios` (iPhone 17 Pro, serveur Better Auth `localhost:3011`)
  - [x] Annuler le consentement → retour app → message « Connexion Google annulée. », bouton ré-utilisable, toujours sur `login`, aucune session partielle → ✅ validé

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

- RNTL : bouton appelle `signIn.social({ provider:'google' })` (mocké) ; succès → `router.replace('/adventures')` ; `cancel`/throw → `<ErrorBanner />` (dans `GoogleSignInButton`) + bouton réactivé + **aucune** session (pas de `signOut` : rien n'est créé à l'annulation). Mock `@better-auth/expo` + `expo-web-browser`.
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

claude-opus-4-8 (BMad dev-story workflow)

### Debug Log References

- Gate mobile : `pnpm --filter @ridenrest/mobile test` → **50 tests, 10 suites, 0 échec** (39 baseline + 6 bouton Google + 5 callback transition).
- `pnpm --filter @ridenrest/mobile typecheck` → clean (`tsc --noEmit`, 0 erreur).
- `pnpm --filter @ridenrest/mobile lint` → exit 0, 0 warning.
- TDD : tests RED vérifiés avant impl pour `GoogleSignInButton` (module absent) et `oauth-callback` (ancien placeholder ne redirige pas), puis GREEN.

### Completion Notes List

- **Architecture server-mediated retenue** (cf. Dev Notes) : `signIn.social` server-mediated, **aucun** identifiant Google exposé au client, **aucune** modif de `src/lib/auth/client.ts` nécessaire (`signIn.social` suffit, pas de plugin client Google). Backend `socialProviders.google` + `trustedOrigins` réutilisés tels quels (vérifiés présents : `apps/web/src/lib/auth/auth.ts:88-89` et `:27`).
- **Détection succès/annulation (AC3, point critique)** : `signIn.social()` **résout aussi sur annulation** (`openAuthSessionAsync` renvoie `cancel`/`dismiss` → le plugin `onSuccess` fait `return` sans throw ni session). Le seul signal fiable est le **cookie de session persisté** : `authClient.getCookie()` (local secure-store, déterministe, sans round-trip réseau). Sans cookie ⇒ annulé/échoué → on ne route JAMAIS sans session confirmée. Bouton réactivé via `finally`.
- **`oauth-callback.tsx`** transformé de placeholder debug (`JSON.stringify(params)`) en **écran de transition filet-de-sécurité** : `<ActivityIndicator />` + validation params (`error`/`access_denied`, params en tableau — validation déférée de MOB-1.4 traitée ici) + redirection selon session. En flow nominal, `@better-auth/expo` capte le retour dans `openAuthSessionAsync` (cette route n'est pas montée).
- **Icône Google** : marque « G » décorative via primitives RN (pas de `react-native-svg` → évite une dépendance native + `expo prebuild`). Masquée aux lecteurs d'écran (`accessibilityElementsHidden`), le libellé du bouton porte l'intention.
- **i18n** : clés mortes `auth.login.googleCta`/`googleSoon` (slot désactivé MOB-2.2) retirées, remplacées par `auth.google.continue` partagé login+signup ; ajout `auth.errors.oauthCancelled`/`oauthFailed`.
- **T1 résolu sans action** : le redirect URI Google est **déjà whitelisté** côté serveur (flow server-mediated → même endpoint `{baseURL}/api/auth/callback/google` que le sign-in Google web déjà en prod sur `https://ridenrest.app`). Aucun redirect URI mobile spécifique n'existe (`ridenrest://` géré par `trustedOrigins`).
- **T5 validé device (2026-06-12)** : dev build iOS (`expo run:ios`, iPhone 17 Pro, serveur Better Auth `localhost:3011`). Les 3 scénarios passent — succès (consentement → `adventures`), persistance (kill/relaunch → reste connecté), annulation propre (message + bouton réutilisable, aucune session partielle). Note dev : un Metro figé d'une session précédente affichait `please_restart_the_process` → résolu en relançant `expo start --dev-client --clear`.

### File List

**Ajoutés :**
- `apps/mobile/src/components/shared/google-sign-in-button.tsx`
- `apps/mobile/src/components/shared/google-sign-in-button.test.tsx`
- `apps/mobile/src/__tests__/oauth-callback.test.tsx`

**Modifiés :**
- `apps/mobile/src/app/oauth-callback.tsx` (placeholder debug → écran de transition + validation params)
- `apps/mobile/src/app/(auth)/login.tsx` (slot OAuth désactivé → `<GoogleSignInButton />`)
- `apps/mobile/src/app/(auth)/signup.tsx` (ajout slot OAuth + séparateur + `<GoogleSignInButton />`)
- `apps/mobile/src/lib/i18n/locales/fr.json` (clés `auth.google.*`/`oauth*`, retrait clés mortes)
- `apps/mobile/src/lib/i18n/locales/en.json` (idem)
- `apps/mobile/src/__tests__/login.test.tsx` (mock `signIn.social`/`getCookie` + assertion bouton actif)
- `apps/mobile/src/__tests__/signup.test.tsx` (idem + assertion bouton)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut MOB-2-3)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.3 (ready-for-dev) — Google OAuth sign-in server-mediated via `@better-auth/expo` (`signIn.social`), capture deep-link `ridenrest://`, persistance, gestion cancel/échec. Backend `socialProviders.google` réutilisé. | bmad-create-story |
| 2026-06-12 | 0.2 | Impl T2/T3/T4 — `GoogleSignInButton` réutilisable (`signIn.social` server-mediated, succès via `getCookie()`, cancel/échec sans état partiel), `oauth-callback` transformé en écran de transition + validation params, i18n, bouton branché login+signup. Gate verte (50 tests, typecheck, lint). T1 (Google Cloud Console) + T5 (device) restent manuels (Guillaume). | bmad-dev-story (Amelia) |
| 2026-06-12 | 1.0 | T1 vérifié (redirect URI Google déjà whitelisté via prod web, même endpoint serveur) + T5 validé device (dev build iOS, 3 scénarios OK : succès, persistance, annulation). Toutes ACs satisfaites. Status → review. | bmad-dev-story (Amelia) |

## Review Findings

_Code review adversariale 3 couches (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-06-12. Scope : fichiers non commités MOB-2.3. Acceptance : **0 écart** — AC1/AC2/AC3 satisfaites par le code._

**Patch (à corriger) :**

- [x] [Review][Patch] Dépendance `useEffect` instable quand `error` est un tableau [apps/mobile/src/app/oauth-callback.tsx:23-32] — `useLocalSearchParams` renvoie une nouvelle référence à chaque rendu ; avec `error` dupliqué (`?error=a&error=b`) `errorParam` est un tableau → dep `[errorParam]` référentiellement instable → `router.replace` peut re-déclencher sur re-rendu. Fix sans ambiguïté : dépendre du booléen `hasError` (ou normaliser `errorParam` en primitive) plutôt que du param brut. (blind+edge) — **CORRIGÉ** : `hasError` calculé en amont de l'effet, dep `[hasError]`.
- [x] [Review][Patch] `setPending(false)` rejoué au succès après `router.replace` [apps/mobile/src/components/shared/google-sign-in-button.tsx:51-62] — le `return` du chemin succès ne court-circuite pas le `finally` : `setPending(false)` s'exécute alors que l'écran est remplacé → flash spinner→GoogleMark avant unmount (no-op React 18, cosmétique). Fix : ne pas remettre `pending` au chemin succès (drapeau succès, ou reset uniquement dans cancel/catch). (blind+edge) — **CORRIGÉ** : `finally` retiré ; `setPending(false)` uniquement sur les branches annulation/échec.
- [x] [Review][Patch] Wording doc vs code : `oauth-callback` n'affiche PAS d'`ErrorBanner` et il n'y a aucun `signOut` [ce fichier, T3 l.51 + Testing standards l.139] — l'implémentation est un écran de transition `<ActivityIndicator />` qui redirige (l'`ErrorBanner` vit dans le bouton, et aucun `signOut` n'est requis puisqu'aucune session n'est créée à l'annulation). Corriger T3 et Testing standards pour matcher le design réellement livré (les Completion Notes, elles, sont correctes). (auditor) — **CORRIGÉ** : T3 et Testing standards réalignés.

**Defer (reporté) :**

- [x] [Review][Defer] Race cold-start sur lecture cookie de l'écran filet-de-sécurité [apps/mobile/src/app/oauth-callback.tsx:27] — au cold-start, si l'effet lit `getCookie()` avant l'hydratation du miroir SecureStore du plugin expo, une session valide peut être renvoyée vers `/(auth)/login`. Mitigé : pire cas = rebond vers login (aucun état partiel, AC3 respectée), le guard `(app)/_layout` ré-admet à la session suivante. Écran rarement monté (flow nominal capté par `openAuthSessionAsync`). Reporté — durcissement (polling/`useSession`) optionnel. (blind+edge)
- [x] [Review][Defer] Aucune télémétrie/log sur échec OAuth [apps/mobile/src/components/shared/google-sign-in-button.tsx:56] — `catch {}` nu : message générique correct pour l'UX mais débogage terrain impossible. Cohérent avec le reste du code auth (pas de logger établi). Reporté. (blind)
- [x] [Review][Defer] Clé i18n `auth.login.orContinueWith` réutilisée hors namespace dans `signup.tsx` [apps/mobile/src/app/(auth)/signup.tsx] — smell de nommage (clé `auth.login.*` consommée par signup) ; valeur rendue correctement dans les 2 locales. Envisager `auth.common.orContinueWith`. Reporté — housekeeping. (edge)

**Dismissed (bruit / faux positifs) — 3 :** garde anti double-tap (gérée par `disabled` quand `loading`, test couvre) ; double-annonce a11y (`accessibilityLabel` override les enfants sur Pressable — non-issue vérifié) ; clés i18n manquantes (vérifiées présentes dans `fr.json` ET `en.json`, anciennes `googleCta`/`googleSoon` bien retirées).
