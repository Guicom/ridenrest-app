---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.5 : Déconnexion & suppression de compte (RGPD)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **me déconnecter et pouvoir supprimer définitivement mon compte**,
So that **je contrôle mes données conformément au RGPD**.

> **Dernière story de l'Epic MOB-2.** Dépend de **MOB-2.1** (client `@better-auth/expo`, secure-store, guard `(app)`) et **MOB-2.4** (écran `(app)/settings`). Le backend gère **déjà** la suppression (`auth.api.deleteUser()` + cascades DB — story web 2.4). ⚠️ **Action irréversible / outward-facing** : confirmation explicite obligatoire. Clôt l'epic auth ; ouvre la voie aux epics MOB-3→6.

## Acceptance Criteria

1. **Given** un utilisateur connecté
   **When** il se déconnecte
   **Then** le JWT/session est **purgé** de `expo-secure-store` (FR-004)
   **And** il est redirigé vers `login`

2. **Given** la page paramètres
   **When** l'utilisateur demande la suppression de son compte
   **Then** une confirmation **explicite** est requise (saisie/typed-confirmation ou double-tap intentionnel)
   **And** après confirmation, le compte et **toutes ses aventures** sont effacés (FR-005, cascades DB)
   **And** l'utilisateur est déconnecté et renvoyé vers `login`

## Tasks / Subtasks

- [ ] **T1 — Déconnexion** (AC: 1)
  - [ ] Bouton « Se déconnecter » dans `src/app/(app)/settings.tsx`
  - [ ] Handler → `authClient.signOut()` → `@better-auth/expo` **purge** la session de `expo-secure-store` (vérifier qu'aucun résidu ne reste : token, cookie, cache token `apiFetch` MOB-2.1)
  - [ ] Vider le cache token de `apiFetch` (MOB-2.1) + `queryClient.clear()` (TanStack) pour ne pas laisser de données du user précédent en mémoire
  - [ ] `router.replace('/(auth)/login')` (le guard `(app)/_layout` redirigera de toute façon dès que `useSession()` repasse non connecté — `replace` évite le retour arrière)

- [ ] **T2 — Suppression de compte (confirmation forte)** (AC: 2)
  - [ ] Section « Zone de danger » dans `settings.tsx` → bouton « Supprimer mon compte »
  - [ ] **Confirmation explicite** : modal/bottom-sheet (`@gorhom/bottom-sheet` si déjà introduit, sinon RN `Modal`) exigeant une action intentionnelle — recommandé : saisie d'un mot (« SUPPRIMER ») ou de l'email, **pas** un simple « OK ». Pattern parité web (story 2.4 : typed-confirmation)
  - [ ] Texte clair : irréversible, efface compte + **toutes les aventures/segments** (cascades)
  - [ ] Handler → suppression Better Auth : `authClient.deleteUser()` (client) **ou** appel d'une action serveur `auth.api.deleteUser()` selon ce qu'expose `@better-auth/expo` (voir Dev Notes). Better Auth peut exiger `requireFreshSession`/ré-auth — gérer le cas
  - [ ] Sur succès : purge secure-store (signOut implicite) + `queryClient.clear()` + `router.replace('/(auth)/login')`
  - [ ] Sur échec : `<ErrorBanner />` i18n, **aucune** déconnexion partielle (l'utilisateur reste connecté, données intactes)

- [ ] **T3 — i18n + a11y** (AC: tous)
  - [ ] Clés `settings.logout.*`, `settings.deleteAccount.*` (titre, avertissement, confirmation, bouton danger) — `fr.json` + `en.json` squelette, **zéro** chaîne en dur
  - [ ] Bouton danger : style NativeWind « destructive » (token couleur danger du DS), `accessibilityRole="button"`, `accessibilityHint` explicite

- [ ] **T4 — Tests** (AC: tous)
  - [ ] `settings.test.tsx` (RNTL) : logout appelle `signOut` + `queryClient.clear` + redirection login ; delete sans confirmation valide **n'appelle pas** `deleteUser` ; delete avec confirmation correcte appelle `deleteUser` + redirection ; échec delete → ErrorBanner + reste connecté
  - [ ] Mock `@/lib/auth/client`, `apiFetch`, `queryClient`
  - [ ] `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts (gate CI)

- [ ] **T5 — Validation manuelle device** (AC: tous)
  - [ ] Logout → renvoyé `login`, kill/relaunch → toujours déconnecté (session bien purgée du Keychain/Keystore, AC1)
  - [ ] Delete (compte de test) → confirmation → compte supprimé en DB (`user` + `adventures`/segments via cascade) + renvoyé `login` + relaunch déconnecté ; tenter delete puis annuler → reste connecté, données intactes

## Dev Notes

### Backend déjà fait — NE PAS recréer (source : story web 2.4, done)

`auth.api.deleteUser()` (Better Auth) supprime la ligne `user` ; **toutes les cascades DB sont déjà en place** : `adventures.userId → user.id CASCADE`, segments, `account`, `profiles`, sessions. → **Aucune** suppression manuelle de données à coder, **aucune** migration. Le mobile déclenche la suppression et gère l'UX de confirmation + la purge locale.

> Citation story 2.4 : « No manual data deletion needed — `auth.api.deleteUser()` deletes `user`, and all cascades fire. » Reproduire ce constat ; ne pas réinventer une route de suppression.

### Méthode de suppression côté mobile (à confirmer)

- Web (story 2.4) appelle `auth.api.deleteUser()` **server-side** via Server Action. Mobile n'a pas de Server Action → deux pistes :
  - **A** : `authClient.deleteUser()` si `@better-auth/expo` / better-auth client l'expose (Better Auth a une fonctionnalité `deleteUser` client gated par config serveur `user.deleteUser.enabled`). **Vérifier** que `user: { deleteUser: { enabled: true } }` est activé côté serveur ; sinon l'activer (modif serveur additive, coordonnée avec story 2.4).
  - **B** : exposer/réutiliser un endpoint NestJS/web qui appelle `auth.api.deleteUser()` et l'appeler via `apiFetch`.
- Better Auth peut exiger une **session fraîche** ou un token de confirmation par email pour `deleteUser`. Gérer ce flux (re-auth ou lien email) si activé. Documenter la config serveur réelle dans les Completion Notes.

### Purge locale complète (AC1 — sécurité)

`signOut()` purge la session `@better-auth/expo` du secure-store, mais **vérifier explicitement** qu'il ne reste :
- aucun token dans le cache mémoire de `apiFetch` (MOB-2.1) → exposer/appeler un `clearTokenCache()`
- aucune donnée user dans TanStack Query → `queryClient.clear()`
- rien d'auth dans `AsyncStorage` (ne doit jamais y avoir été écrit — MOB-2.1)

Sinon : risque de fuite de données entre deux comptes sur le même appareil.

### Action irréversible / outward-facing (garde-fou produit)

La suppression est destructive et définitive. **Confirmation explicite obligatoire** (AC2) — pas un simple bouton. Le pattern web (story 2.4) utilise une typed-confirmation ; le mobile fait de même (modal + saisie). Ne **jamais** supprimer sur un seul tap.

### UX (source : architecture-mobile.md §Loading states & errors / NativeWind)

- Boutons → primitif `<Button>` (MOB-1.3), variante destructive via token couleur danger (style NativeWind, pas inline).
- Confirmation → bottom-sheet (`@gorhom/bottom-sheet` — introduit ici **ou** en MOB-4.2 ; si pas encore présent, RN `Modal` suffit, ne pas sur-architecturer).
- Erreurs → `<ErrorBanner />` inline, jamais `Alert.alert` pour les erreurs réseau. (Une `Alert` de confirmation native reste acceptable pour le double-check, mais la typed-confirmation est préférée pour une action aussi lourde.)
- Loading sur les boutons pendant l'appel (anti double-submit).

### Previous story intelligence

- **MOB-2.4** : `(app)/settings.tsx` existe déjà (carte Strava). Cette story **ajoute** les sections « Compte » (déconnexion) et « Zone de danger » (suppression) au même écran.
- **MOB-2.1** : `signOut`, `useSession`, guard `(app)`, `apiFetch` (+ cache token à vider), `queryClient`. La purge secure-store est gérée par `@better-auth/expo`.
- **MOB-1.3** : `<Button>` (variante destructive à dériver si absente).
- **MOB-1.4** : i18n FR, gate CI bloquante.

### Latest tech information

- Better Auth `deleteUser` (client) nécessite `user.deleteUser.enabled` côté serveur + éventuellement `beforeDelete`/vérification email. Vérifier la config et la version. `@better-auth/expo` réexpose l'API client standard.
- `signOut()` invalide la session serveur **et** purge le storage local (secure-store) — confirmer par test que le relaunch reste déconnecté (AC1).

### Project Structure Notes

- **Ajouts** : sections logout + delete dans `settings.tsx` (+ `settings.test.tsx` si absent), éventuellement `src/components/shared/delete-account-sheet.tsx`, clés i18n `settings.logout.*`/`settings.deleteAccount.*`, helper `clearTokenCache()` dans `api-client.ts` si pas déjà exposé.
- **Modifs** : `src/app/(app)/settings.tsx`, `locales/{fr,en}.json`, éventuellement `apps/web/src/lib/auth/auth.ts` (activer `user.deleteUser.enabled` si requis — additif, coordonné story 2.4) ou un endpoint de suppression.
- Aucune migration DB (cascades déjà en place).

### Frontière de story

- **Inclus** : déconnexion (purge secure-store + cache token + query cache + redirect login), suppression de compte avec confirmation forte + cascades, gestion échec sans état partiel, i18n + a11y.
- **Exclu** : export de données RGPD (hors scope MVP) ; gestion multi-session/multi-device ; toute logique aventures/segments (epics MOB-3→6) ; modif des cascades DB (déjà faites).

### Testing standards

- RNTL : logout → `signOut` + `queryClient.clear` + `router.replace('/login')` ; delete sans confirmation valide ne déclenche pas `deleteUser` ; delete confirmé → `deleteUser` + redirect ; échec → ErrorBanner + reste connecté. Mock `@/lib/auth/client`, `apiFetch`, `queryClient`.
- Validation manuelle : logout persistant (relaunch déconnecté = preuve purge secure-store AC1) ; delete compte de test → DB nettoyée (cascades) ; annulation → intact.
- `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-2.5] — AC d'origine (l.589-608)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Authentication & Security / Enforcement] — secure-store purge, tokens jamais en clair (l.360-380, 760-775)
- [Source: _bmad-output/implementation-artifacts/2-4-password-reset-account-management.md] — `auth.api.deleteUser()`, cascades DB (`adventures.userId → user.id CASCADE`), typed-confirmation (l.82-110, 590-635)
- [Source: _bmad-output/implementation-artifacts/MOB-2-1-better-auth-client-secure-store-session.md] — `signOut`, secure-store, apiFetch cache token, guard (app), queryClient
- [Source: _bmad-output/implementation-artifacts/MOB-2-4-strava-oauth-deeplink.md] — écran `(app)/settings` (base de l'écran Paramètres)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.5 (ready-for-dev) — déconnexion (purge secure-store + caches) + suppression de compte RGPD avec confirmation forte (cascades DB serveur réutilisées). Clôt l'Epic MOB-2. | bmad-create-story |
