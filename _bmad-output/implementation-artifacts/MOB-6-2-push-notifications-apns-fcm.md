---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.2 : Notifications push (APNs / FCM)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **recevoir une notification push quand mon analyse de densité est terminée**,
So that **je n'ai pas à garder l'app ouverte en attendant le résultat**.

> **2ᵉ story de l'epic MOB-6** (Observabilité, Conformité Stores & Release). Ajoute un nouveau module natif (`expo-notifications`) côté mobile **et** un `PushModule` côté NestJS. Le backend densité (queue `density-analysis`, processor, statut sur `adventures`) et le fallback in-app (polling `useDensity`) **existent déjà** — on greffe l'envoi push sur le point de complétion existant sans réécrire le flux densité.
>
> ⚠️ **Module natif neuf → `expo prebuild --clean -p ios` ET `-p android` OBLIGATOIRE** avant `pnpm sim`/`run:android`, sinon `Cannot find native module` / crash au boot (règle AGENTS.md « Module natif neuf = rebuild iOS ET Android »). L'agent ne peut pas builder Android dans son environnement → **validation device par plateforme** (iOS via `pnpm sim` ; Android = Guillaume), reporting anti-arrondi.
>
> 🟢 **RGPD** : un push token n'est pas une donnée de position. Le payload de notification ne transporte **jamais** de coordonnée GPS — seulement `adventureId` (déjà côté serveur) + un libellé. Le flag « permission déjà demandée » se persiste en **AsyncStorage** (donnée non sensible), **jamais** en `expo-secure-store` (réservé aux tokens auth).
>
> 🔴 **Permission au BON MOMENT (AC1)** : le prompt OS de notifications n'est demandé **ni à l'onboarding ni au boot**, mais **juste après la 1ère analyse de densité déclenchée** (`sidebar-density-section.tsx` → après un `trigger()` réussi). Demander trop tôt = refus systématique = fonctionnalité morte.

## Acceptance Criteria

1. **Given** l'app mobile
   **When** je configure `expo-notifications`
   **Then** les tokens push **APNs (iOS)** et **FCM (Android)** sont obtenus (`getExpoPushTokenAsync` → `ExponentPushToken[...]`) et **enregistrés côté serveur** (`POST /push-tokens`, associés au `userId` via `JwtAuthGuard`) (FR-MOB-012)
   **And** la permission notifications est demandée **après la première analyse de densité** (pas à l'onboarding, pas au boot) (FR-MOB-015)
   **And** l'absence de credentials push (dev/simulateur iOS, `!Device.isDevice`) **n'émet aucune erreur** — la permission/registration est simplement no-op sûr

2. **Given** une analyse de densité terminée côté serveur (`density_status` → `'success'`)
   **When** l'événement se produit dans le processor BullMQ
   **Then** une notification push est délivrée à **tous les tokens de l'utilisateur propriétaire de l'aventure** (via Expo Push API), avec un libellé localisé et un `data: { adventureId }` permettant le deep-link vers l'écran carte
   **And** l'envoi push est **best-effort** : une erreur d'envoi (token expiré, réseau) **ne fait PAS échouer** le job densité (log + continue), et un `DeviceNotRegistered` purge le token en base

3. **Given** la permission push refusée (ou non demandée)
   **When** une analyse se termine
   **Then** le **fallback in-app existant** (polling `useDensity` toutes les 3 s → affichage du résultat quand `success`) informe l'utilisateur **sans erreur ni blocage** — aucune régression du comportement MOB-4.4

4. **Given** la déconnexion / suppression de compte (MOB-2.5)
   **When** la session se termine
   **Then** le token push du device est désinscrit côté serveur (`DELETE /push-tokens/:token`) pour ne plus recevoir de notifications rattachées à l'ancien compte

## Tasks / Subtasks

- [x] **T1 — Schéma DB `push_tokens` + migration** (AC: 1, 2)
  - [x] Créer `packages/database/src/schema/push-tokens.ts` : `id` (⚠️ **`text` + `crypto.randomUUID()`**, PAS `uuid` — convention projet `adventures`, et `user.id` est `text` → FK `text`), `user_id` FK → `user.id` (`onDelete: 'cascade'`), `token text notNull` unique, `platform` pgEnum `push_platform` (`['ios','android']`), `created_at`/`updated_at`. Index `idx_push_tokens_user_id`.
  - [x] Exporter la table dans le barrel **`packages/database/src/index.ts`** (⚠️ déviation : la story disait `schema/index.ts` qui **n'existe pas** ; le vrai barrel est `src/index.ts`) + enregistrée dans `db.ts` (`drizzle({ schema })`).
  - [x] **`drizzle-kit generate`** → `migrations/0019_orange_red_skull.sql` (CREATE TYPE `push_platform` + CREATE TABLE `push_tokens` + FK cascade + index) enregistrée dans `_journal.json` (idx 19). `.sql` **jamais** écrit à la main.

- [x] **T2 — Backend : `PushModule` NestJS (tokens + envoi)** (AC: 1, 2, 4)
  - [x] `push.module.ts` + `push.controller.ts` + `push.service.ts` + `push.repository.ts` (feature standard ; **toutes** les requêtes Drizzle dans le repository : `upsertToken`/`deleteByUserAndToken`/`deleteByToken`/`findTokensByUserId`/`findAdventureOwnerId`).
  - [x] `push.controller.ts` : `@Controller('push-tokens')` (JwtAuthGuard global). `POST` (DTO `RegisterPushTokenDto` `{ token, platform }` class-validator, `@CurrentUser()`) → upsert (dédupe on conflict `token`). `DELETE :token` (204) → **scopé à l'utilisateur** (`user.id` + token — durcissement vs story qui disait juste `:token`). Données brutes (ResponseInterceptor).
  - [x] `push.service.ts` : `registerToken()`, `removeToken(userId, token)`, `notifyDensityComplete(adventureId)` = résout l'owner puis envoie via **Expo Push API** (`expo-server-sdk` `^6.1.0`). ⚠️ v6 : la méthode est **`chunkPushNotifications`** (renommée depuis `chunkPushMessages`). Best-effort de bout en bout (try/catch global) ; purge `DeviceNotRegistered` au niveau **ticket** (corrélation `tickets[i]`↔`chunk[i].to`) — pas de polling receipts différé (décision MVP). `accessToken` (`EXPO_ACCESS_TOKEN`) optionnel.
  - [x] `PushModule` enregistré dans `app.module.ts`.
  - [x] Tests co-localisés `push.service.test.ts` (9 tests Jest) : envoi + `data.adventureId`, purge `DeviceNotRegistered`, no-op sans token / sans owner, filtre tokens non-Expo, jamais de throw sur échec réseau, `handleDensityCompleted` délègue.

- [x] **T3 — Backend : brancher l'envoi sur la complétion densité** (AC: 2)
  - [x] `density-analyze.processor.ts` : injection `EventEmitter2` + `this.eventEmitter.emit('density.completed', { adventureId })` **après** `setDensityAnalyzedAt` (post-`success`, l.~99). Listener `@OnEvent('density.completed')` dans `PushService` (EventEmitterModule global). **Découplage retenu** (recommandation Dev Notes) : densité ne connaît pas push. Tests processor étendus (émet après success ; **n'émet pas** sur error).
  - [x] ⚠️ `userId` **absent** de `job.data` → résolu via lookup `adventures.userId` (`findAdventureOwnerId`, aucune PII loggée). Pas de notif sur `'error'` (émission après `success` uniquement → fallback in-app suffit).

- [x] **T4 — Mobile : dépendances natives + config** (AC: 1)
  - [x] `expo-notifications@56.0.16` + `expo-device@56.0.4` ajoutés **pin exact** (`-E`, sans `~` — versions de `bundledNativeModules.json`, gotcha dyld « Symbol not found »).
  - [x] `app.config.ts` → `plugins` : `['expo-notifications', { color: '#2D6A4A' }]` (pas d'`icon` custom → asset absent = défaut app ; APNs `aps-environment` géré par EAS credentials). Prebuild iOS ✓ → entitlement `aps-environment` présent + `ExpoNotifications (56.0.16)` / `ExpoDevice (56.0.4)` dans `Podfile.lock`. `POST_NOTIFICATIONS` Android : ajoutée par le plugin (à vérifier au prebuild Android — Guillaume).
  - [x] `scripts/check-native-config.mjs` : invariant « plugin `expo-notifications` présent » ajouté (5 invariants OK).
  - [x] **`expo prebuild -p ios`** (ios/ déplacé aside pour ENOTEMPTY) : module vérifié dans `ios/Podfile.lock`. `-p android` = Guillaume (SDK Android non dispo dans l'env agent).

- [x] **T5 — Mobile : hook permission + registration (timing correct)** (AC: 1, 3)
  - [x] `src/lib/notifications/push-storage.ts` — flags AsyncStorage (`ridenrest:push-prompted`, `ridenrest:push-token`), best-effort (jamais de throw, jamais `expo-secure-store`) — modèle `consent-storage.ts`.
  - [x] `src/hooks/use-push-notifications.ts` — logique extraite en fonction pure **`requestAndRegisterPushToken()`** (testable hors React), hook `usePushNotifications()` la mémoïse. `Device.isDevice` guard → one-shot (`push-prompted`) → `requestPermissionsAsync()` → si accordé `getExpoPushTokenAsync({ projectId })` (via `expo-constants`) → `POST /push-tokens` + mémorise le token. Refus/simu/pas de projectId → no-op non bloquant. Try/catch global (best-effort).
  - [x] Façade `src/lib/api/push.ts` — `registerPushToken({ token, platform })` (POST) ; `unregisterPushToken(token)` (DELETE, `encodeURIComponent` pour `[`/`]`). Chemins propres (pas `/api/...`).
  - [x] **Trigger** : `sidebar-density-section.tsx` `onConfirm` après `await trigger(categories)` → `void requestAndRegister()` (one-shot interne). = « après la 1re analyse » AC1.
  - [x] Handler foreground + canal Android `default` + `addNotificationResponseReceivedListener` + cold-start (`getLastNotificationResponseAsync`) → deep-link `map/[id]`. Regroupé dans `src/lib/notifications/push-config.ts` + hook `src/hooks/use-notification-observer.ts` monté une fois dans `_layout.tsx` (déviation mineure : hook dédié plutôt qu'inline).

- [x] **T6 — Mobile : désinscription à la déconnexion** (AC: 4)
  - [x] `src/hooks/use-account.ts` : `unregisterPushBeforeSignOut()` (lit le token stocké → `DELETE /push-tokens/:token`) appelé dans la mutation `logout` **avant** `signOut()` (JWT encore valide), best-effort. `finishSession` (logout ET delete) : `clearPushStorage()` (efface token + flag). Suppression de compte : les tokens tombent en cascade DB (FK `onDelete: cascade`).

- [x] **T7 — Tests** (AC: 1, 2, 3, 4)
  - [x] Mocks natifs `__mocks__/expo-notifications.js` + `__mocks__/expo-device.js` (CommonJS, sans JSX ; ⚠️ `isDevice` = **getter/setter** sinon l'interop wildcard Babel fige la valeur → non surchargeable en test) + `jest.mock(...)` dans `jest.setup.ts`.
  - [x] `src/hooks/use-push-notifications.test.tsx` (5 tests co-localisés) : accordé → token enregistré (+ flags) ; refus → no-op + one-shot ; `!Device.isDevice` → no-op ; déjà prompté → no re-prompt ; échec token → pas de throw. + `push-config.test.ts` (extractAdventureId + handler).
  - [x] Régression AC3 : `useDensity`/`densityPollInterval` **inchangés** (tests densité verts). Fallback in-app polling intact.
  - [x] Backend `push.service.test.ts` (§T2). **Gate VERTE** : jest api 418/418 · jest mobile 618/618 · tsc 0 (api+mobile) · eslint 0 erreur · `check:native-config` OK · `expo export -p ios` OK.

- [x] **T8 — Doc Sync + prérequis externes** (règle CRITIQUE project-context)
  - [x] `apps/mobile/AGENTS.md` : section « Notifications push : APNs / FCM (MOB-6.2) » (timing, prebuild 2 plateformes, no-op sim, best-effort, deep-link, mock getter/setter).
  - [x] `apps/mobile/README.md` : section « Notifications push — APNs / FCM » + tableau credentials.
  - [x] `sprint-status.yaml` : MOB-6-2 → `in-progress` (→ `review` en fin).
  - [x] `epics-mobile.md` : **aucun changement requis** — les ACs (FR-MOB-012/015) sont satisfaites telles quelles. Déviations d'implémentation documentées ici (Completion Notes).
  - [x] **Prérequis Guillaume (hors-code / EAS)** documentés (README T4/T8) : clé APNs `.p8` (EAS), `google-services.json` + clé FCM V1, `EXPO_ACCESS_TOKEN` optionnel côté API. Sans credentials → no-op sûr.

- [~] **T9 — Validation device (par plateforme, anti-arrondi)** (AC: 1, 2, 3)
  - [x] iOS : `expo prebuild -p ios` ✓ (pods `ExpoNotifications`/`ExpoDevice` liés, entitlement `aps-environment` ✓) ; `pnpm sim` (build Release, **0 error**) → app **installée + lancée + BOOT SANS CRASH** (pid vivant dans launchd, **aucun `.ips`** généré, écran de connexion rendu correctement — screenshot vérifié). Les nouveaux modules natifs chargent sans dyld crash. ⚠️ Push réel **impossible sur simulateur** (`Device.isDevice === false` → no-op sûr, comportement attendu) → **envoi réel = device physique (Guillaume)**.
  - [ ] Android : `expo prebuild -p android` + `expo run:android` + `POST_NOTIFICATIONS` présente + envoi réel FCM = **Guillaume** (SDK Android non dispo dans l'env agent, cf. MOB-6.1).
  - [x] Reporting **par plateforme** (jamais de « ✓ » global) — voir Completion Notes.

### Review Findings

- [x] [Review][Patch] `deleteAccount` ne désinscrit pas le token push avant la suppression du compte — AC4 gap (cascade DB compense mais dérogation spec) [apps/mobile/src/hooks/use-account.ts:83-104]
- [x] [Review][Patch] `setPushPrompted(true)` posé avant le succès de l'enregistrement serveur — un échec réseau pose la garde one-shot définitivement sans token côté serveur [apps/mobile/src/hooks/use-push-notifications.ts:53-64]
- [x] [Review][Patch] `registerToken` renvoie le `userId` interne au client via `.returning()` — fuite inutile d'un champ sensible [apps/api/src/push/push.repository.ts:13-23]
- [x] [Review][Patch] Navigation cold-start peut rater si le navigateur expo-router n'est pas encore monté quand `getLastNotificationResponseAsync` se résout [apps/mobile/src/hooks/use-notification-observer.ts:34-46]
- [x] [Review][Patch] `setStoredPushToken` peut échouer en silence après enregistrement serveur — token non stocké localement → logout ne peut pas désinscrire [apps/mobile/src/hooks/use-push-notifications.ts:63-64]
- [x] [Review][Patch] Validation du format Expo push token absente côté serveur — n'importe quelle string passe le DTO [apps/api/src/push/dto/register-push-token.dto.ts]
- [x] [Review][Patch] Race condition dans la garde one-shot : deux appels simultanés à `requestAndRegisterPushToken()` passent tous les deux `getPushPrompted()` [apps/mobile/src/hooks/use-push-notifications.ts:44-54]
- [x] [Review][Patch] `deleteByToken` non scopé à l'utilisateur dans le purge `DeviceNotRegistered` — défense en profondeur manquante [apps/api/src/push/push.service.ts:90-99]
- [x] [Review][Defer] N DELETEs séquentiels pour le purge `DeviceNotRegistered` — optimisation batch non critique MVP [apps/api/src/push/push.service.ts:71-73] — deferred, performance optimization
- [x] [Review][Defer] Apostrophe Unicode U+2019 dans `DENSITY_DONE_BODY` — cosmétique, code TypeScript valide [apps/api/src/push/push.service.ts:17] — deferred, cosmetic

## Dev Notes

### Architecture & contraintes (à respecter à la lettre)

- **Ne PAS réécrire le flux densité.** Tout existe (MOB-4.4) : queue `density-analysis`, `density-analyze.processor.ts`, statut sur `adventures.density_status` (enum `idle|pending|processing|success|error`), et côté mobile le hook `useDensity` + `densityPollInterval` (3 s). On **greffe** l'envoi push sur le point de complétion (`setDensityStatus('success')`, `density-analyze.processor.ts:~98`) et on **réutilise** le polling comme fallback AC3.
- **Piège `userId`** : le payload du job densité = `{ adventureId, segmentIds, categories }` — **pas de `userId`**. Résoudre l'owner via `adventures.userId` (lookup DB dans le service push), OU ajouter `userId` au payload dans `density.service.ts` (`queue.add('analyze-density', ...)`). Préférer le lookup (moins de surface de changement, pas de PII dans la queue).
- **Envoi serveur = Expo Push API** (`expo-server-sdk`, un seul endpoint route APNs + FCM). Plus simple que d'intégrer APNs/FCM directement. Best-effort : chunk + tickets + receipts, purge `DeviceNotRegistered`, **ne jamais** faire échouer le job densité sur une erreur d'envoi.
- **RGPD** : payload notif = `{ adventureId }` + libellé localisé, **zéro GPS**. Token push en base (`push_tokens`) rattaché à `user.id`. Flag « prompt déjà montré » en AsyncStorage (non sensible), jamais SecureStore.
- **Timing permission** (AC1) : demandé **après la 1ère analyse densité** dans `sidebar-density-section.tsx`, pas au boot/onboarding. Garde one-shot via flag AsyncStorage.
- **Fallback (AC3)** : rien à créer côté polling. Si permission refusée, `useDensity` (3 s) affiche le résultat quand `success` — comportement MOB-4.4 intact.
- **Contrainte native** : `expo-notifications` = module natif → prebuild `--clean` iOS **ET** Android (règle MOB-5.2 : rebuilder une seule plateforme = crash au boot de l'autre). Pin exact `bundledNativeModules.json`.

### Source tree — fichiers à toucher

| Action | Fichier | Note |
|---|---|---|
| NEW | `packages/database/src/schema/push-tokens.ts` | table + enum `push_platform` (drizzle-kit generate) |
| UPDATE | `packages/database/src/schema/index.ts` | export table |
| NEW | `apps/api/src/push/push.module.ts` / `.controller.ts` / `.service.ts` / `.repository.ts` | feature NestJS standard |
| NEW | `apps/api/src/push/dto/register-push-token.dto.ts` | class-validator `{ token, platform }` |
| NEW | `apps/api/src/push/push.service.test.ts` | tests Jest |
| UPDATE | `apps/api/src/app.module.ts` | enregistrer `PushModule` |
| UPDATE | `apps/api/src/density/jobs/density-analyze.processor.ts` | emit `density.completed` après `setDensityStatus('success')` (~l.98) |
| NEW | `apps/mobile/src/hooks/use-push-notifications.ts` | permission + register (Device.isDevice guard) |
| NEW | `apps/mobile/src/lib/api/push.ts` | façade `POST`/`DELETE /push-tokens` (chemin propre) |
| NEW | `apps/mobile/src/lib/notifications/push-storage.ts` | flag AsyncStorage (modèle `consent-storage.ts`) |
| UPDATE | `apps/mobile/src/components/map/sidebar-density-section.tsx` | trigger permission après `trigger()` (~l.209) |
| UPDATE | `apps/mobile/src/hooks/use-account.ts` | `unregisterPushToken` dans `finishSession` (avant signOut) |
| UPDATE | `apps/mobile/src/app/_layout.tsx` (ou boot) | `setNotificationHandler` + response listener (deep-link) |
| UPDATE | `apps/mobile/app.config.ts` | plugin `expo-notifications` (+ `googleServicesFile` si fourni) |
| UPDATE | `apps/mobile/scripts/check-native-config.mjs` | invariant plugin notifications |
| UPDATE | `apps/mobile/eas.json` | credentials/env push si nécessaire |
| NEW | `apps/mobile/__mocks__/expo-notifications.js` (+ device) | mocks Jest |
| UPDATE | `apps/mobile/jest.setup.ts` | `jest.mock` notifications/device |

### Points d'ancrage précis (recherche 2026-07-04)

- **Backend densité** : `apps/api/src/density/density.service.ts:35` (`queue.add('analyze-density', {adventureId, segmentIds, categories})`) ; `density-analyze.processor.ts:63` (`process()`), `:98` (`setDensityStatus('success')` ← **point d'ancrage push**), `:103` (`'error'`). Statut : `packages/database/src/schema/adventures.ts:5` (`densityStatusEnum`), `:16` (`density_status`).
- **EventEmitter** monté : `apps/api/src/app.module.ts:39` (`EventEmitterModule.forRoot()`), déjà utilisé par `segments.service.ts`, `access-worker.service.ts`, `gpx-parse.processor.ts`.
- **Service email existant (référence, non réutilisable)** : `apps/api/src/feedbacks/feedbacks.service.ts:17` (Resend, no-op sans clé) — modèle de « fire-and-forget key-gated », mais aucun service push n'existe.
- **Mobile polling** : `apps/mobile/src/hooks/use-density.ts:37` (`densityPollInterval`), `:44` (`useQuery ['density', adventureId]`), `:47` (`refetchInterval`), `:71` (`trigger`). Façade : `apps/mobile/src/lib/api/density.ts:12` / `:20`. UI : `apps/mobile/src/components/map/sidebar-density-section.tsx:73/205/209`.
- **Permission runtime (modèle MOB-5.1)** : `apps/mobile/src/hooks/use-live-mode.ts:134` (`requestForegroundPermissionsAsync`), `:180` (`Linking.openSettings`) ; overlay `src/components/live/geolocation-consent.tsx` (⚠️ `<View>` absolue, pas `<Modal>`) ; persistance `src/lib/live/consent-storage.ts:12` (AsyncStorage best-effort).
- **Façade API** : `apps/mobile/src/lib/api/api-client.ts:16` (`API_BASE = ${EXPO_PUBLIC_API_URL}/api`), `:193` (`apiFetch`, JWT + 401-refresh) ; modèle façade `src/lib/api/profile.ts:21` (`PATCH /profile`).
- **Config native** : `apps/mobile/app.config.ts:20` (`ios.bundleIdentifier: app.ridenrest`), `:36` (`android.package`), `:44` (`android.permissions`), `:57-137` (`plugins`), `:145` (`extra.eas.projectId`), `:149` (`runtimeVersion.policy: appVersion`).

### Testing

- **Runner** : mobile = Jest + jest-expo + `@testing-library/react-native` ; api = Jest. Setup mobile global `jest.setup.ts`.
- **Mocks natifs** : fichier par module dans `apps/mobile/__mocks__/` + `jest.mock('<module>')` dans `jest.setup.ts`. **Aucun JSX dans une factory** (transform NativeWind → variable hors-scope interdite) → `jest.fn(() => null)`.
- **Placement** : tests important une route → `apps/mobile/src/__tests__/` (JAMAIS sous `src/app/` — `require.context` d'expo-router casse `expo export`). Tests hook/lib co-localisés.
- **Backend** : tests co-localisés `.service.test.ts` (Jest). Ne pas mettre de query Drizzle en dehors du repository.

### Project Structure Notes

- Migration DB **uniquement** via `drizzle-kit generate` (schéma + `.sql` + `_journal.json` commités ensemble). Un `.sql` écrit à la main n'est jamais appliqué en prod (deploy `drizzle-kit migrate`).
- `EXPO_PUBLIC_*` = embarqué (public). Secrets d'envoi push (clé Expo/FCM serveur) = **API NestJS**, `.env` VPS, jamais dans le bundle mobile.
- Config Expo dans `app.config.ts` (TS), **jamais `app.json`**.
- Reporting device **par plateforme** (règle anti-arrondi AGENTS.md). Le push réel exige un device physique (pas de push APNs sur simulateur iOS).

### Décisions à trancher pendant l'impl (documenter dans Completion Notes)

- Découplage `EventEmitter` (`density.completed`) **vs** appel direct `pushService.notifyDensityComplete` dans le processor. Recommandation : EventEmitter (déjà en place, découple densité ↔ push).
- Résolution `userId` : lookup `adventures.userId` **vs** ajout au payload du job. Recommandation : lookup.
- Envoi : Expo Push API (`expo-server-sdk`) **vs** APNs/FCM directs. Recommandation : Expo Push API (un endpoint, gère les deux stores).
- Libellé de la notification : localisé (i18n) — coordonner avec MOB-6.3 (finition i18n) si les clés n'existent pas encore.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story-MOB-6.2] (l.1075-1094) — ACs, FR-MOB-012, FR-MOB-015
- [Source: apps/api/src/density/jobs/density-analyze.processor.ts] — point d'ancrage push (`setDensityStatus('success')`)
- [Source: apps/api/src/density/{density.service,density.controller,density.repository}.ts] — flux densité existant
- [Source: packages/database/src/schema/adventures.ts] — `density_status` enum + colonnes
- [Source: apps/api/src/app.module.ts] — EventEmitterModule global
- [Source: apps/mobile/src/hooks/use-density.ts + src/lib/api/density.ts] — polling fallback (AC3, MOB-4.4)
- [Source: apps/mobile/src/hooks/use-live-mode.ts + src/components/live/geolocation-consent.tsx + src/lib/live/consent-storage.ts] — patterns permission runtime + consentement + AsyncStorage (MOB-5.1)
- [Source: apps/mobile/src/lib/api/api-client.ts + src/lib/api/profile.ts] — façade API (chemins propres, JWT)
- [Source: apps/mobile/src/hooks/use-account.ts] — `finishSession` (désinscription token, AC4)
- [Source: apps/mobile/app.config.ts + eas.json] — plugins natifs, credentials, versioning
- [Source: apps/mobile/AGENTS.md] — module natif neuf = prebuild 2 plateformes, pin `bundledNativeModules.json`, mocks Jest sans JSX, placement tests, `RECEIVE_BOOT_COMPLETED`
- [Source: _bmad-output/project-context.md] — BullMQ, Drizzle migrations, ResponseInterceptor, RGPD GPS, secure-store=auth only
- [Source: _bmad-output/implementation-artifacts/MOB-6-1-sentry-crash-posthog-analytics.md] — previous story : pattern key-gated, prebuild 2 plateformes, `use-account.ts finishSession`, reporting device par plateforme

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (dev-story workflow)

### Debug Log References

- `drizzle-kit generate` → `0019_orange_red_skull.sql` (idx 19 dans `_journal.json`).
- API : `tsc` 0 · `eslint` 0 (push feature) · `jest` **418/418** (37 suites).
- Mobile : `tsc` 0 · `eslint` 0 erreur (2 warnings pré-existants hors-scope : auto-zoom `live/[id]` + `map/[id]`) · `jest` **618/618** (93 suites) · `check:native-config` **OK (5 invariants)** · `expo export -p ios` **OK**.
- `expo prebuild -p ios` OK → `ExpoNotifications (56.0.16)` + `ExpoDevice (56.0.4)` dans `Podfile.lock`, entitlement `aps-environment` présent.

### Completion Notes List

**Résumé** — Notifications push « analyse de densité terminée » (APNs iOS / FCM Android). Greffe sur le flux densité existant (aucune réécriture) : le processor densité émet `density.completed`, le nouveau `PushModule` NestJS écoute et envoie via l'Expo Push API (best-effort), l'app mobile enregistre son token après la 1re analyse et se désinscrit au logout. Fallback in-app (polling) intact.

**Décisions (tranchées pendant l'impl)** :
- **Découplage EventEmitter** (`density.completed`) plutôt qu'appel direct → densité ne dépend pas de push (recommandation Dev Notes retenue).
- **Résolution `userId`** : lookup `adventures.userId` (`findAdventureOwnerId`) plutôt qu'ajout au payload du job → moins de surface de changement, pas de PII dans la queue (recommandation retenue).
- **Envoi = Expo Push API** (`expo-server-sdk` `^6.1.0`) → un endpoint route APNs + FCM.
- **Libellé notif = français côté serveur** (constantes `push.service.ts`). ⚠️ Le texte est généré serveur (l'OS l'affiche app fermée) → non localisable via l'i18n mobile, et **aucune locale utilisateur n'est stockée en base** → défaut FR (langue primaire). Vraie localisation par utilisateur = nécessiterait une colonne `locale` (à voir avec MOB-6.3).
- **Purge `DeviceNotRegistered`** au niveau **ticket** (corrélation `tickets[i]`↔`chunk[i].to`), pas de polling receipts différé (over-engineering MVP) — satisfait AC2 « un `DeviceNotRegistered` purge le token ».

**Déviations vs story (documentées, ACs inchangées)** :
- `push_tokens.id` en **`text` + `crypto.randomUUID()`** (pas `uuid`) — convention projet + `user.id` est `text`.
- Barrel = **`packages/database/src/index.ts`** (la story disait `schema/index.ts`, inexistant).
- `expo-server-sdk` v6 : méthode **`chunkPushNotifications`** (≠ `chunkPushMessages` de la story, renommée en v6).
- `DELETE /push-tokens/:token` **scopé à l'utilisateur** (`user.id` + token) — durcissement sécurité vs `:token` seul.
- Handler + deep-link dans un **hook dédié** `use-notification-observer.ts` (monté dans `_layout.tsx`) plutôt qu'inline.
- Logique du hook extraite en **fonction pure** `requestAndRegisterPushToken()` (testable hors React ; le Probe/renderHook s'est révélé peu fiable RNTL v14 + React 19).
- Mock `expo-device` : `isDevice` en **getter/setter** (l'interop wildcard Babel fige les propriétés-valeur → non surchargeable en test).

**Validation device (par plateforme, anti-arrondi)** :
- **iOS** : `expo prebuild -p ios` ✓ (pods + entitlement `aps-environment` vérifiés). `pnpm sim` (Release, **0 error**) → app installée + lancée, **BOOT SANS CRASH** confirmé (process vivant dans launchd, **aucun crash report `.ips`**, écran Connexion rendu — screenshot vérifié). Les nouveaux modules natifs (`expo-notifications`/`expo-device`) chargent proprement (pas de dyld « Symbol not found »). Push **réel non testable sur simulateur** (`Device.isDevice === false` → flux permission/registration en no-op sûr — comportement attendu, PAS un bug).
- **Android** : **NON testé par l'agent** (SDK Android non disponible dans l'environnement, cf. MOB-6.1). Prebuild Android + `expo run:android` (émulateur `ridenrest_pixel`) + vérif `POST_NOTIFICATIONS` = **Guillaume**.
- **Envoi push réel** (iOS ET Android) = **device physique + credentials EAS (APNs `.p8`, FCM V1)** = **Guillaume**.

### File List

**Backend / DB :**
- NEW `packages/database/src/schema/push-tokens.ts`
- MODIFIED `packages/database/src/index.ts` (export table + enum + types `PushToken`/`NewPushToken`)
- MODIFIED `packages/database/src/db.ts` (schema registration)
- NEW `packages/database/migrations/0019_orange_red_skull.sql` (+ `meta/_journal.json`, `meta/0019_snapshot.json`)
- NEW `apps/api/src/push/push.module.ts`
- NEW `apps/api/src/push/push.controller.ts`
- NEW `apps/api/src/push/push.service.ts`
- NEW `apps/api/src/push/push.repository.ts`
- NEW `apps/api/src/push/dto/register-push-token.dto.ts`
- NEW `apps/api/src/push/push.service.test.ts`
- MODIFIED `apps/api/src/app.module.ts` (register `PushModule`)
- MODIFIED `apps/api/src/density/jobs/density-analyze.processor.ts` (inject `EventEmitter2` + emit `density.completed`)
- MODIFIED `apps/api/src/density/jobs/density-analyze.processor.test.ts` (mock EventEmitter + 2 tests emit)
- MODIFIED `apps/api/package.json` (add `expo-server-sdk`)

**Mobile :**
- NEW `apps/mobile/src/lib/notifications/push-storage.ts`
- NEW `apps/mobile/src/lib/notifications/push-config.ts`
- NEW `apps/mobile/src/lib/notifications/push-config.test.ts`
- NEW `apps/mobile/src/lib/api/push.ts`
- NEW `apps/mobile/src/hooks/use-push-notifications.ts`
- NEW `apps/mobile/src/hooks/use-push-notifications.test.tsx`
- NEW `apps/mobile/src/hooks/use-notification-observer.ts`
- NEW `apps/mobile/__mocks__/expo-notifications.js`
- NEW `apps/mobile/__mocks__/expo-device.js`
- MODIFIED `apps/mobile/src/components/map/sidebar-density-section.tsx` (trigger `requestAndRegister` après analyse)
- MODIFIED `apps/mobile/src/hooks/use-account.ts` (unregister token au logout + clear flags)
- MODIFIED `apps/mobile/src/app/_layout.tsx` (`useNotificationObserver`)
- MODIFIED `apps/mobile/app.config.ts` (plugin `expo-notifications`)
- MODIFIED `apps/mobile/scripts/check-native-config.mjs` (invariant plugin notifications)
- MODIFIED `apps/mobile/jest.setup.ts` (`jest.mock` notifications/device)
- MODIFIED `apps/mobile/package.json` (add `expo-notifications` + `expo-device` pin exact)

**Docs :**
- MODIFIED `apps/mobile/AGENTS.md` (section Notifications push)
- MODIFIED `apps/mobile/README.md` (section Notifications push + credentials)
- MODIFIED `_bmad-output/implementation-artifacts/sprint-status.yaml`
- MODIFIED `_bmad-output/implementation-artifacts/MOB-6-2-push-notifications-apns-fcm.md` (ce fichier)

### Change Log

| Date | Version | Description |
|---|---|---|
| 2026-07-04 | 1.0 | Implémentation MOB-6.2 (dev-story) : table `push_tokens` + migration 0019 ; `PushModule` NestJS (tokens + envoi Expo Push API, best-effort, purge `DeviceNotRegistered`) ; emit `density.completed` (EventEmitter) sur complétion densité ; mobile `expo-notifications`/`expo-device` (permission après 1re analyse, one-shot AsyncStorage, deep-link `map/[id]`, désinscription au logout) ; mocks + tests (api 418/418, mobile 618/618) ; doc sync AGENTS/README. Gate verte (tsc/eslint/jest/check:native-config/expo export iOS). iOS prebuild ✓ ; validation device physique + Android = Guillaume. |
