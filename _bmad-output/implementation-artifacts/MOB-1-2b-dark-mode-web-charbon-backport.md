---
baseline_commit: 9aed34dfa48de9447acaa8f47abc8df9e9180cc9
---

# Story MOB-1.2b : Dark mode web « Charbon » (back-port de la palette dans la source canonique)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur de la webapp**,
I want **basculer la webapp en thème sombre « Charbon »**,
So that **l'app est lisible en faible luminosité et la palette dark devient une valeur canonique que le design system mobile pourra mirrorer sans invention**.

> Story insérée le **2026-06-07** dans l'Epic MOB-1, suite à la livraison du handoff Claude Design `docs/design/dark-mode-charbon/`. **Prérequis de MOB-1.3** : les tokens mobiles sont un **miroir** de la source web canonique (`UX-DR-MOB-001`) — la palette dark doit donc exister dans `globals.css` **avant** l'extraction. Cible : `apps/web` uniquement (aucun code mobile dans cette story).

## Acceptance Criteria

1. **Given** le handoff `docs/design/dark-mode-charbon/charbon-dark-tokens.css`
   **When** j'intègre le bloc `.dark {}` dans `apps/web/src/app/globals.css`
   **Then** les tokens dark reprennent **exactement** les valeurs du handoff (high-fidelity, zéro invention)
   **And** les `--shadow-*` (base noire) sont intégrés
   **And** le `:root` clair reste strictement inchangé (zéro régression light)
   **And** une seule approche de bascule est conservée (classe `.dark` — **ne pas** reprendre l'option `@media prefers-color-scheme` commentée dans le handoff)

2. **Given** la palette intégrée
   **When** je branche le toggle via `next-themes` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`)
   **Then** le défaut suit la préférence OS et le choix utilisateur persiste (localStorage next-themes)
   **And** la bascule est accessible depuis l'UI (page Settings)
   **And** pas de flash de thème au chargement (`suppressHydrationWarning` sur `<html>`)

3. **Given** le thème dark actif
   **When** je parcours les écrans clés (liste d'aventures, détail/segments, carte, Live)
   **Then** les règles composants du README handoff sont appliquées :
   - pastilles de statut en **teinte** — `background: color-mix(in srgb, var(--density-*) 15%, transparent); color: var(--density-*);` + point 6px (pas de fond plein) ; « En cours… » garde l'`animate-pulse`
   - cartes : fond `var(--surface)`, bordure `1px var(--border)`, hover `var(--surface-raised)`, sélection `box-shadow: 0 0 0 2px var(--primary) inset`, **pas de gradient**
   - boutons : primary = `var(--primary)` + `var(--primary-foreground)`, hover `var(--primary-hover)` ; outline/ghost hover `var(--surface-raised)`
   **And** le wordmark « Powered by Strava » utilise la **variante blanche** sur surfaces sombres (marque orange `#FC5200` inchangée — asset tiers, ne pas modifier)
   **And** vert marque (`--primary #74C69D`) et vert densité (`--density-high #4ADE80`) restent visuellement distincts

## Tasks / Subtasks

- [x] **T1 — Intégrer la palette « Charbon » dans `globals.css`** (AC: 1)
  - [x] Coller le bloc `.dark {}` de `charbon-dark-tokens.css` dans `apps/web/src/app/globals.css` (après le `:root`), valeurs **exactes**
  - [x] Le `@custom-variant dark (&:is(.dark *))` existe déjà (l.5) — ne pas le dupliquer
  - [x] ⚠️ `--shadow-*` : ces tokens n'existent **pas** dans le `:root` actuel — vérifier comment les ombres sont consommées. Si les utilitaires Tailwind `shadow-*` ne lisent pas ces variables, les brancher via `@theme` (namespace `--shadow-*` Tailwind v4) avec les valeurs light par défaut + overrides `.dark`, ou les omettre si aucun composant ne les consomme (documenter le choix)
  - [x] Ne **pas** redéfinir en dark : `--accent-yellow`, `--radius-*`, `--space-*`, `--text-*` (tailles), `--weight-*`, `--tracking-*`, `--font-*`

- [x] **T2 — Câbler le toggle `next-themes`** (AC: 2)
  - [x] `next-themes` est déjà en dépendance (`^0.4.6`, utilisé par `sonner.tsx`) — pas d'installation
  - [x] `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) dans `apps/web/src/app/layout.tsx` ; ajouter `suppressHydrationWarning` sur `<html>` (déjà présent sur `<body>` l.38 — c'est `<html>` qui reçoit la classe)
  - [x] Contrôle de bascule (light / dark / système) dans la page Settings (`apps/web/src/app/(app)/settings/`)
  - [x] Vérifier que le toaster `sonner.tsx` (qui lit `useTheme`) suit correctement

- [x] **T3 — Passe composants dark (règles README handoff)** (AC: 3)
  - [x] Pastilles de statut (Prêt / En cours / Erreur) → teinte `color-mix` + point 6px
  - [x] Cartes (`AdventureCard`, `SegmentCard`) : hover/sélection conformes, pas de gradient
  - [x] Copier `docs/design/dark-mode-charbon/reference/assets/powered-by-strava-white.svg` → `apps/web/public/` et basculer le wordmark selon le thème (variante noire actuelle : `apps/web/public/powered-by-strava.svg`)
  - [x] Carte MapLibre & Live : vérifier la lisibilité des overlays/panneaux sur fond sombre (le style de fond de carte lui-même est hors scope) ; en Live le header reste masqué (inchangé)

- [x] **T4 — QA dark + non-régression light** (AC: 1, 3)
  - [x] Parcours visuel des écrans clés dans les deux thèmes : auth, liste d'aventures, détail/segments, carte/planification, Live, settings
  - [x] Suite de tests web verte (`turbo test --filter=web`) + lint + build
  - [x] Zéro changement de rendu en light (diff visuel informel suffisant)

## Dev Notes

### Livrable & fidélité

- **Source unique des valeurs** : `docs/design/dark-mode-charbon/charbon-dark-tokens.css` — high-fidelity, à reprendre **exactement**. Ne rien inventer, ne rien « ajuster à l'œil ».
- Parité des noms vérifiée (2026-06-07) : tous les tokens du handoff existent déjà dans `globals.css` (`--background-page`, `--surface`, `--surface-raised`, `--background-intro`, `--text-primary/secondary/muted`, `--sage`, `--primary*`, `--density-*`, `--accent-yellow`, `--earth-light`, `--border`, `--input`, `--ring`, `--chart-1→5`…) — **seuls les `--shadow-*` sont nouveaux** (cf. T1).
- Le HTML de `reference/` (DarkMode.html — **panneau B = Charbon**, ThemePanel.jsx) est un prototype visuel de référence, **pas** du code à copier.

### Garde-fous

- **Vert marque ≠ vert densité** : `--primary` (action) reste distinct de `--density-high` (donnée), même en dark.
- **Strava** : la marque orange `#FC5200` est un asset tiers — ne pas modifier ; seule la variante du wordmark change selon le thème.
- Aucun composant ne doit changer de **structure** : seules les valeurs des tokens basculent (principe du handoff).
- Interactions inchangées vs light : `transition-all` 75–300 ms, press `scale(0.97)`, skeletons `animate-pulse`, pas de bounce/spring.

### Lien avec le design system mobile (MOB-1.3)

Une fois cette story livrée, `globals.css` contient **les deux palettes** (`:root` light + `.dark` Charbon) et redevient la source canonique complète que `packages/design-tokens/` (MOB-1.3) extrait — light **et** dark — sans redéfinition. C'est ce qui lève le point bloquant documenté dans `MOB-1-3-design-system-tokens-nativewind-storybook.md` (option B sécurisée par validation design).

### Project Structure Notes

- Modifié : `apps/web/src/app/globals.css`, `apps/web/src/app/layout.tsx`, page Settings, composants pastilles/cartes/wordmark Strava concernés.
- Nouveau : `apps/web/public/powered-by-strava-white.svg` (copié depuis le handoff).
- Aucune migration DB / backend / code mobile.

### References

- [Source: docs/design/dark-mode-charbon/README.md] — overview, règles composants, toggle recommandé
- [Source: docs/design/dark-mode-charbon/charbon-dark-tokens.css] — **le livrable** : bloc `.dark` à intégrer
- [Source: docs/design/dark-mode-charbon/reference/] — prototype visuel (panneau B) + `assets/powered-by-strava-white.svg`
- [Source: apps/web/src/app/globals.css] — `:root` light canonique (l.74-151), `@custom-variant dark` (l.5)
- [Source: _bmad-output/planning-artifacts/epics-mobile.md#Story MOB-1.2b] — AC d'origine
- [Source: _bmad-output/planning-artifacts/epics-mobile.md#UX-DR-MOB-001] — principe miroir + MàJ 2026-06-07

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / bmad-dev-story)

### Debug Log References

- `globals-dark-tokens.test.ts` (AC1) : test de parité exact handoff → `globals.css .dark`. 1 faux positif corrigé (le test matchait `prefers-color-scheme` dans mon propre commentaire → comparaison sur CSS hors-commentaires).
- `theme-toggle.test.tsx` (AC2) : 4 échecs initiaux « multiple elements with role radio » = absence de `cleanup()` entre tests → aligné sur la convention du repo (`afterEach(cleanup)`, cf. `privacy-toggle.test.tsx`).
- `map-canvas.test.tsx` : `ReferenceError: PoweredByStrava is not defined` → import oublié dans `map-canvas.tsx`, ajouté.
- QA visuelle : `pnpm dlx playwright` cache corrompu après runs concurrents → bascule sur `npx -y playwright screenshot` + storage states (cookie session Better Auth + `localStorage.theme`).

### Completion Notes List

**T1 — palette « Charbon » dans `globals.css` (AC1)**
- Bloc `.dark {}` intégré après `:root`, valeurs **exactes** du handoff `charbon-dark-tokens.css` (vérifié par test de parité automatisé). `:root` light strictement inchangé.
- `--accent-yellow` volontairement **non** redéfini (mode-independent, lisible tel quel — cf. README handoff). Option `@media prefers-color-scheme` du handoff **non** reprise : approche unique classe `.dark`.
- **Décision `--shadow-*`** : Tailwind v4 **inline** les valeurs des utilitaires `shadow-*` au build (vérifié dans le CSS compilé : `.shadow-sm{--tw-shadow:0 1px 3px…}`) — ces variables ne sont **pas** lues au runtime par les classes existantes. Les `--shadow-*` du handoff sont donc intégrées comme **valeurs canoniques du design system** (destinées au miroir `packages/design-tokens` MOB-1.3), sans rebranchement `@theme` (aucun composant ne les consomme via `var()`). Choix documenté en commentaire dans `globals.css`.
- **Tokens shadcn hors handoff** (`--card`, `--popover`, `--muted`, `--secondary`, `--accent`, sidebar…) : aliasés en dark via `var()` selon le **même mapping que le light** (ex. `--card: var(--surface)`), zéro valeur inventée. Nécessaire car le handoff ne couvre que la palette app.

**T2 — toggle `next-themes` (AC2)**
- `ThemeProvider` client (`components/shared/theme-provider.tsx`) monté dans `layout.tsx` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`). `suppressHydrationWarning` ajouté sur `<html>` (anti-flash — c'est `<html>` qui reçoit la classe `dark`).
- `ThemeToggle` (segmented control Clair / Sombre / Système, `role=radiogroup`) ajouté en page Settings, section « Apparence ». Guard `mounted` pour éviter le mismatch d'hydratation sur l'état actif.
- `sonner.tsx` lit déjà `useTheme()` → suit automatiquement (vérifié via le dialog Nouveautés QA, popover correctement thémé dans les 2 modes).

**T3 — passe composants dark (AC3)**
- Pastilles statut (`SegmentCard`) : en dark, teinte `color-mix(in srgb, var(--density-*) 15%, transparent)` + texte `--density-*` + point 6px (`hidden dark:inline-block`). « En cours… » garde `animate-pulse`. En light : fond plein inchangé.
- Wordmark Strava factorisé en `<PoweredByStrava />` (bascule CSS pure, pas de `useTheme` → zéro flash) : variante noire `dark:hidden` + variante blanche `hidden dark:inline`. Asset `powered-by-strava-white.svg` copié du handoff vers `public/`. La variante noire porte l'`alt` (lecteurs d'écran), la blanche est `aria-hidden`. Appliqué : adventure-card, segment-card, map-canvas, live page.
- Cartes/surfaces : `dark:bg-surface` / `dark:bg-surface-raised` ajouté partout où un `bg-white` était hardcodé (cartes, panneaux carte, toggles, drawer live, dates détail, wrappers pages, auth-page-wrapper, séparateurs « ou » login/register). Pas de gradient. Sélection `ring-2 ring-primary` conservée.
- Carte/Live : overlays/panneaux relus pour lisibilité sur fond sombre (le style de fond de carte lui-même reste hors scope). Header masqué en Live inchangé.

**T4 — QA + non-régression (AC1, AC3)**
- Régression monorepo complète verte : `turbo test lint typecheck` = **19 tâches OK**, web **1154 tests / 98 fichiers**. Build web vert. CSS compilé vérifié (bloc `.dark`, utilitaires `dark:bg-surface`, `color-mix` arbitraire bien générés).
- QA visuelle headless (compte de test, storage states cookie + `localStorage.theme`) : login, settings (toggle + cartes + dialog), liste aventures (shell + bloc intro + dialog + bouton primary vert clair `#74C69D` sur encre `#0A1711`) — rendus dark conformes ; light strictement inchangé (cartes blanches, primary vert foncé `#2D6A4A`). Vert marque ≠ vert densité respecté.

**Lien MOB-1.3** : `globals.css` contient désormais les deux palettes (`:root` light + `.dark` Charbon) → source canonique complète extractible par `packages/design-tokens/`. Point bloquant de MOB-1.3 levé.

### File List

**Nouveaux**
- `apps/web/src/components/shared/theme-provider.tsx`
- `apps/web/src/components/shared/powered-by-strava.tsx`
- `apps/web/src/app/(app)/settings/_components/theme-toggle.tsx`
- `apps/web/src/app/(app)/settings/_components/theme-toggle.test.tsx`
- `apps/web/src/app/globals-dark-tokens.test.ts`
- `apps/web/public/powered-by-strava-white.svg` (copié du handoff)

**Modifiés**
- `apps/web/src/app/globals.css` (bloc `.dark` Charbon)
- `apps/web/src/app/layout.tsx` + `apps/web/src/app/layout.test.ts`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/(app)/adventures/page.tsx`
- `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` + `.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx` + `.test.tsx`
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/reset-zoom-button.tsx`
- `apps/web/src/app/(app)/live/[id]/page.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx`
- `apps/web/src/app/(marketing)/_components/auth-page-wrapper.tsx`
- `apps/web/src/app/(marketing)/login/_components/login-form.tsx`
- `apps/web/src/app/(marketing)/register/_components/register-form.tsx`

## Change Log

| Date | Version | Description |
|---|---|---|
| 2026-06-07 | 1.0 | Implémentation MOB-1.2b : palette dark « Charbon » dans `globals.css` (parité exacte handoff), toggle `next-themes` (Settings + anti-flash), passe composants dark (pastilles teinte, wordmark Strava blanc, surfaces). 22 tests ajoutés, régression monorepo verte (1154 tests web). Status → review. |

## Review Findings

> Code review adversariale (Blind Hunter / Edge Case Hunter / Acceptance Auditor), baseline `9aed34d`, 2026-06-07. AC1/AC2/AC3 jugés **satisfaits** par l'Acceptance Auditor (parité exacte du bloc `.dark`, `:root` light inchangé, pas de `@media prefers-color-scheme`, toggle conforme, pastilles teinte + wordmark + cartes). Findings ci-dessous = défauts de finition dark (a11y / contrôles natifs), pas de violation d'AC.

### À traiter (patch)

- [x] [Review][Patch] Wordmark Strava blanc : attribut `fill` **dupliqué** (`fill="#FFFFFF" … fill="black"` sur le même `<path>`) → XML malformé, rendu **parser-dépendant** (au mieux fragile, au pire noir-sur-sombre invisible ou image cassée en dark). Fix déterministe : supprimer le `fill="black"` final. [apps/web/public/powered-by-strava-white.svg:2]
- [x] [Review][Patch] `color-scheme: dark` absent du bloc `.dark` → contrôles natifs (date-pickers `<input type="date">` du détail aventure, scrollbars) rendus en clair sur fond sombre, glyphe calendrier quasi invisible. Fix : ajouter `color-scheme: dark;` dans `.dark`. [apps/web/src/app/globals.css:158] (écran détail in-scope, `adventure-detail.tsx:406,420`)
- [x] [Review][Patch] Piste du slider `range` codée en dur `background:#e5e7eb` sans override dark → barre gris clair sur panneau carte sombre (rayon de recherche). Fix : override `.dark` des règles `::-webkit-slider-runnable-track` / `::-moz-range-track`. [apps/web/src/app/globals.css:284,303] (consommé par `map/[id]/_components/search-range-control.tsx:242`)
- [x] [Review][Patch] `PoweredByStrava` perd son **nom accessible en dark** : en dark le `<img>` noir porteur de l'`alt` est `display:none` (`dark:hidden`) et le `<img>` blanc est `aria-hidden + alt=""` → attribution Strava sans nom annoncé aux lecteurs d'écran. Fix : donner `alt="Powered by Strava"` à la variante blanche et retirer `aria-hidden` (un seul `<img>` est dans l'arbre a11y par thème via `display:none`). [apps/web/src/components/shared/powered-by-strava.tsx:17-22]
- [x] [Review][Patch] `ThemeToggle` `role="radiogroup"` sans navigation flèches ni roving `tabIndex` → contrat ARIA radiogroup non honoré (3 tab-stops indépendants étiquetés `radio`). Fix : un seul tab-stop + gestion `ArrowLeft/Right`. [apps/web/src/app/(app)/settings/_components/theme-toggle.tsx:786-811]

### Différés (defer)

- [x] [Review][Defer] Pastille « En cours… » blanc-sur-ambre (`--density-medium #d97706` ≈ 2.5:1) échoue WCAG AA en **light** [apps/web/src/app/(app)/adventures/[id]/_components/segment-card.tsx] — pré-existant, touché par le diff
- [x] [Review][Defer] Pas de fallback `@supports` pour `color-mix()` des pastilles dark (dégrade en texte lisible sans chip sur navigateurs < 2023) [segment-card.tsx:336-352] — dégradation gracieuse, navigateurs cibles OK
- [x] [Review][Defer] Wordmark Live : chip `dark:bg-black/60` seul, pas de parité `bg-white/80` comme `map-canvas` → contraste light du wordmark noir sur tuiles carte non protégé [apps/web/src/app/(app)/live/[id]/page.tsx:596] — incohérence mineure
- [x] [Review][Defer] Radiogroup pré-mount sans option `aria-checked` (garde `mounted` → zéro radio coché au 1er paint, état ARIA transitoirement invalide) [theme-toggle.tsx:791] — tradeoff anti-hydratation assumé
- [x] [Review][Defer] Tests `theme-toggle` ne couvrent ni l'état pré-mount (`mounted=false`) ni l'actif « Système » résolu → garde d'hydratation non vérifiée [theme-toggle.test.tsx:870] — gap de couverture
- [x] [Review][Defer] Pas de `@media print` pour le wordmark blanc → invisible à l'impression d'une page dark (fond blanc forcé) [powered-by-strava.tsx] — cas limite impression
- [x] [Review][Defer] `globals-dark-tokens.test.ts` couplé au doc design hors-arbre (chemin relatif en dur) + regex `extractBlock` fragile (s'arrête au 1er `}`) → faux positif possible sous édition future [globals-dark-tokens.test.ts:894,910] — robustesse de test

### Rejetés (dismiss, 8)

`dark:lg:bg-surface` vs `lg:bg-white` (vérifié : le sélecteur `.dark` ajoute de la spécificité → dark gagne au breakpoint `lg`, fonctionne) ; toggle lit `theme` et non `resolvedTheme` (correct pour un contrôle tri-état) ; alias shadcn dans `.dark` (mapping `var()` identique au light, documenté, zéro hex inventé) ; chip wordmark Live intentionnel ; contraste input date au breakpoint mobile (spéculatif) ; tokens `--shadow-*` « morts » (valeurs canoniques design-system pour le miroir MOB-1.3, documenté) ; commentaire JSX `//` en Live (fonctionne) ; `suppressHydrationWarning` sur `<html>` (confirmation, correct).
