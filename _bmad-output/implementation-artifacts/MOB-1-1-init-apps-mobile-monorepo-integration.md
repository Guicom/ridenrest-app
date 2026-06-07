# Story MOB-1.1 : Initialisation de `apps/mobile/` et intégration monorepo

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **développeur**,
I want **une app Expo Router initialisée dans `apps/mobile/` et intégrée au monorepo Turborepo/pnpm**,
So that **l'app se lance sur simulateur iOS et émulateur Android et peut consommer les packages partagés (`@ridenrest/shared`, `@ridenrest/gpx`)**.

> Première story de l'Epic MOB-1 (Fondation & coquille applicative). Aucune story mobile antérieure — c'est le point d'entrée du périmètre mobile-natif. Le backend (NestJS + PostgreSQL/PostGIS + Redis + BRouter) et les apps existantes (`apps/web`, `apps/api`) **restent inchangés** ; cette story **ajoute** un workspace, elle n'en modifie aucun — à une exception près (voir ⚠️ `.npmrc` ci-dessous), qui impose une non-régression vérifiée.

## Acceptance Criteria

1. **Given** le monorepo ridenrest-app
   **When** j'initialise l'app via `pnpm create expo-app@latest apps/mobile --template with-router --no-install`
   **Then** `apps/mobile/` contient une app Expo Router fonctionnelle
   **And** `.npmrc` (racine) contient `node-linker=hoisted`
   **And** `pnpm install` depuis la racine résout les dépendances sans erreur de hoisting

2. **Given** le passage du linker pnpm en `hoisted` impacte **tout** le monorepo (web + api partagent désormais un `node_modules` aplati)
   **When** je relance `pnpm install` puis `pnpm lint` / `pnpm build` / `pnpm test` à la racine
   **Then** `apps/web` et `apps/api` continuent de builder, linter et passer leurs tests **sans régression** (preuve de non-régression du changement de linker)

3. **Given** `apps/mobile/` initialisée
   **When** je configure `metro.config.js` pour le monorepo
   **Then** Metro résout les imports depuis `@ridenrest/shared` et `@ridenrest/gpx` sans duplication de modules (watchFolders sur la racine, `nodeModulesPaths` projet + racine)

4. **Given** le pipeline Turborepo (`turbo ^2.6.x`, clé `tasks`)
   **When** je lance le dev mobile via turbo
   **Then** l'app démarre et s'affiche sur le simulateur iOS et l'émulateur Android (écran d'accueil par défaut du template)
   **And** les tâches turbo `dev` / `build` / `lint` / `test` / `typecheck` sont déclarées dans `apps/mobile/package.json` et reconnues par turbo (les outputs `build` de `turbo.json` incluent `.expo/**`)

5. **Given** l'app lancée sans session
   **When** elle démarre
   **Then** la navigation Expo Router est opérationnelle (au moins une route placeholder accessible et une navigation programmatique fonctionnelle)

6. **Given** le package `apps/mobile`
   **When** j'inspecte son `package.json`
   **Then** il est nommé `@ridenrest/mobile` (alignement `@ridenrest/web`, `@ridenrest/api`, `@ridenrest/*`)
   **And** ses dépendances internes utilisent le protocole `workspace:*`
   **And** son `tsconfig.json` aligne la rigueur stricte du monorepo et expose l'alias `@/*` → racine `apps/mobile/`

## Tasks / Subtasks

- [ ] **T1 — Initialiser le workspace Expo** (AC: 1, 6)
  - [ ] Depuis la racine du repo : `pnpm create expo-app@latest apps/mobile --template with-router --no-install`
  - [ ] Renommer le package en `@ridenrest/mobile` dans `apps/mobile/package.json` (`"name": "@ridenrest/mobile"`, `"private": true`)
  - [ ] Vérifier que `apps/mobile` est bien capté par `pnpm-workspace.yaml` (déjà `apps/*` — aucun changement attendu)
  - [ ] Confirmer la cible Expo SDK 55 (RN 0.83, React 19.2, New Architecture par défaut) ; ne pas downgrader

- [ ] **T2 — Activer le linker hoisted (changement transverse)** (AC: 1, 2)
  - [ ] Créer le fichier racine `.npmrc` avec `node-linker=hoisted` (le fichier n'existe pas encore — pnpm 10 est en `isolated` par défaut)
  - [ ] `pnpm install` à la racine — résolution sans erreur de hoisting
  - [ ] ⚠️ **Non-régression** : relancer `pnpm lint`, `pnpm build`, `pnpm test` à la racine et confirmer que `apps/web` (Next.js 15) et `apps/api` (NestJS 11) restent verts. Documenter le résultat dans Completion Notes
  - [ ] Si une régression apparaît (résolution de module aplatie), la corriger avant de poursuivre — ne pas laisser le monorepo cassé

- [ ] **T3 — Configurer Metro pour le monorepo** (AC: 3)
  - [ ] Créer/adapter `apps/mobile/metro.config.js` : `watchFolders = [workspaceRoot]`, `resolver.nodeModulesPaths = [projectRoot/node_modules, workspaceRoot/node_modules]`, `resolver.disableHierarchicalLookup = true`
  - [ ] Vérifier qu'un import depuis `@ridenrest/shared` (et `@ridenrest/gpx`) se résout dans l'app sans erreur ni duplication de module (ex. un `import` simple d'une constante/type dans la route placeholder)

- [ ] **T4 — Câbler le pipeline Turborepo** (AC: 4)
  - [ ] Déclarer dans `apps/mobile/package.json` les scripts `dev` (`expo start`), `lint`, `test`, `typecheck` (et `build` = `expo export` léger ou no-op cohérent — le build natif reste sur EAS, cf. MOB-1.2/MOB-1.4)
  - [ ] Étendre `turbo.json` : ajouter `.expo/**` aux `outputs` de la tâche `build` (les tâches `lint`/`test`/`dev` génériques existantes captent déjà mobile via `--filter='*'`)
  - [ ] Vérifier `turbo run dev --filter=@ridenrest/mobile` (ou `--filter=mobile`) démarre Expo
  - [ ] **Ne pas** câbler le job CI ici : la gate CI (turbo `--filter='*'` sur PR, exclusion build natif GH Actions) est le périmètre de **MOB-1.4**

- [ ] **T5 — TypeScript & alias** (AC: 6)
  - [ ] `apps/mobile/tsconfig.json` : `extends: "expo/tsconfig.base"`, `compilerOptions.strict: true` (aligné `@ridenrest/typescript-config/base`), `paths: { "@/*": ["./*"] }`
  - [ ] S'assurer que les types Expo Router générés (`.expo/types`) sont inclus et que `pnpm --filter @ridenrest/mobile typecheck` passe

- [ ] **T6 — Route placeholder & navigation** (AC: 5)
  - [ ] Garder/réduire le template à une route placeholder accessible (ex. `app/index.tsx`) + démontrer une navigation programmatique (`useRouter().push(...)` vers une 2ᵉ route, ou route par défaut du template)
  - [ ] Démarrage sans session : aucun crash, écran d'accueil affiché

- [ ] **T7 — Lancement multi-plateforme** (AC: 4, 5)
  - [ ] `expo start` → lancement vérifié sur **simulateur iOS** et **émulateur Android** (Expo Go suffit : aucun module natif custom ajouté à ce stade — MapLibre / secure-store arrivent plus tard et imposeront le Dev Client)
  - [ ] Consigner toute commande/étape manuelle nécessaire (Watchman, Xcode, Android SDK) dans Dev Notes/Completion Notes

## Dev Notes

### État réel du monorepo (vérifié 2026-06-02)

- **Gestionnaire** : `pnpm@10.32.1` (champ `packageManager` racine), `turbo ^2.6.1` (Turbo **2.x** → clé `tasks` dans `turbo.json`, pas `pipeline`), `typescript ^5.7.3`.
- **`pnpm-workspace.yaml`** : `packages: ['apps/*', 'packages/*']` → `apps/mobile` sera capté automatiquement. **Aucun changement requis.**
- **Convention de nommage des packages** : `@ridenrest/web` (`apps/web`), `@ridenrest/database` / `@ridenrest/gpx` / `@ridenrest/shared` (`packages/*`). → le package mobile **doit** être `@ridenrest/mobile` (le template Expo le nommera `mobile` par défaut, à renommer).
- **Dépendances internes** : protocole `workspace:*` (ex. `apps/web` importe `"@ridenrest/shared": "workspace:*"`).
- **`turbo.json` actuel** : tâches `build` (outputs `.next/**`, `dist/**`), `lint`, `test`, `dev` (persistent). → ajouter `.expo/**` aux outputs `build`.
- **Scripts racine** : `pnpm build|dev|lint|test` = `turbo run <task> --filter='*'` → mobile sera **inclus d'office** dès qu'il déclare ces tâches (c'est précisément le mécanisme exploité par la gate CI de MOB-1.4).
- **`packages/typescript-config`** : exporte `./base`, `./nextjs`, `./nestjs`. `base.json` = `strict: true`, `moduleResolution: "bundler"`, `target: ES2022`. Mobile **étend `expo/tsconfig.base`** (impératif pour Expo Router/JSX/types générés) tout en **conservant `strict: true`** ; ne pas étendre directement `@ridenrest/typescript-config/base` (incompatible avec les besoins Metro/Expo) mais en **aligner la rigueur**.

### ⚠️ Point de vigilance n°1 — `.npmrc node-linker=hoisted` est un changement GLOBAL

Le fichier `.npmrc` **n'existe pas** aujourd'hui → pnpm 10 utilise le linker **`isolated`** (node_modules symlinké/strict). Passer à `hoisted` ré-aplatit **l'intégralité** du `node_modules` du monorepo, donc impacte `apps/web` et `apps/api` aussi, pas seulement mobile. C'est **requis** car Metro ne suit pas les symlinks pnpm (raison documentée dans l'archi), mais c'est aussi le **seul fichier existant modifié** par cette story.
→ **Obligation** : après le changement, re-valider web + api (lint/build/test) — c'est l'objet de l'AC #2. Ne pas considérer la story terminée sans cette preuve de non-régression.

### Patterns d'architecture à respecter (source : `architecture-mobile.md`)

- **Config Expo** : viser `app.config.ts` (TypeScript) plutôt que `app.json` à terme — mais pour MOB-1.1, le template génère `app.json` ; la migration vers `app.config.ts` + le scheme `ridenrest://` sont le périmètre de **MOB-1.4** (deep link scheme). Ne pas pré-implémenter le scheme ici.
- **`metro.config.js` monorepo** : `watchFolders` vers la racine, `nodeModulesPaths` projet **puis** racine, `disableHierarchicalLookup = true`. (Pattern Expo monorepo standard.)
- **Alias** : `@/*` → racine `apps/mobile/` (alignement web), déclaré dans `tsconfig.json` (et `babel.config.js` quand NativeWind/babel seront configurés en MOB-1.3).
- **Variables d'env publiques** : préfixe `EXPO_PUBLIC_*` (ex. futur `EXPO_PUBLIC_API_URL`). Aucun secret dans le bundle JS.
- **Règle métier** : la logique métier reste dans `packages/shared` / `packages/gpx` — l'app mobile est **un client de plus**. Aucune logique métier dupliquée côté mobile.

### Structure cible (à NE PAS sur-implémenter dans cette story)

L'arborescence complète (`app/(auth)`, `app/(app)`, `components/`, `hooks/`, `stores/`, `lib/...`) est décrite dans `architecture-mobile.md` mais sera remplie **au fil des epics**. MOB-1.1 se limite à : init + intégration monorepo + 1 route placeholder + lancement vérifié. Ne pas scaffolder les écrans auth/adventures/map/live (epics MOB-2→MOB-5).

### Frontière de story (ce qui n'est PAS dans MOB-1.1)

- Comptes Apple/Google + EAS + OTA → **MOB-1.2**
- Design tokens + NativeWind + Storybook → **MOB-1.3**
- i18n + framework de tests (Jest/RNTL/Maestro) + **gate CI** + scheme `ridenrest://` + `app.config.ts` → **MOB-1.4**

### Testing standards

- Pas de test unitaire fonctionnel attendu sur MOB-1.1 (le framework Jest/RNTL est installé en MOB-1.4). La validation est **opérationnelle** : `pnpm install` propre, lancement iOS + Android, résolution des imports `@ridenrest/*`, non-régression web/api.
- Convention future : tests co-localisés `*.test.ts(x)`, E2E Maestro dans `.maestro/`.

### Project Structure Notes

- `apps/mobile/` est un **nouveau** workspace ; aucun fichier de `apps/web`, `apps/api`, `packages/*` n'est modifié **sauf** : `.npmrc` (créé), `turbo.json` (outputs `build`), `pnpm-lock.yaml` (régénéré par `pnpm install`).
- Aucune migration DB, aucun changement backend.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-1.1] — AC d'origine, As-a/I-want/So-that
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Selected Starter] — commandes d'init, structure cible (l.154-220)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Architectural Decisions Provided by Starter] — turbo.json `.expo/**`, Dev Client (l.222-276)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Structure Patterns / Configuration & environnement] — alias `@/*`, `EXPO_PUBLIC_*`, app.config.ts (l.537-618)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Versions cibles] — Expo SDK 55, MapLibre RN 11, New Architecture (l.133-142)
- [Source: package.json racine] — pnpm@10.32.1, turbo ^2.6.1, scripts `--filter='*'`
- [Source: turbo.json] — tâches `tasks` (Turbo 2.x), outputs build actuels
- [Source: packages/typescript-config/base.json] — strict, moduleResolution bundler, ES2022

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
