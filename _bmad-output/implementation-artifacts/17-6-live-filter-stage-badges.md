# Story 17.6: Badges des étapes dans le drawer filtres en live mode

Status: done

> **Ajouté 2026-04-09** — Sixième story de l'Epic 17 (Quality of Life). Objectif : afficher les cartouches (badges) des étapes directement dans le drawer des filtres en live mode, là où se trouve actuellement le simple toggle "Étapes". Réutilise le composant `<StageCard />` créé en 17.5.

## Story

As a **cyclist using live mode**,
I want to see the stage badges (cards) directly in the filter drawer,
So that I can quickly review my stages while adjusting my search settings, without opening a separate section.

## Acceptance Criteria

1. **Given** le drawer filtres est ouvert en live mode,
   **When** des étapes existent pour l'aventure,
   **Then** la section "Étapes" affiche les cartouches `<StageCard mode="live" />` au lieu du simple toggle Switch actuel.

2. **Given** la section "Étapes" dans le drawer filtres,
   **When** des étapes sont présentes,
   **Then** la section est un accordéon dépliable (comme Météo et Densité) avec :
   - Header : icône MapPin + "Étapes ({count})" + chevron + toggle Switch (couche carte) à droite
   - Contenu déplié : liste des `<StageCard mode="live" />` dans un conteneur scrollable `max-h-64 overflow-y-auto`

3. **Given** les cartouches étapes dans le drawer filtres,
   **When** le GPS a une position (currentKmOnRoute !== null),
   **Then** les étapes utilisent les mêmes styles que `LiveStagesSection` :
   - Étape courante : `border-2 border-primary bg-primary/5`
   - Étapes passées : `opacity-50`
   - ETA affiché pour les étapes non-passées

4. **Given** le toggle Switch "Étapes" dans la section accordéon,
   **When** l'utilisateur toggle le switch,
   **Then** le comportement est identique à l'actuel : `stageLayerActive` dans `useLiveStore` est mis à jour (affiche/masque les marqueurs d'étapes sur la carte).

5. **Given** le drawer filtres est ouvert et l'accordéon Étapes est déplié,
   **When** l'étape courante est identifiée (GPS),
   **Then** l'auto-scroll vers l'étape courante est déclenché (comme dans `LiveStagesSection`).

6. **Given** aucune étape n'existe pour l'aventure,
   **When** le drawer filtres est ouvert,
   **Then** la section "Étapes" reste un simple toggle Switch sans accordéon (pas de badges à afficher).

## Tasks / Subtasks

- [x] Task 1 — Transformer la section Étapes en accordéon avec StageCards (AC: #1, #2, #3)
  - [x] 1.1 — Modifier `live-filters-drawer.tsx` : remplacer le `div` simple par un accordéon dépliable (même pattern que Météo/Densité)
  - [x] 1.2 — Ajouter props `stages`, `currentKmOnRoute`, `speedKmh` à `LiveFiltersDrawerProps`
  - [x] 1.3 — Importer `StageCard` et `MapPin`, calculer `isPassed`, `isCurrent`, `etaFromCurrentMinutes` pour chaque étape
  - [x] 1.4 — Conteneur scrollable `max-h-64 overflow-y-auto` pour la liste de StageCards
  - [x] 1.5 — Header accordéon : icône MapPin + "Étapes ({count})" + toggle Switch (couche carte) + chevron

- [x] Task 2 — Passer les nouvelles props depuis la page live (AC: #1)
  - [x] 2.1 — Modifier `page.tsx` : passer `stages`, `currentKmOnRoute`, `speedKmh` à `<LiveFiltersDrawer />`

- [x] Task 3 — Auto-scroll vers l'étape courante (AC: #5)
  - [x] 3.1 — `useRef` + `useEffect` avec scrollIntoView (même pattern que `LiveStagesSection`)
  - [x] 3.2 — Guard jsdom : `currentRef.current?.scrollIntoView`

- [x] Task 4 — Fallback sans étapes (AC: #6)
  - [x] 4.1 — Condition : si `stages.length === 0`, garder le simple toggle Switch (pas d'accordéon)

- [x] Task 5 — Tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] 5.1 — Mettre à jour `live-filters-drawer.test.tsx` : tester l'accordéon Étapes, les StageCards, le toggle Switch, le cas sans étapes
  - [x] 5.2 — Vérifier non-régression des tests existants du drawer

## Dev Notes

### Architecture de la solution

```
# FICHIERS À MODIFIER
apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx  ← MODIFIER — transformer section Étapes en accordéon avec StageCards
apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx  ← MODIFIER — ajouter tests pour badges étapes
apps/web/src/app/(app)/live/[id]/page.tsx  ← MODIFIER — passer stages, currentKmOnRoute, speedKmh au drawer

# COMPOSANTS RÉUTILISÉS (NE PAS MODIFIER)
apps/web/src/components/shared/stage-card.tsx  ← RÉUTILISER — composant StageCard existant (story 17.5)
```

### Pattern accordéon existant (Météo / Densité)

Le drawer filtres a déjà deux sections en accordéon (Météo lignes 216-273 et Densité lignes 276-367). Le pattern est :
```tsx
<div className="rounded-xl border border-[--border] overflow-hidden mb-3">
  <button className="w-full flex items-center justify-between px-4 py-3 select-none cursor-pointer hover:bg-[--surface-raised] active:bg-[--border] transition-colors"
    onClick={() => setExpanded(v => !v)}>
    <div className="flex items-center gap-2">
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">Titre</span>
    </div>
    {expanded ? <ChevronUp /> : <ChevronDown />}
  </button>
  {expanded && (<div className="px-4 pb-4 flex flex-col gap-2">...</div>)}
</div>
```

**Particularité pour Étapes** : le toggle Switch (couche carte) doit rester dans le header de l'accordéon, entre le titre et le chevron. Cela permet de toggler la couche sans ouvrir l'accordéon.

### Calculs isPassed / isCurrent / ETA

Réutiliser exactement la même logique que `LiveStagesSection` (lignes 56-60) :
```typescript
const isPassed = currentKmOnRoute !== null && currentKmOnRoute >= stage.endKm
const isCurrent = currentKmOnRoute !== null && currentKmOnRoute >= stage.startKm && currentKmOnRoute < stage.endKm
const hasPosition = currentKmOnRoute !== null && speedKmh > 0
const etaFromCurrentMinutes = hasPosition && (isCurrent || !isPassed)
  ? Math.round(((stage.endKm - currentKmOnRoute!) / speedKmh) * 60)
  : null
```

### Props à ajouter à LiveFiltersDrawerProps

```typescript
interface LiveFiltersDrawerProps {
  // ... existant ...
  stages: AdventureStageResponse[]
  currentKmOnRoute: number | null
  speedKmh: number
}
```

### Intégration dans page.tsx

`stages` et `currentKmOnRoute` sont déjà disponibles dans la page live :
- `stages` : ligne 121 — `const { stages } = useStages(adventureId)`
- `currentKmOnRoute` : ligne 192 — `const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)`
- `speedKmh` : ligne 193 — `const speedKmh = useLiveStore((s) => s.speedKmh)`

Il suffit d'ajouter ces props à l'appel `<LiveFiltersDrawer />` (ligne 525).

### Imports nécessaires dans live-filters-drawer.tsx

```typescript
import { MapPin } from 'lucide-react'  // déjà importable, à ajouter
import type { AdventureStageResponse } from '@ridenrest/shared'
import { StageCard } from '@/components/shared/stage-card'
```

Note : `MapPin` n'est PAS encore importé dans le drawer (seulement dans `LiveStagesSection`). L'ajouter aux imports lucide.

### Section actuelle à transformer (lignes 204-213)

```tsx
{/* Section: Étapes — immediate toggle (no Apply) */}
<div className="flex items-center justify-between mb-3">
  <p className="text-sm font-semibold text-foreground">Étapes</p>
  <Switch
    checked={stageLayerActive}
    onCheckedChange={setStageLayerActive}
    aria-label="Afficher les étapes"
    data-testid="switch-stages"
  />
</div>
```

À remplacer par un accordéon si `stages.length > 0`, sinon garder le toggle simple.

### Rôle du toggle Switch

Le toggle Switch contrôle `stageLayerActive` dans `useLiveStore` — il affiche/masque les marqueurs d'étapes **sur la carte** (layer MapLibre). Il NE contrôle PAS la visibilité des StageCards dans le drawer. Les StageCards sont toujours visibles quand l'accordéon est déplié.

### État accordéon

Ajouter un `useState` local :
```typescript
const [stagesExpanded, setStagesExpanded] = useState(false)
```

### Auto-scroll

Même pattern que `LiveStagesSection` :
```typescript
const currentStageRef = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (stagesExpanded && currentStageRef.current?.scrollIntoView) {
    currentStageRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}, [stagesExpanded, currentKmOnRoute])
```

### Previous story intelligence (17.5)

- StageCard composant partagé créé et validé en 17.5 — 16 tests passent
- Layout 3 lignes : dot+nom / km+D+·D- / ETA (live mode)
- Live mode : `isCurrent` → bordure accent, `isPassed` → opacity-50
- `scrollIntoView` nécessite guard optional chaining pour jsdom
- Pas de boutons edit/delete en live mode (masqués automatiquement par `mode="live"`)

### Git intelligence (5 derniers commits)

- `8816225` — Story 17.4 : D- partout (API + DB + frontend) — `elevationLossM` disponible
- `194945c` — Story 17.3 : elevation profile overlay
- `3ecf683` — Story 17.2 : multi-upload GPX
- `273b5c9` — Story 17.1 : versioning + release notes
- Patterns confirmés : Vitest + @testing-library/react, composants dans `_components/`, kebab-case

### Attention

- **NE PAS modifier `stage-card.tsx`** — le composant est déjà complet et testé
- **NE PAS modifier `live-stages-section.tsx`** — la section flottante reste indépendante
- **NE PAS supprimer le toggle Switch** — il reste fonctionnel pour la couche carte
- **Préserver les data-testid existants** (`switch-stages`, etc.)
- **Le drawer est scrollable** (`max-h-[95vh] overflow-y-auto`) — les StageCards s'intègrent dans ce scroll

### References

- [Source: apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx:204-213] — Section Étapes actuelle (toggle simple)
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx:216-273] — Pattern accordéon Météo (à reproduire)
- [Source: apps/web/src/app/(app)/live/[id]/_components/live-stages-section.tsx:56-60] — Calculs isPassed/isCurrent/ETA
- [Source: apps/web/src/components/shared/stage-card.tsx] — Composant StageCard réutilisable
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:121] — `useStages(adventureId)` déjà appelé
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:192-193] — `currentKmOnRoute`, `speedKmh` disponibles
- [Source: apps/web/src/app/(app)/live/[id]/page.tsx:525-533] — Appel `<LiveFiltersDrawer />` à enrichir

### Review Findings

- [x] [Review][Decision] ETA affichée pour toutes les étapes futures — comportement voulu, dismissed.
- [x] [Review][Decision] `LiveStagesSection` ajoutée dans `page.tsx` sans AC 17.6 — supprimé de `page.tsx`, import retiré (D2:b).
- [x] [Review][Decision] Auto-scroll non relancé à la réouverture du drawer — `open` ajouté dans les deps du `useEffect` (D3:a). [live-filters-drawer.tsx:68-74]
- [x] [Review][Patch] `max-h-90` hors échelle Tailwind dans `SidebarStagesSection` — remplacé par `max-h-96`. [sidebar-stages-section.tsx:237]
- [x] [Review][Patch] Barre Espace sans `preventDefault` dans `LiveStagesSection` — `e.preventDefault()` ajouté dans `onKeyDown`. [live-stages-section.tsx:40-41]
- [x] [Review][Defer] Scroll redéclenché à chaque tick GPS si accordéon ouvert — `useEffect([stagesExpanded, currentKmOnRoute])` appelle `scrollIntoView` à chaque mise à jour GPS ; peut être agaçant en navigation active. [live-filters-drawer.tsx:68-74, live-stages-section.tsx:20-24] — deferred, pre-existing pattern from spec
- [x] [Review][Defer] ETA NaN avec données corrompues — Si `stage.endKm < currentKmOnRoute` pour une étape « non passée » (donnée incohérente), `etaFromCurrentMinutes` peut être NaN, `NaN != null` est vrai, et `formatEta(NaN)` affiche `—` avec la ligne ETA visible. [stage-card.tsx:85-86] — deferred, pre-existing edge case
- [x] [Review][Defer] `currentKmOnRoute` hors plage sans clamp dans le store — valeur négative ou > longueur trace possible ; ETA aberrante. Pré-existant, hors scope 17.6. — deferred, pre-existing
- [x] [Review][Defer] Boutons edit/delete sans `type="button"` dans `StageCard` — si un jour rendu dans un `<form>`, soumission involontaire. [stage-card.tsx] — deferred, pre-existing pattern
- [x] [Review][Defer] `Switch` dans un `button` — pattern accessibilité fragile — clavier/lecteur d'écran : le Switch est enfant d'un `button`, interaction complexe. Fonctionnel mais non idéal. [live-filters-drawer.tsx:~236] — deferred, design decision

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

Aucun problème rencontré.

### Completion Notes List

- Transformé la section Étapes du drawer filtres live en accordéon dépliable avec `<StageCard mode="live" />`
- Header accordéon : icône MapPin + "Étapes ({count})" + toggle Switch (couche carte, `stopPropagation` pour éviter expand) + chevron
- Calculs `isPassed`, `isCurrent`, `etaFromCurrentMinutes` identiques à `LiveStagesSection`
- Conteneur scrollable `max-h-64 overflow-y-auto` pour la liste de StageCards
- Auto-scroll vers l'étape courante via `useRef` + `useEffect` avec guard `scrollIntoView` pour jsdom
- Fallback : si `stages.length === 0`, simple toggle Switch sans accordéon (comportement original préservé)
- Props `stages`, `currentKmOnRoute`, `liveSpeedKmh` passées depuis `page.tsx`
- 13 nouveaux tests + 30 tests existants OK = 43 tests drawer, 987 tests totaux passent
- Prop nommée `liveSpeedKmh` (au lieu de `speedKmh`) pour éviter collision avec le `speedKmh` local du store déjà utilisé dans le drawer

### Change Log

- 2026-04-09: Story 17.6 implémentée — badges étapes dans drawer filtres live mode

### File List

- apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx (MODIFIÉ)
- apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx (MODIFIÉ)
- apps/web/src/app/(app)/live/[id]/page.tsx (MODIFIÉ)
