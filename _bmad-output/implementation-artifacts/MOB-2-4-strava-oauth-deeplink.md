---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.4 : Authentification Strava OAuth (deep link)

Status: ready-for-dev

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

- [ ] **T1 — Serveur : redirect URI Strava + (rappel) genericOAuth déjà en place** (AC: 1, 2) **[MANUEL — Guillaume + vérif]**
  - [ ] **Vérifier** `apps/web/src/lib/auth/auth.ts` : provider `genericOAuth` `strava` **déjà** configuré (story web 2.3) — `providerId: 'strava'`, `authorizationUrl`, `tokenUrl`, scopes `read,activity:read`, `databaseHooks.account.create.after` qui peuple `profiles.strava_athlete_id`. **Ne pas dupliquer.**
  - [ ] **Strava API settings** (https://www.strava.com/settings/api) : « Authorization Callback Domain » doit autoriser le domaine du **serveur Better Auth** (le redirect Strava va vers `{baseURL}/api/auth/oauth2/callback/strava`, PAS vers `ridenrest://` — voir Dev Notes §Flow). En dev, Strava n'accepte qu'un domaine (pas de scheme custom) → utiliser le domaine serveur / tunnel
  - [ ] Confirmer `trustedOrigins` inclut `ridenrest://` (MOB-2.1) pour la redirection finale serveur → app

- [ ] **T2 — Client : plugin genericOAuth + déclenchement linking** (AC: 1, 2)
  - [ ] `src/lib/auth/client.ts` : ajouter le plugin `genericOAuthClient()` (`better-auth/client/plugins`) au tableau `plugins` (à côté de `expoClient`)
  - [ ] Handler « Connecter Strava » : **lier** (pas sign-in) l'utilisateur déjà connecté → `authClient.oauth2.link({ providerId: 'strava', callbackURL: 'ridenrest://oauth-callback' })` (vérifier le nom exact de la méthode de linking exposée par `genericOAuthClient` dans la version installée — cf. web `linkSocial`/`oauth2.link`)
  - [ ] `@better-auth/expo` ouvre `expo-web-browser` et capture le retour `ridenrest://`

- [ ] **T3 — UI état Strava (settings)** (AC: 2, 3)
  - [ ] Créer/compléter `src/app/(app)/settings.tsx` (écran Paramètres, route protégée par le guard `(app)`) avec une carte `components/shared/strava-connection-card.tsx`
  - [ ] Lire l'état connecté : query TanStack sur l'endpoint « me »/profil exposant `stravaConnected`/`stravaAthleteId` (réutiliser l'endpoint NestJS existant — voir Dev Notes). États : « Strava connecté » (bouton Déconnecter) / « Strava non connecté » (bouton Connecter)
  - [ ] **Déconnexion** : `authClient.unlinkAccount({ providerId: 'strava' })` (ou Server flow équivalent web story 2.3) → invalide la query → UI repasse « non connecté » (parité avec AC web 2.3 : ligne `account` supprimée + `strava_athlete_id = null`)
  - [ ] Skeleton/loader pendant le chargement de l'état (`isPending`)

- [ ] **T4 — Gestion annulation/échec** (AC: 3)
  - [ ] Cancel/dismiss `openAuthSessionAsync` ou throw → `<ErrorBanner />` i18n, l'état **reste** « non connecté », aucun token partiel
  - [ ] Valider les params du callback (`error`, manquants) avant de marquer connecté

- [ ] **T5 — Attribution Strava (préparation)** (AC: 2)
  - [ ] Si des données Strava sont affichées (athlète/nom), prévoir le badge « Powered by Strava » (FR-063) — l'écran d'**import** (MOB-3.4) le requiert ; ici l'ajouter si l'UI montre des données Strava, sinon le déférer explicitement à MOB-3.4

- [ ] **T6 — i18n + tests** (AC: tous)
  - [ ] Clés `auth.strava.*` (connect/disconnect/connected/notConnected), `auth.errors.*`
  - [ ] Tests `strava-connection-card.test.tsx` (RNTL) : état connecté/non connecté, connect appelle le linking (mocké), disconnect appelle unlink + UI maj, cancel → ErrorBanner + reste non connecté. Mock `@better-auth/expo`, `expo-web-browser`, `apiFetch`
  - [ ] `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts

- [ ] **T7 — Validation manuelle device** (AC: tous)
  - [ ] Connecté à l'app → Paramètres → « Connecter Strava » → consentement Strava → retour → « Strava connecté » ; vérifier en DB la ligne `account` (provider `strava`) + `profiles.strava_athlete_id` ; « Déconnecter » → ligne supprimée + UI « non connecté » ; annulation → reste « non connecté » + message

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.4 (ready-for-dev) — Strava account-linking (`genericOAuth`/`oauth2.link`) depuis Paramètres, état connecté/non connecté, connect/disconnect, gestion cancel/échec. Backend genericOAuth réutilisé ; import d'activités déféré MOB-3.4. | bmad-create-story |
