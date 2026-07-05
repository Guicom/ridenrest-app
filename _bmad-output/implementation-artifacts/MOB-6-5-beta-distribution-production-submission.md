---
baseline_commit: f0349415d9fe5b1fb173cf42d84072799e96cdf7
---

# Story MOB-6.5 : Distribution beta & soumission production

Status: in-progress

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

- [ ] **T1 — Remplir `submit.production` dans `eas.json`** (AC: 1) — **structure scaffoldée ; valeurs réelles pending T0**
  - [x] iOS : `submit.production.ios` = `{ ascAppId: "6787704466" }` **rempli avec la vraie valeur** (fiche ASC `Ride'n'Rest` créée 2026-07-05 via `asc` : bundle ID `app.ridenrest` enregistré [ID `CF8P6V3P6H`] + fiche web UI officielle → `ascAppId 6787704466`, locale `fr-FR`, SKU `ridenrest`). Clé API ASC créée + validée (`asc auth status --validate` = works). La clé API ASC (`.p8`) sera fournie à `eas build`/`eas submit` interactivement au 1er run (EAS la stocke). **NB : `asc web apps create` volontairement NON utilisé (endpoints web privés « discouraged » → risque ADPLA/compte) — fiche créée par la voie officielle.**
  - [x] Android : `submit.production.android` = `{ serviceAccountKeyPath: './credentials/google-service-account.json', track: 'internal' }` **écrit** (puis `production` en AC2). `credentials/` ajouté à `.gitignore` → JSON service-account reste hors repo. Dépôt du JSON = T0.6 (compte Google pas encore créé).
  - [~] Vérifier que le job `submit` du Workflow n'est plus interactif : structure eas.json OK ; **non vérifiable tant que ascAppId réel + JSON service-account absents** (pending T0).

- [x] **T2 — Poser `SENTRY_AUTH_TOKEN` en EAS env (release symbolisée)** (AC: 3) — **FAIT (2026-07-05)**
  - [x] `eas env:create` (production, scope project) posé pour les **3** variables : `SENTRY_ORG=ridenrest` (plaintext), `SENTRY_PROJECT=react-native` (plaintext), `SENTRY_AUTH_TOKEN=*****` (sensitive). **401 MOB-6.1 corrigé** : nouveau **org auth token EU** (`sntrys_…`, 191 car., région `de.sentry.io`) + **vrais slugs** (l'ancien `.env` avait `SENTRY_ORG=react-native` [=slug projet] et `SENTRY_PROJECT=4511643853717584` [=ID], tous deux faux → org réel `ridenrest`, projet slug `react-native`). Vérifié via `eas env:list --environment production`. NB : le token a le scope upload (`org:ci`) mais pas `project:read` → résolution des slugs faite hors-API (URL org + notes MOB-6.1). Preuve définitive du slug projet = upload `sentry-cli` au prochain build prod.
  - [x] Confirmer que le plugin `@sentry/react-native/expo` (région EU) + `getSentryExpoConfig` (metro) sont correctement câblés pour l'upload source maps sur un build EAS prod. → **config vérifiée** : `app.config.ts:134-147` (`url: 'https://de.sentry.io/'`, org/projet via env) ; `metro.config.js:19` (`getSentryExpoConfig` debug IDs). L'upload réel sur build cloud reste à confirmer sur un build EAS prod (opérationnel).

- [x] **T3 — Versioning release** (AC: 3)
  - [x] Bumper `version` dans `app.config.ts` (`1.0.0` → cible release) pour toute release user-visible. `buildNumber`/`versionCode` restent gérés par EAS (`autoIncrement` + `appVersionSource: remote`). → **Décision : `1.0.0` conservé** — 1ʳᵉ release publique, rien à bumper *depuis* ; `1.0.0` **est** la version cible.
  - [x] Vérifier `runtimeVersion.policy: 'appVersion'` : une OTA ne s'applique qu'aux builds de même `version` — cohérent avec le mapping channel↔profil. → vérifié `app.config.ts:160-161`.

- [ ] **T4 — Build + distribution beta** (AC: 1) — **iOS build ✅ ; submit + Android en cours**
  - [~] `eas build --profile production --platform ios` → **iOS build #6 FINISHED** (2026-07-05, `1.0.0` / buildNumber 6, .ipa produit, credentials iOS EAS-managed via login Apple + `eas credentials`). Android : pending (compte Google). Gotchas résolus en route : (1) bundle ID pré-enregistré sans push → capability `PUSH_NOTIFICATIONS` ajoutée ; (2) build #5 échoué car `SENTRY_AUTH_TOKEN` présent mais `SENTRY_ORG` absent → **sentry-cli fait échouer le build** (poser T2 AVANT le build). **AC3 iOS validé** : build #6 a fini = upload source maps `ridenrest/react-native` réussi.
  - [~] `eas submit --profile production --platform ios` → **TestFlight** : **iOS FAIT ✅** (2026-07-05 — build #6 soumis, EAS a généré+stocké sa propre clé API ASC `[Expo] EAS Submit` KeyID `LNU9JT6285` → submits/Workflow non-interactifs ; « Successfully uploaded to App Store Connect », en cours de traitement Apple). Android (`track internal`) → pending (compte Google).
  - [ ] Inviter les beta-users (événement Espagne). Vérifier install + smoke test sur device réel (login, carte, mode Live, push si MOB-6.2 livré). → iOS : après traitement Apple, inviter via TestFlight (Internal Testing instantané / External = Beta App Review). Android pending.

- [ ] **T5 — Soumission production** (AC: 2) — **opérationnel, après MOB-6.4**
  - [ ] Pré-requis MOB-6.4 : Privacy Nutrition Labels + Data Safety + age rating renseignés.
  - [ ] Promouvoir en review App Store + Google Play (track `production`).
  - [ ] Vérifier le smoke test OTA : `eas update --channel production --message "..."` livre un patch JS sans resoumission (`--environment` requis en `--non-interactive`).

- [ ] **T6 — Automatisation Workflow EAS (optionnel mais recommandé)** (AC: 2)
  - [ ] Une fois T0/T1/T2 satisfaits, tester `eas workflow:run deploy-to-production.yml` : push `main` → fingerprint → `update` (natif inchangé) OU `build`+`submit` (natif changé).
  - [ ] (Optionnel) Décommenter la gate Maestro E2E pré-release du Workflow (jamais en CI PR — cadence release, cf. README §E2E).

- [ ] **T7 — Doc Sync + gate** (règle CRITIQUE project-context)
  - [x] `apps/mobile/README.md` : documenter les commandes exactes (build/submit/update/credentials/env) + l'ordre des prérequis (T0→T5). → section **« Release — Beta → Production (MOB-6.5) »** ajoutée (runbook T0→T6, tableaux console, commandes exactes).
  - [~] `sprint-status.yaml` : MOB-6-5 → `in-progress` (✅ fait) puis `review` (⏳ après complétion opérationnelle). Note MOB-1.2 (`sprint-status.yaml:329`) : à mettre à jour **quand** le compte Google sera débloqué (pas encore fait — Guillaume s'en occupe).
  - [x] **Gate code** minimale (peu de code) : `tsc` 0 · `eslint` 0 · `eas.json` valide. → `tsc --noEmit` 0 · `eslint` 0 erreurs (2 warnings pré-existants hors-scope) · `eas.json` parse OK · `check:native-config` 5 invariants OK. La validation réelle = builds/soumissions (device + consoles), **opérationnelle**.

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

claude-opus-4-8 (dev-story 2026-07-05)

### Debug Log References

- `node -e 'require("./eas.json")'` → parse OK, `submit.production` structuré.
- `pnpm check:native-config` → ✓ 5 invariants natifs OK (aucune violation ; `app.config.ts` non modifié).
- `pnpm typecheck` (`tsc --noEmit`) → 0 erreur.
- `pnpm lint` (`expo lint`) → **0 erreurs**, 2 warnings pré-existants `react-hooks/exhaustive-deps` dans `src/app/(app)/live/[id].tsx` + `src/app/(app)/map/[id].tsx` (fichiers **non touchés** par cette story).
- **🔴 Finding beta iOS (2026-07-05)** : login Google KO sur TestFlight (« La connexion Google a échouée »). Root cause : le build store **n'embarquait aucune URL backend** (`eas.json production.env` = APP_ENV/POSTHOG_HOST seuls ; `.env` gitignoré donc absent du build cloud) → code retombe sur défauts `http://localhost:*` → `localhost` = le device → backend injoignable (login Google server-mediated + email + data tous KO). **Fix** : `EXPO_PUBLIC_API_URL=https://api.ridenrest.app` + `EXPO_PUBLIC_BETTER_AUTH_URL=https://ridenrest.app` posées en **EAS env (production)** (alimentent build **et** OTA) → **rebuild requis** (EXPO_PUBLIC inlinées au build). Documenté README §Env.

### Completion Notes List

**Nature de la story (rappel) : ~80 % opérationnelle** (consoles Apple/Google + EAS CLI authentifié + test device). Le périmètre CODE réalisable par l'agent est minime et **fait** ; le reste est **human-gated** et fera l'objet d'un **guidage pas à pas en live** (choix de Guillaume).

**Fait (code / config / doc) :**
- **T1 (partiel)** — `eas.json → submit.production` scaffoldé : iOS `{ ascAppId: "REPLACE_WITH_ASC_APP_ID" }` (placeholder, valeur réelle pending T0.3) ; Android `{ serviceAccountKeyPath: "./credentials/google-service-account.json", track: "internal" }` (fonctionnel ; JSON à déposer = T0.6). `.gitignore` : `credentials/` ajouté (le `.p8` Apple était déjà couvert par `*.p8`).
- **T2 (partiel)** — Config Sentry EU vérifiée (plugin `de.sentry.io` `app.config.ts:134-147` + `getSentryExpoConfig` `metro.config.js:19`). L'`eas env:create` (token EU + `SENTRY_ORG`/`SENTRY_PROJECT`) est opérationnel → documenté dans le runbook.
- **T3 (fait)** — `version` = **`1.0.0`** conservé (1ʳᵉ release ; version cible correcte). `runtimeVersion.policy: 'appVersion'` vérifié.
- **T7 (fait pour la partie code)** — README : section **« Release — Beta → Production (MOB-6.5) »** = runbook opérationnel complet (T0→T6, tableaux console, commandes exactes, gotchas Android 1er upload / OTA `--environment`). Gate code verte (voir Debug Log). `sprint-status.yaml` → `in-progress`.

**Pending — opérationnel (human-gated, à faire par Guillaume ; guidage live en cours) :**
- **T0** — comptes : ⏳ Google Play Console (blocage bancaire, « je m'en occupe tout à l'heure ») · Apple Team ID · fiches ASC (`ascAppId`) + Play · clé API ASC (`.p8`/Key ID/Issuer ID) · service-account Google (JSON) · lien GitHub↔EAS.
- **T2** — `eas env:create SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`/`SENTRY_PROJECT`) sur EAS.
- **T4** — `eas build --profile production` + `eas submit` → TestFlight (iOS) / Internal Testing (Android) + invitations beta + smoke test device (**par plateforme**).
- **T5** — soumission production (MOB-6.4 ✅) : review App Store + Play (track `production`) + smoke test OTA.
- **T6** — `eas workflow:run deploy-to-production.yml`.

**Statut par AC (honnête, par plateforme) :**
- **AC1** (beta TestFlight/Internal Testing + `submit.production` renseigné) : iOS ⏳ (scaffold ok, `ascAppId` + build/submit pending) · Android ⏳ (scaffold ok, compte + JSON + build/submit pending).
- **AC2** (soumission production + OTA + natif→build) : ⏳ pending T4/T5 (dépendance MOB-6.4 **levée** ✅).
- **AC3** (source maps Sentry EU + `version` bumpée) : config ✅ vérifiée · `version` ✅ `1.0.0` · upload réel + `SENTRY_AUTH_TOKEN` ⏳ pending build EAS prod.

**Story NON terminée → reste `in-progress`** (le gros du travail est opérationnel et pending). Ne PAS marquer `review` tant que la beta (AC1) n'est pas réellement distribuée.

### File List

- `apps/mobile/eas.json` (M) — `submit.production` scaffoldé (iOS `ascAppId` placeholder ; Android `serviceAccountKeyPath` + `track: internal`).
- `apps/mobile/.gitignore` (M) — ignore `credentials/` (JSON service-account Google hors repo).
- `apps/mobile/README.md` (M) — section runbook « Release — Beta → Production (MOB-6.5) » (T7).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (M) — MOB-6-5 → `in-progress`.
- `_bmad-output/implementation-artifacts/MOB-6-5-beta-distribution-production-submission.md` (M) — tâches cochées/annotées, Dev Agent Record, Change Log.

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-07-05 | 0.1 | dev-story : partie CODE de MOB-6.5 (eas.json `submit.production` scaffold, `.gitignore credentials/`, runbook README, version 1.0.0 confirmée, config Sentry EU vérifiée) + gate verte (tsc 0 / eslint 0 / eas.json valide / native-config OK). Story reste `in-progress` — le reste (T0/T2 env/T4/T5/T6) est opérationnel, human-gated, guidage live en cours. | claude-opus-4-8 |
| 2026-07-05 | 0.2 | **Guidage live (iOS) — installation `asc` + setup App Store Connect + build/submit** : bundle ID `app.ridenrest` (+ capability Push), fiche ASC `Ride'n'Rest` (`ascAppId 6787704466` → eas.json), T2 Sentry EU corrigé (token `sntrys_` + slugs `ridenrest`/`react-native` en env EAS), build iOS #6 FINISHED (source maps ✅), submit → **TestFlight** (clé API ASC EAS-managed). **Fix critique beta** : URLs backend prod (`API_URL`/`BETTER_AUTH_URL`) manquantes du build store (login localhost KO sur device) → posées en env EAS production + doc README → **rebuild**. Android + T5/T6 : pending compte Google. | claude-opus-4-8 |
