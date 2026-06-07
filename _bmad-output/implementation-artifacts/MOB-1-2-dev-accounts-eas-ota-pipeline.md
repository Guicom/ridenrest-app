# Story MOB-1.2 : Comptes développeurs & pipeline de distribution (EAS + OTA)

Status: ready-for-dev

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
  - [ ] Apple Developer Program : inscription **compte individuel** ($99/an), Apple ID + CB. **Ne PAS** lancer de démarche D-U-N-S (réservée aux comptes Organisation — non requis ici, décision Guillaume 2026-06-02)
  - [ ] Google Play Console : inscription ($25 paiement unique)
  - [ ] Consigner les identifiants d'équipe (Apple Team ID, Google account) là où le projet stocke ses secrets ops — **jamais** dans le repo
  - [ ] ⚠️ Délais : la validation Apple individuelle est quasi-immédiate (pas de D-U-N-S) ; Google peut demquander une vérification d'identité. Démarrer tôt pour ne pas bloquer MOB-6.5

- [ ] **T2 — Installer & initialiser EAS** (AC: 2)
  - [ ] `cd apps/mobile && pnpm add -D eas-cli` (ou usage via `pnpm dlx eas-cli`) ; `eas login` ; `eas init` (crée le projet EAS + `projectId` dans `app.config.ts`/`app.json`)
  - [ ] Créer `apps/mobile/eas.json` avec 3 profils :
    - `development` : `developmentClient: true`, `distribution: internal`
    - `preview` : `distribution: internal` (build installable hors store, QA)
    - `production` : `distribution: store` (binaire de soumission)
  - [ ] Confirmer que le **Dev Client** est requis dès cette story (MapLibre RN / `expo-secure-store` arrivent ensuite — le Dev Client doit exister avant MOB-2/MOB-4)

- [ ] **T3 — Build EAS `development` iOS + Android** (AC: 2)
  - [ ] `eas build --profile development --platform ios` et `--platform android` → builds **réussis**
  - [ ] Vérifier l'installation du Dev Client sur simulateur iOS / émulateur (ou device) Android et le lancement de l'app
  - [ ] Documenter toute config credential (auto par EAS : signing iOS, keystore Android) dans Completion Notes

- [ ] **T4 — Activer EAS Update (OTA)** (AC: 3)
  - [ ] `expo install expo-updates` ; configurer `runtimeVersion` (policy `appVersion` ou `fingerprint`) et `updates.url` (EAS) dans `app.config.ts`
  - [ ] Rattacher un `channel` à chaque profil dans `eas.json` (`development`→`development`, `preview`→`preview`, `production`→`production`)
  - [ ] Publier un patch JS de test : `eas update --channel preview --message "OTA smoke test"` → vérifier qu'un build `preview` récupère la mise à jour au prochain lancement
  - [ ] ⚠️ Règle OTA : une OTA ne peut livrer **que** du JS/assets ; tout changement natif (nouveau plugin/lib native) impose un **nouveau build** — le noter pour les epics suivants

- [ ] **T5 — Documenter le déclenchement CI → EAS** (AC: 4)
  - [ ] Rédiger (doc/README mobile) le pattern : push tag `v*` → GitHub Actions appelle `eas build`/`eas submit` (cloud) — **GitHub Actions ne compile rien nativement**
  - [ ] Ne **pas** implémenter le job CI lint/test ici (→ MOB-1.4) ; uniquement préparer le hook de build/submit

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
