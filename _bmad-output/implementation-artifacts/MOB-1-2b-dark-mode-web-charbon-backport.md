# Story MOB-1.2b : Dark mode web « Charbon » (back-port de la palette dans la source canonique)

Status: ready-for-dev

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

- [ ] **T1 — Intégrer la palette « Charbon » dans `globals.css`** (AC: 1)
  - [ ] Coller le bloc `.dark {}` de `charbon-dark-tokens.css` dans `apps/web/src/app/globals.css` (après le `:root`), valeurs **exactes**
  - [ ] Le `@custom-variant dark (&:is(.dark *))` existe déjà (l.5) — ne pas le dupliquer
  - [ ] ⚠️ `--shadow-*` : ces tokens n'existent **pas** dans le `:root` actuel — vérifier comment les ombres sont consommées. Si les utilitaires Tailwind `shadow-*` ne lisent pas ces variables, les brancher via `@theme` (namespace `--shadow-*` Tailwind v4) avec les valeurs light par défaut + overrides `.dark`, ou les omettre si aucun composant ne les consomme (documenter le choix)
  - [ ] Ne **pas** redéfinir en dark : `--accent-yellow`, `--radius-*`, `--space-*`, `--text-*` (tailles), `--weight-*`, `--tracking-*`, `--font-*`

- [ ] **T2 — Câbler le toggle `next-themes`** (AC: 2)
  - [ ] `next-themes` est déjà en dépendance (`^0.4.6`, utilisé par `sonner.tsx`) — pas d'installation
  - [ ] `ThemeProvider` (`attribute="class"`, `defaultTheme="system"`, `enableSystem`) dans `apps/web/src/app/layout.tsx` ; ajouter `suppressHydrationWarning` sur `<html>` (déjà présent sur `<body>` l.38 — c'est `<html>` qui reçoit la classe)
  - [ ] Contrôle de bascule (light / dark / système) dans la page Settings (`apps/web/src/app/(app)/settings/`)
  - [ ] Vérifier que le toaster `sonner.tsx` (qui lit `useTheme`) suit correctement

- [ ] **T3 — Passe composants dark (règles README handoff)** (AC: 3)
  - [ ] Pastilles de statut (Prêt / En cours / Erreur) → teinte `color-mix` + point 6px
  - [ ] Cartes (`AdventureCard`, `SegmentCard`) : hover/sélection conformes, pas de gradient
  - [ ] Copier `docs/design/dark-mode-charbon/reference/assets/powered-by-strava-white.svg` → `apps/web/public/` et basculer le wordmark selon le thème (variante noire actuelle : `apps/web/public/powered-by-strava.svg`)
  - [ ] Carte MapLibre & Live : vérifier la lisibilité des overlays/panneaux sur fond sombre (le style de fond de carte lui-même est hors scope) ; en Live le header reste masqué (inchangé)

- [ ] **T4 — QA dark + non-régression light** (AC: 1, 3)
  - [ ] Parcours visuel des écrans clés dans les deux thèmes : auth, liste d'aventures, détail/segments, carte/planification, Live, settings
  - [ ] Suite de tests web verte (`turbo test --filter=web`) + lint + build
  - [ ] Zéro changement de rendu en light (diff visuel informel suffisant)

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
