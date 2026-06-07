# Story MOB-1.4 : Configuration transverse (i18n, tests, CI, deep link scheme)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **développeur**,
I want **un scaffold i18n, un framework de tests intégré au CI existant et le scheme deep link configurés**,
So that **l'app est prête pour la localisation, testée automatiquement sur chaque PR, et capable de recevoir des callbacks `ridenrest://`**.

> Dernière story de l'Epic MOB-1. Dépend de **MOB-1.1** (workspace + tâches turbo). Livre les 4 piliers transverses consommés par tous les epics suivants : **i18n** (toutes les chaînes UI MOB-2→6), **tests** (Jest/RNTL + Maestro), **gate CI** (lint/test/typecheck auto sur PR), **deep link scheme** (`ridenrest://`, prérequis OAuth MOB-2.3/2.4). Câble aussi la migration `app.json` → `app.config.ts`.

## Acceptance Criteria

1. **Given** la distribution stores future
   **When** je configure `expo-localization` + `i18next`
   **Then** une architecture i18n est en place avec le **français** comme locale par défaut
   **And** au moins une chaîne d'UI est résolue via le système i18n (preuve de câblage)

2. **Given** le besoin de qualité
   **When** je configure le framework de tests
   **Then** **Jest + React Native Testing Library** exécutent un test unitaire d'exemple qui passe
   **And** **Maestro** est installé avec un smoke test E2E d'exemple (lancement app)

3. **Given** le pipeline CI existant (`.github/workflows/ci.yml`, GitHub Actions, `pnpm turbo run lint|build|test --filter='*'` sur chaque PR vers `main`)
   **When** `apps/mobile` déclare ses tâches turbo `lint`, `test` et `typecheck`
   **Then** lint + tests unitaires (Jest/RNTL) de `apps/mobile` sont **exécutés automatiquement sur chaque PR** via le `--filter='*'` existant (gate bloquant le merge en cas d'échec)
   **And** **aucun build natif Metro/EAS n'est lancé dans GitHub Actions** : `build:mobile` est exclue du job build GH Actions ou réduite à un `expo export`/`typecheck` léger — le build natif reste exclusivement sur **EAS Build (cloud)** (FR-MOB-003)
   **And** le smoke test **Maestro E2E** est cadencé **en pré-release**, pas sur chaque PR

4. **Given** le besoin de deep linking
   **When** je déclare le scheme `ridenrest://` dans `app.config.ts`
   **Then** un lien `ridenrest://test` ouvre l'app et est routé par Expo Router
   **And** la config iOS (`CFBundleURLTypes`) et Android (intent filter) est générée par le prebuild Expo

## Tasks / Subtasks

- [ ] **T1 — Migration `app.json` → `app.config.ts` + scheme deep link** (AC: 4)
  - [ ] Convertir la config Expo en `app.config.ts` (TypeScript — convention archi, **jamais** `app.json` à terme), en **préservant** le `projectId` EAS si MOB-1.2 l'a déjà créé
  - [ ] Déclarer `scheme: 'ridenrest'` (génère `CFBundleURLTypes` iOS + intent filter Android au prebuild)
  - [ ] Créer une route `app/oauth-callback.tsx` (placeholder) + vérifier qu'un `ridenrest://test` (ou `ridenrest://oauth-callback`) ouvre l'app et est routé par Expo Router (`npx uri-scheme open ridenrest://test --ios` / `--android`)
  - [ ] Ne pas implémenter le flow OAuth lui-même (→ MOB-2.3/2.4) ; uniquement le scheme + le routage

- [ ] **T2 — Scaffold i18n** (AC: 1)
  - [ ] `expo install expo-localization` + `pnpm add i18next react-i18next`
  - [ ] `lib/i18n/i18n.config.ts` : init i18next, détection locale device (`expo-localization`), **fallback `fr`**, locale par défaut `fr`
  - [ ] `lib/i18n/locales/fr.json` (+ `en.json` squelette)
  - [ ] Provider i18n monté dans le root `app/_layout.tsx`
  - [ ] **Preuve de câblage** : au moins une chaîne de l'écran placeholder (MOB-1.1) résolue via `t('...')` (pas de chaîne en dur)

- [ ] **T3 — Framework de tests Jest + RNTL** (AC: 2)
  - [ ] `expo install jest jest-expo @testing-library/react-native` (+ `@types/jest`) ; preset `jest-expo`
  - [ ] `__mocks__/` à la racine `apps/mobile/` pour les libs natives (placeholders pour `expo-location`, `expo-secure-store`, `@maplibre/maplibre-react-native` — utilisés par les epics suivants)
  - [ ] Un test d'exemple **qui passe** (ex. rendu du `Button` du DS de MOB-1.3, ou de l'écran placeholder + assertion i18n)
  - [ ] Scripts `package.json` : `test` (`jest`), `typecheck` (`tsc --noEmit`), `lint` (eslint) — confirmés cohérents avec les tâches turbo déclarées en MOB-1.1

- [ ] **T4 — Maestro E2E (smoke, pré-release)** (AC: 2, 3)
  - [ ] Installer Maestro (CLI) ; `.maestro/launch.yaml` : smoke test « l'app se lance et affiche l'écran d'accueil »
  - [ ] Documenter que Maestro tourne **en pré-release** (avant soumission), **pas** sur chaque PR — ne PAS l'ajouter au job CI PR

- [ ] **T5 — Gate CI (sans rien casser de l'existant)** (AC: 3)
  - [ ] S'assurer que `apps/mobile` expose les tâches turbo `lint` / `test` / `typecheck` → captées **automatiquement** par le `--filter='*'` existant du `ci.yml` (aucune modification du workflow GH Actions nécessaire pour lint/test)
  - [ ] **Exclure le build natif** du job `build` GH Actions : soit `build:mobile` n'est pas dans le scope du job build CI, soit réduite à `expo export`/`typecheck` léger. Le build natif = **EAS uniquement** (MOB-1.2)
  - [ ] Ouvrir/valider une PR de contrôle : confirmer que le lint + les tests mobile s'exécutent et **bloquent** en cas d'échec, et qu'**aucune** étape ne tente de compiler nativement dans Actions
  - [ ] ⚠️ Vérifier que l'ajout des tâches mobile **ne casse pas** le pipeline web/api existant (temps de CI, cache turbo)

## Dev Notes

### CI existant (vérifié)

- `.github/workflows/ci.yml` : GitHub Actions, `pnpm turbo run lint|build|test --filter='*'` sur chaque PR vers `main`, déploiement SSH VPS.
- **Mécanisme clé** : `--filter='*'` inclut **automatiquement** tout workspace déclarant la tâche correspondante. Dès que `apps/mobile` a `lint`/`test`/`typecheck`, ils tournent en CI **sans toucher** au YAML. C'est l'inverse du build natif : il **ne doit pas** tourner dans Actions (lent, nécessite toolchains iOS/Android) → réservé à EAS.
- Root `package.json` : `pnpm@10.32.1`, `turbo ^2.6.1` (clé `tasks`), scripts `turbo run <task> --filter='*'`.

### Patterns i18n / routing (source : `architecture-mobile.md`)

- i18n : `lib/i18n/i18n.config.ts` + `locales/{fr,en}.json` (l.592-596, 1088-1092). FR au lancement, structure prête pour d'autres langues (FR-MOB-021). La **finition** (externalisation de **toutes** les chaînes) est en **MOB-6.3** ; ici = **scaffold + 1 chaîne câblée**.
- Scheme : `ridenrest://` déclaré dans `app.config.ts` (l.650). Deep links OAuth `ridenrest://oauth-google`/`oauth-strava` + `ridenrest://oauth-callback` consommés en MOB-2.
- Config Expo : `app.config.ts` (TS), **jamais** `app.json` (l.614).

### Conventions tests (source : `architecture-mobile.md` §Tests + file detail)

- Tests unit **co-localisés** `*.test.ts(x)` ; E2E Maestro dans `.maestro/*.yaml` ; mocks natifs dans `__mocks__/` (l.988-995, 1112-1114).
- Jest + RNTL préconfigurés via Expo (`jest-expo`). Maestro privilégié à Detox (plus simple, smoke pré-release).

### ⚠️ Dépendances inter-stories

- **MOB-1.1** déclare déjà les tâches turbo `lint`/`test`/`typecheck` côté mobile ; cette story les rend **réelles** (tests qui existent et passent). Vérifier qu'aucun script n'est un no-op au moment d'activer la gate CI (sinon la gate est verte à tort).
- **MOB-1.2** crée le `projectId` EAS dans la config Expo. La migration `app.json`→`app.config.ts` (T1) **doit conserver** ce `projectId` + la config `updates` (OTA). Coordonner l'ordre si 1.2 et 1.4 sont faites en parallèle.
- **MOB-1.3** fournit le `Button` du DS → cible idéale pour le test RNTL d'exemple (T3).

### Garde-fous

- **Ne pas** ajouter Maestro au job CI des PR (coût/temps ; flakiness des E2E). Pré-release uniquement.
- **Ne pas** lancer `expo prebuild`/build natif dans GitHub Actions.
- i18n : aucune chaîne en dur dans l'écran de preuve — sinon l'AC #1 n'est pas réellement satisfaite.
- Locale par défaut **fr** + fallback **fr** (pas `en`).

### Testing standards

- Validation : `pnpm --filter @ridenrest/mobile test` vert (≥ 1 test), `typecheck` vert, `lint` vert ; `maestro test .maestro/launch.yaml` lance l'app ; deep link `ridenrest://test` ouvre l'app ; PR de contrôle montre la gate mobile active et bloquante, sans build natif en Actions.

### Project Structure Notes

- Ajouté : `apps/mobile/app.config.ts` (remplace `app.json`), `app/oauth-callback.tsx`, `lib/i18n/**`, `__mocks__/**`, `.maestro/launch.yaml`, `jest.config`/preset, test(s) d'exemple. Modifié : `app/_layout.tsx` (provider i18n), écran placeholder (1 chaîne i18n), `package.json` (scripts test/typecheck), éventuellement `ci.yml` **uniquement** pour exclure le build natif si nécessaire.
- Aucune migration DB / backend.

### Frontière de story

- **Inclus** : scaffold i18n + 1 chaîne câblée, Jest/RNTL + 1 test, Maestro + 1 smoke, gate CI lint/test/typecheck (build natif exclu), scheme `ridenrest://` + routage + `app.config.ts`.
- **Exclu** : externalisation complète des chaînes → **MOB-6.3** ; flow OAuth → **MOB-2.3/2.4** ; design system → **MOB-1.3** ; comptes/EAS → **MOB-1.2**.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-1.4] — AC d'origine, bloc CI (l.407-434)
- [Source: _bmad-output/planning-artifacts/epics-mobile.md#FR-MOB-021 / FR-MOB-031 / FR-MOB-010] — i18n, tests, scheme (l.249, 254, 239)
- [Source: .github/workflows/ci.yml] — turbo `--filter='*'` lint/build/test sur PR
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Routing & deep links / Configuration] — scheme `ridenrest://`, `app.config.ts` (l.610-655)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Tests / file detail] — Jest/RNTL/Maestro, `.maestro/`, `__mocks__/` (l.719-728, 988-995)
- [Source: _bmad-output/implementation-artifacts/MOB-1-1-init-apps-mobile-monorepo-integration.md] — tâches turbo déclarées, note app.config.ts/scheme déférée ici

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
