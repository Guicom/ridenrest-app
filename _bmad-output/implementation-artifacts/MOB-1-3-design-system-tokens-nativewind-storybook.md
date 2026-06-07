# Story MOB-1.3 : Design system mobile (tokens, NativeWind, Storybook)

Status: ready-for-dev

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

- [ ] **T1 — Créer `packages/design-tokens/` (single source of truth partagée)** (AC: 1)
  - [ ] Nouveau workspace `packages/design-tokens/` nommé `@ridenrest/design-tokens`, `private: true`, `workspace:*`
  - [ ] **Extraire** (copier fidèlement, pas réinventer) les valeurs de `apps/web/src/app/globals.css` — `:root` (light) **et `.dark`** (palette « Charbon », back-portée par MOB-1.2b) — dans un module TS typé — couleurs brand, surface, typo, border, tokens shadcn, density, chart-1→5, `--radius: 0.625rem` + échelle dérivée (`sm ×0.6`, `md ×0.8`, `lg ×1`, `xl ×1.4`, `2xl ×1.8`…), police **Montserrat**
  - [ ] Exporter sous deux formes : (a) **objet JS/TS** (`tokens.ts`) pour les consommateurs non-NativeWind (charts `react-native-svg`, styles MapLibre, `pin-factory`) ; (b) **preset NativeWind/Tailwind** (theme extension) consommable par `apps/mobile`
  - [ ] **Refactor non-régressif `apps/web`** : faire pointer la config Tailwind web vers ce package (ou documenter que `globals.css` reste la source et que le package l'extrait) — **sans** changer un seul rendu web. Si le couplage web est risqué, garder `globals.css` comme source canonique et le package comme **miroir vérifié** (script/test de parité)
  - [ ] Couleurs POI : **ré-exporter / référencer** `@ridenrest/shared` `poi-colors.ts` — ne pas dupliquer les valeurs

- [ ] **T2 — Configurer NativeWind v4 dans `apps/mobile`** (AC: 2)
  - [ ] `expo install nativewind` + `tailwindcss` (v3 compatible NativeWind v4) ; `babel.config.js` (preset `nativewind/babel`) ; `metro.config.js` `withNativeWind` (en cohérence avec la config monorepo de MOB-1.1 — ne pas écraser `watchFolders`)
  - [ ] `tailwind.config.js` mobile : `presets: [require('@ridenrest/design-tokens/nativewind-preset')]` (theme issu des tokens partagés)
  - [ ] `global.css` mobile (directives Tailwind) + import dans le root layout
  - [ ] Helper `cn()` (`clsx` + `tailwind-merge`) dans `lib/cn.ts` (alignement web)
  - [ ] Hook `use-color-scheme.ts` : préférence user (AsyncStorage) + fallback système (`useColorScheme` RN / NativeWind), exposant un toggle

- [ ] **T3 — Composants primitifs + Storybook** (AC: 3)
  - [ ] `components/ui/button.tsx` (variants via `class-variance-authority`, taille `lg` **≥ 44×44 px**), `card.tsx`, `skeleton.tsx`
  - [ ] `@storybook/react-native-web` v8 : `.storybook/main.ts` (pattern `**/*.stories.tsx`), `.storybook/preview.tsx` (decorators : ThemeProvider light/dark, font Montserrat, preset NativeWind)
  - [ ] Stories co-localisées : `button.stories.tsx`, `card.stories.tsx`, `skeleton.stories.tsx`
  - [ ] Déclarer le script `storybook` dans `apps/mobile/package.json` + tâche turbo `storybook` (alias `storybook:mobile`) dans `turbo.json`

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
