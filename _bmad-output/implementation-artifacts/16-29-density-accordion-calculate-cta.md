# Story 16.29: CTA « Calculer la densité » dans l'accordéon densité (planning + live)

Status: done

## Story

En tant qu'utilisateur consultant le mode planning ou live d'une aventure,
je veux voir un bouton « Calculer la densité » avec la popin info/catégories directement dans l'accordéon Densité quand l'analyse n'a pas encore été faite,
afin de lancer l'analyse sans devoir revenir sur la page détail de l'aventure.

## Acceptance Criteria

1. **Planning mode — `SidebarDensitySection`** : quand `densityStatus === 'idle'` OU `(densityStatus === 'success' && densityStale)`, le contenu de l'accordéon (toggle + légende) est **remplacé** par un CTA identique à celui de la page détail aventure : bouton « Calculer la densité » + texte explicatif + ouverture de `DensityCategoryDialog` au clic.
2. **Live mode — accordéon densité dans `LiveFiltersDrawer`** : même comportement — quand la densité n'est pas calculée/stale, le contenu de l'accordéon est remplacé par le CTA + popin.
3. **Quand `densityStatus` est `'pending'` ou `'processing'`** : le contenu de l'accordéon affiche un état « Analyse en cours… X% » (progress issu de `useDensity`), le bouton est désactivé.
4. **Quand `densityStatus === 'success'` et `!densityStale`** : le contenu de l'accordéon affiche le toggle + légende actuel (comportement inchangé).
5. **La `DensityCategoryDialog`** existante est réutilisée telle quelle — aucune duplication.
6. **Le `SidebarDensityCta`** (composant séparé sous les étapes en planning mode) est **supprimé** — le CTA est désormais intégré dans l'accordéon, il n'y a plus besoin d'un CTA séparé en bas de sidebar.
7. Le hook `useDensity(adventureId)` est utilisé dans les deux composants pour lire le statut.
8. Les segments doivent être passés ou accessibles pour vérifier `allSegmentsParsed` — le bouton est désactivé si tous les segments ne sont pas parsés.

## Tasks / Subtasks

- [x] Task 1 — Modifier `SidebarDensitySection` (AC: #1, #3, #4, #7, #8)
  - [x] 1.1 Ajouter les props `adventureId: string` et `segments: MapSegmentData[]`
  - [x] 1.2 Appeler `useDensity(adventureId)` pour obtenir `densityStatus`, `densityStale`, `densityProgress`
  - [x] 1.3 Brancher la logique conditionnelle dans le contenu de l'accordéon :
    - `idle` ou `success + stale` → afficher CTA (bouton + texte explicatif + `DensityCategoryDialog`)
    - `pending` / `processing` → afficher progress bar/texte « Analyse en cours… X% »
    - `success + !stale` → afficher toggle + légende (comportement actuel)
  - [x] 1.4 Ajouter la mutation `triggerDensityAnalysis` (copier le pattern de `sidebar-density-cta.tsx`)
  - [x] 1.5 Vérifier `allSegmentsParsed` pour désactiver le bouton si segments pas prêts

- [x] Task 2 — Modifier l'accordéon densité dans `LiveFiltersDrawer` (AC: #2, #3, #4, #7, #8)
  - [x] 2.1 Ajouter les props `adventureId: string` sur `LiveFiltersDrawer`
  - [x] 2.2 Appeler `useDensity(adventureId)` dans le composant
  - [x] 2.3 Même logique conditionnelle que Task 1.3 dans la section densité du drawer
  - [x] 2.4 Ajouter la mutation `triggerDensityAnalysis`
  - [x] 2.5 Passer `adventureId` depuis le parent (`live/[id]/page.tsx`)

- [x] Task 3 — Supprimer `SidebarDensityCta` (AC: #6)
  - [x] 3.1 Supprimer le fichier `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.tsx`
  - [x] 3.2 Supprimer les imports et rendus de `SidebarDensityCta` dans `map-view.tsx`
  - [x] 3.3 Vérifier qu'aucune autre référence n'existe dans le codebase

- [x] Task 4 — Passer les props aux parents (AC: #7, #8)
  - [x] 4.1 Dans `map-view.tsx` : passer `adventureId` et `segments` à `SidebarDensitySection`
  - [x] 4.2 Dans `live/[id]/page.tsx` : passer `adventureId` et `segments` à `LiveFiltersDrawer`

## Dev Notes

### Composants à modifier

| Fichier | Action |
|---------|--------|
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx` | Ajouter logique conditionnelle + CTA + mutation |
| `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` | Ajouter logique conditionnelle dans section densité |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.tsx` | **SUPPRIMER** |
| `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` | Passer props + retirer `SidebarDensityCta` |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Passer `adventureId` à `LiveFiltersDrawer` |

### Composants réutilisés (NE PAS dupliquer)

- `DensityCategoryDialog` — déjà dans `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx`
- `useDensity` hook — déjà dans `apps/web/src/hooks/use-density.ts`
- `triggerDensityAnalysis` — déjà dans `apps/web/src/lib/api-client.ts`

### Pattern de logique conditionnelle (pseudo-code)

```tsx
const { densityStatus, densityStale } = useDensity(adventureId)
const needsCalculation = densityStatus === 'idle' || (densityStatus === 'success' && densityStale)
const isAnalyzing = ['pending', 'processing'].includes(densityStatus)
const isDone = densityStatus === 'success' && !densityStale

// Dans le contenu de l'accordéon :
{needsCalculation && <DensityCta ... />}
{isAnalyzing && <ProgressIndicator ... />}
{isDone && <ToggleAndLegend ... />}
```

### Texte CTA (reprendre le style de `SidebarDensityCta` actuel)

- **Idle** : « Identifie les zones avec peu d'hébergements sur votre parcours. »
- **Stale** : « Les segments ont changé depuis la dernière analyse. Relancez pour mettre à jour. »
- **Bouton** : « Calculer la densité » (texte du bouton, pas « Lancer l'analyse de densité »)

### Mutation pattern (copier depuis `sidebar-density-cta.tsx`)

```tsx
const triggerMutation = useMutation({
  mutationFn: (categories: string[]) => triggerDensityAnalysis(adventureId, categories),
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ['density', adventureId] })
    toast.success('Analyse de densité démarrée')
    setDialogOpen(false)
  },
  onError: (err: Error & { status?: number }) => {
    toast.error(err.status === 409 ? 'Analyse déjà en cours' : "Erreur lors du lancement de l'analyse")
  },
})
```

### TanStack Query keys

- `['density', adventureId]` — convention existante, ne pas inventer d'autre clé

### Segments nécessaires

- **Planning** : `segments` est déjà disponible dans `map-view.tsx` (type `MapSegmentData[]`) — le passer en prop
- **Live** : les segments sont aussi chargés dans `live/[id]/page.tsx` — vérifier la prop `segments` ou récupérer via le hook existant

### Pas de changement backend

Aucune modification API/NestJS — tout est déjà en place (`GET /api/density/:adventureId/status`, `POST /api/density/analyze`).

### Project Structure Notes

- Le pattern accordéon conditionnel est cohérent avec `sidebar-density-section.tsx` et `live-filters-drawer.tsx`
- `DensityCategoryDialog` est importé cross-route (adventures → map) — pattern déjà établi dans `sidebar-density-cta.tsx`
- La suppression de `SidebarDensityCta` simplifie la sidebar (un seul point d'entrée pour la densité au lieu de deux)

### References

- [Source: `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx`] — accordéon planning actuel
- [Source: `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx`:245-289] — section densité live
- [Source: `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.tsx`] — CTA séparé à supprimer
- [Source: `apps/web/src/app/(app)/adventures/[id]/_components/density-trigger-button.tsx`] — bouton page détail (référence UX)
- [Source: `apps/web/src/app/(app)/adventures/[id]/_components/density-category-dialog.tsx`] — popin catégories à réutiliser
- [Source: `apps/web/src/hooks/use-density.ts`] — hook densité

### Review Findings

- [x] [Review][Decision → Patch] `densityStatus === 'error'` non géré — résolu : `error` traité comme `needsCalculation` avec message « L'analyse a échoué. Réessayez. » + bouton « Réessayer »
- [x] [Review][Patch] `removeDensityLayer` appelle `map.getCanvas()` sur map potentiellement détruite — résolu : try/catch ajouté [`density-layer.ts`:149]
- [x] [Review][Patch] Double appel `addDensityLayer` sur style switch — résolu : supprimé du handler `styledata`, le `useEffect` density gère la restauration [`live-map-canvas.tsx`:170]
- [x] [Review][Patch] `DensityCategoryDialog` rendu dans le bloc conditionnel — résolu : déplacé hors du conditionnel dans les 2 composants
- [x] [Review][Defer] Planning `map-canvas.tsx` duplique la logique density layer au lieu d'utiliser `density-layer.ts` partagé [`map-canvas.tsx`:771-855] — deferred, pre-existing
- [x] [Review][Defer] `buildDensityColoredFeatures` — dernier chunk peut être skip si waypoints < 2, et epsilon matching fragile sur boundaries [`density-layer.ts`:27-41] — deferred, pre-existing
- [x] [Review][Defer] Logique dérivée (needsCalculation/isAnalyzing/isDone + mutation) dupliquée entre `SidebarDensitySection` et `LiveFiltersDrawer` — deferred, code quality

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — no blocking issues encountered

### Completion Notes List
- `SidebarDensitySection` (planning mode) now has 3 states: CTA (idle/stale), progress (pending/processing), toggle+legend (success+fresh)
- `LiveFiltersDrawer` density accordion has identical conditional logic
- `useDensity` hook now exposes `densityProgress` (0–100) from the API response
- `SidebarDensityCta` component deleted — CTA now lives inside the density accordion (single entry point)
- Button text changed from "Lancer l'analyse de densité" to "Calculer la densité" per story spec
- Unused `densityCategories` destructuring removed from `map-view.tsx`
- **Fix live mode density layer**: `LiveMapCanvas` did not support the density colored trace layer — extracted density layer helpers to `density-layer.ts`, added `coverageGaps`/`densityStatus` props to `LiveMapCanvas`, wired density layer add/remove on data change, style switch, and `densityColorEnabled` toggle via Zustand subscription
- All 906 tests pass, 0 lint errors
- Tests rewritten for `SidebarDensitySection` (12 tests covering CTA/progress/done states)
- `LiveFiltersDrawer` test updated: mocks for useDensity/api-client added, QueryClientProvider wrapper, density tests updated for new CTA behavior

### File List
- `apps/web/src/hooks/use-density.ts` — added `densityProgress` to return value
- `apps/web/src/lib/density-layer.ts` — **NEW** — shared density layer helpers (addDensityLayer, removeDensityLayer, buildDensityColoredFeatures) used by LiveMapCanvas
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.tsx` — rewritten with conditional CTA/progress/toggle logic
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-section.test.tsx` — rewritten with 12 tests for all 3 states
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.tsx` — added adventureId/segments props, useDensity, conditional density accordion content
- `apps/web/src/app/(app)/live/[id]/_components/live-filters-drawer.test.tsx` — added mocks, QueryClientProvider wrapper, updated density tests
- `apps/web/src/app/(app)/live/[id]/page.tsx` — added useDensity, passed coverageGaps/densityStatus to LiveMapCanvas, passed adventureId+segments to LiveFiltersDrawer
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — added coverageGaps/densityStatus props, density layer management (init, style switch, reactive effect, Zustand toggle subscription)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — removed SidebarDensityCta import/render, passed props to SidebarDensitySection, removed unused densityCategories
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — removed SidebarDensityCta mock and test
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.tsx` — **DELETED**
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-density-cta.test.tsx` — **DELETED**
