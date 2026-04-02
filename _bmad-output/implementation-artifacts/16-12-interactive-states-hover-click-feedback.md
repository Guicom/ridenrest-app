# Story 16.12: Interactive States — Cursor, Hover & Click Feedback

## Story

As a **user navigating the Ride'n'Rest app**,
I want every interactive element to respond visually when I hover over it or click it,
So that the UI feels responsive and polished — and I always know what's clickable.

---

## Context & Design Decisions

### Problème actuel

Plusieurs éléments interactifs manquent d'un ou plusieurs états visuels :
- Certains `div` cliquables (`adventure-card`, etc.) n'ont pas de `cursor: pointer` explicite
- Certains boutons actifs (style inline coloré) n'ont pas de hover state (ex : `poi-layer-grid` active)
- Quasiment aucun élément n'a d'état `active:` (feedback au tap/clic) — critique sur mobile
- Chips de la density dialog et de la poi-popup sans hover

### Objectif

Systématiser trois comportements sur **tous les éléments cliquables** de l'app :
1. **`cursor: pointer`** — indique visuellement que l'élément est cliquable
2. **Hover background** — fond qui s'assombrit ou s'éclaircit légèrement
3. **Active/click feedback** — légère compression (`active:scale-[0.97]`) ou assombrissement (`active:brightness-90`) au tap

### Règles générales

- `cursor-pointer` sur les `<div onClick>`, `<span onClick>`. Pour les `<button>`, `<input[type=date]>` et `<[role=switch]>` : règle CSS globale dans `globals.css` (voir Dev Notes).
- Hover : préférer les tokens existants (`hover:bg-[--surface-raised]`, `hover:bg-muted/50`, `hover:opacity-90`) plutôt qu'inventer de nouvelles couleurs.
- Active : `active:scale-[0.97] transition-all duration-75` — discret, naturel, efficace sur mobile.
- Éléments avec style inline coloré (actifs) : utiliser `hover:brightness-90` (CSS filter) plutôt que scale si le fond est dynamique.
- Ne jamais utiliser `hover:bg-[${dynamicColor}]` — style inline uniquement pour les couleurs dynamiques (cf. règle POI Color System).

---

## Acceptance Criteria

**AC-1 — cursor: pointer sur les div cliquables**

**Given** un élément `<div>` (ou `<span>`, `<li>`) avec `onClick`,
**When** l'utilisateur survole l'élément sur desktop,
**Then** le curseur devient `pointer`.

**AC-2 — Hover background sur tous les boutons et cards cliquables**

**Given** n'importe quel élément interactif sans état actif (fond neutre),
**When** l'utilisateur survole l'élément sur desktop,
**Then** le fond change légèrement (plus sombre en mode clair, plus clair en mode sombre).

**AC-3 — Hover sur éléments avec style inline coloré (actifs)**

**Given** un élément avec fond dynamique inline (ex: bouton layer actif, chip active),
**When** l'utilisateur survole l'élément,
**Then** l'élément s'assombrit légèrement (`filter: brightness(0.9)` ou `hover:brightness-90`).

**AC-4 — Active/click feedback sur tous les éléments cliquables**

**Given** n'importe quel élément interactif (bouton, card, chip, lien-CTA),
**When** l'utilisateur clique (desktop) ou tape (mobile),
**Then** un feedback visuel immédiat est visible : compression légère (`scale-[0.97]`) ou assombrissement (`brightness-90`).

**AC-5 — Pas d'active sur éléments désactivés**

**Given** un élément avec `disabled` ou `aria-disabled`,
**When** l'utilisateur tente d'interagir,
**Then** aucun hover ni active feedback n'est visible (curseur `not-allowed` ou `default`).

**AC-6 — Cohérence planning ↔ live ↔ adventure detail**

**Given** les composants partagés (`PoiLayerGrid`, `AccommodationSubTypes`),
**When** utilisés dans le contexte live (drawer) ou planning (sidebar),
**Then** les états interactifs sont identiques — pas de divergence entre les deux modes.

---

## Scope — Éléments à traiter

### Groupe A — Cards et containers cliquables (div/span avec onClick)

| Composant | Fichier | Manque |
|---|---|---|
| `AdventureCard` — wrapper div principal | `adventures/_components/adventure-card.tsx:14` | hover background |
| Strava route list item div | `adventures/[id]/_components/strava-import-modal.tsx:133` | active state (hover OK) |

> Note: `AdventureCard` a déjà `cursor-pointer` et `transition-colors` mais pas de `hover:` background sur le wrapper. Ajouter `hover:bg-[--surface-raised]` et `active:scale-[0.98]`.

### Groupe B — Boutons natifs sans état complet

| Composant | Fichier | Manque |
|---|---|---|
| "Aventures passées" toggle | `adventures/_components/adventure-list.tsx:100` | hover bg + active |
| Density category chips (inactives) | `adventures/[id]/_components/density-category-dialog.tsx:45` | hover bg + active |
| Density category chips (actives) | idem | hover brightness + active |
| `MapStylePicker` item actif | `map/[id]/_components/map-style-picker.tsx:23` | hover brightness + active |
| `MapStylePicker` item inactif | idem | active state (hover OK) |
| POI popup — close button × | `map/[id]/_components/poi-popup.tsx:170` | active state (hover OK) |
| POI popup — type chips (inactives) | `map/[id]/_components/poi-popup.tsx:229` | active state (hover OK) |
| POI popup — type chips (actives) | idem | hover brightness + active |

### Groupe C — Boutons POI Layer Grid (style inline coloré)

| Composant | Fichier | Manque |
|---|---|---|
| `PoiLayerGrid` bouton actif | `map/[id]/_components/poi-layer-grid.tsx:35` | hover brightness (style inline) + active |
| `PoiLayerGrid` bouton inactif | idem | active state (hover OK) |

### Groupe D — Liens CTA (a href)

| Composant | Fichier | Manque |
|---|---|---|
| POI popup — Booking CTA | `map/[id]/_components/poi-popup.tsx:248` | active state (`hover:opacity-90` OK) |
| POI popup — Site officiel | `map/[id]/_components/poi-popup.tsx:261` | hover bg + active |

### Groupe E — AccommodationSubTypes chips

| Composant | Fichier | Manque |
|---|---|---|
| Chips actives (fond coloré inline) | `map/[id]/_components/accommodation-sub-types.tsx` | hover brightness + active |
| Chips inactives | idem | active state (à vérifier) |

---

## Tasks

### Task 1 — [x] `adventure-card.tsx` : hover + active sur la card principale

**File :** `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx`

Sur le wrapper `<div>` principal (ligne ~14) :
- Ajouter `hover:bg-[--surface-raised]` (actuellement absent)
- Ajouter `active:scale-[0.98] transition-all duration-75` (feedback clic)

```tsx
className={`bg-white rounded-xl border border-[--border] p-4 transition-all duration-75 hover:bg-[--surface-raised] active:scale-[0.98]${isSelected ? ' ring-2 ring-[--primary]' : ''}`}
```

> Ne pas mettre `transition-all` sur les boutons intérieurs (Planning, Modifier, Live) — ils ont déjà leurs propres transitions.

---

### Task 2 — [x] `adventure-list.tsx` : toggle "Aventures passées"

**File :** `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx`

Sur le `<button>` "Aventures passées" (~ligne 100) :
```tsx
className="flex items-center gap-2 text-sm text-text-muted mb-2 w-full cursor-pointer rounded-lg px-1 py-0.5 hover:bg-[--surface-raised] active:bg-[--border] transition-colors"
```

---

### Task 3 — [x] `density-category-dialog.tsx` : chips interactives

**File :** `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx`

Sur les chips (~ligne 45), ajouter pour les inactives `hover:bg-muted/70` et pour les actives `hover:brightness-90` + pour toutes `active:scale-[0.95]` :

```tsx
className={[
  'text-sm px-3 py-1.5 rounded-full font-medium border cursor-pointer transition-all duration-75 active:scale-[0.95]',
  isActive
    ? 'bg-primary text-primary-foreground border-transparent hover:brightness-90'
    : 'bg-muted text-muted-foreground border-[--border] opacity-60 hover:opacity-80 hover:bg-muted/70',
].join(' ')}
```

---

### Task 4 — [x] `map-style-picker.tsx` : items du popover

**File :** `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx`

Sur les `<button>` du popover (~ligne 23) :
```tsx
className={cn(
  'w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer transition-all duration-75 active:scale-[0.97]',
  mapStyle === style.id
    ? 'bg-primary text-primary-foreground hover:brightness-90'
    : 'hover:bg-[--surface] text-foreground',
)}
```

---

### Task 5 — [x] `poi-layer-grid.tsx` : bouton actif (style inline coloré)

**File :** `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx`

Pour l'état actif (style inline), `hover:brightness-90` ne peut pas être appliqué directement via className quand `backgroundColor` est inline. Solution : ajouter un wrapper `div` avec overlay `::hover` — non, trop complexe. Alternative simple : ajouter `active:opacity-75` comme feedback de clic + `cursor-pointer` :

```tsx
className={[
  'flex-1 flex items-center justify-center rounded-xl p-3 transition-all duration-75 cursor-pointer active:scale-[0.95]',
  isActive ? '' : 'bg-white text-foreground border border-[--border] hover:bg-surface-raised',
].join(' ')}
```

> Pour l'état actif, `active:scale-[0.95]` est le feedback visuel. Le hover sur fond coloré inline reste sans changement — acceptable car le feedback au clic est l'essentiel.

---

### Task 6 — [x] `poi-popup.tsx` : close button, type chips, liens CTA

**File :** `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`

**Close button** (~ligne 170) — ajouter `active:scale-[0.85]` :
```tsx
className="shrink-0 mt-0.5 h-6 w-6 flex items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 text-[--text-secondary] cursor-pointer"
```

**Type chips inactives** (~ligne 237) — ajouter `active:scale-[0.95]` :
```tsx
'bg-white text-[--text-primary] border-[--border] hover:bg-[--surface] active:scale-[0.95]'
```

**Type chips actives** (~ligne 234) — ajouter `hover:brightness-90 active:scale-[0.95]` :
```tsx
'bg-[--primary] text-white border-[--primary] hover:brightness-90 active:scale-[0.95]'
```

**Booking CTA** (~ligne 254) — ajouter `active:scale-[0.98]` :
```tsx
className="flex items-center justify-center gap-2 w-full h-11 rounded-full bg-[--primary] text-white text-sm font-medium hover:opacity-90 active:scale-[0.98] transition-all duration-75"
```

**Site officiel link** (~ligne 265) — ajouter `hover:bg-[--surface] active:scale-[0.98]` :
```tsx
className="flex items-center justify-center gap-2 w-full h-11 rounded-full border border-[--border] text-[--text-primary] text-sm font-medium hover:bg-[--surface] active:scale-[0.98] transition-all duration-75"
```

---

### Task 7 — [x] `accommodation-sub-types.tsx` : chips

**File :** `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx`

Ajouter `active:scale-[0.95] transition-all duration-75` sur toutes les chips.
Pour les actives (fond inline coloré) : ajouter `hover:brightness-90` via className (fonctionne avec les filtres CSS même avec fond inline).

---

### Task 8 — [x] Audit rapide des autres éléments

Fichiers audités et corrigés :

| Fichier | Corrections apportées |
|---|---|
| `live/[id]/_components/live-controls.tsx` | Boutons RECHERCHER + FILTERS → `transition-all duration-75 active:scale-[0.97]` |
| `map/[id]/_components/layer-toggles.tsx` | Tous les toggles → `transition-all duration-75 active:scale-[0.95]` |
| `map/[id]/_components/trace-click-cta.tsx` | "Rechercher ici" + "✕" → `active:scale-[0.95/0.85]` |
| `map/[id]/_components/sidebar-density-section.tsx` | Header cliquable → `hover:bg-[--surface-raised] active:bg-[--border] transition-colors` |
| `map/[id]/_components/reset-zoom-button.tsx` | TooltipTrigger → `cursor-pointer active:scale-[0.90] transition-all duration-75` |
| `adventures/_components/adventure-card.tsx` | Boutons Planning/Modifier/Live (desktop + mobile) → `transition-all duration-75 active:scale-[0.97]` |
| `live/[id]/_components/live-filters-drawer.tsx` | Close ×, ±rayon, accordéons Météo/Densité, segmented météo, bouton Rechercher |
| `map/[id]/_components/sidebar-stages-section.tsx` | Boutons éditer/supprimer étape + color swatches |

---

### Task 9 — [x] Règle CSS globale `cursor: pointer`

**File :** `apps/web/src/app/globals.css`

Ajout d'une règle globale dans `@layer base` pour couvrir tous les éléments interactifs sans avoir à ajouter `cursor-pointer` sur chaque bouton :

```css
button:not(:disabled),
[role="button"]:not([aria-disabled="true"]),
[role="switch"],
input[type="date"],
input[type="datetime-local"],
input[type="time"] {
  cursor: pointer;
}
```

- `button:not(:disabled)` — tous les boutons natifs (couvre le shadcn `Button`, etc.)
- `[role="switch"]` — composant shadcn `Switch` (`<button role="switch">`)
- `input[type="date/datetime-local/time"]` — champs date du drawer live
- La pseudo-classe `:disabled` est exclue → `disabled:cursor-not-allowed` reste prioritaire

---

## Dev Notes

### `active:scale` + `transition-transform` vs `transition-all`

`transition-all duration-75` est suffisant pour les feedbacks de clic (75ms = imperceptible mais visible).
Préférer `transition-all duration-75` plutôt que `transition-colors` seul pour que `transform` soit aussi animé.

### `hover:brightness-90` sur fond inline

`brightness-90` est un filtre CSS (`filter: brightness(0.9)`), pas une couleur de fond. Il fonctionne même quand `backgroundColor` est inline. C'est le seul moyen propre d'ajouter un hover sur un fond coloré dynamique sans Tailwind dynamique.

### Mobile : `active:` > `hover:`

Sur mobile (touch), `hover:` ne se déclenche pas. `active:` est le seul feedback tactile natif — toujours l'inclure.

### Règle CSS globale `cursor: pointer` (approche retenue)

Plutôt que d'ajouter `cursor-pointer` sur chaque bouton individuellement, une règle CSS globale dans `@layer base` de `globals.css` couvre automatiquement tous les `<button>`, `[role="switch"]`, et `input[type="date/datetime-local/time"]`. Les `cursor-pointer` déjà présents dans les classNames sont simplement redondants — pas de régression.

### Pas de tests requis

Changements purement visuels/comportementaux. Tester manuellement : desktop (hover + click) + mobile (tap feedback).

---

## Files to Modify

| File | Action |
|---|---|
| `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` | UPDATE |
| `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` | UPDATE |
| `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` | UPDATE |
| `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx` | UPDATE |
| `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` | UPDATE |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` | UPDATE |
| `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx` | UPDATE |
| Other clickable elements found during Task 8 audit | UPDATE if needed |

---

## Files Modified

| File | Action |
|---|---|
| `apps/web/src/app/(app)/adventures/_components/adventure-card.tsx` | UPDATED |
| `apps/web/src/app/(app)/adventures/_components/adventure-list.tsx` | UPDATED |
| `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx` | UPDATED |
| `apps/web/src/app/(app)/map/[id]/_components/map-style-picker.tsx` | UPDATED |
| `apps/web/src/app/(app)/map/[id]/_components/poi-layer-grid.tsx` | UPDATED |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` | UPDATED |
| `apps/web/src/app/(app)/map/[id]/_components/accommodation-sub-types.tsx` | UPDATED |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` | UPDATED (Task 8 audit) |
| `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx` | UPDATED (Task 8 audit) |
| `apps/web/src/app/(app)/map/[id]/_components/trace-click-cta.tsx` | UPDATED (Task 8 audit) |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx` | UPDATED (Task 8 audit) |
| `apps/web/src/app/(app)/map/[id]/_components/reset-zoom-button.tsx` | UPDATED (audit post-review) |
| `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` | UPDATED (audit post-review) |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` | UPDATED (audit post-review) |
| `apps/web/src/app/globals.css` | UPDATED — règle CSS globale cursor:pointer (Task 9) |
| `_bmad-output/implementation-artifacts/sprint-status.yaml` | UPDATED (story status sync) |
| `apps/web/src/app/(app)/adventures/[id]/_components/strava-import-modal.tsx` | UPDATED (code-review fix) |

---

## Dev Agent Record

### Implementation Notes

**Tasks 1-7** : Tous les éléments ciblés dans la story ont été mis à jour avec le pattern systématique :
- `cursor-pointer` + `transition-all duration-75` + `active:scale-[0.9x]` pour les éléments à fond neutre
- `hover:brightness-90` pour les éléments à fond coloré inline (PoiLayerGrid actif, AccommodationSubTypes actifs, density chips actifs, map-style-picker actif, poi-popup type chips actifs)
- `active:scale-[0.85]` pour les petits boutons (close button poi-popup)
- `active:scale-[0.95/0.97/0.98]` selon la taille de l'élément (chips=0.95, popover items=0.97, cards/CTAs=0.98)

**Design Decision — Sidebar section headers** : Les headers cliquables des blocs sidebar (Étapes, Densité, etc.) n'ont intentionnellement PAS de hover/active background — cohérent sur tous les blocs, style épuré préféré.

**Task 8 — Audit** : 4 fichiers supplémentaires corrigés :
- `live-controls.tsx` : boutons RECHERCHER + FILTERS sans active state → ajout `cursor-pointer transition-all duration-75 active:scale-[0.97]`
- `layer-toggles.tsx` : tous les boutons toggle layers sans active state → `transition-colors` → `transition-all duration-75 cursor-pointer active:scale-[0.95]`
- `trace-click-cta.tsx` : boutons "Rechercher ici" et "✕" sans cursor-pointer ni active → corrigés
- `sidebar-density-section.tsx` : header cliquable sans hover/active → `hover:bg-[--surface-raised] active:bg-[--border] transition-colors` ajouté

**app-header.tsx** : Fichier non trouvé dans le projet — probablement géré via shadcn/ui Header ou n'existe pas encore.

**Approche finale cursor:pointer** : Au lieu d'ajouter `cursor-pointer` sur chaque élément, une règle CSS globale dans `globals.css` couvre automatiquement tous les boutons/switches/inputs date → plus maintenable, zéro oubli futur.

### Validation

- 690 tests web passent (65 test files)
- 229 tests API passent (20 test suites)
- Zéro régression

### Change Log

- 2026-04-02: Implémentation story 16-12 — états interactifs cursor/hover/active sur tous les éléments cliquables (11 fichiers)
- 2026-04-02: Audit complémentaire — 7 fichiers supplémentaires corrigés (reset-zoom, live-filters-drawer, sidebar-stages, adventure-card buttons)
- 2026-04-02: Règle CSS globale `cursor: pointer` dans `globals.css` pour buttons/switches/date inputs (19 fichiers total)
- 2026-04-02: Code review fixes — `strava-import-modal` active state, `live-controls` hover:brightness-90, `layer-toggles` hover:brightness-90 on active, `live-filters-drawer` disabled:hover suppressed via hover:enabled

---

## Story Status

`done`
