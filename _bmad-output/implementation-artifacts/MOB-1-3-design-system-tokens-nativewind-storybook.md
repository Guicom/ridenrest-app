---
baseline_commit: 6b6c9ed46bef164406a3a66bc47407dd118e3103
---

# Story MOB-1.3 : Design system mobile (tokens, NativeWind, Storybook)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **développeur frontend**,
I want **un design system mobile basé sur des design tokens partagés, NativeWind et Storybook RN**,
So that **les écrans natifs sont construits avec des composants cohérents et conformes à l'identité de l'app (reprise du design web déjà en place)**.

> 3ᵉ story de l'Epic MOB-1. Dépend de **MOB-1.1** (workspace mobile) et de **MOB-1.2b** (palette dark « Charbon » back-portée dans la source web canonique). Pose le socle visuel consommé par tous les epics UI (MOB-2→MOB-5). **Principe directeur (UX-DR-MOB-001)** : on **reprend le design web existant**. Les tokens mobiles sont une **extraction / miroir** des valeurs web canoniques — **jamais** une redéfinition ni une approximation (zéro dérive visuelle vs web).

## Acceptance Criteria

1. **Given** le besoin d'un design cohérent **reprenant le design web déjà en place**
   **When** je crée `packages/design-tokens/`
   **Then** les tokens (couleurs brand vert/magenta, espacements, échelle `--radius-*`, typographie **Montserrat**) sont exposés et consommables par l'app mobile
   **And** ces tokens sont une **extraction / miroir des valeurs web canoniques** — variables `@theme`/`:root` de `apps/web/src/app/globals.css` (vocabulaire shadcn : `primary`/`secondary`/`card`/`popover`/`muted`/`accent`/`destructive`/`border`/`ring`/`chart-1→5`) — **pas des valeurs redéfinies/approximées**
   **And** la source de vérité couleurs POI reste `packages/shared/src/constants/poi-colors.ts` (jamais hardcodé)

2. **Given** l'app mobile
   **When** je configure NativeWind (v4)
   **Then** les composants peuvent être stylés via classes utilitaires alimentées par les tokens
   **And** le thème dark/light bascule via préférence utilisateur + `useColorScheme()` — palette dark « Charbon » mirorée depuis le web (voir note ✅ Dark Mode ci-dessous)

3. **Given** le design system
   **When** je mets en place Storybook RN (web, `@storybook/react-native-web` v8)
   **Then** au moins les composants primitifs **Button** (taille `lg` ≥ 44×44 px — HIG iOS / WCAG), **Card** et **Skeleton** ont une story
   **And** la tâche turbo `storybook` (alias `storybook:mobile`) est déclarée et lançable

## Tasks / Subtasks

- [x] **T1 — Créer `packages/design-tokens/` (single source of truth partagée)** (AC: 1)
  - [x] Nouveau workspace `packages/design-tokens/` nommé `@ridenrest/design-tokens`, `private: true`, `workspace:*`
  - [x] **Extraire** (copier fidèlement, pas réinventer) les valeurs de `apps/web/src/app/globals.css` — `:root` (light) **et `.dark`** (palette « Charbon », back-portée par MOB-1.2b) — dans un module TS typé — couleurs brand, surface, typo, border, tokens shadcn, density, chart-1→5, `--radius: 0.625rem` + échelle dérivée (`sm ×0.6`, `md ×0.8`, `lg ×1`, `xl ×1.4`, `2xl ×1.8`…), police **Montserrat** → `src/palette.json` (source unique brute) + `src/tokens.ts` (typé)
  - [x] Exporter sous deux formes : (a) **objet JS/TS** (`tokens.ts`) pour les consommateurs non-NativeWind (charts `react-native-svg`, styles MapLibre, `pin-factory`) ; (b) **preset NativeWind/Tailwind** (theme extension) consommable par `apps/mobile` (`nativewind-preset.js`, CommonJS)
  - [x] **Refactor non-régressif `apps/web`** : option **miroir vérifié** retenue — `globals.css` reste la source canonique web, le package l'extrait et un **test de parité** (`tokens.test.ts`, 7/7 ✅) garantit zéro dérive. **Zéro changement de rendu web** (web non touché)
  - [x] Couleurs POI : **ré-exporter** `@ridenrest/shared` `poi-colors.ts` depuis `tokens.ts` — aucune valeur dupliquée (vérifié par le test)

- [x] **T2 — Configurer NativeWind v4 dans `apps/mobile`** (AC: 2)
  - [x] `expo install nativewind@4.2.5` + `tailwindcss@3.4.19` + `expo-font`/`@expo-google-fonts/montserrat`/`@react-native-async-storage/async-storage`/`clsx`/`tailwind-merge` (versions SDK 56) ; `babel.config.js` (`babel-preset-expo` `jsxImportSource: nativewind` + `nativewind/babel`) ; `metro.config.js` `withNativeWind` enveloppé **après** la config monorepo (watchFolders/nodeModulesPaths préservés)
  - [x] `tailwind.config.js` mobile : `presets: [require('nativewind/preset'), require('@ridenrest/design-tokens/nativewind-preset')]` (theme 100% issu des tokens partagés, zéro redéfinition locale)
  - [x] `src/global.css` (directives Tailwind) + import dans `src/app/_layout.tsx`
  - [x] Helper `cn()` (`clsx` + `tailwind-merge`) dans `src/lib/cn.ts` (alignement web)
  - [x] Hook `src/hooks/use-color-scheme.ts` : préférence user (AsyncStorage) + fallback système (`useColorScheme` NativeWind), expose `colorScheme`/`preference`/`setPreference`/`toggle`/`hydrated`
  - [x] Police Montserrat chargée via `@expo-google-fonts/montserrat` + `expo-font` dans le root layout (gating splash), familles alignées sur le preset (`Montserrat_400/500/600/700`)

- [x] **T3 — Composants primitifs + Storybook** (AC: 3)
  - [x] `src/components/ui/button.tsx` (variants via `class-variance-authority`, taille `lg` **≥ 44×44 px** : `h-11 min-w-[44px]`), `card.tsx`, `skeleton.tsx` — stylés NativeWind + `cn()`
  - [x] `@storybook/react-native-web-vite` v8 (package v8 « react-native-web ») : `.storybook/main.ts` (pattern `src/**/*.stories.tsx`, `framework.options.pluginReactOptions.jsxImportSource: 'nativewind'`), `.storybook/preview.tsx` (decorator thème light/dark via scope `.dark`, preset NativeWind via `global.css`), `.storybook/preview-head.html` (Montserrat web), `postcss.config.js` (Tailwind v3 cible web)
  - [x] Stories co-localisées : `button.stories.tsx`, `card.stories.tsx`, `skeleton.stories.tsx` — **build Storybook OK** (CSS de sortie contient les tokens light `#2D6A4A` + dark `#74C69D` scopés `.dark`)
  - [x] Script `storybook` (+`build-storybook`) dans `apps/mobile/package.json` + tâches turbo `storybook`/`build-storybook` + alias racine `storybook:mobile` (`turbo run storybook --filter=@ridenrest/mobile`)

## Dev Notes

### ✅ DARK MODE — RÉSOLU (2026-06-07) : palette « Charbon » livrée, back-port web via MOB-1.2b

Le point bloquant est levé. Guillaume a fourni le handoff Claude Design **`docs/design/dark-mode-charbon/`** :
- `charbon-dark-tokens.css` — bloc `.dark {}` **high-fidelity** réutilisant les **mêmes noms de tokens** que `globals.css` (parité vérifiée : tous les noms existent déjà ; seuls les `--shadow-*` sont nouveaux)
- `README.md` — règles composants dark (pastilles de statut en teinte `color-mix`, wordmark Strava blanc, hover/sélection, vert marque ≠ vert densité)
- `reference/` — prototype visuel (panneau B = Charbon) + assets

**Option retenue : (B), sécurisée par le handoff** — la palette dark est une valeur design validée, pas une invention. La **story MOB-1.2b** (`MOB-1-2b-dark-mode-web-charbon-backport.md`, insérée dans l'epic, **prérequis de cette story**) back-porte le bloc `.dark` dans `apps/web/src/app/globals.css` + toggle `next-themes`. La source canonique web contient donc **les deux palettes avant extraction** : le principe miroir (`UX-DR-MOB-001`) reste intact.

Conséquences pour cette story :
- **Dépendance ajoutée : MOB-1.2b** (palette dark présente dans `globals.css`).
- T1 extrait **light + dark** depuis la source web (`:root` + `.dark`).
- T2/T3 : `use-color-scheme.ts` et le ThemeProvider Storybook exposent les **deux palettes réelles** (équivalent natif de `next-themes` : préférence persistée AsyncStorage + fallback système, défaut = système).
- Garde-fou inchangé : ne reprendre **que** les valeurs de la source web (qui inclut désormais Charbon) — toujours zéro invention.

### Valeurs canoniques à extraire (vérifiées dans `globals.css`)

- **Brand** : `--primary #2D6A4A` (sage green), `--primary-hover #245740`, `--primary-light #EBF5EE`, `--primary-foreground #FFFFFF`. ⚠️ Le « magenta » mentionné dans les epics correspond à l'accent **POI Access** (`ACCESS_ROUTE_COLOR #e6007e`), pas à un token `globals.css` — il vit côté feature/`poi-colors`, pas dans le DS de base. Ne pas l'ajouter aux tokens brand sauf si présent dans la source.
- **Surface/texte** : `--background #FFFFFF`, `--background-page #F5F7F5`, `--surface #F8FAF9`, `--text-primary #1A2D22`, `--text-secondary #4D6E5A`, `--text-muted #8EA899`.
- **shadcn** : `--card #F8FAF9`, `--popover #FFFFFF`, `--muted #F5F7F5`, `--secondary #EFF5F1`, `--accent #EBF5EE`/`--accent-foreground #2D6A4A`, `--destructive #dc2626`, `--border`/`--input #D4E0DA`, `--ring #2D6A4A`.
- **Density (trace carte)** : `--density-high #16a34a`, `--density-medium #d97706`, `--density-low #dc2626`.
- **Chart** : `chart-1 #2D6A4A`, `chart-2 #16a34a`, `chart-3 #d97706`, `chart-4 #dc2626`, `chart-5 #4D6E5A`.
- **Radius** : `--radius: 0.625rem` (= 10px) + échelle `sm/md/lg/xl/2xl/3xl/4xl` (multiplicateurs 0.6 / 0.8 / 1 / 1.4 / 1.8 / 2.2 / 2.6).
- **Typo** : Montserrat (`--font-montserrat` → `--font-sans`). Charger la font côté natif via `expo-font` / `@expo-google-fonts/montserrat`.

### Patterns NativeWind à respecter (source : `architecture-mobile.md` §Styling, l.622-630)

- Styling via `className="..."` sur `<View>`/`<Text>` — **jamais** de style inline RN si NativeWind s'applique.
- **Exception couleurs POI dynamiques** : style **inline obligatoire** (héritage web — Tailwind JIT ne génère pas `bg-[${color}]` au runtime). Couleurs lues depuis `poi-colors.ts`.
- Combinaisons conditionnelles via `cn()`.
- Theming via variables + `useColorScheme()`.
- ⚠️ **Gotcha NativeWind v4 (`jsxImportSource`)** : éviter `<Pressable style={({ pressed }) => [...]}>` (style **sous forme de fonction**) — le wrapping NativeWind ne l'applique pas de façon fiable. Préférer `className` (+ `active:` pour l'état pressé) ou le primitif `<Button>`. Constaté sur `index.tsx` lors de MOB-1.3, corrigé.

### Conventions Storybook (source : `architecture-mobile.md` §Storybook stories + file detail)

- `@storybook/react-native-web` v8, stories co-localisées `*.stories.tsx`.
- Composants `map/` natifs lourds = **pas** de stories. Cette story ne couvre **que** les primitifs (`ui/`).
- Cible tactile : `Button` `lg` **≥ 44×44 px** (NFR-LP-003 — standard natif HIG iOS, supersède le 48px web).

### Garde-fous

- **NativeWind v4** (stable) — **ne pas** passer à v5 (différée jusqu'à stabilité, cf. décisions différées archi l.312).
- **tokens = miroir, pas redéfinition** : si une valeur n'est pas dans `globals.css`/`poi-colors.ts`, elle n'a pas sa place dans le DS de base — la remonter comme question, pas l'inventer.
- **Icons** : `lucide-react-native` (équivalent mobile de `lucide-react` web) — cohérence visuelle.
- Ne pas scaffolder les composants `shared/`, `map/`, `live/` (epics suivants) ; cette story = `packages/design-tokens/` + NativeWind + 3 primitifs storybook-ifiés.

### Testing standards

- Le framework Jest/RNTL est installé en **MOB-1.4** ; ici la validation passe par **Storybook** (rendu isolé des primitifs) + lancement de l'app stylée. Un test de **parité tokens web↔mobile** (snapshot des valeurs) est un plus fortement recommandé pour garantir « zéro dérive ».

### Project Structure Notes

- Nouveau : `packages/design-tokens/`. Modifié : `apps/mobile/` (babel/metro/tailwind/global.css, `components/ui/*`, `.storybook/`, `lib/cn.ts`, `hooks/use-color-scheme.ts`), `turbo.json` (tâche `storybook`). Couplage `apps/web` : **uniquement** si on branche Tailwind web sur le package (sinon parité par miroir vérifié) — dans tous les cas, **zéro changement de rendu web**.
- Aucune migration DB / backend.

### Frontière de story

- **Inclus** : `packages/design-tokens/`, NativeWind v4, infra theming, 3 primitifs + Storybook, tâche turbo `storybook`.
- **Exclu** : back-port web de la palette dark « Charbon » et toggle `next-themes` → **MOB-1.2b** (prérequis), i18n/tests/CI/scheme → **MOB-1.4**, EAS → **MOB-1.2**, composants métier → epics MOB-2→5.

### References

- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-1.3] — AC d'origine (l.383-405)
- [Source: _bmad-output/planning-artifacts/epics-mobile.md#UX-DR-MOB-001] — reprendre le design web, tokens = miroir (l.268)
- [Source: _bmad-output/planning-artifacts/epics-mobile.md#NFR-LP-003] — cible tactile ≥ 44×44 px (l.183)
- [Source: apps/web/src/app/globals.css] — valeurs canoniques `:root` (l.74-151), `@theme` shadcn (l.7-72) — bloc `.dark` « Charbon » ajouté par MOB-1.2b
- [Source: docs/design/dark-mode-charbon/] — handoff Claude Design dark mode (livrable `charbon-dark-tokens.css` + README règles composants)
- [Source: _bmad-output/implementation-artifacts/MOB-1-2b-dark-mode-web-charbon-backport.md] — story prérequis (back-port web)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#UI / Styling] — NativeWind v4, design-tokens, Storybook v8, lucide-react-native (l.317-330)
- [Source: _bmad-output/planning-artifacts/architecture-mobile.md#Styling — NativeWind] — règles className, exception couleurs POI inline (l.622-630)
- [Source: packages/shared/src/constants/poi-colors.ts] — source de vérité couleurs POI

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- **Test de parité (RED→GREEN)** : 1er run échoue sur `dark --card` (`#1b2025` attendu mais `#f8faf9` reçu) + shadows absents. Cause = bug de parsing : un commentaire du bloc `.dark` contient `` `.shadow-sm{…}` `` dont le `}` fermait prématurément la capture `[^}]*`. Fix = strip des commentaires CSS avant extraction → 7/7 ✅.
- **NativeWind preset** : `require('tailwindcss/plugin')` aurait résolu vers la Tailwind v4 hoistée du web → remplacé par la forme « fonction » du plugin (compatible v3/v4), sans `require`.
- **Storybook web** : build OK ; CSS de sortie vérifié contenant `--color-primary: #2D6A4A` (`:root`) ET `#74C69D` (`.dark`) + `var(--color-primary)` dans les utilitaires → pipeline NativeWind→Tailwind→tokens fonctionnel (le piège connu « styles non appliqués » est évité grâce à `pluginReactOptions.jsxImportSource` + `postcss.config.js`).
- **Police Storybook web** : 1ère version (alias CSS via classe) inefficace — NativeWind applique `fontFamily` EN INLINE (`Montserrat_600SemiBold`), qui prime sur une règle de feuille de style. Fix = `@font-face` portant exactement ces noms natifs, sourcées du CDN fontsource (`preview-head.html`). Montserrat rendue correctement après restart.
- **Régression native (simulateur iOS)** : au boot de l'app, les boutons démo « Naviguer vers /explore » (`index.tsx`) et « Retour » (`explore.tsx`, MOB-1.1) s'affichaient **sans leur fond vert** (texte blanc quasi invisible). Cause : ces boutons utilisaient un `<Pressable style={({pressed}) => [...]}>` (style **sous forme de fonction**), que le wrapping NativeWind (`jsxImportSource: 'nativewind'`) n'appliquait plus de façon fiable (les `<View>` à style statique, eux, restaient OK). Fix = migration des **deux écrans** vers NativeWind `className` + le primitif partagé `<Button>` → régression levée ET validation native du design system (tokens `bg-background-page`/`text-text-primary`/`bg-primary-light` + `<Button size="lg">`). Confirmé visuellement sur simulateur iOS (capture).

### Completion Notes List

- **AC1 ✅** : `packages/design-tokens/` (`@ridenrest/design-tokens`) créé. Source unique brute = `src/palette.json`, consommée par (a) `tokens.ts` (objet TS typé, non-NativeWind) et (b) `nativewind-preset.js` (CommonJS, requérable par Tailwind) → zéro dérive entre les deux formes. Tokens extraits fidèlement de `globals.css` (`:root` + `.dark` Charbon) : brand, surface, typo, border, shadcn (`card`/`popover`/`muted`/`secondary`/`accent`/`destructive`/`border`/`ring`), density, `chart-1→5`, radius (`0.625rem` + échelle dérivée), shadows Charbon, Montserrat. POI = **ré-export** de `@ridenrest/shared` (jamais dupliqué). **Couplage web : option miroir vérifié** — `globals.css` reste canonique, parité garantie par `tokens.test.ts` (7/7), **zéro changement de rendu web** (`git status apps/web` vide).
- **AC2 ✅** : NativeWind v4 (4.2.5) + Tailwind v3.4.19. `babel.config.js` (`babel-preset-expo` `jsxImportSource: nativewind` + `nativewind/babel`), `metro.config.js` `withNativeWind` enveloppé après la config monorepo MOB-1.1 (watchFolders/nodeModulesPaths préservés). `tailwind.config.js` ne tire son thème QUE des presets partagés. `src/global.css` importé dans le root layout. `lib/cn.ts` (clsx+tailwind-merge, aligné web). `hooks/use-color-scheme.ts` : préférence AsyncStorage + fallback système + toggle (équivalent natif `next-themes`). Montserrat 400/500/600/700 chargée via `@expo-google-fonts/montserrat` (gating splash).
- **AC3 ✅** : primitifs `button.tsx` (cva, `lg` = `h-11 min-w-[44px]` ≥ 44×44 px / NFR-LP-003), `card.tsx`, `skeleton.tsx`. Storybook RN web v8 (`@storybook/react-native-web-vite` — package v8 « react-native-web ») : `.storybook/main.ts`/`preview.tsx` (decorator thème light/dark via scope `.dark`), 3 stories co-localisées. Script `storybook` + tâches turbo `storybook`/`build-storybook` + alias racine `storybook:mobile`. **Build Storybook vérifié.**
- **Vérifs** : parité 7/7 ✅ · typecheck mobile + design-tokens ✅ · lint mobile (`expo lint`) + design-tokens ✅ · **régression monorepo 23/23 tâches** (web 1154 tests) ✅ · `apps/web` intact ✅.
- **Garde-fous respectés** : NativeWind v4 (pas v5) ; aucun token inventé (tout vérifié vs source web/poi-colors) ; magenta = accent POI Access (hors DS de base, non ajouté) ; pas de scaffolding `shared/`/`map/`/`live/`.
- **Note testing** : framework Jest/RNTL non installé ici (→ MOB-1.4) ; validation primitifs via Storybook (build OK) ; test de parité tokens fourni (recommandé par la story).

### File List

**Nouveaux — `packages/design-tokens/`**
- `packages/design-tokens/package.json`
- `packages/design-tokens/tsconfig.json`
- `packages/design-tokens/vitest.config.ts`
- `packages/design-tokens/eslint.config.mjs`
- `packages/design-tokens/nativewind-preset.js`
- `packages/design-tokens/src/palette.json`
- `packages/design-tokens/src/tokens.ts`
- `packages/design-tokens/src/index.ts`
- `packages/design-tokens/src/tokens.test.ts`

**Nouveaux — `apps/mobile/`**
- `apps/mobile/babel.config.js`
- `apps/mobile/tailwind.config.js`
- `apps/mobile/postcss.config.js`
- `apps/mobile/nativewind-env.d.ts`
- `apps/mobile/src/global.css`
- `apps/mobile/src/lib/cn.ts`
- `apps/mobile/src/hooks/use-color-scheme.ts`
- `apps/mobile/src/components/ui/button.tsx`
- `apps/mobile/src/components/ui/card.tsx`
- `apps/mobile/src/components/ui/skeleton.tsx`
- `apps/mobile/src/components/ui/button.stories.tsx`
- `apps/mobile/src/components/ui/card.stories.tsx`
- `apps/mobile/src/components/ui/skeleton.stories.tsx`
- `apps/mobile/.storybook/main.ts`
- `apps/mobile/.storybook/preview.tsx`
- `apps/mobile/.storybook/preview-head.html`

**Modifiés**
- `apps/mobile/package.json` (deps NativeWind/Storybook + scripts `storybook`/`build-storybook`)
- `apps/mobile/metro.config.js` (`withNativeWind`)
- `apps/mobile/tsconfig.json` (include `nativewind-env.d.ts` — auto NativeWind)
- `apps/mobile/app.json` (plugin `expo-font` — auto `expo install`)
- `apps/mobile/.gitignore` (`storybook-static/`)
- `apps/mobile/src/app/_layout.tsx` (import `global.css` + chargement Montserrat)
- `apps/mobile/src/app/index.tsx` (écran démo migré NativeWind + primitif `<Button>` — fix régression bouton + dogfooding DS)
- `apps/mobile/src/app/explore.tsx` (idem : migré NativeWind + `<Button variant="outline">` — fix régression bouton « Retour »)
- `turbo.json` (tâches `storybook` + `build-storybook`)
- `package.json` (alias racine `storybook:mobile`)
- `pnpm-lock.yaml`

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-07 | 1.0 | Implémentation MOB-1.3 : `packages/design-tokens/` (miroir vérifié web↔mobile, parité 7/7), NativeWind v4 dans `apps/mobile`, 3 primitifs + Storybook RN web v8 (build OK). Régression monorepo 23/23, web intact. Status → review. | Amelia (dev-story) |
| 2026-06-07 | 1.1 | Revue manuelle (Storybook + simulateur iOS) : fix police Storybook web (`@font-face` fontsource dans `preview-head.html`) ; fix régression bouton natif — migration `index.tsx` **et `explore.tsx`** vers NativeWind `className` + primitif `<Button>` (gotcha `Pressable` style-fonction documenté). | Amelia (dev-story) |
| 2026-06-07 | 1.2 | **Code review** (3 couches : Blind/Edge/Auditor) — AC1/2/3 OK, mirror vérifié, 0 Critical/High. 9 patches appliqués : (décisions) Skeleton animé via `Animated` RN + refactor preset en **tokens canaux** (`rgb(var/<alpha>)` → support `/opacity`) ; (patches) `vitest` épinglé `^4.0.18`, fonts Storybook `montserrat@5`, Skeleton a11y décoratif, `tsconfig` newline, commentaire sprint-status, `toggle` fallback hydratation, **durcissement test parité** (var-fallback, zéro var() résiduel, shadows `.dark` strict, complétude light/dark = **8/8**). 3 items différés (FOUC hydratation, `font-sans`→Regular, `fontError` log) → `deferred-work.md`. Validation : parité 8/8 · typecheck DT+mobile · lint · **build Storybook ✅** · web intact. Status → done. | Code review |

## Review Findings (Code Review — 2026-06-07)

> Revue adversariale 3 couches (Blind Hunter · Edge Case Hunter · Acceptance Auditor). **Verdict : AC1/AC2/AC3 satisfaites avec preuves** (mirror `UX-DR-MOB-001` vérifié valeur par valeur, web intact, garde-fous OK). Aucune issue Critical/High. Findings = qualité / robustesse / a11y.

**Decision-needed → résolues en `patch` puis APPLIQUÉES (Guillaume, 2026-06-07)** :

- [x] [Review][Patch] **Pulsation Skeleton sur natif** — `animate-pulse` (keyframe web) n'anime pas sur RN. **Implémenté** : pulsation pilotée par l'API `Animated` de react-native (opacité 1→0.5→1, boucle), + masquage a11y (`accessibilityElementsHidden`/`importantForAccessibility`). ⚠️ **Pivot moteur vs « Reanimated »** : importer `react-native-reanimated` casse le build Storybook (cible `@storybook/react-native-web-vite` — graphe Reanimated `compatibility.json`/`swipeSimulator.js` non transformable par vite) ; `Animated` (cœur RN, déjà polyfillé par react-native-web) donne la **même pulsation native** sans casser le catalogue. **Build Storybook re-vérifié ✅.** [`apps/mobile/src/components/ui/skeleton.tsx`] _(blind+edge)_
- [x] [Review][Patch] **Modificateurs d'opacité couleur (`bg-primary/50`)** — **Implémenté** : preset refactoré en **tokens canaux** — `colors` exposés en `rgb(var(--color-x) / <alpha-value>)`, vars CSS injectées en canaux RGB via `hexToRgbChannels`. `palette.json`/`tokens.ts` **restent en hex** (miroir intact, parité **8/8 ✅**). CSS Storybook vérifié : `--color-primary: 45 106 74` (light) / `116 198 157` (dark) + utilitaires `rgb(var(--color-primary) / var(--tw-bg-opacity,1))`. [`packages/design-tokens/nativewind-preset.js`] _(blind+edge)_

**Patch** (fix non ambigu) :

- [x] [Review][Patch] `vitest: "latest"` non épinglé → version non reproductible [`packages/design-tokens/package.json:28`] _(blind)_
- [x] [Review][Patch] Fonts Storybook `montserrat@latest` (CDN) non épinglées → drift/offline CI [`apps/mobile/.storybook/preview-head.html:12,19,26,33`] _(blind+edge)_
- [x] [Review][Patch] `Skeleton` `accessibilityRole="progressbar"` sémantiquement faux (placeholder décoratif, pas de valeur) → masquer de l'a11y (`accessibilityElementsHidden`) ou `accessibilityLabel` [`apps/mobile/src/components/ui/skeleton.tsx:15`] _(blind+edge)_
- [x] [Review][Patch] `tsconfig.json` mobile : newline final manquant [`apps/mobile/tsconfig.json`] _(blind+auditor)_
- [x] [Review][Patch] Commentaire corrompu `sprint-status.yaml` (« web intactign-tokens… » — fragments concaténés) → réécriture propre [`_bmad-output/implementation-artifacts/sprint-status.yaml:330`] _(auditor)_
- [x] [Review][Patch] (low) `toggle` lit `colorScheme` brut (peut valoir `undefined` avant hydratation → bascule toujours vers `'dark'`) → dériver du fallback/`preference` [`apps/mobile/src/hooks/use-color-scheme.ts:55-57`] _(blind+edge)_
- [x] [Review][Patch] (low) Durcir le test de parité : résoudre les `var(--x, fallback)`, asserter zéro `var(` non résolu, empêcher qu'un `--shadow-*` défini seulement dans `:root` satisfasse l'assertion `.dark` (cascade-merge masque une dérive), et vérifier la complétude du set de tokens [`packages/design-tokens/src/tokens.test.ts`] _(blind+edge+auditor)_

**Defer** (réel mais non bloquant maintenant) :

- [x] [Review][Defer] FOUC d'hydratation : `hydrated` exposé mais aucun conscommateur ne gate dessus → flash possible (préf. explicite ≠ système) au boot. À gater quand l'UI de thème existera (MOB-1.4+) [`apps/mobile/src/hooks/use-color-scheme.ts`] — deferred, pas de consommateur de thème dans cette story _(edge)_
- [x] [Review][Defer] `font-sans` → Regular uniquement : `font-bold` ne produit pas un Montserrat gras sur RN (poids = nom de famille). Les composants utilisent `font-montserrat-bold` explicite ; à documenter comme garde-fou DS [`packages/design-tokens/nativewind-preset.js:41`] — deferred, comportement RN attendu, composants OK _(blind)_
- [x] [Review][Defer] `_layout.tsx` avale `fontError` silencieusement (rend avec police système, zéro signal) → ajouter un log/telemetry [`apps/mobile/src/app/_layout.tsx`] — deferred, dégradation gracieuse acceptable _(blind+edge)_

**Dismissed comme bruit (11)** : Pressable RN applique déjà `accessibilityState.disabled` depuis la prop `disabled` ; `postcss.config.js` racine non consommé par Metro natif (Storybook vite uniquement) ; plugin `expo-font` légitime (auto `expo install`) ; spread `...props` après role/className (override intentionnel) ; misuse `size="icon"`+`label` (hors contrat) ; variant `link` sans `active:` (polish) ; double `hideAsync` splash (dev-only/Fast Refresh) ; `babel api.cache(true)` (théorique) ; `index.ts` re-export de types redondant (inoffensif) ; nom de package Storybook `-vite` (déviation documentée, pas une violation) ; glob `*.stories.@(ts|tsx)` matche aussi `.ts` (inoffensif).
