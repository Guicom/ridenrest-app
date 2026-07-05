# MOB-1.4 — Notes de session & guide reviewer (2026-06-08)

> **But de ce document** : capturer le contexte complet de la session d'implémentation de MOB-1.4,
> et surtout **prévenir les rollbacks involontaires** par une revue de code ultérieure. Plusieurs
> changements sont **intentionnels** et corrects même s'ils peuvent surprendre hors contexte.
> **À lire avant de proposer un revert.**
>
> Story associée : `MOB-1-4-cross-config-i18n-tests-ci-deeplink-scheme.md` (statut : `review`).
> Baseline : `ac20da8`.

---

## 1. Résumé exécutif

MOB-1.4 livre les 4 piliers transverses de l'Epic MOB-1 :
**i18n** · **tests (Jest/RNTL + Maestro)** · **gate CI** · **deep link `ridenrest://` + migration `app.config.ts`**.

Tout a été **validé**, y compris **au runtime** sur simulateur iOS (deep link → app → routing → params).
Gate CI complète : **21/21 tâches vertes** (web 1154 tests + mobile 7 tests). Lint/typecheck/jest mobile verts.

---

## 2. ⚠️ Décisions intentionnelles — NE PAS ROLLBACK

### 2.1 `apps/mobile/src/components/ui/skeleton.tsx` modifié (fichier hérité de MOB-1.3)

- **Quoi** : `useRef(new Animated.Value(1)).current` → `useState(() => new Animated.Value(1))`.
- **Pourquoi** : ce fichier violait la règle ESLint `react-hooks/refs` (« Cannot access refs during render »),
  ce qui rendait **la tâche `lint` mobile ROUGE** (5 erreurs). Or T5 exige d'activer une **gate CI lint/test
  verte ET bloquante**. Une gate rouge à l'arrivée (à cause d'un fichier MOB-1.3) aurait cassé tout merge mobile.
- **Pourquoi c'est correct** : le lazy initializer `useState` est le **pattern React recommandé** pour une
  instance stable créée une seule fois ; **comportement d'animation strictement inchangé**.
- **➡️ Ne pas revenir** au `useRef(...).current` : ça re-casse la gate lint.

### 2.2 `.github/workflows/ci.yml` **NON modifié** — c'est volontaire, pas un oubli

- T5 dit « modifier `ci.yml` **uniquement si nécessaire** » pour exclure le build natif. **Ce n'était pas nécessaire.**
- Le workflow existant fait déjà `pnpm turbo run lint|build|test --filter='*'`. Le `--filter='*'` **capte
  automatiquement** tout workspace qui déclare la tâche → dès que `apps/mobile` expose `lint`/`test`/`typecheck`,
  ils tournent en CI **sans toucher au YAML**.
- **Aucun build natif en Actions** : la tâche `build` mobile = `expo export` (bundle JS, vérifié via
  `turbo run build --filter='*' --dry=json` → `@ridenrest/mobile#build = "expo export"`). Pas de prebuild,
  pas de compilation iOS/Android. Le natif reste **EAS only** (FR-MOB-003).
- **➡️ Ne pas ajouter** d'étape mobile dédiée ni de build natif dans `ci.yml` : ce serait une régression.

### 2.3 `apps/mobile/app.json` **supprimé** + `app.config.ts` ajouté

- Migration **volontaire** demandée par T1 (convention archi : **jamais** `app.json` à terme).
- `projectId` EAS (`4548dbd0-…`) + config `updates` (OTA) de MOB-1.2 ont été **préservés** dans `app.config.ts`.
- **➡️ Ne pas restaurer** `app.json` (les deux en même temps = conflit de config Expo).

### 2.4 Maestro **non ajouté** au job CI des PR — volontaire

- `.maestro/launch.yaml` existe mais tourne **en pré-release uniquement** (coût/lenteur émulateur, flakiness E2E).
  C'est explicitement exigé par AC3 + garde-fous. **Ne pas** l'ajouter au workflow PR.
- Maestro est un **CLI système** (installé via `curl`), volontairement **hors `package.json`**.

### 2.5 Assertion Maestro sur le titre de marque (et non une chaîne i18n)

- `.maestro/launch.yaml` asserte `Ride'n'Rest` (codé en dur dans `index.tsx`), **pas** une chaîne traduite.
- **Pourquoi** : l'i18n résout selon la **locale du device**. Un simulateur neuf est souvent en `en` → une
  assertion sur une chaîne FR serait **flaky**. Le titre de marque est locale-indépendant. **Choix délibéré.**

### 2.6 i18n : locale par défaut **ET** fallback = `fr` (jamais `en`)

- Exigé par FR-MOB-021 + garde-fous. `FALLBACK_LOCALE = 'fr'`. **Ne pas** basculer le fallback sur `en`.

### 2.7 `jest.config.js` — `transformIgnorePatterns` étendu

- La liste blanche inclut `nativewind`, `react-native-css-interop`, `@ridenrest/*` (packages workspace exportés
  en **source TS**), `@expo-google-fonts/*`. **Nécessaire** pour que Jest transpile ces modules non précompilés.
  Réduire cette liste **casse** la suite de tests.

### 2.8 Mocks natifs placeholders dans `__mocks__/`

- `expo-location`, `expo-secure-store`, `@maplibre/maplibre-react-native` sont des **placeholders volontaires**
  pour les epics **futurs** (MOB-2/4/5). Ils ne sont pas « morts » : ne pas les supprimer comme inutilisés.
- `expo-localization` mock → device `fr` **déterministe** en test (sinon l'init i18next varie selon l'env CI).

---

## 3. Fichiers générés / non suivis (ne pas committer, ne pas s'en inquiéter)

- **`apps/mobile/ios/`** : généré par `expo prebuild` (déclenché par `expo run:ios`). **Gitignored**
  (`.gitignore:42 /ios`) — workflow Expo « managed »/CNG, régénéré à la volée. **Ne pas committer.**
- **`apps/mobile/.expo/`** : cache/logs locaux. Gitignored.
- **`.maestro/`**, `app.config.ts`, `jest.config.js`, `jest.setup.ts`, `__mocks__/`, `src/lib/i18n/`,
  `src/app/oauth-callback.tsx`, `src/components/ui/button.test.tsx` : **artefacts livrables** de la story (à committer).

---

## 4. Contexte environnement — la « saga Xcode » (pour comprendre, rien à corriger côté code)

Tentative de **vérification runtime locale** du deep link → série de blocages **purement environnementaux**
(aucun lié au code MOB-1.4). Résolus et **documentés** dans `apps/mobile/AGENTS.md` + `README.md` :

1. Aucun simulateur booté → booté manuellement.
2. CocoaPods absent → installé (`brew install cocoapods`).
3. Runtime simulateur de **build** manquant (`23B80` présent mais pas reconnu) → `xcodebuild -downloadPlatform iOS`.
4. **Cause racine finale** : **Expo SDK 56 exige Xcode 26.4+** ; le poste était en **26.1** → le code Swift
   `weak let` d'`expo-modules-jsi` ne compilait pas (`xcodebuild error 65`). **MAJ Xcode 26.1 → 26.5** +
   runtime simulateur iOS 26.5 → **BUILD SUCCEEDED** (749 fichiers).

**Point clé** : « ça marchait avant » parce que les builds passaient par **EAS Build (cloud)** (toolchain à jour),
jamais en local. `expo start` ne compile pas (sert le JS). Le besoin de Xcode local 26.4+ n'apparaît qu'au
**premier `expo run:ios`**. → Voir `apps/mobile/AGENTS.md` (section toolchain) pour le détail.

---

## 5. Validation effectuée (preuves)

| Vérification | Commande | Résultat |
|---|---|---|
| Tests mobile | `pnpm --filter @ridenrest/mobile test` | **7/7** (2 suites) ✅ |
| Typecheck mobile | `tsc --noEmit` | 0 erreur ✅ |
| Lint mobile | `expo lint` | exit 0 ✅ (rouge avant fix §2.1 → prouve la gate non-no-op) |
| Gate CI complète | `turbo run lint test --filter='*'` | **21/21** tâches (web 1154 + mobile 7) ✅ |
| Build mobile = pas de natif | `turbo run build --filter='*' --dry=json` | `expo export` ✅ |
| Scheme iOS généré | `plutil … Info.plist` (app installée) | `CFBundleURLSchemes → ridenrest` ✅ |
| **Deep link runtime** | `simctl openurl … ridenrest://oauth-callback?provider=test&code=abc123` | app ouverte → route `oauth-callback` → params `{provider:test, code:abc123}` affichés + i18n FR ✅ |

---

## 6. Hors périmètre (déféré — ne pas attendre dans cette story)

- **Flow OAuth réel** (échange de code, session) → **MOB-2.3/2.4**. `oauth-callback.tsx` est un **placeholder**
  qui affiche les params reçus ; c'est intentionnel.
- **Externalisation complète des chaînes** → **MOB-6.3**. Ici = scaffold i18n + chaînes des écrans placeholder.
- **`eas submit` / TestFlight** → **MOB-6.5**.

---

## 7. Fichiers touchés cette session (récap)

**Ajoutés** : `app.config.ts`, `src/app/oauth-callback.tsx`, `src/lib/i18n/{i18n.config.ts,index.ts,i18n.config.test.ts,locales/{fr,en}.json}`,
`jest.config.js`, `jest.setup.ts`, `__mocks__/{expo-localization,expo-location,expo-secure-store,@maplibre/maplibre-react-native}.js`,
`src/components/ui/button.test.tsx`, `.maestro/launch.yaml`, ce fichier de notes.

**Modifiés** : `package.json` (deps + scripts test/typecheck), `src/app/_layout.tsx` (provider i18n),
`src/app/index.tsx` + `explore.tsx` (chaînes `t()`), `src/components/ui/skeleton.tsx` (fix lint §2.1),
`README.md` + `AGENTS.md` (doc i18n/tests/Maestro/gate CI/deep link + prérequis Xcode 26.4).

**Supprimé** : `app.json` (→ `app.config.ts`).
