---
baseline_commit: 9aed34dfa48de9447acaa8f47abc8df9e9180cc9
---

# Story MOB-1.2 : Comptes développeurs & pipeline de distribution (EAS + OTA)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **product owner**,
I want **les comptes développeurs Apple (individuel) et Google provisionnés et un pipeline EAS Build + OTA configuré**,
So that **l'app peut être buildée en cloud, distribuée en beta et patchée en OTA sans soumission store à chaque correctif JS**.

> 2ᵉ story de l'Epic MOB-1. Dépend de **MOB-1.1** (workspace `apps/mobile/` initialisé, intégré au monorepo). Story partiellement **opérationnelle/administrative** (création de comptes payants) + technique (EAS/OTA). La distribution beta réelle (TestFlight/Internal Testing) et la soumission production sont **hors scope** ici (→ MOB-6.5) ; cette story livre l'**infrastructure de build** et un **build `development` (Dev Client)** fonctionnel.

## Acceptance Criteria

1. **Given** le besoin de distribution
   **When** je provisionne les comptes
   **Then** un compte **Apple Developer individuel** est actif ($99/an, Apple ID + carte bancaire, **sans D-U-N-S**)
   **And** un compte **Google Play Console** est actif ($25 one-shot)

2. **Given** `apps/mobile/` initialisée (MOB-1.1)
   **When** je configure EAS (`eas.json` + `eas init` / `expo install eas-cli` côté projet)
   **Then** les profils `development`, `preview` et `production` sont définis dans `eas.json`
   **And** un build EAS `development` (**Dev Client**) **réussit** pour iOS **et** Android

3. **Given** EAS configuré
   **When** j'active `expo-updates` (OTA)
   **Then** un canal OTA (`channel`) est rattaché à chaque profil de build (`development`/`preview`/`production`)
   **And** un patch JS publié sur le canal `preview` (`eas update --channel preview`) est appliqué au prochain lancement d'un build `preview`

4. **Given** le workflow CI/CD existant (déclenché sur tag, cf. web)
   **When** je documente le déclenchement EAS Build
   **Then** le pattern de déclenchement (GitHub Actions → EAS Build sur push de tag `v*`) est **documenté/préparé** — sans que GitHub Actions ne lance de build natif lui-même (le build s'exécute sur EAS cloud) (cohérent avec la gate CI de MOB-1.4)

## Tasks / Subtasks

- [ ] **T1 — Provisionner les comptes développeurs** (AC: 1) — *action Guillaume*
  - [x] Apple Developer Program : inscription **compte individuel** ($99/an), Apple ID + CB. **Ne PAS** lancer de démarche D-U-N-S (réservée aux comptes Organisation — non requis ici, décision Guillaume 2026-06-02) — ✅ compte actif (confirmé Guillaume 2026-06-07)
  - [ ] Google Play Console : inscription ($25 paiement unique) — ⏳ **RESTE À FAIRE** : paiement refusé (`OR_MIVEM_04`, validation carte), adresse de facturation vérifiée sans succès → résolution côté banque en cours. **Décision Guillaume 2026-06-07 : story passée en review avec ce reste-à-faire** (non bloquant avant MOB-6.5 — le compte Google ne sert qu'à la soumission store). À clôturer dès le paiement accepté.
  - [x] Consigner les identifiants d'équipe (Apple Team ID, Google account) là où le projet stocke ses secrets ops — **jamais** dans le repo — décision Guillaume 2026-06-07 : pas de consignation séparée (Team ID consultable à tout moment sur developer.apple.com → Membership ; aucune machine n'en a besoin avant MOB-6.5). Rien dans le repo ✅
  - [x] ⚠️ Délais : la validation Apple individuelle est quasi-immédiate (pas de D-U-N-S) ; Google peut demquander une vérification d'identité. Démarrer tôt pour ne pas bloquer MOB-6.5 — démarches lancées tôt : Apple validé, Google en cours (résolution bancaire), marge confortable avant MOB-6.5

- [x] **T2 — Installer & initialiser EAS** (AC: 2)
  - [x] `cd apps/mobile && pnpm add -D eas-cli` (ou usage via `pnpm dlx eas-cli`) ; `eas login` ; `eas init` (crée le projet EAS + `projectId` dans `app.config.ts`/`app.json`) — eas-cli 20.1.0 en devDependency, login Guillaume (compte `ridenrest`), projet `@ridenrest/ridenrest` créé, `projectId: 4548dbd0-ee0d-4ba7-8acb-e42469ec1ec3` dans `app.json`
  - [x] Créer `apps/mobile/eas.json` avec 3 profils :
    - `development` : `developmentClient: true`, `distribution: internal` (+ `ios.simulator: true` pour vérif simulateur sans provisioning device)
    - `preview` : `distribution: internal` (build installable hors store, QA)
    - `production` : `distribution: store` (binaire de soumission, `autoIncrement` + `appVersionSource: remote`)
  - [x] Confirmer que le **Dev Client** est requis dès cette story (MapLibre RN / `expo-secure-store` arrivent ensuite — le Dev Client doit exister avant MOB-2/MOB-4) — confirmé : `expo-dev-client ~56.0.19` installé (exigé par EAS pour `developmentClient: true`)

- [x] **T3 — Build EAS `development` iOS + Android** (AC: 2)
  - [x] `eas build --profile development --platform ios` et `--platform android` → builds **réussis** — iOS `72767639` (simulateur) + Android `5f4b781e` : FINISHED sur EAS cloud 2026-06-07
  - [x] Vérifier l'installation du Dev Client sur simulateur iOS / émulateur (ou device) Android et le lancement de l'app — iOS : installé via `eas build:run` sur iPhone 17 Pro, bundle chargé depuis Metro (vérifié `launchctl` → `app.ridenrest` au premier plan). Android : APK installé via `adb install` sur émulateur Pixel 7, Dev Client connecté à Metro via deep link + `adb reverse`, bundle chargé (screenshots)
  - [x] Documenter toute config credential (auto par EAS : signing iOS, keystore Android) dans Completion Notes — fait (voir Completion Notes)

- [ ] **T4 — Activer EAS Update (OTA)** (AC: 3)
  - [x] `expo install expo-updates` ; configurer `runtimeVersion` (policy `appVersion` ou `fingerprint`) et `updates.url` (EAS) dans `app.config.ts` — `expo-updates ~56.0.18`, policy `appVersion` (reco Dev Notes), `updates.url: https://u.expo.dev/4548dbd0-…` via `eas update:configure` (dans `app.json` — migration `app.config.ts` → MOB-1.4)
  - [x] Rattacher un `channel` à chaque profil dans `eas.json` (`development`→`development`, `preview`→`preview`, `production`→`production`)
  - [x] Publier un patch JS de test : `eas update --channel preview --message "OTA smoke test"` → vérifier qu'un build `preview` récupère la mise à jour au prochain lancement — build `preview` Android `9a114615` installé sur émulateur ; update `692f517a` (marqueur visuel) publiée sur canal `preview` ; 1ᵉʳ lancement = fetch, 2ᵉ lancement = marqueur affiché ✅ ; marqueur reverté puis update « revert OTA smoke test » (`6bff08c7`) republiée pour réaligner le canal sur le repo
  - [x] ⚠️ Règle OTA : une OTA ne peut livrer **que** du JS/assets ; tout changement natif (nouveau plugin/lib native) impose un **nouveau build** — le noter pour les epics suivants — documenté dans `apps/mobile/README.md` §« Règle OTA »

- [x] **T5 — Documenter le déclenchement CI → EAS** (AC: 4)
  - [x] Rédiger (doc/README mobile) le pattern : push tag `v*` → GitHub Actions appelle `eas build`/`eas submit` (cloud) — **GitHub Actions ne compile rien nativement** — `apps/mobile/README.md` §« CI/CD → EAS Build » : squelette YAML cible (tag `v*` → `eas build --non-interactive`), secret `EXPO_TOKEN`, note que le CI web actuel (`ci.yml`) se déclenche sur push `main` (pas tag) et que le job mobile s'ajoutera sans le modifier
  - [x] Ne **pas** implémenter le job CI lint/test ici (→ MOB-1.4) ; uniquement préparer le hook de build/submit — aucun fichier workflow modifié/créé, doc uniquement

### Review Findings

- [x] [Review][Patch] README — tableau des profils : `development` annoncé « simulateur/émulateur/device » alors que `eas.json` force `ios.simulator: true` → le build iOS ne s'installe QUE sur simulateur (un device iOS physique exigerait un build sans `simulator: true` + provisioning). Corrigé : iOS = simulateur uniquement ; Android = émulateur/device [apps/mobile/README.md:31]
- [x] [Review][Patch] README — section OTA : précisé que `eas update` doit **toujours** recevoir `--channel` (sans lui, publication sur une branche par défaut non consommée par les builds ; `--environment` aussi requis en `--non-interactive` avec eas-cli 20.x, cf. Debug Log) [apps/mobile/README.md:57]
- [x] [Review][Defer] `experiments.reactCompiler: true` sans `babel-plugin-react-compiler` déclaré dans `apps/mobile/package.json` (dépendance fantôme résolue par hoisting pnpm — préexistant MOB-1.1, builds EAS verts malgré tout) — deferred, pre-existing → à régler en MOB-1.4 (déclarer la dep ou désactiver l'experiment) [apps/mobile/app.json:46]
- [x] [Review][Defer] Squelette CI (doc) : `eas build --no-wait` rend le job vert quel que soit le résultat du build EAS cloud (aucune gate d'échec) ; et `eas-cli` étant devDep du workspace mobile, vérifier sa disponibilité via `pnpm --dir apps/mobile exec` en CI — deferred → à traiter lors de l'implémentation réelle du job en MOB-1.4 [apps/mobile/README.md:78-94]

## Dev Notes

### Décisions d'infrastructure (source : `architecture-mobile.md` §Infrastructure & Deployment, l.424-435)

| Élément | Choix | Note |
|---|---|---|
| Build pipeline | **EAS Build** (free tier ~30 builds/mois) | Cloud, suffit au MVP |
| OTA | **EAS Update** (gratuit) | Patches JS sans soumission store |
| CI/CD | GitHub Actions → EAS Build sur push tag `v*` | Aligné workflow web existant |
| Distribution | TestFlight (iOS) + Internal Testing (Google) → Production | **Réalisée en MOB-6.5**, pas ici |

### ⚠️ Incohérence documentaire à NE PAS suivre

`architecture-mobile.md` l.447 mentionne encore *« provision Apple Developer Program ($99/an, validation D-U-N-S → démarrer tôt) »*. **C'est obsolète.** La décision projet actée (FR-MOB-002, `epics-mobile.md` l.234 + Story MOB-1.2 l.370) est un **compte individuel SANS D-U-N-S**. → Suivre l'AC #1 (individuel, pas de D-U-N-S). Le D-U-N-S ne concerne que les comptes *Organisation*.

### Garde-fous techniques

- **`eas.json` + `app.config.ts`** : la migration `app.json` → `app.config.ts` et la déclaration du scheme `ridenrest://` sont le périmètre de **MOB-1.4**. Si MOB-1.4 n'est pas encore faite, EAS peut fonctionner avec `app.json` ; coordonner le `projectId` EAS (ne pas le perdre lors de la migration vers `app.config.ts`).
- **Secrets / variables EAS** : variables d'env publiques en `EXPO_PUBLIC_*` (via `eas.json` `env` par profil ou EAS Secrets) ; **aucun secret** dans le bundle JS (NFR-014). `BETTER_AUTH_SECRET` reste **côté serveur uniquement** — jamais embarqué.
- **Free tier EAS** : ~30 builds/mois. Économiser les builds natifs (privilégier OTA pour le JS). Documenter dans Completion Notes la conso si proche de la limite.
- **`runtimeVersion`** : choisir une policy cohérente dès maintenant (recommandé `appVersion` au MVP, ou `fingerprint` si on veut un découplage fin natif/JS) — un mismatch `runtimeVersion` ⇒ l'OTA n'est pas servie. C'est la cause n°1 d'OTA « qui ne s'applique pas ».

### Testing standards

- Pas de test unitaire (infra de build/comptes). Validation **opérationnelle** : 2 comptes actifs, builds `development` iOS+Android verts, OTA `preview` appliquée.
- Le framework de tests (Jest/RNTL/Maestro) est installé en **MOB-1.4**.

### Project Structure Notes

- Fichiers ajoutés/modifiés : `apps/mobile/eas.json` (nouveau), `app.config.ts`/`app.json` (ajout `projectId` + config `updates`), doc/README mobile. Aucun impact `apps/web`/`apps/api`.
- Aucune migration DB, aucun changement backend.

### Frontière de story

- **Inclus** : comptes Apple/Google, `eas.json` 3 profils, build `development` iOS+Android, EAS Update + canaux, doc déclenchement CI→EAS.
- **Exclu** : distribution beta réelle TestFlight/Internal Testing + soumission stores → **MOB-6.5** ; job CI lint/test/typecheck → **MOB-1.4** ; design system → **MOB-1.3**.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-1.2] — AC d'origine (l.360-381)
- [Source: _bmad-output/planning-artifacts/epics-mobile.md#FR-MOB-002 / FR-MOB-003] — compte individuel sans D-U-N-S, EAS + OTA (l.234-235)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Infrastructure & Deployment] — EAS, OTA, CI tag v*, distribution (l.424-435)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Decision Impact Analysis] — séquence setup foundation (l.443-448) ⚠️ ligne D-U-N-S obsolète
- [Source: _bmad-output/implementation-artifacts/MOB-1-1-init-apps-mobile-monorepo-integration.md] — prérequis workspace + note app.json→app.config.ts (MOB-1.4)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Claude Code)

### Implementation Plan

- Ordre volontairement ajusté : T2 → **T4 (config OTA)** → T3 (builds) → T5, pour que les builds embarquent la config `expo-updates`/canaux et éviter un re-build (économie free tier ~30 builds/mois).
- `bundleIdentifier`/`package` requis pour EAS build, absents de la story : décision Guillaume 2026-06-07 → **`app.ridenrest`** (reverse-DNS de ridenrest.app, identique iOS/Android).

### Debug Log References

- Builds EAS : iOS dev `72767639-f696-4efb-ae54-f13b66c2883b`, Android dev `5f4b781e-2c2a-4e51-9740-72524a2b2520`, Android preview `9a114615-4775-4fb3-a518-b02df969a553` — tous FINISHED (dashboard : expo.dev/accounts/ridenrest/projects/ridenrest)
- Updates EAS : `692f517a` (« OTA smoke test ») puis `6bff08c7` (« revert OTA smoke test »), branche/canal `preview`, runtime `1.0.0`
- ⚠️ Piège rencontré : un Metro `expo start --android` résiduel faisait tourner le bundle dans **Expo Go** sur l'émulateur — les premières « vérifications » Android étaient en réalité Expo Go (`host.exp.exponent`). Re-vérifié proprement avec `app.ridenrest` (pidof + `cmd package resolve-activity`). Pour les vérifs futures : toujours confirmer le package au premier plan.
- `eas build:run -p android` échoue (« Failed to resolve the Android aapt path » — build-tools absents du SDK brew) → contournement `adb install` direct de l'APK téléchargé.
- `eas update --non-interactive` exige `--environment` (eas-cli 20.x).

### Completion Notes List

- **Comptes (T1, AC1)** : Apple Developer individuel **actif** (sans D-U-N-S). Google Play Console **bloqué** : paiement $25 refusé, Guillaume doit contacter sa banque. Non bloquant techniquement (compte Google requis seulement pour la soumission store, MOB-6.5). Consignation Apple Team ID dans le gestionnaire de mots de passe : à confirmer par Guillaume.
- **EAS (T2, AC2)** : eas-cli `20.1.0` en devDependency `apps/mobile`. Projet EAS `@ridenrest/ridenrest`, `projectId 4548dbd0-ee0d-4ba7-8acb-e42469ec1ec3` (`app.json` → `extra.eas`). `eas.json` : 3 profils + canaux homonymes, `appVersionSource: remote`, `development.ios.simulator: true`.
- **Credentials (T3)** : 100 % gérés par EAS cloud — keystore Android généré sur les serveurs Expo (aucun keytool local), build iOS `development` = simulateur donc sans signing ; le signing device/store utilisera le compte Apple au moment voulu. **Rien dans le repo.**
- **OTA (T4, AC3)** : `expo-updates ~56.0.18`, `runtimeVersion.policy: appVersion`, `updates.url` EAS. Smoke test complet validé sur build `preview` Android (fetch lancement 1, application lancement 2). Règle « OTA = JS/assets uniquement » documentée dans le README.
- **Bonus** : `expo-dev-client ~56.0.19` (requis par EAS pour le profil development) ; `ITSAppUsesNonExemptEncryption: false` ajouté à `app.json` (évite une étape App Store Connect en MOB-6.5 — note : le build iOS `72767639` a été lancé avant cet ajout, sans impact dev).
- **CI→EAS (T5, AC4)** : documenté dans `apps/mobile/README.md` — pattern tag `v*` → `eas build` cloud (squelette YAML), secret `EXPO_TOKEN`, GitHub Actions ne compile rien nativement. Précision : le CI web actuel se déclenche sur push `main` (pas tag) ; le job mobile par tag s'y ajoutera en MOB-1.4 sans le modifier.
- **Conso builds** : 3 builds EAS utilisés ce mois (iOS dev, Android dev, Android preview) sur ~30 du free tier.
- **Régression** : `turbo run lint typecheck test build --force` → **23/23 tâches vertes** (510+ tests), aucune régression liée aux nouvelles dépendances.

### File List

- `apps/mobile/eas.json` (nouveau)
- `apps/mobile/app.json` (modifié : bundleIdentifier/package `app.ridenrest`, infoPlist ITSAppUsesNonExemptEncryption, extra.eas.projectId, owner, runtimeVersion, updates.url)
- `apps/mobile/package.json` (modifié : + eas-cli, expo-updates, expo-dev-client)
- `apps/mobile/README.md` (réécrit : doc builds EAS, OTA, CI→EAS, env vars)
- `pnpm-lock.yaml` (modifié : nouvelles dépendances)
- `_bmad-output/implementation-artifacts/MOB-1-2-dev-accounts-eas-ota-pipeline.md` (story : frontmatter baseline_commit, checkboxes, Dev Agent Record)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut MOB-1-2)

### Change Log

- 2026-06-07 — MOB-1.2 : EAS Build configuré (3 profils + canaux OTA), projet EAS créé, builds `development` iOS/Android + `preview` Android verts, Dev Clients vérifiés sur simulateur/émulateur, EAS Update opérationnel (smoke test OTA validé sur canal `preview`), doc CI→EAS rédigée. Identité app : `app.ridenrest`. Restent : compte Google Play (blocage bancaire) + consignation Apple Team ID (actions Guillaume).
- 2026-06-07 — Consignation Apple Team ID : décision PO = pas de consignation séparée (consultable sur developer.apple.com). Story passée en **review** sur décision Guillaume avec un reste-à-faire tracé : inscription Google Play Console (paiement `OR_MIVEM_04` en résolution bancaire) — AC1 partiellement satisfait (Apple ✅ / Google ⏳), sans impact sur AC2-AC4 ni sur les stories MOB-1.x/MOB-2+ ; deadline réelle = MOB-6.5.
- 2026-06-07 — **Code review** (3 couches adversariales : Blind Hunter / Edge Case Hunter / Acceptance Auditor) : 0 decision-needed, 2 patches appliqués (README : iOS dev = simulateur uniquement ; `eas update` toujours avec `--channel`), 2 defers consignés dans `deferred-work.md` (reactCompiler phantom dep → MOB-1.4 ; gate `--no-wait` du squelette CI → MOB-1.4), 19 findings rejetés (dont faux positif « conflit `appVersionSource: remote` × `runtimeVersion: appVersion` »). AC2-AC4 conformes, AC1 partiel (Google ⏳, décision PO tracée). Story passée en **done** — le reste-à-faire Google Play reste tracé ici et dans sprint-status (deadline MOB-6.5).
