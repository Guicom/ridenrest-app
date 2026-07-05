---
baseline_commit: 9922fc2f3d8683ded400bf24a97f7a80c55c96bc
---

# Story MOB-1.1 : Initialisation de `apps/mobile/` et intégration monorepo

Status: done

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
   **And** les tâches turbo `dev` / `build` / `lint` / `test` / `typecheck` sont déclarées dans `apps/mobile/package.json` et reconnues par turbo *(amendé en code review 2026-06-07 : les outputs `build` n'incluent **pas** `.expo/**` — `expo export` écrit dans `dist/**` déjà couvert ; `.expo/` est un cache machine non déterministe qui polluerait le cache turbo)*

5. **Given** l'app lancée sans session
   **When** elle démarre
   **Then** la navigation Expo Router est opérationnelle (au moins une route placeholder accessible et une navigation programmatique fonctionnelle)

6. **Given** le package `apps/mobile`
   **When** j'inspecte son `package.json`
   **Then** il est nommé `@ridenrest/mobile` (alignement `@ridenrest/web`, `@ridenrest/api`, `@ridenrest/*`)
   **And** ses dépendances internes utilisent le protocole `workspace:*`
   **And** son `tsconfig.json` aligne la rigueur stricte du monorepo et expose l'alias `@/*` → racine `apps/mobile/`

## Tasks / Subtasks

- [x] **T1 — Initialiser le workspace Expo** (AC: 1, 6)
  - [x] Depuis la racine du repo : `pnpm create expo-app@latest apps/mobile --template with-router --no-install` *(déviation : `--template with-router` résout désormais vers le package npm `with-router` — l'exemple Expo n'existe plus, Expo Router est inclus dans le template par défaut depuis SDK 50 → init refaite avec `--template default`)*
  - [x] Renommer le package en `@ridenrest/mobile` dans `apps/mobile/package.json` (`"name": "@ridenrest/mobile"`, `"private": true`)
  - [x] Vérifier que `apps/mobile` est bien capté par `pnpm-workspace.yaml` (déjà `apps/*` — aucun changement attendu)
  - [x] Confirmer la cible Expo SDK 55 (RN 0.83, React 19.2, New Architecture par défaut) ; ne pas downgrader *(template actuel = SDK 56, RN 0.85.3, React 19.2.3 — supérieur à la cible, non downgradé conformément à la consigne)*

- [x] **T2 — Activer le linker hoisted (changement transverse)** (AC: 1, 2)
  - [x] Créer le fichier racine `.npmrc` avec `node-linker=hoisted` (le fichier n'existe pas encore — pnpm 10 est en `isolated` par défaut)
  - [x] `pnpm install` à la racine — résolution sans erreur de hoisting
  - [x] ⚠️ **Non-régression** : relancer `pnpm lint`, `pnpm build`, `pnpm test` à la racine et confirmer que `apps/web` (Next.js 15) et `apps/api` (NestJS 11) restent verts. Documenter le résultat dans Completion Notes
  - [x] Si une régression apparaît (résolution de module aplatie), la corriger avant de poursuivre — ne pas laisser le monorepo cassé *(régression React dupliqué détectée et corrigée : web aligné 19.1.0 → 19.2.3 + réinstallation propre — détail en Completion Notes)*

- [x] **T3 — Configurer Metro pour le monorepo** (AC: 3)
  - [x] Créer/adapter `apps/mobile/metro.config.js` : `watchFolders = [workspaceRoot]`, `resolver.nodeModulesPaths = [projectRoot/node_modules, workspaceRoot/node_modules]`, `resolver.disableHierarchicalLookup = true`
  - [x] Vérifier qu'un import depuis `@ridenrest/shared` (et `@ridenrest/gpx`) se résout dans l'app sans erreur ni duplication de module (ex. un `import` simple d'une constante/type dans la route placeholder) *(prouvé par `expo export` : bundles iOS/Android/Web générés avec `LAYER_CATEGORIES` + `haversine` importés dans `index.tsx`)*

- [x] **T4 — Câbler le pipeline Turborepo** (AC: 4)
  - [x] Déclarer dans `apps/mobile/package.json` les scripts `dev` (`expo start`), `lint`, `test`, `typecheck` (et `build` = `expo export` léger ou no-op cohérent — le build natif reste sur EAS, cf. MOB-1.2/MOB-1.4)
  - [x] Étendre `turbo.json` : ajouter `.expo/**` aux `outputs` de la tâche `build` (les tâches `lint`/`test`/`dev` génériques existantes captent déjà mobile via `--filter='*'`) *(+ tâche `typecheck` ajoutée à `turbo.json` — absente jusqu'ici, requise par l'AC 4)* *(⚠️ annulé en code review : `.expo/**` retiré des outputs — cache machine, le bundle sort dans `dist/**` ; tâche `typecheck` conservée + `outputs: []` + script racine `typecheck` ajouté)*
  - [x] Vérifier `turbo run dev --filter=@ridenrest/mobile` (ou `--filter=mobile`) démarre Expo *(vérifié : Metro démarre via turbo, processus arrêté proprement)*
  - [x] **Ne pas** câbler le job CI ici : la gate CI (turbo `--filter='*'` sur PR, exclusion build natif GH Actions) est le périmètre de **MOB-1.4**

- [x] **T5 — TypeScript & alias** (AC: 6)
  - [x] `apps/mobile/tsconfig.json` : `extends: "expo/tsconfig.base"`, `compilerOptions.strict: true` (aligné `@ridenrest/typescript-config/base`), `paths: { "@/*": ["./*"] }` *(template SDK 56 = layout `src/` → `@/*` → `./src/*`, identique à `apps/web` — alignement web respecté, meilleur que la lettre de la story)*
  - [x] S'assurer que les types Expo Router générés (`.expo/types`) sont inclus et que `pnpm --filter @ridenrest/mobile typecheck` passe *(include `.expo/types/**/*.ts` présent ; typecheck vert, typed routes actives)*

- [x] **T6 — Route placeholder & navigation** (AC: 5)
  - [x] Garder/réduire le template à une route placeholder accessible (ex. `app/index.tsx`) + démontrer une navigation programmatique (`useRouter().push(...)` vers une 2ᵉ route, ou route par défaut du template) *(template réduit à 3 fichiers : `src/app/_layout.tsx` (Stack), `src/app/index.tsx` (placeholder + imports `@ridenrest/*` + bouton `router.push('/explore')`), `src/app/explore.tsx` (2ᵉ route + `router.back()`) — démo du template purgée : components/hooks/constants/global.css/scripts + 7 deps démo retirées)*
  - [x] Démarrage sans session : aucun crash, écran d'accueil affiché *(vérifié par captures d'écran sur les 2 plateformes)*

- [x] **T7 — Lancement multi-plateforme** (AC: 4, 5)
  - [x] `expo start` → lancement vérifié sur **simulateur iOS** et **émulateur Android** (Expo Go suffit : aucun module natif custom ajouté à ce stade — MapLibre / secure-store arrivent plus tard et imposeront le Dev Client) *(iOS : iPhone 17 Pro, Expo Go 56.0.3, home + navigation /explore vérifiés par captures. Android : AVD Pixel 7 / API 36, home + imports `@ridenrest/*` au runtime (4 layers POI, Paris–Lyon ≈ 391 km) + navigation /explore vérifiés par captures)*
  - [x] Consigner toute commande/étape manuelle nécessaire (Watchman, Xcode, Android SDK) dans Dev Notes/Completion Notes *(consigné en Completion Notes — outillage Android installé via Homebrew pendant la story)*

### Review Findings

- [x] [Review][Decision→Patch] Clé PostHog réelle dans `apps/api/.env.example` — `NEXT_PUBLIC_POSTHOG_KEY=phc_...` ajoutée hors périmètre MOB-1.1, absente de la File List, valeur réelle (pas un placeholder `changeme-*`) et préfixe `NEXT_PUBLIC_*` (web) dans le `.env.example` de l'API. **Résolu : fichier restauré à la baseline `9922fc2` — la ligne sera re-committée proprement via l'epic analytics si besoin.**
- [x] [Review][Decision→Patch] `.expo/**` en outputs turbo `build` est erroné — `expo export` écrit dans `dist/` (déjà couvert par `dist/**`) ; `.expo/` est un cache machine non déterministe (devices.json, cache/) → pollution du cache turbo. **Résolu : `.expo/**` retiré de `turbo.json` ; AC4, T4, Dev Notes, Completion Notes et `architecture-mobile.md` amendés (Doc Sync Rule).**
- [x] [Review][Decision→Patch] TypeScript 6.0.3 (mobile, nested) vs 5.9.3 (racine) sous `node-linker=hoisted` — skew de major non verrouillé. **Résolu : `apps/mobile` aligné `typescript ~5.9.3` ; après réinstall, plus aucune copie nested (5.9.3 hoisté unique) ; typecheck mobile vert.**
- [x] [Review][Decision→Patch] `name`/`slug`/`scheme` = `mobile` dans `app.json` — défauts du template ; le `slug` engage le projet EAS dès MOB-1.2. **Résolu : `name: "Ride'n'Rest"`, `slug: "ridenrest"` ; `scheme: "mobile"` laissé volontairement (le scheme `ridenrest://` est périmètre MOB-1.4).**
- [x] [Review][Patch] Tâche turbo `typecheck` orpheline — aucun script racine `typecheck` dans `package.json` et pas d'`outputs: []` déclaré [turbo.json:21, package.json racine]. **Résolu : script racine `"typecheck": "turbo run typecheck --filter='*'"` ajouté + `outputs: []` sur la tâche.**
- [x] [Review][Patch] Doc Sync incomplet dans `architecture-mobile.md` — alias `@/*` → racine et `.expo/**` contredits par l'impl validée ; pattern Metro et SDK 55 non annotés [_bmad-output/planning-artifacts/architecture-mobile.md]. **Résolu : 4 amendements (SDK 56 réel, `.expo/**` hors outputs, alias `@/*` → `./src/*`, Metro `disableHierarchicalLookup=false` + watchFolders racine).** *(Précision : `disableHierarchicalLookup=true` n'était prescrit que par les Dev Notes de la story, pas par la doc d'archi — une garde-fou explicite a été ajoutée à l'archi pour éviter toute réintroduction.)*

*Validation post-patches (2026-06-07) : `pnpm install` propre + `turbo run test lint build typecheck --filter='*'` → **23/23 tâches vertes** (46.9 s, 12 cached).*
- [x] [Review][Defer] Pas de `pnpm.overrides` verrouillant React à une version unique — l'alignement web/mobile 19.2.3 est fragile sous hoisted ; double instance React si divergence future [package.json racine] — deferred, durcissement préventif
- [x] [Review][Defer] `expo-env.d.ts` gitignored mais référencé par `tsconfig.json` — typecheck sur clone frais avant tout `expo start` peut différer (types routes non générés) ; pattern Expo standard, à régler avec la CI MOB-1.4 [apps/mobile/tsconfig.json:18] — deferred, pre-existing pattern Expo

## Dev Notes

### État réel du monorepo (vérifié 2026-06-02)

- **Gestionnaire** : `pnpm@10.32.1` (champ `packageManager` racine), `turbo ^2.6.1` (Turbo **2.x** → clé `tasks` dans `turbo.json`, pas `pipeline`), `typescript ^5.7.3`.
- **`pnpm-workspace.yaml`** : `packages: ['apps/*', 'packages/*']` → `apps/mobile` sera capté automatiquement. **Aucun changement requis.**
- **Convention de nommage des packages** : `@ridenrest/web` (`apps/web`), `@ridenrest/database` / `@ridenrest/gpx` / `@ridenrest/shared` (`packages/*`). → le package mobile **doit** être `@ridenrest/mobile` (le template Expo le nommera `mobile` par défaut, à renommer).
- **Dépendances internes** : protocole `workspace:*` (ex. `apps/web` importe `"@ridenrest/shared": "workspace:*"`).
- **`turbo.json` actuel** : tâches `build` (outputs `.next/**`, `dist/**`), `lint`, `test`, `dev` (persistent). ~~→ ajouter `.expo/**` aux outputs `build`~~ *(invalidé en code review : `expo export` écrit dans `dist/**`, déjà couvert ; `.expo/` = cache machine)*.
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

Claude Opus 4.8 (claude-opus-4-8) — Claude Code

### Debug Log References

- **Init template** : `--template with-router` (AC1) télécharge désormais le package npm `with-router` (HOC react-router de 2018) — l'exemple `with-router` d'expo/examples a été retiré, Expo Router étant inclus dans le template par défaut depuis SDK 50. Ré-init avec `--template default` → Expo SDK 56 / RN 0.85.3 / React 19.2.3 / New Architecture, layout `src/app/`.
- **Régression hoisting (AC2)** : `pnpm build` → `TypeError: Cannot read properties of null (reading 'useContext')` au prerender Next (pages `/404`, `/500`). Cause : React dupliqué — racine 19.2.3 (hoisté depuis mobile) vs `apps/web` 19.1.0 nested. Fix : alignement web `react`/`react-dom` 19.1.0 → 19.2.3 (RN 0.85.3 exige exactement 19.2.3 ; Next 15.5 accepte ^19). Des copies stale `@radix-ui/*/node_modules/react@19.1.0` absentes du lockfile subsistaient sur disque → réinstallation propre (suppression de tous les node_modules + `pnpm install`).
- **ESLint mobile** : le template SDK 56 ne génère plus de config ESLint. `eslint-config-expo@56` (via `eslint-plugin-react`) est incompatible ESLint 10 (`context.getFilename` supprimé) → ESLint pinné `^9` dans `apps/mobile` (copie nested 9.39.4, le reste du monorepo garde ESLint 10 racine).
- **Lancement iOS sans sudo** : `xcode-select` pointait sur les CommandLineTools → contourné via `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (Xcode 26.1, simulateurs iPhone 17 disponibles).

### Completion Notes List

- **AC1 ✅** — `apps/mobile/` initialisé avec Expo SDK 56 / Expo Router (layout `src/app/`), `.npmrc` racine créé (`node-linker=hoisted`), `pnpm install` propre. Déviation documentée : `--template default` au lieu de `with-router` (obsolète, voir Debug Log).
- **AC2 ✅ (non-régression prouvée, 2 régressions corrigées)** —
  - *Régression 1 (React dupliqué)* : build web cassé (`useContext` null au prerender) → `apps/web` aligné `react`/`react-dom` 19.1.0 → **19.2.3** (RN 0.85.3 exige exactement 19.2.3) + réinstallation propre des node_modules (copies stale hors lockfile).
  - *Régression 2 (plugin ESLint hoisté)* : `eslint-config-expo` (mobile) hoiste `eslint-plugin-react-hooks@7.1.1` à la racine → web (via `eslint-config-next` qui attend `^5`) héritait des règles v7 (48 erreurs `set-state-in-effect`) → pin explicite `eslint-plugin-react-hooks@^5.0.0` en devDependency de `apps/web` (la racine redescend à 5.2.0, mobile reste vert).
  - *Validation finale* : `turbo run test lint build typecheck --filter='*' --force` → **23/23 tâches vertes** (api 406 tests, web 1132 tests / 96 fichiers, shared 30, gpx 22, analytics 26).
- **AC3 ✅** — `metro.config.js` monorepo (watchFolders racine + nodeModulesPaths projet puis racine). ⚠️ Déviation assumée : `disableHierarchicalLookup` laissé à `false` (défaut) — le forcer à `true` (consigne story/architecture, héritée des anciens guides Expo) **casse le runtime Expo Go SDK 56** (`[runtime not ready] TypeError` au boot, confirmé par `expo doctor`). Résolution prouvée au bundle (`expo export` : iOS 1138 modules / Android 1604 / Web 862) **et au runtime** (constantes `@ridenrest/shared` + calcul `@ridenrest/gpx` affichés à l'écran).
- **AC4 ✅** — scripts `dev`/`build` (= `expo export`)/`lint`/`test` (no-op documenté)/`typecheck` déclarés ; `turbo.json` : tâche `typecheck` ajoutée (`outputs: []`) ; `turbo run dev --filter=@ridenrest/mobile` démarre Expo ; app affichée sur simulateur iOS et émulateur Android (captures). *(Code review 2026-06-07 : `.expo/**` retiré des outputs `build` — le bundle `expo export` sort dans `dist/**` déjà couvert, `.expo/` est un cache machine ; script racine `typecheck` ajouté à `package.json` pour que la tâche soit exécutée par les pipelines.)*
- **AC5 ✅** — navigation Expo Router opérationnelle : route placeholder `/` + navigation programmatique `useRouter().push('/explore')` vérifiée sur iOS (back stack natif) et Android (tap réel via adb).
- **AC6 ✅** — package `@ridenrest/mobile`, deps internes `workspace:*` (`@ridenrest/shared`, `@ridenrest/gpx`), tsconfig strict étendant `expo/tsconfig.base`, alias `@/*` → `./src/*` (identique à `apps/web`).
- **Étapes manuelles machine (hors repo, à reproduire sur un autre poste de dev)** :
  - iOS : Xcode 26.1 requis ; si `xcode-select` pointe sur les CommandLineTools, soit `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, soit préfixer par `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` (méthode utilisée ici, sans sudo).
  - Android : `brew install openjdk && brew install --cask android-commandlinetools`, puis `JAVA_HOME=/opt/homebrew/opt/openjdk ANDROID_HOME=/opt/homebrew/share/android-commandlinetools`, `yes | sdkmanager --licenses`, `sdkmanager "platform-tools" "emulator" "platforms;android-36" "system-images;android-36;google_apis;arm64-v8a"`, `avdmanager create avd -n ridenrest_pixel -k "system-images;android-36;google_apis;arm64-v8a" -d pixel_7`.
  - Watchman : non installé, non bloquant (Metro a fonctionné sans) — `brew install watchman` recommandé pour le confort en dev prolongé.
- **Reste à charge equipe** : rien pour cette story. Le commit est à faire par Guillaume (convention projet).

### File List

**Créés :**
- `.npmrc`
- `apps/mobile/package.json`
- `apps/mobile/app.json`
- `apps/mobile/tsconfig.json`
- `apps/mobile/metro.config.js`
- `apps/mobile/eslint.config.js`
- `apps/mobile/src/app/_layout.tsx`
- `apps/mobile/src/app/index.tsx`
- `apps/mobile/src/app/explore.tsx`
- `apps/mobile/assets/**` (icônes/splash du template)
- `apps/mobile/.gitignore`, `apps/mobile/AGENTS.md`, `apps/mobile/CLAUDE.md`, `apps/mobile/LICENSE`, `apps/mobile/README.md`, `apps/mobile/.claude/settings.json` (générés par le template)

**Modifiés :**
- `turbo.json` (tâche `typecheck` ajoutée avec `outputs: []` ; `.expo/**` ajouté puis retiré des outputs `build` en code review)
- `package.json` racine (script `typecheck` ajouté — code review)
- `apps/web/package.json` (react/react-dom 19.1.0 → 19.2.3 ; + devDep `eslint-plugin-react-hooks@^5.0.0` — corrections de régressions hoisting, autorisées par T2)
- `pnpm-lock.yaml` (régénéré)
- `_bmad-output/planning-artifacts/architecture-mobile.md` (doc sync code review : SDK 56 réel, alias `@/*` → `./src/*`, pattern Metro `disableHierarchicalLookup=false`, `.expo/**` hors outputs turbo)

**Supprimés (réduction du template, dans `apps/mobile/`) :**
- `src/components/`, `src/hooks/`, `src/constants/`, `src/global.css`, `scripts/` (démo du template default)

## Change Log

- 2026-06-07 — MOB-1.1 implémentée : workspace `apps/mobile` (Expo SDK 56 / Expo Router), linker pnpm `hoisted` + non-régression web/api prouvée (2 régressions hoisting corrigées : React dupliqué, eslint-plugin-react-hooks v7), Metro monorepo, pipeline turbo (dev/build/lint/test/typecheck), route placeholder + navigation programmatique, lancement vérifié simulateur iOS (iPhone 17 Pro) + émulateur Android (Pixel 7/API 36). Statut → review.
- 2026-06-07 — Code review (Blind Hunter / Edge Case Hunter / Acceptance Auditor) : 6 patches appliqués — retrait `NEXT_PUBLIC_POSTHOG_KEY` de `apps/api/.env.example` (hors périmètre), retrait `.expo/**` des outputs turbo `build` (cache machine, AC4 amendé), alignement `typescript ~5.9.3` mobile (skew TS6/TS5 sous hoisted), `app.json` renommé (`Ride'n'Rest`/`ridenrest`), script racine `typecheck` + `outputs: []`, doc sync `architecture-mobile.md`. 2 defers (pnpm.overrides React, expo-env.d.ts clone frais) consignés dans deferred-work.md. Re-validation : 23/23 tâches vertes. Statut → done.
