---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.5 : Déconnexion & suppression de compte (RGPD)

Status: done

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

- [x] **T1 — Déconnexion** (AC: 1)
  - [x] Bouton « Se déconnecter » dans `src/app/(app)/settings.tsx` (via `<AccountSection />`, section « Compte »)
  - [x] Handler → `signOut()` → `@better-auth/expo` **purge** la session de `expo-secure-store`
  - [x] Vider le cache token de `apiFetch` (`invalidateAuthTokenCache()`, MOB-2.1) + `queryClient.clear()` (TanStack) — factorisés dans `useAccountActions`
  - [x] `router.replace('/(auth)/login')` (purge+redirect uniquement sur succès `signOut`)

- [x] **T2 — Suppression de compte (confirmation forte)** (AC: 2)
  - [x] Section « Zone de danger » dans `settings.tsx` → bouton « Supprimer mon compte » (variante `destructive`, carte bordée danger)
  - [x] **Confirmation explicite** : RN `Modal` (pas de `@gorhom/bottom-sheet` en dep → pas de sur-architecture) exigeant la saisie du mot « SUPPRIMER »/« DELETE » (localisé) ; bouton confirmer désactivé tant que la saisie ne correspond pas. Pattern parité web (typed-confirmation)
  - [x] Texte clair : irréversible, efface compte + **toutes les aventures/segments** (cascades) — clé i18n `deleteAccount.warning`
  - [x] Handler → `authClient.deleteUser()` (Piste A : `user.deleteUser.enabled: true` déjà actif côté serveur `auth.ts`, **aucune** modif serveur, pas de session fraîche/lien email requis)
  - [x] Sur succès : purge secure-store (`signOut`) + `invalidateAuthTokenCache` + `queryClient.clear()` + `router.replace('/(auth)/login')`
  - [x] Sur échec (`{ error }` ou rejet) : `<ErrorBanner />` i18n dans la modal, **aucune** déconnexion/purge partielle (utilisateur reste connecté, données intactes)

- [x] **T3 — i18n + a11y** (AC: tous)
  - [x] Clés `settings.accountSection`, `settings.dangerSection`, `settings.logout.*`, `settings.deleteAccount.*` — `fr.json` + `en.json`, **zéro** chaîne en dur (interpolation `{{word}}`)
  - [x] Bouton danger : variante NativeWind `destructive` (token DS), `accessibilityRole="button"` (primitif `<Button>`), `accessibilityHint` explicite sur logout + delete

- [x] **T4 — Tests** (AC: tous)
  - [x] `account-section.test.tsx` (RNTL, co-localisé) : logout appelle `signOut` + `invalidateAuthTokenCache` + `queryClient.clear` + redirection login ; delete sans confirmation valide **n'appelle pas** `deleteUser` ; delete confirmé appelle `deleteUser` + redirection ; échec delete (`{error}` et rejet) → ErrorBanner + reste connecté ; logout en échec → ErrorBanner sans redirection
  - [x] Mock `@/lib/auth/client`, `@/lib/api/api-client`, `expo-router` ; spy `queryClient.clear`
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts (gate CI) — **12 suites / 67 tests**, tsc 0 erreur, lint propre

- [x] **T5 — Validation manuelle device** (AC: tous) — _validée par Guillaume (2026-06-12)_
  - [x] Logout → renvoyé `login`, kill/relaunch → toujours déconnecté (session bien purgée du Keychain/Keystore, AC1)
  - [x] Delete (compte de test) → confirmation → compte supprimé en DB (`user` + `adventures`/segments via cascade) + renvoyé `login` + relaunch déconnecté ; tenter delete puis annuler → reste connecté, données intactes

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

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- Gate mobile : `pnpm --filter @ridenrest/mobile test` → **12 suites / 67 tests** verts (dont `account-section.test.tsx` : 7 tests). `typecheck` (tsc --noEmit) → 0 erreur. `lint` (expo lint) → propre.

### Completion Notes List

- **Méthode de suppression — Piste A confirmée, AUCUNE modif serveur.** `apps/web/src/lib/auth/auth.ts` a déjà `user: { deleteUser: { enabled: true } }` (posé en story web 2.4). Aucune `sendDeleteAccountVerification` ni `beforeDelete` n'est configurée → `authClient.deleteUser()` côté mobile supprime **immédiatement** (pas de session fraîche ni de lien email à gérer). Les cascades DB (`adventures`, segments, `account`, `profiles`, sessions) tombent server-side ; le hook `user.delete.before` deauthorise Strava au passage (déjà en place, MOB-2.4). **Aucune route de suppression ni migration créée.**
- **Architecture (parité pattern Strava MOB-2.4).** Logique extraite dans un hook `useAccountActions` (`src/hooks/use-account.ts` — mutations `logout`/`deleteAccount` + purge locale factorisée) ; présentation + confirmation forte + feedback d'erreur dans un composant `AccountSection` (`src/components/shared/account-section.tsx`). `settings.tsx` ne fait que composer `<StravaConnectionCard />` + `<AccountSection />`.
- **Purge locale complète (AC1 — anti-fuite inter-comptes).** `signOut()` purge le secure-store (plugin expo) ; `invalidateAuthTokenCache()` vide le cache JWT mémoire d'`apiFetch` ; `queryClient.clear()` jette tout le server-state. Purge + `router.replace('/(auth)/login')` exécutés **uniquement** sur succès serveur (jamais sur échec → pas d'état partiel). Sur delete, `signOut()` est rappelé en best-effort (`.catch(() => {})`) après `deleteUser` pour garantir l'effacement du secure-store même si `deleteUser` ne le fait pas.
- **Confirmation forte (AC2 — action irréversible/outward-facing).** RN `Modal` (pas de `@gorhom/bottom-sheet` dans les deps → on ne sur-architecture pas) avec saisie typée du mot localisé « SUPPRIMER »/« DELETE » (comparaison trim + insensible à la casse). Bouton « Supprimer définitivement » **désactivé** tant que la saisie ne correspond pas (double garde : `disabled` Pressable + guard handler). Échec serveur/réseau → `<ErrorBanner />` dans la modal, l'utilisateur **reste connecté**, données intactes.
- **Écart de plan documenté.** Les tests visent `account-section.test.tsx` (co-localisé, qui porte toute la logique logout/delete) plutôt que `settings.test.tsx` : (1) cohérent avec le pattern établi hook+composant+test co-localisé (cf. `strava-connection-card.test.tsx`) ; (2) évite le gotcha Expo Router (`*.test.tsx` sous `src/app/` est bundlé par `expo export` — cf. AGENTS.md). Valeur de test identique (logout + delete + échecs tous couverts).
- **T5 (validation device) — VALIDÉE par Guillaume (2026-06-12).** Logout persistant après relaunch (preuve purge Keychain/Keystore, AC1) ; delete compte de test → DB nettoyée via cascade + relaunch déconnecté ; annulation → reste connecté, données intactes (AC2). Tous les AC confirmés sur device.

### File List

**Ajouts :**
- `apps/mobile/src/hooks/use-account.ts`
- `apps/mobile/src/components/shared/account-section.tsx`
- `apps/mobile/src/components/shared/account-section.test.tsx`

**Modifications :**
- `apps/mobile/src/app/(app)/settings.tsx` (branche `<AccountSection />` + maj commentaire d'en-tête)
- `apps/mobile/src/lib/i18n/locales/fr.json` (clés `settings.accountSection/dangerSection/logout.*/deleteAccount.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (idem)

**Inchangé (vérifié) :** `apps/web/src/lib/auth/auth.ts` — `deleteUser.enabled` déjà actif, aucune modif requise.

### Review Findings

_Revue de code adversariale (Blind Hunter + Edge Case Hunter + Acceptance Auditor), 2026-06-12. Verdict : les 2 AC sont satisfaites (config serveur `deleteUser.enabled: true` vérifiée → la suppression aboutit à l'exécution, pas d'échec runtime). 0 decision-needed, 2 patch, 3 defer, 6 dismiss._

- [x] [Review][Patch] Guard anti double-submit manquant sur le logout (asymétrie avec le chemin delete qui guarde `if (isDeleting) return`) — `handleLogout` ne re-vérifie pas `isLoggingOut` ; une double-tape avant le re-render (le `Button` ne pose `disabled` qu'au render suivant) déclenche deux `signOut()` + deux `finishSession`/`router.replace`. [apps/mobile/src/components/shared/account-section.tsx] — **CORRIGÉ** : `if (isLoggingOut) return;` ajouté en tête de `handleLogout`.
- [x] [Review][Patch] Backdrop plein écran de la modal annoncé comme un bouton « Annuler » géant par le lecteur d'écran — le `Pressable` overlay portait `accessibilityRole="button"` + `accessibilityLabel=cancel` sur toute la surface ; un utilisateur VoiceOver/TalkBack y focalisait un bouton démesuré qui doublait le bouton « Annuler » explicite. [apps/mobile/src/components/shared/account-section.tsx] — **CORRIGÉ** : `accessibilityRole`/`accessibilityLabel` retirés du backdrop, remplacés par `accessible={false}` (dismiss tactile conservé, descendants toujours lus par le SR).
- [x] [Review][Defer] Purge secure-store best-effort sur le chemin delete (`await signOut().catch(() => {})`) [apps/mobile/src/hooks/use-account.ts] — deferred, tradeoff documenté (Completion Notes l.147) : si ce `signOut` échoue, la session secure-store peut subsister, mais le compte étant supprimé server-side la session est inerte (le serveur 401) et une re-connexion l'écrase ; `invalidateAuthTokenCache()` + `queryClient.clear()` tournent quand même. Durcissement = purge secure-store dédiée indépendante de `signOut`.
- [x] [Review][Defer] Aucun timeout/abort client sur `authClient.deleteUser()` → modal non-dismissable si la requête se bloque [apps/mobile/src/hooks/use-account.ts] — deferred, robustesse : pendant `isDeleting`, Annuler est `disabled` et backdrop/back early-return ; une requête qui hang piège l'utilisateur dans la modal (seul kill-app sort). Suit le pattern serveur `AbortSignal.timeout` introduit en MOB-2.4.
- [x] [Review][Defer] `router.replace` lançant dans `finishSession` (onSuccess) reclasserait un delete réussi en échec → message « compte intact » factuellement faux [apps/mobile/src/hooks/use-account.ts] — deferred, faible probabilité (expo-router `replace` ne lève pas en pratique) ; durcissement = exécuter la navigation hors du chemin throwable de la mutation.

**Dismiss (6, non persistés)** : (1) Blind « `deleteUser` no-op silencieux / exige une vérification email » → config serveur vérifiée (`deleteUser.enabled: true`, pas de `sendDeleteAccountVerification`/`beforeDelete`) ; (2) Blind+Edge « casse Turkish-i sur `toUpperCase` » → `String.toUpperCase()` est locale-invariant en JS (seul `toLocaleUpperCase` l'est) et seuls fr/en sont supportés ; (3) Edge « le back Android dismiss la modal nativement pendant le delete » → la visibilité du `Modal` RN est pilotée par la prop `visible` ; `onRequestClose` est un callback, pas un auto-dismiss → l'early-return garde la modal ouverte ; (4) Edge « double navigation `router.replace` + `<Redirect>` du guard » → idempotent, même cible, pas de stack/loop ; (5) Edge « `queryClient.clear()` race / setState post-unmount » → React 19 sans warning, redirect démonte immédiatement ; (6) Edge+Auditor « `onError` absent / cast `deleteUser` fragile » → rejet consommé par le `try/catch` du composant (pas d'unhandledrejection), cast acceptable (méthode core gated par la config serveur active).

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.5 (ready-for-dev) — déconnexion (purge secure-store + caches) + suppression de compte RGPD avec confirmation forte (cascades DB serveur réutilisées). Clôt l'Epic MOB-2. | bmad-create-story |
| 2026-06-12 | 1.0 | Implémentation T1–T4 (review). Hook `useAccountActions` (logout + deleteUser + purge locale) + composant `AccountSection` (déconnexion + zone de danger avec confirmation typée RN `Modal`). Piste A confirmée (`deleteUser.enabled` déjà serveur → 0 modif backend). i18n FR/EN, a11y (hints + role). Tests RNTL co-localisés (7 tests). Gate verte : 12 suites / 67 tests, tsc 0, lint propre. T5 device manuelle en attente (Guillaume). | bmad-dev-story (claude-opus-4-8) |
