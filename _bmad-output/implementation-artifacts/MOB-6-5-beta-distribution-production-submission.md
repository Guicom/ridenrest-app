---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.5 : Distribution beta & soumission production

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner**,
I want **distribuer l'app en beta puis la soumettre en production**,
So that **les beta-users (événement Espagne) puis le public puissent l'utiliser**.

> **5ᵉ story de l'epic MOB-6** — **story majoritairement OPÉRATIONNELLE** (commandes EAS CLI + consoles Apple/Google), pas du code. ~80 % du travail = actions humaines/console. L'infrastructure technique est **déjà en place** (MOB-1.2) : projet EAS, 3 profils build + canaux OTA, `expo-updates` testé, credentials EAS-managed, Sentry source maps câblées, **et un EAS Workflow `deploy-to-production.yml` déjà écrit** (fingerprint → build/submit ou OTA auto). Le code restant est minimal : remplir `submit.production` dans `eas.json` + poser `SENTRY_AUTH_TOKEN` en env EAS + bump `version`.
>
> 🔴 **BLOCKER PRIORITÉ 1 — compte Google Play Console NON créé.** Hérité de MOB-1.2 : paiement $25 refusé (`OR_MIVEM_04`, validation carte), « résolution bancaire en cours » ; deadline réelle = **cette story** (`sprint-status.yaml:329`). **Sans ce compte, l'AC1 Android (Internal Testing) et l'AC2 Android sont bloqués.** À débloquer en tout premier.
>
> 🔗 **Dépendance amont : MOB-6.4** (Privacy Nutrition Labels iOS + Data Safety Android + age rating + liens légaux) — **requise AVANT** de pouvoir passer en review (AC2). Ne pas soumettre en production sans MOB-6.4 done.
>
> ⚠️ **Natif ≠ OTA** : `expo-updates` ne livre que JS/assets. Tout changement natif (module/plugin/permission/bump SDK — ex. l'ajout de `expo-notifications` en MOB-6.2) impose un **nouveau build + resoumission**, pas une OTA. Le Workflow EAS résout ça automatiquement via fingerprint.

## Acceptance Criteria

1. **Given** un build EAS `production`
   **When** je le distribue en beta
   **Then** il est disponible via **TestFlight** (iOS) et **Internal Testing** (Google Play)
   **And** les beta-users (événement Espagne) peuvent l'installer et l'utiliser
   **And** le profil `submit.production` d'`eas.json` est renseigné (clé API App Store Connect iOS + `ascAppId` ; `serviceAccountKeyPath` + `track: internal` Android) pour un `eas submit` non-interactif

2. **Given** la beta validée
   **When** je soumets en production
   **Then** l'app est soumise à la review **Apple** et **Google** (Privacy Labels / Data Safety de MOB-6.4 renseignés au préalable)
   **And** un **patch JS critique** peut être livré en **OTA** sans nouvelle soumission (`eas update --channel production`) (FR-MOB-003)
   **And** un changement **natif** déclenche correctement un nouveau build + submit (jamais une OTA silencieuse) — garanti par le fingerprint du Workflow EAS

3. **Given** la chaîne de release
   **When** un build production est produit
   **Then** les **source maps Sentry** sont uploadées (région **EU**) via `SENTRY_AUTH_TOKEN` posé en EAS env var (scope production, sensitive), pour des stack traces symbolisées
   **And** `version` (`app.config.ts`) est bumpée pour toute release user-visible (le build number est auto-incrémenté par EAS)

## Tasks / Subtasks

- [ ] **T0 — Débloquer les prérequis comptes (BLOCKER, priorité 1)** (AC: 1, 2) — **Guillaume**
  - [ ] Créer / débloquer le **compte Google Play Console** (paiement $25 — blocage bancaire MOB-1.2). Sans lui, tout l'Android est bloqué.
  - [ ] Confirmer le **compte Apple Developer** actif (l'était en MOB-1.2 ✅) et récupérer le Team ID.
  - [ ] Créer les **fiches app** : App Store Connect (→ récupérer l'`ascAppId`) + Google Play Console (application `app.ridenrest`).
  - [ ] Générer une **clé API App Store Connect** (`.p8` + Key ID + Issuer ID) et un **service-account Google Cloud** lié à Play Console (JSON) pour `eas submit` non-interactif.
  - [ ] Lier le repo GitHub à EAS (dashboard Expo → GitHub → app GitHub Expo) pour activer le Workflow.

- [ ] **T1 — Remplir `submit.production` dans `eas.json`** (AC: 1)
  - [ ] iOS : `submit.production.ios` = `{ ascAppId, ascApiKeyPath | ascApiKeyId + ascApiKeyIssuerId }`.
  - [ ] Android : `submit.production.android` = `{ serviceAccountKeyPath, track: 'internal' }` (puis `production` en AC2). Ne PAS committer les clés/JSON de credentials — référencer des chemins (`.env.local` / EAS secrets) ; le JSON service-account reste hors repo.
  - [ ] Vérifier que le job `submit` du Workflow n'est plus interactif (sinon il bloque).

- [ ] **T2 — Poser `SENTRY_AUTH_TOKEN` en EAS env (release symbolisée)** (AC: 3)
  - [ ] `eas env:create --name SENTRY_AUTH_TOKEN --scope project --environment production --visibility sensitive` (token **EU** valide — corriger le 401 EU/US + org/projet identifié en MOB-6.1 : `SENTRY_ORG`/`SENTRY_PROJECT` slugs corrects, région `de.sentry.io`).
  - [ ] Confirmer que le plugin `@sentry/react-native/expo` (région EU, `app.config.ts:123-136`) + `getSentryExpoConfig` (metro) uploadent bien les source maps sur un build EAS production (pas désactivé comme en build local `sim-build.sh`).

- [ ] **T3 — Versioning release** (AC: 3)
  - [ ] Bumper `version` dans `app.config.ts` (`1.0.0` → cible release) pour toute release user-visible. `buildNumber`/`versionCode` restent gérés par EAS (`autoIncrement` + `appVersionSource: remote`).
  - [ ] Vérifier `runtimeVersion.policy: 'appVersion'` : une OTA ne s'applique qu'aux builds de même `version` — cohérent avec le mapping channel↔profil.

- [ ] **T4 — Build + distribution beta** (AC: 1) — **opérationnel**
  - [ ] `eas build --profile production --platform all` (ou `all` séparé). Credentials iOS générés à la 1re fois (`eas credentials`), keystore Android EAS-managed.
  - [ ] `eas submit --profile production --platform ios` → **TestFlight** ; `eas submit --profile production --platform android` (track `internal`) → **Internal Testing**.
  - [ ] Inviter les beta-users (événement Espagne). Vérifier install + smoke test sur device réel (login, carte, mode Live, push si MOB-6.2 livré).

- [ ] **T5 — Soumission production** (AC: 2) — **opérationnel, après MOB-6.4**
  - [ ] Pré-requis MOB-6.4 : Privacy Nutrition Labels + Data Safety + age rating renseignés.
  - [ ] Promouvoir en review App Store + Google Play (track `production`).
  - [ ] Vérifier le smoke test OTA : `eas update --channel production --message "..."` livre un patch JS sans resoumission (`--environment` requis en `--non-interactive`).

- [ ] **T6 — Automatisation Workflow EAS (optionnel mais recommandé)** (AC: 2)
  - [ ] Une fois T0/T1/T2 satisfaits, tester `eas workflow:run deploy-to-production.yml` : push `main` → fingerprint → `update` (natif inchangé) OU `build`+`submit` (natif changé).
  - [ ] (Optionnel) Décommenter la gate Maestro E2E pré-release du Workflow (jamais en CI PR — cadence release, cf. README §E2E).

- [ ] **T7 — Doc Sync + gate** (règle CRITIQUE project-context)
  - [ ] `apps/mobile/README.md` : documenter les commandes exactes (build/submit/update/credentials/env) + l'ordre des prérequis (T0→T5).
  - [ ] `sprint-status.yaml` : MOB-6-5 → `in-progress` puis `review`. Mettre à jour la note MOB-1.2 (`sprint-status.yaml:329`) si le compte Google est débloqué.
  - [ ] **Gate code** minimale (peu de code) : `tsc` 0 · `eslint` 0 · `eas.json` valide. La validation réelle = builds/soumissions (device + consoles).

## Dev Notes

### Architecture & contraintes (à respecter à la lettre)

- **Le gros du travail est opérationnel** : lister les **commandes exactes** et **prérequis console**, pas produire du code. Le seul code/config = `eas.json submit.production`, `SENTRY_AUTH_TOKEN` env EAS, bump `version`.
- **Déjà en place (MOB-1.2, ne pas re-faire)** : projet EAS `@ridenrest/ridenrest` (`projectId 4548dbd0-…`), 3 profils build (`development`/`preview`/`production`) + canaux OTA homonymes, `production: distribution 'store'` + `autoIncrement`, `appVersionSource: 'remote'`, `expo-updates ~56.0.18` + policy `appVersion` (OTA testée sur `preview`), credentials 100 % EAS-managed (iOS cert/provisioning + keystore Android sur serveurs Expo, rien dans le repo), compte Apple actif, Sentry source maps (plugin EU + `getSentryExpoConfig` metro + runtime key-gated).
- **EAS Workflow déjà écrit** : `apps/mobile/.eas/workflows/deploy-to-production.yml` — déclencheur `push main`, job `fingerprint` → `get-build` : natif inchangé → `type: update` (OTA branch `production`) ; natif changé → `type: build` (production) + `type: submit`. Résout « natif ≠ OTA » automatiquement. **Prérequis listés en tête du fichier = la checklist de cette story.**
- **CI GitHub Actions ne fait AUCUN build/submit EAS** (`.github/workflows/ci.yml` = lint/test/typecheck + deploy VPS web/api ; mobile capté par `expo export` léger). L'automatisation mobile vit dans le **Workflow EAS** (cloud Expo), pas GitHub Actions.
- **Natif ≠ OTA** : une OTA (`eas update`) ne livre que JS/assets. Un module natif (ex. `expo-notifications` MOB-6.2) exige build + submit. Le fingerprint du Workflow garantit ça.
- **Sentry EU** : région `de.sentry.io` (plugin `app.config.ts:123-136`). Le 401 « Invalid token » de MOB-6.1 venait d'un mismatch EU/US + org/projet mal nommés → à corriger pour l'upload symbolisé (`SENTRY_ORG`/`SENTRY_PROJECT` slugs corrects). Build EAS ≠ build local (`sim-build.sh` désactive l'upload local).

### État des fichiers clés (recherche 2026-07-04)

- `apps/mobile/eas.json` : `cli.appVersionSource: 'remote'`, 3 profils. `development` (`simulator:true`, `channel development`), `preview` (`internal`, `channel preview`), `production` (`distribution store`, `autoIncrement`, `channel production`). Env `EXPO_PUBLIC_APP_ENV` + `EXPO_PUBLIC_POSTHOG_HOST` par profil. **`submit.production: {}` VIDE** ← à remplir (T1). Aucune clé credential dans le repo (grep négatif).
- `apps/mobile/app.config.ts` : `version '1.0.0'` (l.14), `runtimeVersion.policy 'appVersion'` (l.149-151), `updates.url https://u.expo.dev/4548dbd0-…` (l.152-154), `owner 'ridenrest'` (l.148), `extra.eas.projectId '4548dbd0-…'` (l.144-146), `scheme 'ridenrest'`, `ITSAppUsesNonExemptEncryption: false` (l.23). `buildNumber`/`versionCode` **absents** (gérés par EAS).
- `apps/mobile/.eas/workflows/deploy-to-production.yml` : Workflow fingerprint→build/submit/update (voir ci-dessus).
- `apps/mobile/metro.config.js` : `getSentryExpoConfig(projectRoot)` (debug IDs pour symbolication).
- `apps/mobile/src/lib/observability/sentry.ts` : `initSentry()` key-gated (`EXPO_PUBLIC_SENTRY_DSN`), `enabled: !__DEV__`, scrub GPS.

### MOB-1.2 — état hérité (fondation)

- Compte **Apple Developer individuel actif** (sans D-U-N-S, décision 2026-06-02). Team ID non consigné (developer.apple.com).
- Builds `development` iOS+Android FINISHED + `preview` Android ; OTA smoke test `preview` validé.
- **⏳ Compte Google Play Console NON créé** (blocage bancaire) — **bloquant direct de cette story** (`sprint-status.yaml:329`).

### Commandes de référence (à documenter dans README)

```
# Beta (AC1)
eas build --profile production --platform all
eas submit --profile production --platform ios      # → TestFlight
eas submit --profile production --platform android  # → Internal Testing (track internal)

# Credentials / env
eas credentials                                     # iOS cert/provisioning (1re fois)
eas env:create --name SENTRY_AUTH_TOKEN --scope project --environment production --visibility sensitive

# Production (AC2) — promouvoir en review, puis OTA pour patch JS
eas update --channel production --message "fix ..." --environment production

# Automatisation
eas workflow:run deploy-to-production.yml
```

### Testing

- Peu de code → gate `tsc`/`eslint` + `eas.json` valide. La vraie validation = builds EAS + soumissions + install device (TestFlight/Internal Testing) + smoke test OTA.
- Reporting **par plateforme** (iOS/Android) — jamais de « ✓ » global (règle anti-arrondi AGENTS.md).

### Project Structure Notes

- Credentials (`.p8` Apple, JSON service-account Google, keystore) : **jamais dans le repo**. EAS-managed ou `.env.local`/EAS secrets.
- `SENTRY_AUTH_TOKEN` = secret, jamais `EXPO_PUBLIC_*`.
- Bump `version` dans `app.config.ts` (TS), jamais `app.json`.

### Décisions / prérequis humains (Guillaume)

- **Débloquer Google Play Console** (priorité 1).
- Clé API App Store Connect + `ascAppId` ; service-account Google.
- MOB-6.4 done (labels + Data Safety) avant review production.
- Token Sentry EU valide (corriger le 401 MOB-6.1).

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story-MOB-6.5] (l.1136-1152) — ACs, FR-MOB-003
- [Source: apps/mobile/eas.json] — profils build/submit (`submit.production` vide)
- [Source: apps/mobile/app.config.ts] — version, runtimeVersion, updates, projectId
- [Source: apps/mobile/.eas/workflows/deploy-to-production.yml] — Workflow fingerprint→build/submit/OTA + prérequis
- [Source: apps/mobile/metro.config.js + src/lib/observability/sentry.ts] — source maps Sentry EU
- [Source: _bmad-output/implementation-artifacts/MOB-1-2-dev-accounts-eas-ota-pipeline.md] — fondation EAS/OTA, compte Apple actif, Google Play bloqué
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml:329] — note « résolution bancaire, deadline MOB-6.5 »
- [Source: _bmad-output/implementation-artifacts/MOB-6-4-store-compliance-legal-links.md] — dépendance amont (labels/Data Safety)
- [Source: _bmad-output/implementation-artifacts/MOB-6-1-sentry-crash-posthog-analytics.md:246] — 401 token Sentry EU/US à corriger
- [Source: apps/mobile/AGENTS.md] — natif ≠ OTA, reporting par plateforme, rebuild 2 plateformes
- [Source: _bmad-output/project-context.md] — CI/CD, secrets, VPS deploy

## Dev Agent Record

### Agent Model Used

_(à remplir par le dev agent)_

### Debug Log References

### Completion Notes List

### File List
