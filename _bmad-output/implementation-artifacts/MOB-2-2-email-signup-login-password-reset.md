---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-2.2 : Inscription / connexion email & réinitialisation du mot de passe

Status: review

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

- [x] **T1 — Schémas de validation partagés (Zod)** (AC: 1, 2, 3)
  - [x] **Réutiliser** les schémas auth depuis `packages/shared/schemas/` s'ils existent (story web 2.1) — `signUpSchema`, `signInSchema`, `forgotPasswordSchema`. **Ne PAS dupliquer.** Si absents, les créer dans `packages/shared` (consommés web + mobile) → **absents → créés** dans `packages/shared/src/schemas/auth.schema.ts` + exportés depuis `src/index.ts` (le web n'est pas refactoré dans cette story mobile, mais les schémas y sont désormais disponibles)
  - [x] Contraintes alignées serveur : email valide, mot de passe **min 8** (Better Auth `minPasswordLength: 8`) → `PASSWORD_MIN_LENGTH = 8` exporté
  - [x] Messages d'erreur i18n-isables (clés, pas de texte serveur brut affiché à l'utilisateur) → messages Zod = **clés i18n** (`auth.errors.*`), résolues via `t()` côté écran

- [x] **T2 — Écran inscription `(auth)/signup.tsx`** (AC: 1, 4)
  - [x] Form React Hook Form + `zodResolver(signUpSchema)` (archi §Forms — RHF v7, schemas `packages/shared`)
  - [x] Champs : email, mot de passe (+ toggle afficher/masquer au lieu d'un champ confirmation). Composants `components/ui/*` (Input/TextField créés, Button MOB-1.3) — `className` NativeWind, aucun style inline
  - [x] Submit → `authClient.signUp.email({ email, password, name })` (le `name` requis est **dérivé** de la partie locale de l'email) → succès = session secure-store (MOB-2.1) → `router.replace('/(app)/adventures')`
  - [x] Erreurs serveur (`USER_ALREADY_EXISTS` → `auth.errors.emailTaken`, sinon générique) → `<ErrorBanner />` inline mappé en i18n ; erreurs de champ → sous le champ
  - [x] Lien « Déjà un compte ? Se connecter » → `(auth)/login`

- [x] **T3 — Écran connexion `(auth)/login.tsx`** (AC: 2, 4)
  - [x] Remplacer le placeholder MOB-2.1. Form RHF + `zodResolver(signInSchema)`
  - [x] Submit → `authClient.signIn.email({ email, password })` → `router.replace('/(app)/adventures')`
  - [x] Identifiants invalides → message **générique** (`auth.errors.invalidCredentials`) — ne distingue pas email inexistant / mauvais mdp (anti-énumération)
  - [x] Liens : « Créer un compte » → `signup` ; « Mot de passe oublié ? » → `reset-password`
  - [x] Emplacement **réservé** pour le bouton OAuth (« Continuer avec Google » → MOB-2.3) — bouton désactivé + libellé « Bientôt disponible », **sans** flow

- [x] **T4 — Écran réinitialisation `(auth)/reset-password.tsx`** (AC: 3, 4)
  - [x] Form RHF + `zodResolver(forgotPasswordSchema)` (email seul)
  - [x] Submit → `authClient.requestPasswordReset({ email, redirectTo })` (API courante ; `forgetPassword` est l'alias déprécié — aligné sur le web) → **toujours** message neutre (succès **ou** échec), anti-énumération
  - [x] `redirectTo` : **Option A** retenue → pointe vers la page web de reset (`${WEB_URL}/reset-password`, `WEB_URL` dérivé de `EXPO_PUBLIC_WEB_URL` ?? `EXPO_PUBLIC_BETTER_AUTH_URL`)
  - [x] **Scope** : déclenchement de l'email seulement (FR-007). Saisie mobile du nouveau mdp (Option B / deep link) **non implémentée** — l'utilisateur termine via le lien web (backend inchangé)

- [x] **T5 — i18n + accessibilité** (AC: 4)
  - [x] Clés `auth.common.*`, `auth.signup.*`, `auth.login.*`, `auth.reset.*`, `auth.errors.*` dans `locales/fr.json` **et** `en.json` — **zéro** chaîne en dur
  - [x] `accessibilityLabel` (label du champ) / `accessibilityRole` ; `keyboardType="email-address"`, `autoCapitalize="none"`, `autoCorrect={false}`, `textContentType`/`autoComplete` (`email`, `new-password`, `current-password`) pour l'autofill iOS/Android
  - [x] `<KeyboardAvoidingView>` (+ `ScrollView keyboardShouldPersistTaps`) sur les 3 écrans

- [x] **T6 — Tests** (AC: tous)
  - [x] `signup.test.tsx`, `login.test.tsx`, `reset-password.test.tsx` (RNTL, sous `src/__tests__/`) : rendu, validation Zod inline (email invalide / pwd court), submit appelle le bon `authClient.*` (mocké), état loading + anti-double-submit, message générique login KO, message neutre reset (succès **et** échec)
  - [x] Mock `@/lib/auth/client` + `expo-router` (aucun réseau réel) ; `userEvent` (pas `fireEvent`) pour awaiter les updates async RHF (RNTL v14 + React 19)
  - [x] `pnpm --filter @ridenrest/mobile test|typecheck|lint` **verts** (33 tests mobile + 38 shared ; typecheck OK ; lint exit 0)

- [ ] **T7 — Validation manuelle** (AC: 1, 2, 3) — ⏳ **À FAIRE par l'utilisateur** (interaction device + boîte mail : non automatisable par l'agent)
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

claude-opus-4-8[1m] (bmad-dev-story)

### Debug Log References

- **Tests RNTL v14 + React 19 — « overlapping act() » qui corrompt les renders suivants** : avec `fireEvent`, toute interaction déclenchant une mise à jour async de React Hook Form (`handleSubmit` → bascule `isSubmitting`, validation Zod async) laisse un `act()` ouvert ; le `render()` du test suivant ne se commit alors plus (`screen.toJSON()` === `null` → « Unable to find … »). Diagnostic : la 1re paire de tests passait, mais tout test postérieur à une interaction échouait, y compris un simple rendu. Pistes écartées (n'ont rien corrigé) : drain `act(async()=>{})` post-assert, `afterEach` avec `setTimeout(0)`, `accessibilityRole="alert"`, bordure d'erreur NativeWind dynamique. **Solution** : remplacer `fireEvent` par `userEvent` (`userEvent.setup()` + `await user.type/press`), qui awaite proprement les updates async et clôt l'`act`. → 33 tests verts, 0 warning.
- **Typed routes Expo Router obsolètes** : `typedRoutes: true` ; `.expo/types/router.d.ts` ne listait pas `signup`/`reset-password` → erreurs TS2345 au typecheck. `expo export` ne régénère **pas** ce fichier ; seul le serveur de dev (`expo start`) le régénère (file watcher). Lancé brièvement en arrière-plan puis arrêté → types à jour, typecheck vert.
- **`pnpm lint` rouge en local (pré-existant, hors story)** : confirmé par `git stash` (la baseline échoue déjà, 9315 erreurs). Causes : (1) artefacts `storybook-static/**` (gitignored mais non exclus d'ESLint), (2) `__mocks__/*.js` qui utilisent `jest` (`no-undef` actif pour le JS, désactivé pour le TS). Corrigé dans `eslint.config.js` : ignore `storybook-static/**` + global `jest` pour `__mocks__/**/*.js`. → lint exit 0.

### Completion Notes List

- **T1** — Schémas auth partagés créés (`packages/shared/src/schemas/auth.schema.ts` : `signUpSchema`/`signInSchema`/`forgotPasswordSchema` + `PASSWORD_MIN_LENGTH=8`), messages = **clés i18n** (résolues via `t()`), exportés depuis `src/index.ts`. 8 tests vitest. Le web n'est **pas** refactoré (hors périmètre story mobile) mais peut désormais consommer ces schémas.
- **Dépendances ajoutées à `apps/mobile`** (mandatées par les tâches RHF + Zod, alignées sur le web) : `react-hook-form@^7.71.2`, `@hookform/resolvers@^5.2.2`, `zod@^4.3.6`. Déjà hoistées (le web en dépend) → résolues sans souci.
- **Primitifs UI créés** : `components/ui/input.tsx` (TextInput stylé, `forwardRef`, `h-11` cible tactile), `text-field.tsx` (label + input + erreur inline, `accessibilityLabel`), `error-banner.tsx` (équivalent RN d'`ErrorMessage`, jamais `Alert.alert`) + story `text-field.stories.tsx`.
- **T2/T3/T4** — 3 écrans RHF + `zodResolver` + `<Controller>`. Signup dérive le `name` Better Auth de l'email. Login : message générique + slot Google désactivé. Reset : **Option A** (`redirectTo` → page web), message neutre succès/échec via `requestPasswordReset` (API courante, alias `forgetPassword` déprécié).
- **T5** — Clés i18n FR + EN complètes ; a11y/autofill (`keyboardType`, `autoCapitalize`, `textContentType`/`autoComplete`) ; `KeyboardAvoidingView` + `ScrollView`.
- **T6** — 3 suites RNTL sous `src/__tests__/` (jamais sous `src/app/` — gotcha `require.context`), mocks `@/lib/auth/client` + `expo-router`, `userEvent`. **Gate vert** : mobile 33 tests / typecheck / lint (exit 0) ; shared 38 tests / lint / build ; `expo export` iOS OK (bundle sans fichiers de test).
- **T7 (manuel)** — **NON exécuté** : nécessite l'interaction device tap-à-tap et l'accès à une boîte mail (email Resend), hors capacité de l'agent. Simulateur iPhone 17 Pro démarré + serveur dev 8081 actif, mais l'app n'est pas installée (build natif requis). Checklist laissée à l'utilisateur (voir T7). La logique est couverte au niveau test/unit + build ; la persistance de session + guards a déjà été éprouvée device en MOB-2.1 (T7).

### File List

**Créés**
- `packages/shared/src/schemas/auth.schema.ts`
- `packages/shared/src/schemas/auth.schema.test.ts`
- `apps/mobile/src/app/(auth)/signup.tsx`
- `apps/mobile/src/app/(auth)/reset-password.tsx`
- `apps/mobile/src/components/ui/input.tsx`
- `apps/mobile/src/components/ui/text-field.tsx`
- `apps/mobile/src/components/ui/error-banner.tsx`
- `apps/mobile/src/components/ui/text-field.stories.tsx`
- `apps/mobile/src/__tests__/signup.test.tsx`
- `apps/mobile/src/__tests__/login.test.tsx`
- `apps/mobile/src/__tests__/reset-password.test.tsx`

**Modifiés**
- `packages/shared/src/index.ts` (exports schémas auth)
- `apps/mobile/src/app/(auth)/login.tsx` (placeholder → formulaire réel + slot OAuth)
- `apps/mobile/src/lib/i18n/locales/fr.json` (clés `auth.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (clés `auth.*`)
- `apps/mobile/package.json` (deps RHF / resolvers / zod)
- `apps/mobile/eslint.config.js` (ignore `storybook-static/**` + global `jest` pour `__mocks__`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut MOB-2-2)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 0.1 | Création story MOB-2.2 (ready-for-dev) — écrans email signup/login/reset (RHF + Zod partagé), anti-énumération, états loading, i18n + autofill/a11y. Backend Better Auth réutilisé tel quel. | bmad-create-story |
| 2026-06-08 | 0.2 | Implémentation T1–T6 : schémas Zod partagés, écrans signup/login/reset (RHF + zodResolver + Controller), primitifs UI Input/TextField/ErrorBanner, i18n FR/EN + a11y/autofill, 33 tests mobile (userEvent) + 8 schémas shared. Gates test/typecheck/lint verts + `expo export` OK. T7 (validation manuelle device + email) laissée à l'utilisateur. Statut → review. | bmad-dev-story |

## Review Findings

_Revue adversariale (3 couches : Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 2026-06-12. Périmètre : changements non commités MOB-2.2 (tracked + untracked, 20 fichiers, ~1509 lignes)._

### Decision-needed

- [x] [Review][Decision→Patch] **Login écrase TOUTES les erreurs en `invalidCredentials`** — _résolu (Guillaume, 2026-06-12) : **distinguer les non-credentials**._ Surfacer un message distinct pour réseau / `TOO_MANY_REQUESTS` / 5xx, en gardant le message générique uniquement sur les vraies erreurs d'authentification (anti-énumération préservée). → voir patch P7 ci-dessous. [Blind Hunter #4]
- [x] [Review][Decision] **Bouton DEV « Déconnexion (DEV — T7) » (chaîne FR en dur) dans `adventures/index.tsx`** — _résolu (Guillaume, 2026-06-12) : **conservé jusqu'à T7**._ Affordance nécessaire à la validation manuelle T7 (encore à faire). À retirer juste après T7. Pas de modif code maintenant ; reste un item ouvert lié à T7. [Blind Hunter #17 + Acceptance Auditor]

### Patch

_Les 7 patches ont été **appliqués** le 2026-06-12 (Guillaume, « tout appliquer »). Gates verts post-fix : shared 39 tests + build OK ; mobile 39 tests (33 → 39, +6 chemins d'échec) + typecheck OK + lint exit 0. P7 issu de la décision D1._

- [x] [Review][Patch] **[High] `onSubmit` sans try/catch — rejet réseau = aucun feedback** [apps/mobile/src/app/(auth)/login.tsx, signup.tsx, reset-password.tsx] — un rejet de promesse (`@better-fetch` ne convertit pas l'offline/timeout en `{error}` côté client React) laisse login/signup sans bannière (le bouton se réactive en silence) et fait que reset n'affiche **jamais** son message neutre (`setSent(true)` après le `await` qui throw). Envelopper d'un try/catch → erreur générique (login/signup) / message neutre (reset) sur throw. [Blind Hunter #2 + Edge Case Hunter]
- [x] [Review][Patch] **[Med] Pas de branche `else` pour `{data:null,error:null}`** [login.tsx, signup.tsx onSubmit] — si le client résout sans `data` ni `error` (204/corps vide, cas géré explicitement par l'api-client MOB-2.1), aucune navigation ni bannière → impasse silencieuse. Ajouter un fallback erreur générique. [Blind Hunter #1 + Edge Case Hunter]
- [x] [Review][Patch] **[Med] Email non trimmé dans le schéma partagé** [packages/shared/src/schemas/auth.schema.ts] — un espace de fin (fréquent via autofill mobile) fait échouer la `.email()` sur une adresse valide + pollue le `name` dérivé. Ajouter `.trim()` (`z.string().trim().email(...)`). [Edge Case Hunter]
- [x] [Review][Patch] **[Low] Indicateur de chargement absent (label-swap seul)** [3 écrans / components/ui/button] — AC4 demande « désactivé + indicateur » ; actuellement seul le libellé change, pas de `ActivityIndicator` ni `accessibilityState={{ busy: true }}`. [Acceptance Auditor]
- [x] [Review][Patch] **[Low] Couverture de test des chemins d'échec** [src/__tests__/*.test.tsx] — aucun test n'exerce `mockRejectedValue` (throw réseau), et login/reset n'ont pas d'assertion loading/anti-double-submit. À ajouter (couvre P1 + AC4). [Blind Hunter #11/#12/#13]
- [x] [Review][Patch] **[Low] Polish a11y/UX** [login.tsx, signup.tsx] — `returnKeyType="next"` sur le champ email sans focus-advance (touche morte malgré `forwardRef` sur `Input`) ; toggle show/hide sans `accessibilityState`. [Blind Hunter #9/#10]
- [x] [Review][Patch] **[Low] (issu D1) Distinguer les erreurs non-credentials au login** [login.tsx onSubmit] — mapper réseau / `TOO_MANY_REQUESTS` / 5xx vers un message distinct (clés i18n dédiées) tout en gardant `auth.errors.invalidCredentials` pour les erreurs d'authentification réelles (anti-énumération). [résolu depuis Decision D1]

### Deferred

- [x] [Review][Defer] **`redirectTo`/`WEB_URL` fallback `http://localhost:3011`** [reset-password.tsx] — deferred : même classe que le durcissement HTTPS/env déjà différé en MOB-2.1 (`better-auth-url-https-guard`) ; le client auth partage exactement le même défaut localhost.
- [x] [Review][Defer] **Dérivation du `name` non bornée/non assainie** [signup.tsx] — deferred : qualité de donnée (unicode, `+tag`, 64 car. non bornés) ; non bloquant, le `||` couvre déjà le local-part vide.

### Dismissed (9)

Double-submit via `onSubmitEditing` (re-entrancy déjà gardée par `handleSubmit` de RHF) · `t('' )`/défaut Zod brut (inatteignable, `defaultValues=''` force la `.email()`/`.min()` à message i18n) · perte de focus au toggle (spéculatif, `setShowPassword(v=>!v)` stable) · `textContentType` iOS strong-pw · setState post-unmount (no-op React 19) · `Input` consommé via `TextField` seulement (composition voulue) · assertions via `t()` + casts `as unknown as jest.Mock` (patterns de test acceptables, parité i18n fr/en vérifiée clean) · web non refacto vers schémas partagés (hors périmètre story, documenté) · spec cite `forgetPassword` au lieu de `requestPasswordReset` (texte spec obsolète, code correct/aligné web).
