---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.4 : Authentification Strava OAuth (deep link)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur cycliste**,
I want **connecter mon compte Strava**,
So that **je pourrai importer mes activités GPX comme segments d'aventure**.

> **Dépend de MOB-2.1** (client `@better-auth/expo`, `expo-web-browser`, scheme, `trustedOrigins`) et **MOB-2.3** (pattern OAuth deep-link). ⚠️ **Strava ≠ Google** : Strava est de l'**account-linking** (utilisateur **déjà connecté** qui lie une intégration), PAS un sign-in. Le provider `genericOAuth` Strava est **déjà configuré côté serveur** (story web 2.3). L'usage réel (import d'activités) arrive en **MOB-3.4** — ici on ne livre **que** la connexion/déconnexion + l'état UI.

## Acceptance Criteria

1. **Given** l'écran de connexion ou les paramètres
   **When** je tape « Connecter Strava »
   **Then** le flow OAuth Strava s'ouvre
   **And** après autorisation, le callback ramène l'utilisateur dans l'app (FR-003)

2. **Given** un retour de callback Strava réussi
   **When** le token Strava est reçu
   **Then** la connexion Strava est enregistrée côté backend (inchangé — `account` provider `strava` + `profiles.strava_athlete_id`)
   **And** l'état « Strava connecté » est visible dans l'UI

3. **Given** un flow Strava annulé/échoué
   **When** l'utilisateur revient dans l'app
   **Then** un message d'erreur clair est affiché et l'état Strava reste « non connecté »

## Tasks / Subtasks

- [x] **T1 — Serveur : redirect URI Strava + (rappel) genericOAuth déjà en place** (AC: 1, 2) **[MANUEL — Guillaume + vérif]**
  - [x] **Vérifié** `apps/web/src/lib/auth/auth.ts` : provider `genericOAuth` `strava` **déjà** configuré (story web 2.3) — `providerId: 'strava'`, `authorizationUrl`, `tokenUrl`, scopes `read,read_all`, `databaseHooks.account.create.after` qui peuple `profiles.stravaAthleteId`. Non dupliqué. ⚠️ Scopes réels = `['read,read_all']` (pas `read,activity:read` comme écrit dans la story) — c'est l'existant prod 2.3, non modifié.
  - [x] **Strava API settings** : le redirect Strava va vers `{baseURL}/api/auth/oauth2/callback/strava` (serveur Better Auth), PAS `ridenrest://`. Le « Authorization Callback Domain » du serveur **prod** est **déjà** déclaré chez Strava (web 2.3 done, en prod). 🔶 **Reste manuel pour T7 en dev** : Strava n'accepte qu'un domaine (pas de scheme custom ni `localhost`) → pour tester sur device, pointer `EXPO_PUBLIC_BETTER_AUTH_URL` vers le domaine serveur prod **ou** un tunnel dont le domaine est ajouté chez Strava.
  - [x] Confirmé `trustedOrigins: ['ridenrest://', 'ridenrest://*']` (MOB-2.1, `auth.ts` l.27) pour la redirection finale serveur → app

- [x] **T2 — Client : plugin genericOAuth + déclenchement linking** (AC: 1, 2)
  - [x] `src/lib/auth/client.ts` : plugin `genericOAuthClient()` **déjà** présent au tableau `plugins` (ajouté en MOB-2.1, l.32) → active `authClient.oauth2.link()`
  - [x] Handler « Connecter Strava » : **lier** (pas sign-in) → `authClient.oauth2.link({ providerId: 'strava', callbackURL: 'ridenrest://oauth-callback' })` dans `hooks/use-strava-connection.ts`. Méthode confirmée = `oauth2.link` (better-auth 1.5.5, parité web `strava-connection-card.tsx`).
  - [x] ⚠️ **CORRECTIF 1 (vérif device)** : `@better-auth/expo` 1.5.5 n'ouvre le navigateur d'auth QUE pour `/sign-in*` et `/link-social` (`client.js:250`) — **PAS** pour `/oauth2/link` (genericOAuth). `oauth2.link()` renvoyait donc l'URL d'autorisation **sans ouvrir de browser** → « annulée » instantanée. **Fix** : le hook récupère `res.data.url` et ouvre le navigateur (cf. correctif 2).
  - [x] ⚠️ **CORRECTIF 2 (vérif device — `state_mismatch`)** : ouvrir l'URL Strava **directement** échouait au callback (`CODE: state_mismatch`) car le cookie `oauth_state` posé par `oauth2.link` vit dans le jar **fetch RN**, pas dans le **navigateur**. **Fix** : on ouvre le **proxy `{baseURL}/api/auth/expo-authorization-proxy?authorizationURL=…&oauthState=…`** (endpoint du plugin `expo()` serveur), qui réinjecte `oauth_state` comme cookie navigateur avant de rediriger vers Strava. `oauthState` lu depuis `authClient.getCookie()` (regex `*oauth_state`). C'est exactement le mécanisme que le plugin applique au social-login, répliqué pour le linking genericOAuth.

- [x] **T3 — UI état Strava (settings)** (AC: 2, 3)
  - [x] Créé `src/app/(app)/settings.tsx` (route protégée par le guard `(app)`) + carte `components/shared/strava-connection-card.tsx`. Lien d'accès ajouté sur le placeholder `adventures/index.tsx` (AC1).
  - [x] Lecture de l'état via `authClient.listAccounts()` (endpoint Better Auth core, pas de nouveau code API) → présence d'un provider `strava` = connecté. Query TanStack `['strava-connection']`. États : « Compte connecté » (bouton Déconnecter) / « Non connecté » (bouton Connecter). **Déviation documentée** : l'endpoint NestJS `GET /api/profile` n'expose **pas** `stravaConnected` ; `listAccounts()` est la source de vérité client (cf. Dev Notes, conforme « pas de nouveau code serveur »).
  - [x] **Déconnexion** : `authClient.unlinkAccount({ providerId: 'strava' })` → supprime la ligne `account` → invalide la query → UI « non connecté ». **Parité web complète** via nouveau hook serveur `databaseHooks.account.delete.before` (auth.ts) : deauthorize token Strava (best-effort) + `stravaAthleteId = null` (décision Guillaume — voir §Déviations).
  - [x] Skeleton pendant le chargement de l'état (`isLoading`)

- [x] **T4 — Gestion annulation/échec** (AC: 3)
  - [x] Annulation (`oauth2.link` résout sans liaison) → `StravaLinkCancelledError` → `<ErrorBanner />` i18n, l'état **reste** « non connecté », aucune liaison partielle. Rejet réseau → message `connectFailed`. Échec disconnect → message `disconnectFailed` + reste « connecté ».
  - [x] Vérité de l'état **re-lue côté serveur** (`listAccounts`) après chaque `oauth2.link` — jamais sur la valeur de retour de `link` (qui résout aussi sur cancel). Aucun marquage « connecté » sans compte réellement lié.

- [x] **T5 — Attribution Strava (préparation)** (AC: 2)
  - [x] La carte n'affiche **aucune donnée Strava** (ni nom d'athlète, ni avatar) — seulement l'état connecté/non connecté. Le badge « Powered by Strava » (FR-063) est donc **déféré à MOB-3.4** (écran d'import affichant des routes/données Strava), conformément à la frontière de story.

- [x] **T6 — i18n + tests** (AC: tous)
  - [x] Clés `auth.strava.*` (title/description/connected/notConnected/connect/connecting/disconnect/disconnecting + `errors.*`) et `settings.*` ajoutées en `fr.json` + `en.json`
  - [x] Tests `strava-connection-card.test.tsx` (RNTL, 8 cas) : skeleton chargement, état connecté/non connecté, connect → `oauth2.link` + UI connectée, annulation → ErrorBanner + reste non connecté, échec réseau, disconnect → `unlinkAccount` + UI non connectée, échec disconnect. Mock `@/lib/auth/client` (wrapper, cf. AGENTS.md) + rendu dans un vrai `QueryClientProvider` (exerce aussi le hook).
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` **verts** (58 tests / 11 suites, tsc 0, lint 0)

- [x] **T7 — Validation manuelle device** (AC: tous) — ✅ **VALIDÉE par Guillaume (dev build iOS, compte Strava réel)**
  - [x] Paramètres → « Connecter Strava » → consentement Strava → retour app → **« Compte connecté »** ✓ (après les 2 correctifs : ouverture browser + proxy oauth_state).
  - [x] « Déconnecter » → UI « Non connecté » ✓. **Parité cross-platform confirmée en réel** : déconnexion Strava côté **mobile** → reflétée côté **web**, ET déconnexion côté **web** → reflétée côté **mobile** (hook serveur `account.delete.before` : suppression ligne `account` + reset `stravaAthleteId`). Annulation → « Connexion Strava annulée » + reste non connecté (vu lors des essais).
  - 🔶 Prérequis T1 confirmé en pratique : « Authorization Callback Domain » Strava = `localhost` (dev). Pour la prod, ajouter le domaine serveur prod.

## Dev Notes

### 🚨 Strava = account-LINKING, pas sign-in (source : story web 2.3, done)

| | Strava (cette story) |
|---|---|
| But | **Lier** une intégration à un user **déjà connecté** (jamais s'authentifier avec Strava) |
| Méthode Better Auth | `oauth2.link` / `linkSocial` via `genericOAuth` (PAS `signIn.social`) |
| Crée un user ? | **Non** — rattache à l'utilisateur courant |
| Email ? | Strava **ne fournit pas** d'email |
| Où | Écran **Paramètres** (utilisateur connecté), pas l'écran login |

→ Ne **pas** copier le bouton Google sur l'écran login pour Strava. Strava vit dans `(app)/settings`. L'AC1 dit « écran de connexion ou les paramètres » → **Paramètres** est le bon emplacement (l'utilisateur est déjà connecté pour lier).

### Flow OAuth Strava (server-mediated, cohérent MOB-2.3)

```
Paramètres → authClient.oauth2.link({ providerId:'strava', callbackURL:'ridenrest://oauth-callback' })
  → expo-web-browser → {baseURL}/api/auth/oauth2/... → Strava (consentement)
  → Strava redirige → {baseURL}/api/auth/oauth2/callback/strava  (serveur : stocke accessToken/refreshToken dans `account`, peuple strava_athlete_id)
  → serveur redirige → ridenrest://oauth-callback  (trustedOrigins)
  → expo-web-browser capture → query "me" invalidée → UI « Strava connecté »
```

> ⚠️ Le « Authorization Callback Domain » à déclarer chez **Strava** = domaine du **serveur Better Auth**, **pas** `ridenrest://`. Strava n'accepte pas les schemes custom comme callback domain. L'AC « redirect URI custom `ridenrest://oauth-strava` » de l'epic reflète une piste PKCE native ; **avec le backend genericOAuth existant**, le redirect Strava reste serveur-side et `ridenrest://oauth-callback` n'est que la redirection finale. Documenter clairement (évite une config Strava erronée).

### Contraintes Strava (source : story web 2.3 — impacte MOB-3.4)

- Token Strava : access valide **6h** (`expires_in: 21600`), refresh stocké dans `account.refreshToken` — le **refresh est géré par NestJS** (story 3.x / MOB-3.4), pas le mobile.
- Rate limits : 100 req/15min, 1000/jour (enforced NestJS).
- `GET /api/v3/athlete` **ne renvoie pas** d'email → placeholder côté serveur (déjà géré story 2.3).
- ToS : import de **routes**, pas d'activités arbitraires (détail MOB-3.4). Ici on ne fait **que** la connexion.

### Lecture de l'état connecté

- Réutiliser l'endpoint NestJS « me »/profil qui expose `stravaAthleteId`/`stravaConnected` (story web 2.3 affiche l'état via Server Component lisant `profiles.strava_athlete_id`). Sur mobile, query TanStack via `apiFetch` (MOB-2.1) — query key cohérente (ex. `['me']` ou `['profile']`). Vérifier l'endpoint réel exposé par l'API ; sinon `account` listing via Better Auth (`authClient.listAccounts()`).
- Disconnect : parité avec web (suppression ligne `account` strava + reset `strava_athlete_id`). Utiliser `authClient.unlinkAccount({ providerId: 'strava' })` si disponible, sinon l'action serveur équivalente.

### Backend déjà fait — NE PAS recréer (story web 2.3, done)

`genericOAuth` strava dans `auth.ts` (providerId, urls, scopes, `databaseHooks.account.create.after` → `profiles.strava_athlete_id`). Schéma DB : `account` (accessToken/refreshToken/providerId) + `profiles.strava_athlete_id` (unique) **déjà** en place. → Mobile = client + UI uniquement.

### Previous story intelligence

- **MOB-2.3** : pattern OAuth deep-link server-mediated établi (`expo-web-browser`, capture `ridenrest://oauth-callback`, gestion cancel/échec, validation params). **Réutiliser** la même mécanique ; seule la **méthode** change (`oauth2.link` au lieu de `signIn.social`) et l'**emplacement** (settings au lieu de login).
- **MOB-2.1** : guard `(app)` → `settings` est une route protégée (utilisateur connecté garanti, prérequis du linking). `apiFetch` pour lire l'état.
- **MOB-1.3** : `<Button>`, `<Card>`, `<Skeleton>`.

### Latest tech information

- `genericOAuthClient()` (`better-auth/client/plugins`) expose le linking pour les providers custom. Vérifier la méthode exacte (`oauth2.link` / `linkSocial({ provider })`) dans la version `better-auth` installée — l'API a évolué entre versions.
- `@better-auth/expo` route le callback via le scheme ; pas de parsing manuel si le linking est awaitable.

### Project Structure Notes

- **Ajouts** : `src/app/(app)/settings.tsx` (si absent), `src/components/shared/strava-connection-card.tsx` (+ `.test.tsx`), hook `src/hooks/use-strava-connection.ts` (query état + mutations connect/disconnect), clés i18n `auth.strava.*`, badge « Powered by Strava » si données affichées.
- **Modifs** : `src/lib/auth/client.ts` (`genericOAuthClient()`), `locales/{fr,en}.json`, éventuellement `oauth-callback.tsx` (transition partagée MOB-2.3).
- Aucune migration DB. Serveur : **vérification** config Strava (pas de nouveau code).

### Frontière de story

- **Inclus** : connexion/déconnexion Strava (linking) depuis Paramètres, état UI connecté/non connecté, gestion cancel/échec, lecture état via API, badge attribution si données affichées, i18n.
- **Exclu** : **import d'activités/routes Strava → MOB-3.4** (et son badge « Powered by Strava » obligatoire sur les données importées) ; refresh token (NestJS) ; logout app / suppression compte → **MOB-2.5** ; flow PKCE natif sauf décision contraire.

### Testing standards

- RNTL : carte état connecté/non connecté ; connect → `oauth2.link({ providerId:'strava' })` (mocké) ; disconnect → unlink + invalidation query → UI « non connecté » ; cancel/throw → `<ErrorBanner />` + reste non connecté. Mock `@better-auth/expo`, `expo-web-browser`, `apiFetch`.
- Validation manuelle : flow complet + vérif DB (`account` strava + `strava_athlete_id`) + disconnect + annulation.
- `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-2.4] — AC d'origine (l.562-587)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Authentication & Security] — OAuth Strava `ridenrest://oauth-strava`, whitelist Strava (l.360-380)
- [Source: _bmad-output/implementation-artifacts/2-3-strava-oauth-connection.md] — `genericOAuth` strava, account-linking ≠ sign-in, `account`/`strava_athlete_id`, connect/disconnect, contraintes token/rate-limit
- [Source: _bmad-output/implementation-artifacts/MOB-2-3-google-oauth-deeplink.md] — pattern OAuth deep-link server-mediated, gestion cancel/échec, validation params
- [Source: _bmad-output/implementation-artifacts/MOB-2-1-better-auth-client-secure-store-session.md] — client expo, guard (app), apiFetch, trustedOrigins

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- Tests carte au vert après 2 correctifs RNTL : (1) `render()` doit être **awaité** (RNTL v14 + React 19, comme tous les tests existants) ; (2) le `<Skeleton>` est masqué a11y (décoratif) → `getByTestId(..., { includeHiddenElements: true })`.
- Typecheck : l'erreur initiale `'/(app)/settings' not assignable` venait du cache **local gitignoré** `.expo/types/router.d.ts` (typed routes périmé). En CI le `typecheck` tourne **avant** le `build` → pas de cache → `Href` permissif, donc OK. Cache local régénéré (route `settings` ajoutée à l'identique du générateur Expo).

### Completion Notes List

- ✅ **Strava = account-linking** (pas sign-in) depuis Paramètres. Connect `authClient.oauth2.link({ providerId:'strava', callbackURL:'ridenrest://oauth-callback' })`, disconnect `authClient.unlinkAccount({ providerId:'strava' })`, état lu via `authClient.listAccounts()` (présence provider `strava`).
- ✅ **Hook `useStravaConnection`** (`src/hooks/use-strava-connection.ts`) : query `['strava-connection']` + mutations connect/disconnect avec invalidation. La vérité de l'état est **re-lue côté serveur** après chaque `oauth2.link` (qui résout aussi sur annulation) → `StravaLinkCancelledError` distingue annulé d'échec réseau. Aucun état partiel (AC3).
- ✅ **Carte `StravaConnectionCard`** : possède son propre `<Card>` (pas de double-wrap, cf. project-context), skeleton pendant `isLoading`, `<ErrorBanner />` in-page (jamais `Alert.alert`).
- ✅ **Écran `(app)/settings.tsx`** + lien d'accès depuis le placeholder `adventures` (AC1 — pas encore de header/onglets, arrive en MOB-3.x).
- ✅ **Parité disconnect web↔mobile** via **nouveau hook serveur** (décision Guillaume) — voir §Déviations.
- ✅ i18n FR/EN (`auth.strava.*`, `settings.*`). Gate verte : 58 tests / 11 suites, tsc 0, lint 0.
- ✅ **Vérification visuelle simulateur (skill `run`)** : reload Metro cache vidé → bouton « Paramètres » visible sur adventures → écran Paramètres OK → carte Strava lit l'état **réel** via le backend live = « Compte connecté » + bouton « Déconnecter » (Guillaume déjà lié). Disconnect device OK (état → « Non connecté »).
- 🐛 **BUG bloquant trouvé en device + corrigé** : tap « Connecter Strava » → « annulée » instantanée, **sans ouverture du navigateur Strava**. Cause : `@better-auth/expo` 1.5.5 n'auto-ouvre le browser que pour `/sign-in*` + `/link-social`, pas `/oauth2/link`. Fix : ouverture manuelle via `WebBrowser.openAuthSessionAsync` sur l'URL renvoyée par `oauth2.link`. 2 tests ajoutés (browser ouvert sur l'URL ; retour success sans compte lié → annulée). 60 tests verts.
- ✅ **Bug safe-area** détecté et corrigé (titre Paramètres chevauchait la status bar) : `SafeAreaProvider` au root `_layout.tsx` + inset haut dans `settings.tsx`.
- ✅ **T7 validée par Guillaume sur device** : connexion Strava complète (consentement → « Compte connecté »), déconnexion, et **parité cross-platform réelle** (déco Strava mobile↔web dans les deux sens) — preuve en conditions réelles du hook serveur `account.delete.before`. Callback domain Strava = `localhost` en dev.
- ⏭️ Badge « Powered by Strava » **déféré MOB-3.4** (aucune donnée Strava affichée ici).

#### Déviations (Doc Sync Rule)

1. **[Serveur] Nouveau `databaseHooks.account.delete.before` dans `apps/web/src/lib/auth/auth.ts`** — la story prévoyait « pas de nouveau code serveur ». Mais `unlinkAccount` (core) supprime seulement la ligne `account` ; il ne révoque PAS le token Strava et ne remet PAS `profiles.stravaAthleteId` à `null` (ce que fait la Server Action web `disconnectStrava`). Sans ce hook, un disconnect mobile laisserait le web afficher encore « connecté ». **Décision Guillaume (AskUserQuestion) : option « hook serveur centralisé »** → `unlinkAccount` (web ET mobile) atteint désormais le même état final (token révoqué + `stravaAthleteId=null`). Additif, best-effort, idempotent.
2. **[Lecture d'état] `listAccounts()` au lieu d'un endpoint NestJS `me`** — `GET /api/profile` n'expose pas `stravaConnected`/`stravaAthleteId`. Conforme à « pas de nouveau code API » : la présence de la ligne `account` (via Better Auth core) est la source de vérité côté mobile.
3. **[Doc] Scopes Strava** = `['read,read_all']` dans l'existant prod 2.3 (la story écrivait `read,activity:read`). Non modifié — c'est le backend prod en place.

### File List

**Mobile (apps/mobile) — ajouts :**
- `src/hooks/use-strava-connection.ts` — query état (`listAccounts`) + mutations connect (`oauth2.link` → ouverture browser manuelle `expo-web-browser`) / disconnect (`unlinkAccount`)
- `src/components/shared/strava-connection-card.tsx` — carte UI Paramètres
- `src/components/shared/strava-connection-card.test.tsx` — 8 tests RNTL
- `src/app/(app)/settings.tsx` — écran Paramètres

**Mobile — modifs :**
- `src/app/_layout.tsx` — `SafeAreaProvider` au root (insets pour écrans à header custom)
- `src/app/(app)/adventures/index.tsx` — lien « Paramètres » (point d'entrée Strava, AC1)
- `src/app/(app)/settings.tsx` — inset haut via `useSafeAreaInsets` (fix chevauchement status bar)
- `src/lib/i18n/locales/fr.json` + `en.json` — clés `auth.strava.*`, `settings.*`, `auth.adventures.settingsLink`
- `.expo/types/router.d.ts` — cache typed-routes local régénéré (route `settings`) — gitignoré

**Web (apps/web) — modifs :**
- `src/lib/auth/auth.ts` — `databaseHooks.account.delete.before` (parité disconnect Strava : deauthorize + reset `stravaAthleteId`)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.4 (ready-for-dev) — Strava account-linking (`genericOAuth`/`oauth2.link`) depuis Paramètres, état connecté/non connecté, connect/disconnect, gestion cancel/échec. Backend genericOAuth réutilisé ; import d'activités déféré MOB-3.4. | bmad-create-story |
| 2026-06-12 | 1.0 | Implémentation T1-T6 : hook `useStravaConnection` (`listAccounts`/`oauth2.link`/`unlinkAccount`), carte `StravaConnectionCard`, écran `(app)/settings`, lien depuis adventures, i18n FR/EN. Hook serveur `account.delete.before` pour parité disconnect web↔mobile (décision Guillaume). Gate verte (58 tests, tsc, lint). T7 (device) en attente. Statut → review. | claude-opus-4-8 |
| 2026-06-12 | 1.1 | Vérif visuelle simulateur (skill `run`, Metro cache vidé) : bouton Paramètres + écran + carte Strava « Compte connecté » lue sur backend live. Fix safe-area (titre Paramètres chevauchait la status bar) → `SafeAreaProvider` root + inset `settings.tsx`. 58 tests OK. | claude-opus-4-8 |
| 2026-06-12 | 1.2 | **Fix bloquant device** : `@better-auth/expo` 1.5.5 n'ouvre pas le navigateur pour `/oauth2/link` (seulement `/sign-in*`+`/link-social`) → « annulée » instantanée sans consentement Strava. Correctif : ouverture manuelle `WebBrowser.openAuthSessionAsync(url)` sur l'URL renvoyée par `oauth2.link`. +2 tests (60 verts), tsc/lint OK. | claude-opus-4-8 |
| 2026-06-12 | 1.3 | **Fix `state_mismatch` + T7 validée** : ouverture via le proxy `expo-authorization-proxy` (oauth_state réinjecté côté navigateur). Guillaume valide sur device : connexion Strava OK, déconnexion + **parité cross-platform mobile↔web** confirmée (hook serveur prouvé). T7 ✅. tsc/lint OK, 60 tests. | claude-opus-4-8 |

## Review Findings

**Code review adversarial (3 couches : Blind Hunter · Edge Case Hunter · Acceptance Auditor) — 2026-06-12.**
Périmètre : working tree (fichiers non commités = empreinte MOB-2.4). Bilan : **0 decision-needed · 1 patch · 6 defer · 4 dismissed**.

**Acceptance Auditor : 3/3 AC PASS** — AC1 (entrée Paramètres + `oauth2.link` + ouverture proxy), AC2 (backend réutilisé + état via `listAccounts`), AC3 (cancel/échec → `<ErrorBanner>` i18n + état jamais « connecté » sans compte réel). Aucune violation de spec ; les 2 déviations documentées (hook serveur `account.delete.before`, `listAccounts` vs endpoint NestJS) sont fidèlement reflétées dans le code.

### Patch (à traiter)

- [x] [Review][Patch] Deauthorize Strava sans timeout dans le hook **bloquant** `account.delete.before` — `await fetch(...deauthorize)` sans `AbortSignal.timeout` : un Strava lent/indisponible peut faire traîner la requête `unlinkAccount` mobile (chemin interactif « Déconnecter ») jusqu'au timeout socket OS. **✅ Corrigé** : `signal: AbortSignal.timeout(5000)` ajouté sur les **deux** hooks (`account.delete.before` ET `user.delete.before` voisin, cohérence). tsc auth.ts = 0 erreur. [apps/web/src/lib/auth/auth.ts:186, 145]

### Defer (réel mais non bloquant)

- [x] [Review][Defer] Reset `stravaAthleteId` exécuté en `before` (pas `after`) — si la suppression de la ligne `account` échoue/rollback après le hook, `profiles.stravaAthleteId=null` alors que la ligne `account` subsiste (état incohérent). Le `before` est nécessaire pour le deauthorize (token requis avant suppression) ; risque faible, T7-validé. [apps/web/src/lib/auth/auth.ts:196] — deferred
- [x] [Review][Defer] Réponse deauthorize non vérifiée — `fetch` ne rejette pas sur 401/403 ; un token expiré donne une révocation silencieusement non effective alors que le commentaire annonce « token révoqué ». Best-effort par design. [apps/web/src/lib/auth/auth.ts:186-190] — deferred
- [x] [Review][Defer] `unlinkAccount({ providerId:'strava' })` sans `accountId` + `.some()` — collapse plusieurs lignes `strava` éventuelles ; en cas de doublon (anomalie data), une ligne peut subsister → « connecté » résiduel au refetch. Requiert une incohérence DB ; `stravaAthleteId` unique rend le cas improbable. [apps/mobile/src/hooks/use-strava-connection.ts:58,141] — deferred
- [x] [Review][Defer] `WebBrowser` types `dismiss`/`locked` collapsés en « annulé » — `result.type !== 'success'` regroupe `dismiss`, `cancel` ET `locked` (Android, session concurrente) → bannière « annulé » potentiellement trompeuse. UX mineure. [apps/mobile/src/hooks/use-strava-connection.ts:127] — deferred
- [x] [Review][Defer] Cookie `oauth_state` absent → mal classé « annulé » — si `getCookie()` est vide/le regex ne matche pas, le proxy s'ouvre sans `oauthState` → `state_mismatch` → success-sans-compte → `StravaLinkCancelledError` → message « annulé » au lieu de « échec ». Cookie posé juste avant par `oauth2.link` → rare en pratique. [apps/mobile/src/hooks/use-strava-connection.ts:114-118] — deferred
- [x] [Review][Defer] Test positif `connect` ne fige pas la garde de vérification — `listAccounts` mocké renvoie « connecté » sur tous les appels post-initiaux : le test passerait même si la re-lecture serveur post-link (`fetchStravaConnected`) était supprimée (le refetch `onSuccess` flippe l'UI). La garde anti-état-partiel n'est asserté que par les cas négatifs (annulation/no-account). [apps/mobile/src/components/shared/strava-connection-card.test.tsx] — deferred

### Dismissed (faux positifs / hors-sujet)

- ❌ « Double-tap connect/disconnect non gardé » (Blind + Edge) — **FAUX POSITIF** : `<Button>` calcule `isDisabled = disabled || loading` et passe `disabled={isDisabled}` au `Pressable` ([button.tsx:81,91]) → le bouton est bien désactivé pendant `isConnecting`/`isDisconnecting`.
- ❌ « setState après unmount » (Edge) — React 19 (cf. AGENTS) : un setState sur composant démonté est un no-op silencieux, sans warning. Aucune conséquence.
- ❌ « Double-encodage `oauth_state` » (Blind) — spéculatif ; le flow réel (T7 device, compte Strava réel) valide l'aller-retour `state` de bout en bout : aucune double-encodage avec les valeurs réelles.
- ❌ « Regex `oauth_state` trop permissif » (Blind + Edge) — noms de cookies contrôlés par better-auth, jar unique ; collision théorique uniquement.
