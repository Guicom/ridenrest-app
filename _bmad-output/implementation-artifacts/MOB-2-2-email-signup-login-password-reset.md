---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.2 : Inscription / connexion email & réinitialisation du mot de passe

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **nouvel utilisateur**,
I want **créer un compte avec email/mot de passe, me connecter et réinitialiser mon mot de passe**,
So that **je peux accéder à l'application sans dépendre d'un fournisseur OAuth**.

> **Dépend de MOB-2.1** (client `@better-auth/expo`, secure-store, `apiFetch`, groupes `(auth)`/`(app)` + guard). Cette story remplit les écrans `(auth)/login`, `(auth)/signup`, `(auth)/reset-password` avec des **formulaires réels** (React Hook Form + Zod). Le backend Better Auth est **déjà configuré** (story web 2.1/2.4 : `emailAndPassword` minPwd 8, `sendResetPassword` via Resend) — **rien à recréer côté serveur**. Google → MOB-2.3, Strava → MOB-2.4, logout/suppression → MOB-2.5.

## Acceptance Criteria

1. **Given** l'écran d'inscription
   **When** je saisis un email et un mot de passe valides
   **Then** un compte est créé et je suis connecté (FR-001)
   **And** les erreurs de validation (email invalide, mot de passe < 8 caractères) sont affichées clairement, inline, par champ

2. **Given** l'écran de connexion
   **When** je saisis des identifiants valides
   **Then** je suis authentifié et redirigé vers `adventures`
   **And** des identifiants invalides produisent un message d'erreur explicite (sans révéler si l'email existe)

3. **Given** l'écran de réinitialisation
   **When** je demande un reset avec mon email
   **Then** un email de réinitialisation est envoyé (Resend, backend inchangé) (FR-007)
   **And** un message confirme l'envoi **sans révéler** si l'email existe (anti-énumération)

4. **Given** un formulaire auth quelconque
   **When** une requête est en cours
   **Then** le bouton de soumission est en état chargement (désactivé + indicateur), double-submit impossible
   **And** toutes les chaînes sont résolues via i18n (`t()`), aucune en dur

## Tasks / Subtasks

- [ ] **T1 — Schémas de validation partagés (Zod)** (AC: 1, 2, 3)
  - [ ] **Réutiliser** les schémas auth depuis `packages/shared/schemas/` s'ils existent (story web 2.1) — `signUpSchema`, `signInSchema`, `forgotPasswordSchema`. **Ne PAS dupliquer.** Si absents, les créer dans `packages/shared` (consommés web + mobile)
  - [ ] Contraintes alignées serveur : email valide, mot de passe **min 8** (Better Auth `minPasswordLength: 8`)
  - [ ] Messages d'erreur i18n-isables (clés, pas de texte serveur brut affiché à l'utilisateur)

- [ ] **T2 — Écran inscription `(auth)/signup.tsx`** (AC: 1, 4)
  - [ ] Form React Hook Form + `zodResolver(signUpSchema)` (archi §Forms — RHF v7, schemas `packages/shared`)
  - [ ] Champs : email, mot de passe (+ éventuellement confirmation). Composants `components/ui/*` (Input, Button MOB-1.3) — `className` NativeWind, jamais styles inline
  - [ ] Submit → `authClient.signUp.email({ email, password, name })` → succès = session établie (secure-store, MOB-2.1) → `router.replace('/(app)/adventures')`
  - [ ] Erreurs serveur (email déjà pris, etc.) → `<ErrorBanner />` inline mappé en i18n ; erreurs de champ → sous le champ
  - [ ] Lien « Déjà un compte ? Se connecter » → `(auth)/login`

- [ ] **T3 — Écran connexion `(auth)/login.tsx`** (AC: 2, 4)
  - [ ] Remplacer le placeholder MOB-2.1. Form RHF + `zodResolver(signInSchema)`
  - [ ] Submit → `authClient.signIn.email({ email, password })` → `router.replace('/(app)/adventures')`
  - [ ] Identifiants invalides → message **générique** (« Email ou mot de passe incorrect ») — ne pas distinguer email inexistant / mauvais mot de passe (anti-énumération)
  - [ ] Liens : « Créer un compte » → `signup` ; « Mot de passe oublié ? » → `reset-password`
  - [ ] Emplacements **réservés** pour les boutons OAuth (« Continuer avec Google » → MOB-2.3) — placeholder visuel ou slot, **sans** implémenter le flow

- [ ] **T4 — Écran réinitialisation `(auth)/reset-password.tsx`** (AC: 3, 4)
  - [ ] Form RHF + `zodResolver(forgotPasswordSchema)` (email seul)
  - [ ] Submit → `authClient.forgetPassword({ email, redirectTo })` → **toujours** afficher un message de confirmation neutre (« Si un compte existe, un email a été envoyé »), succès **ou** échec, pour ne pas révéler l'existence de l'email
  - [ ] `redirectTo` : voir Dev Notes §Flow reset mobile (web vs deep link)
  - [ ] **Scope** : déclencher l'envoi de l'email suffit pour cette story (FR-007). La **saisie du nouveau mot de passe** depuis le mobile (via deep link `ridenrest://reset-password?token=...`) est optionnelle — voir Dev Notes ; si non implémentée, l'utilisateur termine le reset via le lien web (backend inchangé)

- [ ] **T5 — i18n + accessibilité** (AC: 4)
  - [ ] Clés `auth.signup.*`, `auth.login.*`, `auth.reset.*`, `auth.errors.*` dans `locales/fr.json` (+ `en.json` squelette) — **zéro** chaîne en dur
  - [ ] `accessibilityLabel`/`accessibilityRole` sur champs et boutons ; `keyboardType="email-address"`, `autoCapitalize="none"`, `textContentType`/`autoComplete` (password, new-password) pour l'autofill iOS/Android et les gestionnaires de mots de passe
  - [ ] `<KeyboardAvoidingView>` / gestion clavier pour que les champs restent visibles

- [ ] **T6 — Tests** (AC: tous)
  - [ ] `signup.test.tsx`, `login.test.tsx`, `reset-password.test.tsx` (RNTL) : rendu, validation Zod (email invalide / pwd court → erreurs inline), submit appelle le bon `authClient.*` (mocké), état loading désactive le bouton, message neutre sur reset
  - [ ] Mocker `@/lib/auth/client` (les `authClient.*`) ; ne pas taper le réseau réel
  - [ ] `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts (gate CI MOB-1.4)

- [ ] **T7 — Validation manuelle** (AC: 1, 2, 3)
  - [ ] Signup nouvel email → compte créé + connecté + redirigé `adventures` + session persistée (kill/relaunch)
  - [ ] Login OK / login KO (message générique) ; reset → email Resend reçu (si `RESEND_API_KEY` configuré) + message neutre

## Dev Notes

### Backend DÉJÀ configuré — NE PAS recréer (source : stories web 2.1 & 2.4, done)

`apps/web/src/lib/auth/auth.ts` expose déjà :
- `emailAndPassword: { enabled: true, minPasswordLength: 8 }`
- `emailVerification: { sendOnSignUp: false, ... }` (vérification email **désactivée** au MVP — un signup connecte immédiatement, pas d'écran « vérifiez votre email »)
- `sendResetPassword` (Resend, `noreply@ridenrest.app`) — déclenché par `authClient.forgetPassword()`
- `databaseHooks.user.create.after` → crée la ligne `profiles`
- jwt 15 min / refresh 30 j

→ Mobile = **client uniquement**. Les méthodes `@better-auth/expo` sont les mêmes que le web (`signUp.email`, `signIn.email`, `forgetPassword`, `resetPassword`) car `@better-auth/expo` ré-expose l'API Better Auth standard. **Aucune** modif serveur dans cette story (le plugin `expo()` a été ajouté en MOB-2.1).

### Méthodes client (source : 2-1 / 2-4 web + @better-auth/expo)

```ts
// depuis src/lib/auth/client.ts (MOB-2.1)
import { authClient } from '@/lib/auth/client'

await authClient.signUp.email({ email, password, name })          // crée + connecte
await authClient.signIn.email({ email, password })                // connecte
await authClient.forgetPassword({ email, redirectTo })            // envoie le mail reset
await authClient.resetPassword({ newPassword, token })            // (si saisie mobile du nouveau mdp)
```

> ⚠️ `name` est requis par le schéma user Better Auth selon la config. Vérifier le schéma serveur ; au besoin dériver un `name` par défaut depuis l'email ou ajouter un champ. Reproduire ce que fait `register-form.tsx` web (story 2.1).

### Flow reset mobile (décision à confirmer)

`forgetPassword({ email, redirectTo })` envoie un email contenant un lien `{redirectTo}?token=...`. Deux options pour `redirectTo` :
- **Option A (recommandée MVP, moindre effort)** : `redirectTo` pointe vers la **page web** de reset existante (`apps/web .../reset-password`) — l'utilisateur termine le reset dans le navigateur, backend 100 % inchangé. Le mobile ne fait qu'**initier**. Conforme à l'AC3 (« un email de réinitialisation est envoyé »).
- **Option B (full mobile)** : `redirectTo` = `ridenrest://reset-password?token=...`, ajouter une route `(auth)/reset-password-confirm.tsx` qui lit le token (`useLocalSearchParams`) et appelle `authClient.resetPassword({ newPassword, token })`. Nécessite que le scheme soit dans les `trustedOrigins` (fait MOB-2.1) et que le mail soit envoyé avec un lien deep-link.

→ **Recommandation** : Option A pour cette story (FR-007 = « email envoyé »). Documenter le choix ; si Option B, livrer la route de confirmation + test.

### Forms & UI (source : architecture-mobile.md)

- React Hook Form v7 + `zodResolver`, schemas depuis `packages/shared/schemas/` — **jamais** dupliquer la validation (l.402, 668).
- Styling **NativeWind** (`className=`), `cn()` pour conditionnels. Style inline **uniquement** pour couleurs runtime (pas le cas ici). Réutiliser primitifs `components/ui/*` (Button/Input/Card de MOB-1.3 — créer `Input` s'il manque, dans `components/ui/`).
- Loading : bouton submit `isPending` → désactivé + indicateur (jamais double-submit). Erreurs réseau → `<ErrorBanner />` inline, **jamais** `Alert.alert` (l.690-700).
- Anti-énumération (AC2/AC3) : messages génériques. Pattern identique au web (stories 2.1/2.4).

### Previous story intelligence

- **MOB-2.1** livre : `authClient` (`src/lib/auth/client.ts`), `apiFetch`, groupes `(auth)`/`(app)` + guard centralisé, placeholders `login`/`adventures`, providers root, clés i18n `auth.*` amorcées. Cette story **remplace** les placeholders par les formulaires réels et **étend** `auth.*`.
- **MOB-1.3** : design system (Button, Card, Skeleton). Réutiliser. Si `Input`/`FormField` manquent, les créer dans `components/ui/` avec stories Storybook (convention archi `*.stories.tsx`).
- **MOB-1.4** : i18n FR par défaut/fallback, gate CI lint/test/typecheck bloquante, preset jest-expo, mocks natifs.

### Git intelligence

- Stories web `2-1-email-password-registration-login.md` (RHF + Zod + `login-form.tsx`/`register-form.tsx`) et `2-4-password-reset-account-management.md` (`forgot-password`/`reset-password` forms, `authClient.forgetPassword`/`resetPassword`) sont les **références directes** pour l'UX et les appels — porter en RN (RNTL au lieu de RTL, `<View>/<TextInput>` au lieu de `<div>/<input>`, NativeWind au lieu de Tailwind web). La **logique d'appel est identique**.

### Latest tech information

- `@better-auth/expo` ré-expose l'API standard ; pas d'endpoint custom à appeler. La session post-signup/signin est persistée automatiquement en secure-store (MOB-2.1).
- RN : `TextInput` avec `autoComplete="password"`/`"new-password"`, `textContentType` (iOS) et `autoComplete` (Android) pour l'intégration avec iCloud Keychain / Google Password Manager — important pour l'UX et l'acceptation store.

### Project Structure Notes

- **Ajouts** : `src/app/(auth)/signup.tsx`, `src/app/(auth)/reset-password.tsx` (+ tests), éventuellement `src/components/ui/input.tsx` + `text-field.tsx` (+ `.stories.tsx`), schémas Zod `packages/shared` si absents, clés i18n.
- **Modifs** : `src/app/(auth)/login.tsx` (placeholder → form réel + slot OAuth), `locales/{fr,en}.json`.
- Aucune migration DB / modif serveur.

### Frontière de story

- **Inclus** : écrans signup/login/reset fonctionnels (email/password), validation Zod partagée, anti-énumération, états loading, i18n + a11y/autofill, déclenchement email reset.
- **Exclu** : Google → **MOB-2.3** ; Strava → **MOB-2.4** ; logout/suppression → **MOB-2.5** ; saisie mobile du nouveau mot de passe = optionnelle (Option B) ; vérification email (désactivée MVP serveur) ; toute modif serveur.

### Testing standards

- RNTL : rendu + validation inline (email invalide, pwd < 8) + appel `authClient.*` mocké + état loading + message neutre reset. Mock `@/lib/auth/client`.
- Validation manuelle : signup→connecté→persisté ; login OK/KO générique ; reset→email+message neutre.
- `pnpm --filter @ridenrest/mobile test|typecheck|lint` verts.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-2.2] — AC d'origine (l.505-535)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Frontend Architecture] — RHF v7 + Zod resolver, schemas packages/shared (l.396-414)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Loading states & errors] — bouton loading, ErrorBanner inline (l.690-705)
- [Source: _bmad-output/implementation-artifacts/2-1-email-password-registration-login.md] — `signUp.email`/`signIn.email`, RHF forms, anti-énumération, minPwd 8
- [Source: _bmad-output/implementation-artifacts/2-4-password-reset-account-management.md] — `forgetPassword`/`resetPassword`, message neutre, `sendResetPassword` Resend (l.115-130, 200-270, 360-411)
- [Source: _bmad-output/implementation-artifacts/MOB-2-1-better-auth-client-secure-store-session.md] — client auth, groupes (auth)/(app), guard, providers

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.2 (ready-for-dev) — écrans email signup/login/reset (RHF + Zod partagé), anti-énumération, états loading, i18n + autofill/a11y. Backend Better Auth réutilisé tel quel. | bmad-create-story |
