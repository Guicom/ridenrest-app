# Story 17.5: Refonte des cartouches étapes (planning + live)

Status: done

> **Ajouté 2026-04-09** — Cinquième et dernière story de l'Epic 17 (Quality of Life). Objectif : restructurer les cartouches étapes en layout 3 lignes dans la sidebar planning, puis ajouter les mêmes cartouches en live mode avec section dépliable + highlight de l'étape courante. Dépend de 17.4 (D- disponible).

## Story

As a **cyclist reviewing stages in planning or live mode**,
I want stage cards with a clearer layout and better information hierarchy,
So that I can quickly scan stage details without visual clutter.

## Acceptance Criteria

1. **Given** une cartouche étape en planning mode,
   **When** les données de l'étape sont affichées,
   **Then** le layout suit une structure 3 lignes :
   - **Ligne 1** : dot couleur + nom tronqué (`truncate`) — à droite : boutons ✏️ et 🗑️ compacts
   - **Ligne 2** : km + D+ · D- (e.g. "42.5 km · ↑ 850 m · ↓ 720 m") — ou "↑ — · ↓ —" si pas de données
   - **Ligne 3** : date/heure de départ (e.g. "Jeu 15 avril · 07:30") — absente si non définie

2. **Given** le layout actuel des cartouches planning,
   **When** comparé au nouveau design,
   **Then** les changements sont :
   - Nom promu en ligne 1 pleine largeur (plus mélangé avec les stats)
   - Boutons actions (edit, delete) déplacés à droite de la ligne 1 (plus en fin de ligne mixte)
   - Distance + élévation groupés sur ligne 2
   - Date/heure sur ligne 3 (info moins prioritaire)
   - Dot couleur toujours en début de ligne 1

3. **Given** un badge météo existe par étape,
   **When** des données météo sont disponibles,
   **Then** le badge est affiché inline sur ligne 3 après la date (ou sur une 4e ligne si l'espace est insuffisant en mobile).

4. **Given** le live mode n'a actuellement AUCUNE cartouche étape (seulement des marqueurs carte),
   **When** des étapes existent pour l'aventure,
   **Then** une section dépliable "Étapes" est ajoutée au live mode UI (dans le bottom drawer ou comme panneau), avec le même layout 3 lignes mais :
   - Boutons actions (edit, delete) masqués (lecture seule)
   - L'étape courante (basée sur la position GPS) est visuellement mise en avant (e.g. bordure accent, fond surlignée)
   - Les étapes déjà passées sont estompées (opacité réduite)
   - ETA depuis la position courante affiché au lieu de l'heure de départ absolue

5. **Given** les cartouches en planning mode,
   **When** rendu sur mobile (< 768px),
   **Then** le layout reste lisible — ligne 1 tronque le nom, boutons compacts, lignes 2-3 wrap gracieusement.

6. **Given** la refonte est appliquée,
   **When** les modes planning et live sont comparés,
   **Then** les deux utilisent le même composant de base (`<StageCard />`) avec un prop `mode: 'planning' | 'live'` contrôlant la visibilité des actions et le comportement de highlight.

## Tasks / Subtasks

### Phase 1 — Composant partagé `<StageCard />`

- [x] Task 1 — Créer `<StageCard />` (AC: #1, #2, #6)
  - [x] 1.1 — Créer `apps/web/src/components/shared/stage-card.tsx`
  - [x] 1.2 — Props interface (avec ajout `stagesHaveDepartures` pour contrôle météo)
  - [x] 1.3 — Layout 3 lignes (dot+nom+boutons / km+D+·D- / date ou ETA + météo)
  - [x] 1.4 — Styles conditionnels live mode (isCurrent → border-primary, isPassed → opacity-50)
  - [x] 1.5 — OfflineTooltipWrapper autour des boutons edit/delete

- [x] Task 2 — Formater la date/heure d'étape (AC: #1, #4)
  - [x] 2.1 — `formatStageDeparture()` dans stage-card.tsx : ISO → "jeu. 15 avril · 07:30"
  - [x] 2.2 — `formatEta()` : `~2h15` ou `~45 min`

### Phase 2 — Intégration planning mode

- [x] Task 3 — Remplacer le rendering inline dans `sidebar-stages-section.tsx` (AC: #1, #2, #3, #5)
  - [x] 3.1 — Import `StageCard`, suppression imports inutiles (Pencil, Trash2)
  - [x] 3.2 — Remplacement boucle `stages.map()` par `<StageCard mode="planning" />`
  - [x] 3.3 — Callbacks `onEdit={handleEditOpen}` et `onDelete={setDeleteTarget}`
  - [x] 3.4 — `<StageDepartureInput />` conservé après `<StageCard />`
  - [x] 3.5 — Props weatherActive, stagesHaveDepartures, departureTime, speedKmh passés
  - [x] 3.6 — Container géré par StageCard, pas de doublon

### Phase 3 — Intégration live mode

- [x] Task 4 — Créer une section "Étapes" dans le live mode (AC: #4, #6)
  - [x] 4.1 — Créer `live-stages-section.tsx`
  - [x] 4.2 — Props stages, currentKmOnRoute, speedKmh
  - [x] 4.3 — Section dépliable "Étapes ({count})", pliée par défaut
  - [x] 4.4 — Calculs isPassed, isCurrent, etaFromCurrentMinutes
  - [x] 4.5 — Rendu via `<StageCard mode="live" />`
  - [x] 4.6 — Auto-scroll vers étape courante (scrollIntoView avec guard jsdom)

- [x] Task 5 — Intégrer `<LiveStagesSection />` dans la page live (AC: #4)
  - [x] 5.1 — Import LiveStagesSection dans page.tsx
  - [x] 5.2 — Position : entre ElevationStrip et LiveControls (absolute bottom-[88px])
  - [x] 5.3 — Condition : `stages.length > 0 && isLiveModeActive`
  - [x] 5.4 — Props stages, currentKmOnRoute, speedKmh passés
  - [x] 5.5 — Réutilisation hooks existants (useStages, useLiveStore)

### Phase 4 — Tests

- [x] Task 6 — Tests du composant StageCard (AC: #1, #4, #6)
  - [x] 6.1 — `stage-card.test.tsx` : 16 tests (planning 3 lignes, D+/D- null, edit/delete, weather badge, live isCurrent/isPassed/ETA)
  - [x] 6.2 — Non-régression sidebar-stages-section.test.tsx (9 tests pass, texte attendu mis à jour pour nouveau layout)

- [x] Task 7 — Test de LiveStagesSection (AC: #4)
  - [x] 7.1 — `live-stages-section.test.tsx` : 7 tests (collapsed par défaut, expand, highlight, opacity, ETA, no edit/delete)

### Review Findings

**`decision-needed` :**
- [x] [Review][Decision] AC3 — Badge météo sur cartouche étape — décision : pas de météo sur les cartouches (layer carte météo suffisant) → déféré
- [x] [Review][Decision] Contrainte « StageDepartureInput séparé » — `StageDepartureInput` en `children` de `StageCard` est voulu → accepted as-is
- [x] [Review][Decision] AC3/AC4 — Badge météo absent en live mode — décision : voulu, pas de météo en live sur cartouches → déféré

**`patch` :**
- [x] [Review][Patch] Violation contrainte scroll planning : `max-h-90` au lieu de `max-h-64` [sidebar-stages-section.tsx:237] — voulu (demandé par Guillaume)
- [x] [Review][Patch] ETA affiché pour toutes les étapes quand `currentKmOnRoute === null` — `!isPassed` est toujours vrai → branche ETA toujours activée, calcul via `stage.startKm` trompeur [live-stages-section.tsx:51-55]
- [x] [Review][Patch] Division par zéro si `speedKmh === 0` → Infinity/NaN dans l'ETA [live-stages-section.tsx:54]
- [x] [Review][Patch] `formatStageDeparture` ne valide pas l'ISO → "Invalid Date" en cas de chaîne malformée [stage-card.tsx:9-16]
- [x] [Review][Patch] `formatEta` ne gère pas `NaN`, `Infinity` ou minutes négatives → libellés dégradés [stage-card.tsx:19-26]
- [x] [Review][Patch] Header live non accessible : `div` cliquable sans `role="button"`, `tabIndex`, `aria-expanded`, ni gestion clavier [live-stages-section.tsx:33-45]
- [x] [Review][Patch] Auto-scroll vers l'étape courante ne se ré-active pas si `currentKmOnRoute` change alors que la section est déjà ouverte [live-stages-section.tsx:18-23]
- [x] [Review][Patch] AC5 — Ligne 2 (`flex` sans `flex-wrap`) peut déborder sur petits écrans [stage-card.tsx:125]

**`defer` (pré-existant) :**
- [x] [Review][Defer] Boutons edit/delete visibles sans `onEdit`/`onDelete` (actions sans effet) [stage-card.tsx:98-121] — deferred, pré-existant / design pattern du composant
- [x] [Review][Defer] Libellés `fr-FR` en dur — incohérent si app devient multilingue — deferred, hors scope story

## Dev Notes

### Architecture de la solution

```
# NOUVEAU COMPOSANT PARTAGÉ
apps/web/src/components/shared/stage-card.tsx         ← CRÉER — composant réutilisable planning + live

# PLANNING MODE — Refactoring inline → StageCard
apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx  ← MODIFIER — remplacer lignes 239-289 par <StageCard />

# LIVE MODE — Nouvelle section
apps/web/src/app/(app)/live/[id]/_components/live-stages-section.tsx    ← CRÉER — section dépliable avec StageCard list
apps/web/src/app/(app)/live/[id]/page.tsx                               ← MODIFIER — intégrer LiveStagesSection
```

### Dépendance sur Story 17.4 (D-)

Cette story dépend de 17.4 qui ajoute `elevationLossM` à `AdventureStageResponse`. Si 17.4 n'est pas encore implémentée :
- Le type `AdventureStageResponse` n'aura PAS encore `elevationLossM`
- Le dev doit coder de manière défensive : `stage.elevationLossM` avec optional chaining ou type assertion
- Afficher `↓ —` si le champ n'existe pas / est null
- Quand 17.4 sera mergée, les cartouches afficheront automatiquement le D-

**Idéal** : implémenter 17.4 d'abord, puis 17.5.

### Pattern existant : sidebar-stages-section.tsx (lignes 239-297)

Le code actuel à refactorer est un `stages.map()` inline dans `sidebar-stages-section.tsx` (lignes 236-299). Le rendering actuel met TOUT sur une seule ligne horizontale (dot + nom + km + D+ + ETA + météo + edit + delete) — ce qui est tassé et difficile à lire, surtout sur mobile.

Le nouveau layout déplace les infos sur 3 lignes verticales pour une meilleure lisibilité.

**Ce qui doit être préservé du code existant :**
- `data-testid={`stage-item-${stage.id}`}` sur le container
- `data-testid={`edit-stage-${stage.id}`}` sur le bouton edit
- `data-testid={`delete-stage-${stage.id}`}` sur le bouton delete
- `<StageDepartureInput />` reste un composant séparé APRÈS le StageCard dans le container parent
- `OfflineTooltipWrapper` autour des boutons (pattern existant pour la gestion offline)
- `StageWeatherBadge` avec props `stageId`, `stageDepartureTime`, `departureTime`, `speedKmh`

### Live mode — Données disponibles

Le hook `useStages(adventureId)` est déjà appelé dans `page.tsx:120` et retourne `stages: AdventureStageResponse[]`. Les données sont donc disponibles sans fetch supplémentaire.

Le `currentKmOnRoute` (position GPS snappée sur la trace) est dans `useLiveStore` (ligne 191 de page.tsx). C'est ce qui permet de déterminer :
- L'étape courante : `stage.startKm <= currentKmOnRoute < stage.endKm`
- Les étapes passées : `currentKmOnRoute >= stage.endKm`
- L'ETA : `(stage.endKm - currentKmOnRoute) / speedKmh * 60`

### Live mode — Emplacement de la section Étapes

**Option recommandée** : section dépliable au-dessus de `LiveControls`, entre l'ElevationStrip et les contrôles de recherche. Position : `absolute bottom-[148px]` (au-dessus des 88px de LiveControls) — ou intégrer dans le drawer filters comme une section supplémentaire.

**Alternative** : dans le `LiveFiltersDrawer` comme une section en haut du drawer (avant les filtres POI). Le drawer existe déjà et est scrollable.

Le dev devra choisir selon le rendu — la section dépliable pliée par défaut prend peu de place et peut s'intégrer au-dessus de LiveControls.

### Mobile — Responsive

Le composant `<StageCard />` doit fonctionner dans deux contextes :
- **Planning sidebar** : largeur ~300px (sidebar), scroll vertical `max-h-64 overflow-y-auto`
- **Live mode** : pleine largeur mobile (ou dans un drawer)

Le layout 3 lignes verticales fonctionne naturellement dans les deux cas. Le `truncate` sur le nom (ligne 1) gère les noms longs.

### Formatage date/heure

Utiliser `Intl.DateTimeFormat` natif (pas de lib externe) :
```typescript
const fmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short', day: 'numeric', month: 'long',
  hour: '2-digit', minute: '2-digit'
})
// "jeu. 15 avril · 07:30" → ajuster le format si nécessaire
```

### ETA en live mode

Calcul simple basé sur la vitesse constante :
```typescript
const remainingKm = stage.endKm - (currentKmOnRoute ?? stage.startKm)
const etaMinutes = Math.round((remainingKm / speedKmh) * 60)
```

Format : `~{h}h{mm}` si > 60 min, sinon `~{mm} min`.

### `elevationLossM` — Champ optionnel

Si 17.4 n'est pas encore implémentée, `AdventureStageResponse` n'aura pas `elevationLossM`. Le dev doit :
1. Accéder au champ via `(stage as any).elevationLossM` ou optional chaining si le type n'est pas encore mis à jour
2. OU mieux : attendre que 17.4 soit mergée et le type mis à jour
3. Dans tous les cas, gérer `null` / `undefined` → afficher "↓ —"

### Imports clés

```typescript
// StageCard
import { Pencil, Trash2, TrendingUp, TrendingDown } from 'lucide-react'
import type { AdventureStageResponse } from '@ridenrest/shared'
import { StageWeatherBadge } from '@/app/(app)/map/[id]/_components/stage-weather-badge'
import { OfflineTooltipWrapper } from '@/components/shared/offline-tooltip-wrapper'

// LiveStagesSection
import { ChevronDown, ChevronUp, MapPin } from 'lucide-react'
import { useLiveStore } from '@/stores/live.store'
```

### Previous story intelligence (17.4)

- Story 17.4 est `ready-for-dev` — pas encore implémentée au moment de la création de 17.5
- 17.4 ajoute `elevationLossM: number | null` à `AdventureStageResponse` — nécessaire pour l'affichage D- sur ligne 2
- Le dev de 17.5 devrait vérifier si 17.4 est implémentée avant de commencer
- Si 17.4 pas encore faite : utiliser `(stage as any).elevationLossM ?? null` et gérer le cas null

### Git intelligence (5 derniers commits)

- `194945c` — Story 17.3 : elevation profile overlay (Recharts, frontend pur)
- `3ecf683` — Story 17.2 : multi-upload GPX (dialog pattern, tests Vitest)
- `273b5c9` — Story 17.1 : versioning + release notes (build-time parsing, localStorage)
- Patterns confirmés : co-located tests (`__tests__/` folder), composants partagés dans `components/shared/`, Vitest + @testing-library/react
- Convention de nommage : kebab-case pour les fichiers (`stage-card.tsx`, `live-stages-section.tsx`)

### Attention

- **NE PAS supprimer `<StageDepartureInput />`** — ce composant dépliable reste séparé du `<StageCard />`, rendu après lui dans le container parent
- **Préserver les data-testid** existants pour les tests E2E
- **`OfflineTooltipWrapper`** est obligatoire autour des boutons edit/delete (gestion mode hors-ligne)
- **Le scroll `max-h-64 overflow-y-auto`** sur le container stages en planning mode doit être préservé
- **`stagesHaveDepartures`** flag dans sidebar-stages-section.tsx (ligne 262) contrôle la visibilité du badge météo — le conserver dans le nouveau composant
- **NE PAS modifier `live-controls.tsx`** — la section stages est un composant séparé positionné au-dessus ou à côté
- **NE PAS modifier `live-map-canvas.tsx`** — les marqueurs map restent inchangés
- **Live mode : section pliée par défaut** — ne doit pas encombrer l'interface au démarrage

### References

- [Source: apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:236-299] — Code actuel à refactorer (stages.map inline)
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:120] — `useStages(adventureId)` déjà appelé en live mode
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:191] — `currentKmOnRoute` depuis `useLiveStore`
- [Source: apps/web/src/stores/live.store.ts:9,51] — `currentKmOnRoute` state + setter
- [Source: packages/shared/src/types/adventure.types.ts:68-82] — `AdventureStageResponse` interface
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx:16-33] — `LiveControlsProps` interface
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:396-420] — Zone d'intégration pour LiveStagesSection
- [Source: _bmad-output/planning-artifacts/epics.md:3452-3501] — AC et notes techniques de l'epic
- [Source: _bmad-output/implementation-artifacts/17-4-elevation-loss-d-minus-everywhere.md] — Story 17.4 (dépendance D-)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

- scrollIntoView not available in jsdom → guard with optional chaining `currentRef.current?.scrollIntoView`

### Completion Notes List

- StageCard composant partagé créé avec layout 3 lignes (dot+nom+boutons / km+D+·D- / date|ETA+météo)
- Planning mode : boutons edit/delete avec OfflineTooltipWrapper, weather badge conditionnel
- Live mode : isCurrent → bordure accent, isPassed → opacity-50, ETA formaté (~Xh ou ~X min)
- sidebar-stages-section.tsx refactoré : inline rendering remplacé par StageCard, imports nettoyés
- LiveStagesSection créée : section dépliable (pliée par défaut), calculs isPassed/isCurrent/ETA, auto-scroll
- Intégrée dans live page entre ElevationStrip et LiveControls, conditionnée sur stages.length > 0
- 16 tests StageCard + 7 tests LiveStagesSection + 9 tests sidebar existants mis à jour (974 tests total, 0 fail)
- Aucune erreur TypeScript introduite (erreurs pré-existantes dans d'autres fichiers)

### Change Log

- 2026-04-09: Story 17.5 implémentée — refonte cartouches étapes 3 lignes + section live mode

### File List

- `apps/web/src/components/shared/stage-card.tsx` — CRÉÉ — composant StageCard partagé planning+live
- `apps/web/src/components/shared/stage-card.test.tsx` — CRÉÉ — 16 tests unitaires
- `apps/web/src/app/(app)/live/[id]/_components/live-stages-section.tsx` — CRÉÉ — section dépliable live
- `apps/web/src/app/(app)/live/[id]/_components/live-stages-section.test.tsx` — CRÉÉ — 7 tests unitaires
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — MODIFIÉ — refactoré vers StageCard
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx` — MODIFIÉ — texte attendu mis à jour
- `apps/web/src/app/(app)/live/[id]/page.tsx` — MODIFIÉ — intégration LiveStagesSection
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — MODIFIÉ — status in-progress→review
