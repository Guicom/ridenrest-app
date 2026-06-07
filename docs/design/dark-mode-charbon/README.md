# Handoff : Dark Mode « Charbon » — Webapp Ride'n'Rest

## Overview
Mode sombre pour la **webapp** Ride'n'Rest (`ridenrest-app/apps/web` — Next.js + shadcn/ui + Tailwind v4). Direction retenue : **« Charbon »** — fond charbon neutre, accent vert sauge clair. Le but est de pouvoir basculer toute l'app en thème sombre lisible (liste d'aventures, détail/segments, carte, Live) sans refondre les composants : seules les **valeurs** des tokens existants changent.

## About the Design Files
Les fichiers de ce paquet sont des **références de design en HTML** — un prototype montrant l'intention visuelle, pas du code de production à copier tel quel. La tâche est de **réimplémenter le dark mode dans le codebase existant** (Tailwind v4 + shadcn/ui), en réutilisant les patterns déjà en place (variables CSS dans `globals.css`, `next-themes` ou équivalent pour le toggle). Le vrai livrable à intégrer est **`charbon-dark-tokens.css`** ; le HTML sert uniquement à visualiser le rendu cible.

## Fidelity
**High-fidelity.** Couleurs, hex, typographie et états finals. Les valeurs de `charbon-dark-tokens.css` sont à reprendre exactement.

## Le livrable principal : `charbon-dark-tokens.css`
Ce fichier redéfinit **les mêmes noms de tokens** que `colors_and_type.css` / `globals.css`, sous un sélecteur `.dark`. Rien dans les composants ne doit changer.

**Intégration (recommandée — toggle manuel) :**
1. Garder le `:root { … }` clair tel quel.
2. Coller le bloc `.dark { … }` dans `globals.css`.
3. Piloter via `class="dark"` sur `<html>` (ex. `next-themes` avec `attribute="class"`).

Une **Option B** (suivre l'OS via `@media (prefers-color-scheme: dark)`) est fournie en commentaire — n'en garder qu'une seule.

## Design Tokens (valeurs Charbon)

### Surfaces & bordures
| Token | Light | Dark (Charbon) |
|---|---|---|
| `--background-page` | `#F5F7F5` | `#14181C` |
| `--background` / `--surface` | `#FFFFFF` / `#F8FAF9` | `#1B2025` |
| `--surface-raised` | `#EFF5F1` | `#242B31` |
| `--background-intro` | `#b4c9b1` | `#1E2A24` |
| `--border` / `--input` | `#D4E0DA` | `#333B42` |

### Texte
| Token | Light | Dark |
|---|---|---|
| `--text-primary` / `--foreground` | `#1A2D22` | `#ECEFF1` |
| `--text-secondary` | `#4D6E5A` | `#AEB8BF` |
| `--text-muted` | `#8EA899` | `#727C83` |
| `--sage` | `#7A8C82` | `#9DAAB0` |

### Vert de marque (action / CTA)
| Token | Light | Dark |
|---|---|---|
| `--primary` | `#2D6A4A` | `#74C69D` |
| `--primary-hover` | `#245740` | `#95D5B2` |
| `--primary-foreground` | `#FFFFFF` | `#0A1711` |
| `--primary-light` | `#EBF5EE` | `#18241E` |
| `--ring` | `#2D6A4A` | `#74C69D` |

### Densité / statut (éclaircies pour fond sombre)
| Token | Light | Dark |
|---|---|---|
| `--density-high` (Prêt) | `#16a34a` | `#4ADE80` |
| `--density-medium` (En cours) | `#d97706` | `#FBBF24` |
| `--density-low` / `--destructive` (Erreur) | `#dc2626` | `#F87171` |

### Inchangés (ne pas redéfinir en dark)
`--accent-yellow #F4C542` (lisible tel quel), tous les `--radius-*`, `--space-*`, `--text-*`, `--weight-*`, `--tracking-*`, et les familles `--font-*`. Les **ombres** passent en base noire (voir le CSS).

## Composants — règles dark

- **Cartes** (`AdventureCard`, `SegmentCard`) : fond `var(--surface)`, bordure `1px var(--border)`, `rounded-xl` (carte) / `rounded-lg` (segment). Hover → `var(--surface-raised)`. Sélection → `box-shadow: 0 0 0 2px var(--primary) inset`. Pas de gradient.
- **Boutons** : primary = `var(--primary)` + texte `var(--primary-foreground)`, hover `var(--primary-hover)`. Outline = bordure `var(--border)` + texte `var(--text-primary)`, hover fond `var(--surface-raised)`. Ghost = fond `var(--surface-raised)`. Press `active:scale-[0.97]`.
- **Pastilles de statut** : sur fond sombre, préférer la **teinte** au remplissage plein —
  `background: color-mix(in srgb, var(--density-high) 15%, transparent); color: var(--density-high);` + un point de 6px. « En cours… » garde l'`animate-pulse`.
- **Strava** : le wordmark « Powered by Strava » est noir → utiliser la **variante blanche** `assets/powered-by-strava-white.svg` sur surfaces sombres. La marque orange `#FC5200` reste inchangée (asset tiers, ne pas modifier).
- **Vert marque ≠ vert densité** : `--primary` (action) reste distinct de `--density-high` (donnée), même en dark.

## Interactions & Behavior
Inchangées par rapport au light : `transition-all` 75–300ms, hover `opacity-90` ou `surface-raised`, press `scale(0.97)`, skeletons `animate-pulse`. Pas de bounce/spring. En **Live mode** le header reste masqué.

## Toggle / State
Recommandé : `next-themes` (`attribute="class"`, `defaultTheme="system"`). Persiste le choix utilisateur. Aucun autre état nécessaire — le dark mode est purement présentationnel.

## Files (dans ce paquet)
- `charbon-dark-tokens.css` — **le livrable** : overrides `.dark` prêts à coller.
- `reference/DarkMode.html` — prototype visuel : 3 directions comparées. **Charbon = panneau B** (la direction retenue).
- `reference/ThemePanel.jsx` — composant de doc (swatches, type, boutons, pastilles, cartes) rendu par direction.
- `reference/design-canvas.jsx` — coquille canvas (présentation uniquement, non requise en prod).
- `reference/assets/` — `logo.svg`, `powered-by-strava.svg` + variante blanche.

## Notes
- Source de vérité des tokens : `colors_and_type.css` du design system. N'introduis aucun nouveau nom de token ; réutilise ceux de la liste existante.
- Pour ouvrir le prototype : `reference/DarkMode.html` (le panneau B est « Charbon »).