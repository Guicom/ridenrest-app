---
baseline_commit: ac20da855f765e84f8cf9686374961b469eae300
---

# Story MOB-1.4 : Configuration transverse (i18n, tests, CI, deep link scheme)

Status: done

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

- [x] **T1 — Migration `app.json` → `app.config.ts` + scheme deep link** (AC: 4)
  - [x] Convertir la config Expo en `app.config.ts` (TypeScript — convention archi, **jamais** `app.json` à terme), en **préservant** le `projectId` EAS si MOB-1.2 l'a déjà créé
  - [x] Déclarer `scheme: 'ridenrest'` (génère `CFBundleURLTypes` iOS + intent filter Android au prebuild)
  - [x] Créer une route `app/oauth-callback.tsx` (placeholder) + vérifier qu'un `ridenrest://test` (ou `ridenrest://oauth-callback`) ouvre l'app et est routé par Expo Router (`npx uri-scheme open ridenrest://test --ios` / `--android`)
  - [x] Ne pas implémenter le flow OAuth lui-même (→ MOB-2.3/2.4) ; uniquement le scheme + le routage

- [x] **T2 — Scaffold i18n** (AC: 1)
  - [x] `expo install expo-localization` + `pnpm add i18next react-i18next`
  - [x] `lib/i18n/i18n.config.ts` : init i18next, détection locale device (`expo-localization`), **fallback `fr`**, locale par défaut `fr`
  - [x] `lib/i18n/locales/fr.json` (+ `en.json` squelette)
  - [x] Provider i18n monté dans le root `app/_layout.tsx`
  - [x] **Preuve de câblage** : au moins une chaîne de l'écran placeholder (MOB-1.1) résolue via `t('...')` (pas de chaîne en dur)

- [x] **T3 — Framework de tests Jest + RNTL** (AC: 2)
  - [x] `expo install jest jest-expo @testing-library/react-native` (+ `@types/jest`) ; preset `jest-expo`
  - [x] `__mocks__/` à la racine `apps/mobile/` pour les libs natives (placeholders pour `expo-location`, `expo-secure-store`, `@maplibre/maplibre-react-native` — utilisés par les epics suivants)
  - [x] Un test d'exemple **qui passe** (ex. rendu du `Button` du DS de MOB-1.3, ou de l'écran placeholder + assertion i18n)
  - [x] Scripts `package.json` : `test` (`jest`), `typecheck` (`tsc --noEmit`), `lint` (eslint) — confirmés cohérents avec les tâches turbo déclarées en MOB-1.1

- [x] **T4 — Maestro E2E (smoke, pré-release)** (AC: 2, 3)
  - [x] Installer Maestro (CLI) ; `.maestro/launch.yaml` : smoke test « l'app se lance et affiche l'écran d'accueil »
  - [x] Documenter que Maestro tourne **en pré-release** (avant soumission), **pas** sur chaque PR — ne PAS l'ajouter au job CI PR

- [x] **T5 — Gate CI (sans rien casser de l'existant)** (AC: 3)
  - [x] S'assurer que `apps/mobile` expose les tâches turbo `lint` / `test` / `typecheck` → captées **automatiquement** par le `--filter='*'` existant du `ci.yml` (aucune modification du workflow GH Actions nécessaire pour lint/test)
  - [x] **Exclure le build natif** du job `build` GH Actions : soit `build:mobile` n'est pas dans le scope du job build CI, soit réduite à `expo export`/`typecheck` léger. Le build natif = **EAS uniquement** (MOB-1.2)
  - [x] Ouvrir/valider une PR de contrôle : confirmer que le lint + les tests mobile s'exécutent et **bloquent** en cas d'échec, et qu'**aucune** étape ne tente de compiler nativement dans Actions
  - [x] ⚠️ Vérifier que l'ajout des tâches mobile **ne casse pas** le pipeline web/api existant (temps de CI, cache turbo)

### Review Findings

> Code review (bmad-code-review) — 2026-06-08, baseline `ac20da8`. 3 couches adverses (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Suite de tests **réexécutée pour vérification empirique → 7/7 verts**, ce qui a permis d'écarter 2 « High » des agents (résolution alias `@/lib/cn` en Jest et non-application des `__mocks__`) comme **faux positifs** (les tests passent réellement). Triage : 1 decision-needed, 0 patch, 1 defer, 9 dismissed.

- [x] [Review][Decision→Patch] Tâche `typecheck` non exécutée par la gate CI — **RÉSOLU** (Guillaume, option 1). Ajout d'une étape `Typecheck` (`pnpm turbo run typecheck --filter='*'`) dans `.github/workflows/ci.yml` (entre `Lint` et `Build`). Auparavant `ci.yml` ne lançait que `lint|build|test` → `typecheck` n'était gated pour aucun workspace, alors que `turbo.json` définit la tâche et que le README (T5) affirmait qu'elle était « captée par la gate ». L'affirmation est désormais vraie. Vérifié : `turbo run typecheck --filter='*'` → **7/7 verts** (tâches `typecheck` réelles : `@ridenrest/mobile`, `@ridenrest/design-tokens` ; web/api type-checkent via leur `build`). Le typecheck mobile bloque désormais le merge en cas d'erreur `tsc`.
- [x] [Review][Defer] Validation des params du deep link OAuth absente [apps/mobile/src/app/oauth-callback.tsx:22] — deferred, par conception (placeholder ; flow réel + parsing `code`/`error`/array-params en MOB-2.3/2.4)

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

claude-opus-4-8 (Claude Opus 4.8, 1M context)

### Debug Log References

- `pnpm --filter @ridenrest/mobile test` → **2 suites / 7 tests** verts (i18n.config.test.ts, button.test.tsx).
- `pnpm exec tsc --noEmit` (apps/mobile) → **0 erreur**.
- `pnpm turbo run lint --filter=@ridenrest/mobile` → **rouge à l'arrivée** : 5 erreurs `react-hooks/refs` dans `src/components/ui/skeleton.tsx:22` (héritage MOB-1.3, `useRef(new Animated.Value()).current` lu pendant le rendu). Corrigé (lazy `useState`) → **exit 0**. *Cette rougeur prouve que la gate n'est pas un no-op.*
- `pnpm turbo run lint test --filter='*'` (gate CI complète, tous workspaces) → **21/21 tâches OK** (web : 98 suites / 1154 tests ; mobile : 7 tests). L'ajout des tâches mobile ne casse pas le pipeline web/api.
- `turbo run build --filter='*' --dry=json` → `@ridenrest/mobile#build = "expo export"` (bundle JS, **aucune** compilation native iOS/Android dans Actions).

### Completion Notes List

> 📌 **Reviewers — lire d'abord** : `MOB-1-4-session-notes-2026-06-08.md` (même dossier). Il liste les
> **décisions intentionnelles à NE PAS rollback** (fix `skeleton.tsx` pour la gate lint, `ci.yml` volontairement
> non modifié, `app.json` supprimé au profit de `app.config.ts`, Maestro hors CI, fallback i18n `fr`, etc.),
> les fichiers générés non suivis (`ios/`, `.expo/`), et le contexte environnement (Xcode 26.4+ requis par SDK 56).

- **T1 — `app.config.ts` + scheme** : `app.json` supprimé, config migrée en TypeScript (`app.config.ts`) avec `projectId` EAS + bloc `updates` (OTA) **préservés**. `scheme: 'ridenrest'` déclaré → génère `CFBundleURLTypes` (iOS) + intent filter (Android) au prebuild. Route placeholder `app/oauth-callback.tsx` créée (affiche les params reçus, **sans** flow OAuth → déféré MOB-2.3/2.4). **Vérification runtime du deep link : RÉUSSIE** ✅ (iPhone 17 Pro, iOS 26.5). `xcrun simctl openurl … ridenrest://oauth-callback?provider=test&code=abc123` ouvre l'app, Expo Router route vers l'écran `oauth-callback`, qui affiche les query params reçus (`{"provider":"test","code":"abc123"}`) + les chaînes i18n FR via `t()` (valide aussi AC1 au runtime). `CFBundleURLSchemes → ridenrest` confirmé dans l'`Info.plist` généré par le prebuild (preuve AC4 config iOS). Pré-requis environnement rencontré et résolu : **Expo SDK 56 exige Xcode 26.4+** (le poste était en 26.1 → le code Swift `weak let` d'`expo-modules-jsi` ne compilait pas, `xcodebuild error 65`) ; MAJ Xcode 26.1 → **26.5** + install du runtime simulateur iOS 26.5 (`xcodebuild -downloadPlatform iOS`) → `expo run:ios` compile (749 fichiers, BUILD SUCCEEDED) et installe l'app. Build EAS cloud non affecté (toolchain à jour). Prérequis documenté dans `AGENTS.md` + `README.md`.
- **T2 — i18n** : `src/lib/i18n/` (`i18n.config.ts`, `index.ts`, `locales/{fr,en}.json`). Init i18next + détection locale device (`expo-localization`), **locale par défaut + fallback = `fr`** (jamais `en`). `I18nextProvider` monté au root (`_layout.tsx`). Toutes les chaînes des écrans `index`/`explore`/`oauth-callback` résolues via `t()` (preuve de câblage, zéro chaîne en dur). Externalisation complète déférée MOB-6.3.
- **T3 — Jest/RNTL** : preset `jest-expo` (`jest.config.js` + `jest.setup.ts`). `transformIgnorePatterns` étendu (nativewind, react-native-css-interop, `@ridenrest/*` source TS, `@expo-google-fonts/*`). Mocks natifs `__mocks__/` (expo-localization → `fr` déterministe, expo-location, expo-secure-store, @maplibre/maplibre-react-native). Test d'exemple `button.test.tsx` (rendu/rôle/onPress) + `i18n.config.test.ts` (résolution `t()`).
- **T4 — Maestro** : `.maestro/launch.yaml` (smoke « app se lance + écran d'accueil »). Assert sur le **titre de marque `Ride'n'Rest`** (codé en dur, indépendant de la locale device — un simulateur neuf est souvent `en`). Cadence **pré-release** documentée (README) ; **non ajouté** au job CI PR. Maestro = CLI système (hors `package.json`).
- **T5 — Gate CI** : `apps/mobile` expose `lint`/`test`/`typecheck` → captés par le `--filter='*'` existant, **aucune** modification de `ci.yml`. Build mobile = `expo export` (léger) → **aucun build natif** en Actions (natif = EAS only, FR-MOB-003). Gate vérifiée verte **et bloquante** (était rouge avant le fix skeleton). Pipeline web/api intact (21/21).
- **Fix hors-périmètre nécessaire à T5** : `src/components/ui/skeleton.tsx` (MOB-1.3) violait `react-hooks/refs` et rendait la gate lint mobile rouge à l'arrivée. Corrigé par l'initialiseur paresseux `useState(() => new Animated.Value(1))` (instance stable, sans lecture de ref pendant le rendu) — comportement d'animation inchangé.

### File List

**Ajoutés**

- `apps/mobile/app.config.ts` (remplace `app.json` ; scheme + projectId EAS + updates)
- `apps/mobile/src/app/oauth-callback.tsx` (route placeholder deep link)
- `apps/mobile/src/lib/i18n/i18n.config.ts`
- `apps/mobile/src/lib/i18n/index.ts`
- `apps/mobile/src/lib/i18n/i18n.config.test.ts`
- `apps/mobile/src/lib/i18n/locales/fr.json`
- `apps/mobile/src/lib/i18n/locales/en.json`
- `apps/mobile/jest.config.js`
- `apps/mobile/jest.setup.ts`
- `apps/mobile/__mocks__/expo-localization.js`
- `apps/mobile/__mocks__/expo-location.js`
- `apps/mobile/__mocks__/expo-secure-store.js`
- `apps/mobile/__mocks__/@maplibre/maplibre-react-native.js`
- `apps/mobile/src/components/ui/button.test.tsx`
- `apps/mobile/.maestro/launch.yaml`

**Modifiés**

- `apps/mobile/package.json` (deps i18next/react-i18next/expo-localization/jest/jest-expo/RNTL ; scripts `test`/`typecheck`)
- `apps/mobile/src/app/_layout.tsx` (provider i18n au root)
- `apps/mobile/src/app/index.tsx` (chaînes via `t()`)
- `apps/mobile/src/app/explore.tsx` (chaînes via `t()`)
- `apps/mobile/src/components/ui/skeleton.tsx` (fix lint `react-hooks/refs` pour gate CI verte)
- `apps/mobile/README.md` (doc i18n / tests / Maestro pré-release / gate CI / deep link + prérequis build natif local Xcode 26.4)
- `apps/mobile/AGENTS.md` (exigence toolchain Xcode 26.4 pour SDK 56 ; distinction `expo start`/`run:ios`/EAS ; gotcha runtime simulateur)

**Notes de session (hors story, pour la revue)**

- `_bmad-output/implementation-artifacts/MOB-1-4-session-notes-2026-06-08.md` (guide reviewer : décisions intentionnelles à ne pas rollback, fichiers générés, contexte env Xcode, preuves de validation)

**Supprimés**

- `apps/mobile/app.json` (migré vers `app.config.ts`)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-08 | 1.0 | Implémentation MOB-1.4 : migration `app.config.ts` + scheme `ridenrest://`, scaffold i18n (fr par défaut/fallback), framework Jest/RNTL + mocks natifs, smoke Maestro pré-release, gate CI lint/test/typecheck (build natif exclu → EAS). Fix lint `skeleton.tsx` pour gate verte. Statut → review. | Amelia (dev agent) |
