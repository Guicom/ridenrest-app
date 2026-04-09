# Story 17.5: Refonte des cartouches étapes (planning + live)

Status: ready-for-dev

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

- [ ] Task 1 — Créer `<StageCard />` (AC: #1, #2, #6)
  - [ ] 1.1 — Créer `apps/web/src/components/shared/stage-card.tsx`
  - [ ] 1.2 — Props interface :
    ```typescript
    interface StageCardProps {
      stage: AdventureStageResponse
      mode: 'planning' | 'live'
      /** Live mode: is this the current stage based on GPS? */
      isCurrent?: boolean
      /** Live mode: is this stage already passed? */
      isPassed?: boolean
      /** Live mode: ETA in minutes from current position to stage end */
      etaFromCurrentMinutes?: number | null
      /** Weather badge visibility */
      weatherActive?: boolean
      /** Global departure time fallback */
      departureTime?: string | null
      /** Speed for weather computation */
      speedKmh?: number
      /** Callbacks (planning only) */
      onEdit?: (stage: AdventureStageResponse) => void
      onDelete?: (stage: AdventureStageResponse) => void
    }
    ```
  - [ ] 1.3 — Layout 3 lignes :
    - **Ligne 1** : `<div className="flex items-center gap-2">` → dot couleur (h-3 w-3 rounded-full) + nom (flex-1 truncate text-sm font-medium) + boutons si `mode === 'planning'` (Pencil h-3 w-3, Trash2 h-3 w-3)
    - **Ligne 2** : `<div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-5">` (pl-5 = aligné sous le nom, après le dot) → `{distanceKm.toFixed(1)} km` + `·` + `↑ {elevationGainM} m` + `·` + `↓ {elevationLossM} m` (conditionné sur non-null) — OU `↑ — · ↓ —` si pas de données
    - **Ligne 3** (conditionnel) : `<div className="text-xs text-muted-foreground pl-5">` → date/heure formatée (si `departureTime` défini) ou ETA en live mode + badge météo inline
  - [ ] 1.4 — Styles conditionnels live mode :
    - `isCurrent` → `border-2 border-primary bg-primary/5` (bordure accent + fond léger)
    - `isPassed` → `opacity-50`
    - Ni l'un ni l'autre → style standard
  - [ ] 1.5 — Ré-exporter les `OfflineTooltipWrapper` wrappers autour des boutons edit/delete (pattern existant dans sidebar-stages-section.tsx)

- [ ] Task 2 — Formater la date/heure d'étape (AC: #1, #4)
  - [ ] 2.1 — Utilitaire de formatage (dans stage-card.tsx ou util partagé) : `departureTime` ISO → "Jeu 15 avril · 07:30" en français — utiliser `Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })`
  - [ ] 2.2 — En live mode : afficher ETA au lieu de l'heure de départ — format : `~2h15 restantes` ou `~45 min` (basé sur `etaFromCurrentMinutes`)

### Phase 2 — Intégration planning mode

- [ ] Task 3 — Remplacer le rendering inline dans `sidebar-stages-section.tsx` (AC: #1, #2, #3, #5)
  - [ ] 3.1 — Importer `StageCard` dans `sidebar-stages-section.tsx`
  - [ ] 3.2 — Remplacer le contenu de la boucle `stages.map()` (lignes 239-297) par `<StageCard stage={stage} mode="planning" ... />`
  - [ ] 3.3 — Passer les callbacks `onEdit={handleEditOpen}` et `onDelete={setDeleteTarget}`
  - [ ] 3.4 — Conserver le `<StageDepartureInput />` APRÈS le `<StageCard />` dans le container (c'est un composant séparé dépliable)
  - [ ] 3.5 — Passer `weatherActive`, `departureTime`, `speedKmh` comme props
  - [ ] 3.6 — Le container div parent (`flex flex-col gap-1 rounded-md border p-2`) est désormais le contenu de `<StageCard />` — ne PAS doubler l'enveloppe

### Phase 3 — Intégration live mode

- [ ] Task 4 — Créer une section "Étapes" dans le live mode (AC: #4, #6)
  - [ ] 4.1 — Créer `apps/web/src/app/(app)/live/[id]/_components/live-stages-section.tsx`
  - [ ] 4.2 — Props : `stages: AdventureStageResponse[]`, `currentKmOnRoute: number | null`, `speedKmh: number`
  - [ ] 4.3 — Section dépliable avec header "Étapes ({count})" et icône ChevronDown/ChevronUp — état plié/déplié dans useState (plié par défaut)
  - [ ] 4.4 — Pour chaque étape, calculer :
    - `isPassed` : `currentKmOnRoute !== null && currentKmOnRoute >= stage.endKm`
    - `isCurrent` : `currentKmOnRoute !== null && currentKmOnRoute >= stage.startKm && currentKmOnRoute < stage.endKm`
    - `etaFromCurrentMinutes` : `isCurrent || !isPassed ? Math.round(((stage.endKm - (currentKmOnRoute ?? stage.startKm)) / speedKmh) * 60) : null`
  - [ ] 4.5 — Rendu : `<StageCard stage={stage} mode="live" isCurrent={isCurrent} isPassed={isPassed} etaFromCurrentMinutes={eta} />`
  - [ ] 4.6 — Scroll automatique vers l'étape courante quand la section est dépliée (via `useRef` + `scrollIntoView`)

- [ ] Task 5 — Intégrer `<LiveStagesSection />` dans la page live (AC: #4)
  - [ ] 5.1 — Dans `apps/web/src/app/(app)/live/[id]/page.tsx`, importer `LiveStagesSection`
  - [ ] 5.2 — Position : entre `ElevationStrip` (ligne 396-404) et `LiveControls` (ligne 407-420) — ou dans le filters drawer comme section supplémentaire
  - [ ] 5.3 — **Décision d'emplacement recommandée** : ajouter comme section au-dessus de `LiveControls`, visible quand `stages.length > 0 && isLiveModeActive` — le drawer filters est déjà chargé et la section dépliable ne prend pas de place par défaut
  - [ ] 5.4 — Passer `stages={stages}`, `currentKmOnRoute={currentKmOnRoute}`, `speedKmh={speedKmh}`
  - [ ] 5.5 — Attention : `stages` est déjà fetchée dans la page live (ligne 120 : `const { stages } = useStages(adventureId)`) et `currentKmOnRoute` depuis `useLiveStore` (ligne 191)

### Phase 4 — Tests

- [ ] Task 6 — Tests du composant StageCard (AC: #1, #4, #6)
  - [ ] 6.1 — `apps/web/src/components/shared/__tests__/stage-card.test.tsx` :
    - Planning mode : affiche les 3 lignes, boutons edit/delete visibles
    - Planning mode sans D- : affiche "↑ — · ↓ —"
    - Planning mode sans departureTime : ligne 3 absente
    - Live mode : boutons masqués
    - Live mode isCurrent : classe bordure accent
    - Live mode isPassed : classe opacity-50
    - Live mode ETA : affiche le temps restant formaté
  - [ ] 6.2 — Vérifier non-régression sur les tests existants de `sidebar-stages-section.tsx`

- [ ] Task 7 — Test de LiveStagesSection (AC: #4)
  - [ ] 7.1 — `apps/web/src/app/(app)/live/[id]/_components/__tests__/live-stages-section.test.tsx` :
    - Section dépliable : initialement pliée, affiche les stages quand dépliée
    - Highlight étape courante : vérifie la classe CSS
    - Étapes passées : vérifie l'opacité réduite
    - ETA calcul : vérifie le formatage

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

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
