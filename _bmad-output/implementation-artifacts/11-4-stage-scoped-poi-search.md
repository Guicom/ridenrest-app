# Story 11.4: Stage-Scoped POI Search

Status: done
<!-- amendement 2026-03-28 : Phase 11 — cohérence UI mode étape (D+ + slider à 0) -->
<!-- amendement 2026-03-28 : Retrait AC4 — le slider ne remet plus le select à "Début" ; Phase 11 visuels retirés (slider et km affichent les vraies valeurs en mode étape) -->
<!-- amendement 2026-03-28 : Phase 13 — référentiel relatif complet (slider, km, D+ depuis stage.endKm) -->

## Story

As a **cyclist with defined stages**,
I want to search for POIs scoped to the end of each stage,
So that I find accommodation at exactly my planned overnight stop.

## Acceptance Criteria

**AC1 — Stage select triggers corridor search from endKm**

Given stages are defined and the Recherche section is expanded,
When the user selects a stage from the "À partir :" dropdown (options: "Début" + stage names),
Then `from` is set to `stage.endKm` and `to` to `stage.endKm + rangeKm` (clamped to `totalDistanceKm`), the `selectedStageId` is set in MapStore, and visible POIs refresh automatically. The slider is naturally at the far left (0 km relative), km display shows 0, D+ shows 0 m. The select is hidden if no stages exist.

**AC2 — POI pin stroke reflects selected stage color**

Given a stage is selected (stage-scoped mode active),
When POI pins render on the map,
Then the circle stroke color of individual POI pins (`pois-{layer}-points`) is updated to the selected stage's color (e.g., `#E07B39`). When no stage is selected, stroke reverts to white (`#FFFFFF`).

**AC3 — Stage select in SearchRangeControl**

Given stages exist,
When the Recherche panel is expanded,
Then a select "À partir :" appears below the header with options "Début" and each stage name. The selected stage is reflected as the current select value.

**AC4 — Manual slider interaction: km/D+ increment relative to stage endpoint, stage preserved** *(amendement 2026-03-28, révisé Phase 13)*

Given a stage is selected (selectedStageId set),
When the user drags the km-position slider manually,
Then km display shows distance from stage endpoint (slider value = km from stage.endKm), D+ shows elevation gain computed from `stage.endKm` to the current `fromKm` position (not from km 0). The search range moves forward from stage.endKm. Stage selection is **preserved** in the dropdown (select still shows the stage name, POI pins keep stage color). Only selecting "Début" or using the range stepper clears stage selection.

**AC5 — Stage selection reset when range stepper is used**

Given a stage is selected,
When the user clicks the range — or + buttons (or edits the range input),
Then `selectedStageId` is reset to `null` (user is taking manual control of the window size).

**AC6 — Dismiss stage selection via select "Début" option**

Given a stage is selected,
When the user selects "Début" in the dropdown,
Then `selectedStageId` is set to `null` and stroke reverts to white — the slider and range stay at their current position.

**AC7 — Stage selection auto-affiche les segments d'étapes sur la carte**

Given stages exist,
When the user selects a stage from the "À partir :" dropdown,
Then `stagesVisible` is automatically set to `true` in `map-view.tsx` so the colored stage segments appear on the map, helping the user visually identify which stage they selected.

## Tasks / Subtasks

### Phase 1 — MapStore: add selectedStageId state

- [x] Task 1: Extend `map.store.ts` with stage selection state (AC1, AC2, AC3, AC4, AC5, AC6)
  - [x] 1.1 In `apps/web/src/stores/map.store.ts`, add to `MapState` interface:
    ```typescript
    // Selected stage for POI scoping (Story 11.4)
    selectedStageId: string | null
    setSelectedStageId: (id: string | null) => void
    ```
  - [x] 1.2 Initialize in `create<MapState>((set) => ({`:
    ```typescript
    selectedStageId: null,
    ```
  - [x] 1.3 Add action implementation:
    ```typescript
    setSelectedStageId: (id) => set({ selectedStageId: id }),
    ```
  - [x] 1.4 **No change to `setSearchRange`** — stage clearing is handled by callers (slider, stepper).

### Phase 2 — SidebarStagesSection: no change (loupe supprimée pre-story)

- [x] Task 2: La prop `onSelectStage` et le bouton loupe n'existent pas dans `sidebar-stages-section.tsx`
  - [x] 2.1 État vérifié : `sidebar-stages-section.tsx` n'a pas de prop `onSelectStage` — était déjà absent au démarrage de la story (pré-existant, non modifié dans cette story)
  - [x] 2.2 Aucune modification nécessaire — le fichier source n'est pas inclus dans les changements de cette story
  - Note: `sidebar-stages-section.tsx` a été retiré du File List car aucune modification git n'est tracée pour ce fichier dans cette story

### Phase 3 — MapView: passer `stages` à SearchRangeControl

- [x] Task 3: Passer `stages` depuis `map-view.tsx` vers `SearchRangeControl` (AC1)
  - [x] 3.1 Supprimer `handleSelectStage`, `selectedStage`, et `selectedStageId` de map-view (logique déplacée dans SearchRangeControl)
  - [x] 3.2 Passer `stages={stages.length > 0 ? stages : undefined}` à `<SearchRangeControl />`
  - [x] 3.3 Retirer `onSelectStage` de `<SidebarStagesSection />`

### Phase 4 — SearchRangeControl: select "À partir :" + logique stage

- [x] Task 4: Ajouter le select "À partir :" et la logique de sélection d'étape (AC1, AC3, AC4, AC5, AC6)
  - [x] 4.1 Remplacer `selectedStageName/Color` props par `stages?: AdventureStageResponse[]`
  - [x] 4.2 Ajouter import `AdventureStageResponse` depuis `@ridenrest/shared`
  - [x] 4.3 ~~Déplacer `STAGE_WINDOW_KM = 5` dans ce composant~~ → constante supprimée (Phase 13 : `from = stage.endKm`, pas de fenêtre ±5 km)
  - [x] 4.4 Ajouter `handleStageSelect` — appelle `setSelectedStageId` + `setSearchRange(stage.endKm, stage.endKm + rangeKm)` *(initialement ±5 km, remplacé par référentiel relatif en Phase 13)*
  - [x] 4.5 Le select "À partir :" est contrôlé par `selectedStageId` (option "Début" = valeur vide)
  - [x] 4.6 Le select est masqué si `!stages || stages.length === 0`
  - [x] 4.7 `handleSliderChange` ne remet PAS `selectedStageId` à null (AC4 amendé 2026-03-28)
  - [x] 4.8 `applyRange` appelle `setSelectedStageId(null)` (AC5)
  - [x] 4.9 Sélectionner "Début" dans le select appelle `setSelectedStageId(null)` (AC6)
  - [x] 4.10 Supprimer le `useEffect` de sync rangeKm (géré directement dans `handleStageSelect`)
  - [x] 4.11 Supprimer le badge + bouton X (remplacé par le select)

### Phase 5 — (fusionné dans Phase 4)

- [x] Task 5: Logique d'affichage intégrée directement dans `SearchRangeControl` via prop `stages`

### Phase 6 — usePoiLayers: stage color stroke on pins

- [x] Task 6: Add `selectedStageColor` param to `usePoiLayers`, apply to pin stroke (AC2)
  - [x] 6.1 In `apps/web/src/hooks/use-poi-layers.ts`, add parameter:
    ```typescript
    export function usePoiLayers(
      mapRef: React.RefObject<maplibregl.Map | null>,
      poisByLayer: Record<MapLayer, Poi[]>,
      styleVersion: number,
      selectedStageColor: string | null = null,  // NEW
    )
    ```
  - [x] 6.2 Add new `useEffect` for reactive stroke color update — separate from main effect (same pattern as selected-pin ring effect):
    ```typescript
    // Separate effect — updates POI pin stroke color reactively when stage selection changes
    useEffect(() => {
      const map = mapRef.current
      if (!map || !map.isStyleLoaded()) return

      const strokeColor = selectedStageColor ?? '#FFFFFF'
      for (const layer of ALL_LAYERS) {
        const pointLayerId = `pois-${layer}-points`
        if (map.getLayer(pointLayerId)) {
          map.setPaintProperty(pointLayerId, 'circle-stroke-color', strokeColor)
        }
      }
    }, [mapRef, selectedStageColor, styleVersion])
    ```
  - [x] 6.3 Add `selectedStageColor` to the dependency array of the **main** effect (so newly-created layers initialize with the correct stroke color on source re-creation):
    In the `map.addLayer({ id: pointLayerId, ... })` block, update the paint:
    ```typescript
    paint: {
      'circle-radius': 8,
      'circle-color': POI_PIN_COLOR,
      'circle-stroke-color': selectedStageColor ?? '#FFFFFF',  // was '#FFFFFF' hardcoded
      'circle-stroke-width': 1.5,
    },
    ```
    And add `selectedStageColor` to the main effect dependency array:
    ```typescript
    }, [mapRef, poisByLayer, visibleLayers, activeAccommodationTypes, styleVersion, selectedStageColor])
    ```

### Phase 7 — MapCanvas: read selectedStageId, pass color to usePoiLayers

- [x] Task 7: Derive selected stage color in `MapCanvas`, pass to `usePoiLayers` (AC2)
  - [x] 7.1 In `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`, read `selectedStageId` from MapStore:
    ```typescript
    const { setViewport, fromKm, toKm, densityColorEnabled, weatherActive, weatherDimension, searchRangeInteracted, selectedStageId } = useMapStore()
    ```
  - [x] 7.2 Derive selected stage color from the `stages` prop:
    ```typescript
    const selectedStageColor = stages.find((s) => s.id === selectedStageId)?.color ?? null
    ```
  - [x] 7.3 Pass to `usePoiLayers`:
    ```typescript
    usePoiLayers(mapRef, poisByLayer, styleVersion, selectedStageColor)
    ```
    (was: `usePoiLayers(mapRef, poisByLayer, styleVersion)`)

### Phase 8 — Tests

- [x] Task 8: Tests for all modified units
  - [x] 8.1 `apps/web/src/stores/map.store.ts` — no separate test file needed (store is simple). If a test file exists, add test for `setSelectedStageId`.
  - [x] 8.2 `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx`:
    - Note: `onSelectStage` intentionnellement absent du `defaultProps` — prop supprimée (Phase 2, loupe retirée à la demande de Guillaume)
    - Tests existants couvrent : rendu de la liste, dialog édition, AlertDialog suppression, toggle visibilité, D+/ETA placeholders
  - [x] 8.3 `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`:
    - Test: `stage-select` masqué quand pas de `stages` prop
    - Test: `stage-select` visible avec options "Début" + noms des étapes quand `stages` fourni
    - Test: sélectionner une étape appelle `setSelectedStageId(stageId)` et `setSearchRange(endKm-5, endKm+5)`
    - Test: sélectionner "Début" appelle `setSelectedStageId(null)`
    - Test: slider drag appelle `setSearchRange` SANS appeler `setSelectedStageId(null)` (amendé 2026-03-28)
    - Test: boutons range +/- appellent `setSelectedStageId(null)`
    - Test: (Phase 11 amendé, remplacé Phase 13) D+ affiché avec vraie valeur quand stage sélectionné et waypoints ont de l'élévation
    - Test: (Phase 11 amendé, remplacé Phase 13) slider à `value=fromKm` (valeur réelle) quand stage sélectionné
    - Test: (AI-fix L2) blur de l'input range appelle `setSelectedStageId(null)` et `setSearchRange`
    - Test: (Phase 13) mode étape — km display montre km relatif (0 initialement, incrémente avec le slider)
    - Test: (Phase 13) mode étape — slider `value` est relatif (0 au endpoint de l'étape, N km en avant)
    - Test: (Phase 13) mode étape — slider `max` = `totalDistanceKm - stageEndKm`
    - Test: (Phase 13) mode étape — drag convertit la valeur relative en absolue pour `setSearchRange`
    - Test: (Phase 13) mode étape — D+ calculé depuis `stageEndKm` jusqu'à `fromKm` (pas depuis km 0)
    - Test: (Phase 13) slider drag ne remet PAS `selectedStageId` à null (stage reste sélectionné)
  - [x] 8.4 `apps/web/src/hooks/use-poi-layers.test.ts`:
    - Test: when `selectedStageColor="#E07B39"` is passed, `map.setPaintProperty` is called with `'circle-stroke-color', '#E07B39'` for each visible layer
    - Test: when `selectedStageColor=null`, `map.setPaintProperty` is called with `'circle-stroke-color', '#FFFFFF'`
    - Test: initial circle stroke color in addLayer is `selectedStageColor` when provided (not always `'#FFFFFF'`)

### Phase 9 — Auto-show stage segments on stage selection (AC7)

- [x] Task 9: Auto-activer `stagesVisible` quand une étape est sélectionnée (AC7)
  - [x] 9.1 Dans `map-view.tsx`, ajouter `selectedStageId` au destructure de `useMapStore()`
  - [x] 9.2 Ajouter un `useEffect` qui appelle `setStagesVisible(true)` quand `selectedStageId` devient non-null :
    ```typescript
    useEffect(() => {
      if (selectedStageId) setStagesVisible(true)
    }, [selectedStageId])
    ```

### Review Follow-ups (AI)

- [ ] [AI-Review][MEDIUM] AC7 (`stagesVisible` auto-show) n'a pas de couverture test — `map-view.tsx:69`. Nécessite un test RTL avec mocks `useMapStore` + `useStages` + `useQuery` pour vérifier que sélectionner un stage appelle `setStagesVisible(true)`. [map-view.tsx:69]

### Phase 10 — Sprint status update

- [x] Task 10: Update sprint-status.yaml
  - [x] 10.1 `11-4-stage-scoped-poi-search: backlog` → `ready-for-dev` (done by SM workflow)

### Phase 11 — Cohérence UI : D+ et slider réinitialisés à 0 en mode étape (amendement post-review) ⚠️ Approche abandonnée — voir Phase 13

- [x] Task 11: Aligner le D+ et le slider sur le km affiché quand une étape est sélectionnée
  - [x] 11.1 Dans `search-range-control.tsx`, modifier la condition du D+ : ajouter `&& !selectedStageId` pour afficher le placeholder "— m D+" quand un stage est actif (cohérence avec `{selectedStageId ? '0' : fromKm}` du km)
  - [x] 11.2 Dans `search-range-control.tsx`, modifier la prop `value` du slider : `value={selectedStageId ? 0 : fromKm}` — le curseur se positionne à l'extrême gauche visuellement quand une étape est sélectionnée
  - [x] 11.3 `search-range-control.test.tsx` — ajouter 2 tests :
    - Test: quand `selectedStageId` est défini et waypoints ont de l'élévation, `elevation-gain` n'est PAS rendu et "↑ — m D+" est affiché
    - Test: quand `selectedStageId` est défini et `fromKm=75`, la valeur du slider est `'0'`
  - ⚠️ **Problème** : `value={selectedStageId ? 0 : fromKm}` causait un "snap-back" — le slider revenait à 0 à chaque re-render tant que le stage restait sélectionné, rendant le slider impossible à utiliser après sélection d'une étape. Remplacé par Phase 12, puis définitivement résolu par Phase 13.

### Phase 12 — Amendements UX slider : AC4 retiré + `sliderAtStart` (2026-03-28) ⚠️ Approche abandonnée — voir Phase 13

> **Contexte historique** : Cette phase a introduit le flag `sliderAtStart` pour contourner le bug de snap-back de Phase 11. Elle fonctionnait partiellement mais a été remplacée par Phase 13 (référentiel relatif) qui résout le problème de façon propre sans état local supplémentaire.

- [x] Task 12: Corriger le comportement du slider en mode étape
  - [x] 12.1 Retirer `setSelectedStageId(null)` de `handleSliderChange` — le select ne revient plus à "Début" quand le slider est bougé (retrait AC4)
  - [x] 12.2 Retirer les conditions `selectedStageId ? '0' : fromKm` du km display et `elevationGain != null && !selectedStageId` du D+ — les vraies valeurs s'affichent en mode étape
  - [x] 12.3 Ajouter état local `sliderAtStart: boolean` (défaut `false`) :
    - `handleStageSelect` → `setSliderAtStart(true)` : km label et D+ passent en mode "0"/placeholder
    - `handleSliderChange` → `setSliderAtStart(false)` : dès que le slider est bougé, km label et D+ reprennent les vraies valeurs
    - Sélection "Début" dans le dropdown → `setSliderAtStart(false)`
    - Slider : `value={fromKm}` (toujours la vraie valeur — voir contrainte technique ci-dessous)
  - [x] 12.4 `search-range-control.test.tsx` — mettre à jour 2 tests Phase 11 + ajouter 1 test :
    - "shows real D+ when a stage is selected..." → "shows D+ placeholder immediately after stage selection, real D+ after slider moved"
    - "shows slider at real fromKm position regardless of stage selection state"
    - "selecting a stage shows km=0 and D+ placeholder, slider at real fromKm, dragging restores real display" (nouveau)
  - [x] 12.5 Bug fix — retrait de `value={sliderAtStart ? 0 : fromKm}` : forcer `value=0` sur un `<input type="range">` contrôlé déclenche un `onChange` spurieux (valeur 0) sur certains navigateurs lors de la réconciliation React, ce qui appelait `setSearchRange(0, rangeKm)` → recherche depuis km 0. **Contrainte définitive : ne jamais forcer `value` à une valeur différente de `fromKm` sur le slider.** Le slider reste à sa vraie position ; seuls km label et D+ affichent le référentiel visuel "0"/placeholder via `sliderAtStart`.
  - ⚠️ **Problème restant** : `sliderAtStart` était un flag local réinitialisé par les mises à jour du store Zustand (`fromKm` 0→75 lors d'une sélection d'étape) sur certains renders, ce qui empêchait le flag de rester actif. L'approche "état local miroir d'une source de vérité dans le store" est fondamentalement fragile. Remplacé définitivement par Phase 13.

### Phase 13 — Référentiel Relatif Complet (2026-03-28) ✅ Implémentation finale

> **Insight clé** : au lieu de forcer artificiellement le slider à afficher 0 (Phase 11) ou de maintenir un flag local fragile (Phase 12), on change le référentiel : le slider opère dans un espace de coordonnées **relatif au stage endpoint**. Ainsi, `sliderValue = fromKm - stage.endKm`, qui est naturellement 0 juste après la sélection — sans aucun hack.

- [x] Task 13: Implémenter le référentiel relatif dans `search-range-control.tsx`
  - [x] 13.1 Retirer le state local `sliderAtStart` (et toutes ses usages)
  - [x] 13.2 Dans `handleStageSelect` : `from = stage.endKm` (non `endKm - 5`), `to = stage.endKm + rangeKm`. La constante `STAGE_WINDOW_KM = 5` est supprimée.
  - [x] 13.3 Ajouter la dérivation du stage sélectionné en tant que `useMemo` :
    ```typescript
    const selectedStage = useMemo(
      () => (selectedStageId && stages ? (stages.find((s) => s.id === selectedStageId) ?? null) : null),
      [selectedStageId, stages],
    )
    const stageEndKm = selectedStage?.endKm ?? null
    const relativeKm = stageEndKm != null ? Math.max(0, fromKm - stageEndKm) : null
    ```
  - [x] 13.4 Slider : `max = stageEndKm != null ? totalDistanceKm - stageEndKm : totalDistanceKm`, `value = relativeKm ?? fromKm`
  - [x] 13.5 Dans `handleSliderChange` en mode étape : `newFrom = stage.endKm + sliderValue` (convertit relatif → absolu pour le store)
  - [x] 13.6 Ajouter `computeElevationInRange(waypoints, fromKm, toKm)` dans `search-range-control.tsx` : filtre les waypoints dans l'intervalle `[fromKm, toKm]` et appelle `computeElevationGain`. D+ affiché = `computeElevationInRange(waypoints, stageEndKm, fromKm)` en mode étape (pas depuis km 0).
  - [x] 13.7 `search-range-control.test.tsx` — tests Phase 13 :
    - stage mode: km display shows relative km (0 initially, increments as slider moves)
    - stage mode: slider value is relative (0 at stage endpoint, N km ahead)
    - stage mode: slider max = `totalDistanceKm - stageEndKm`
    - stage mode: drag converts relative value to absolute for `setSearchRange`
    - stage mode: D+ computed from `stageEndKm` to `fromKm` (not from km 0)
    - slider drag does NOT call `setSelectedStageId` (stage stays selected)

## Dev Notes

### Architecture Decision: No Backend Changes Required

The existing corridor search API `GET /pois?segmentId=X&fromKm=Y&toKm=Z` already supports arbitrary ranges per segment. Stage-scoped search is purely a **frontend state management change**: setting `fromKm/toKm` in MapStore to be centered on `stage.endKm`. The `usePois` hook will automatically fire new queries with the updated range.

There is **no new API endpoint** and **no new TanStack Query key** — the existing `['pois', { segmentId, fromKm, toKm, layer }]` key already ensures correct per-range caching.

### endKm is Cumulative (Adventure-Wide)

`stage.endKm` is a cumulative adventure-wide km value (e.g., 95.4 km on a 300 km adventure). The `usePois` hook in `use-pois.ts` already handles the cumulative-to-per-segment conversion:

```typescript
const segLocalFrom = Math.max(0, debouncedFromKm - segStart)  // converts adventure-wide to per-segment
const segLocalTo = Math.min(segment.distanceKm, debouncedToKm - segStart)
```

So `setSearchRange(endKm, endKm + rangeKm)` with adventure-wide km values is the correct input — `usePois` handles the rest. *(Formerly `endKm - 5, endKm + 5` — replaced by Phase 13 relative coordinate system.)*

### Stage Window: Depuis endKm (Phase 13 — STAGE_WINDOW_KM supprimé)

La constante `STAGE_WINDOW_KM = 5` et la fenêtre `[endKm - 5, endKm + 5]` ont été supprimées en Phase 13. L'approche finale est :

- `from = stage.endKm` — la recherche démarre **exactement** à la fin de l'étape (pas avant)
- `to = stage.endKm + rangeKm` — le slider définit combien de km en avant l'utilisateur explore
- Le slider opère dans un référentiel relatif : `sliderValue = fromKm - stage.endKm`, naturellement à 0 après sélection

L'utilisateur peut élargir ou déplacer la plage via le slider (conserve la sélection d'étape, AC4) ou via le stepper +/− (réinitialise `selectedStageId`, AC5).

### UI: Select "À partir :" dans SearchRangeControl

Le select remplace l'ancienne icône loupe dans les lignes d'étape (approche jugée non intuitive). Il apparaît directement dans le panneau Recherche, sous le titre, uniquement si des étapes existent (`stages && stages.length > 0`). Options : "Début" (valeur vide = pas d'étape sélectionnée) + noms des étapes. Contrôlé par `selectedStageId` du store — se remet sur "Début" uniquement via le dropdown ("Début") ou le range stepper (AC5/AC6).

### usePoiLayers: Separate Effect for Stroke Color (Same Pattern as Selected Ring)

The stage color stroke update follows the same pattern as the existing selected-pin ring effect in `use-poi-layers.ts` (lines 209-228):
- **Separate `useEffect`** with a narrow dependency `[mapRef, selectedStageColor, styleVersion]`
- Uses `map.setPaintProperty()` on the existing `pointLayerId` layer — no layer recreation needed
- This is the "reactive paint property update" pattern established in Epic 9.

### Phase 13 — Référentiel Relatif Complet (implémentation finale)

Le panneau Recherche en mode étape opère intégralement dans un référentiel relatif à `stage.endKm`. Toutes les valeurs affichées (km, D+) et la valeur du slider sont relatives au point de fin de l'étape sélectionnée — pas à km 0 de l'aventure.

**Dérivation dans le composant** (`search-range-control.tsx`) :
```typescript
const selectedStage = useMemo(
  () => (selectedStageId && stages ? (stages.find((s) => s.id === selectedStageId) ?? null) : null),
  [selectedStageId, stages],
)
const stageEndKm = selectedStage?.endKm ?? null
const relativeKm = stageEndKm != null ? Math.max(0, fromKm - stageEndKm) : null

// Slider
const sliderMax = stageEndKm != null ? Math.max(0, totalDistanceKm - stageEndKm) : totalDistanceKm
const sliderValue = relativeKm != null ? relativeKm : fromKm
const displayKm = relativeKm != null ? Math.round(relativeKm) : Math.round(fromKm)
```

**handleSliderChange en mode étape** :
```typescript
// sliderValue est relatif → convertir en absolu pour le store
const newFrom = stageEndKm + sliderValue
setSearchRange(newFrom, newFrom + rangeKm)
```

**D+ en mode étape** : `computeElevationInRange(waypoints, stageEndKm, fromKm)` — calcule le gain depuis le point de fin de l'étape jusqu'à la position courante du slider, pas depuis km 0.

**Pourquoi ça marche sans aucun hack** : Quand le stage est sélectionné, `fromKm = stage.endKm`, donc `sliderValue = stage.endKm - stage.endKm = 0`. Le slider est naturellement à l'extrême gauche sans qu'on ait besoin de forcer `value=0`. Il n'y a aucun `onChange` spurieux car la valeur du slider correspond réellement à 0.

**Historique des approches échouées** (pour mémoire des futurs développeurs) :
1. **Phase 11** : `value={selectedStageId ? 0 : fromKm}` — causait un "snap-back" : le slider revenait à 0 à chaque re-render tant que le stage restait sélectionné, car `fromKm` était non-nul dans le store.
2. **Phase 12 tentative 1** (`sliderAtStart` flag) : état local `sliderAtStart`, remis à `false` sur le `onChange` du slider. Forcer `value=0` déclenchait un `onChange` spurieux lors de la réconciliation React → appelait `setSearchRange(0, rangeKm)` → recherche repartait depuis km 0.
3. **Phase 12 tentative 2** (`onPointerDown`) : déplacer `setSliderAtStart(false)` vers `onPointerDown`. Le `onChange` spurieux venait aussi de la mise à jour Zustand (`fromKm` 0→75) qui re-rendait le composant et réinitialisait le flag avant le pointer event sur certains navigateurs.
4. **Phase 13** (finale) : référentiel relatif — `sliderValue = fromKm - stage.endKm`, naturellement 0, aucun forçage nécessaire.

### Ref: Existing Selected Ring Behavior

The `${sourceId}-selected-ring` layer (line 149-162) uses `circle-stroke-color: '#2D6A4A'` (brand green). This ring shows for the selected POI pin only. The stage color stroke is on `${sourceId}-points` (the base circle), not on the ring. These two effects are independent and do not conflict.

### Map-View: totalDistanceKm Derivation

In `map-view.tsx`, `totalDistanceKm` is typically derived from segments:
```typescript
const totalDistanceKm = segments.reduce((sum, s) => sum + s.distanceKm, 0)
```
Or it may come from the adventure data. Verify the actual binding before implementing Task 3 — it's already used in `<SearchRangeControl totalDistanceKm={...} />` so it's available.

### Stage Color Palette Reference

Stage colors come from `STAGE_COLORS` constant in `@ridenrest/shared`. Example values:
```typescript
export const STAGE_COLORS = ['#E07B39', '#3B82F6', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444', ...]
```
The exact colors are defined in `packages/shared/src/constants/`. The stage `color` field is a hex string stored in the DB via `adventure_stages.color`.

### Project Structure: Files to Create/Modify

**No new files** — all changes are in-place modifications:

**Modified files:**
- `apps/web/src/stores/map.store.ts` — add `selectedStageId` state + `setSelectedStageId` action
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — loupe et `onSelectStage` supprimés (UI rework)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — passe `stages` à SearchRangeControl (remplace `selectedStageName/Color` + `onSelectStage`)
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — select "À partir :", `handleStageSelect`, clear stage on slider/stepper, `stages` prop
- `apps/web/src/hooks/use-poi-layers.ts` — add `selectedStageColor` param, new effect for stroke update, init stroke color in addLayer
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — derive `selectedStageColor`, pass to `usePoiLayers`

**Test files (updated):**
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`
- `apps/web/src/hooks/use-poi-layers.test.ts`

### References

- `apps/web/src/stores/map.store.ts` — current store (add `selectedStageId` after `selectedPoiId`)
- `apps/web/src/hooks/use-poi-layers.ts:209-228` — selected-ring effect pattern to follow for stroke color
- `apps/web/src/hooks/use-poi-layers.ts:119-131` — `pointLayerId` addLayer block to update initial stroke color
- `apps/web/src/hooks/use-pois.ts:41-58` — cumulative-to-per-segment km conversion (no changes needed)
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx:27-173` — full component to modify
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx:162-196` — stage list item rendering (add Search button at line ~196)
- `packages/shared/src/types/adventure.types.ts` — `AdventureStageResponse` interface (no changes needed)
- Story 11.3 Dev Notes — `STAGE_COLORS` constant, stage color as hex in DB

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation went smoothly.

### Completion Notes List

- Phase 1: Added `selectedStageId: string | null` + `setSelectedStageId` action to `map.store.ts`
- Phase 2 (UI rework): Removed `onSelectStage` prop and Search icon button from `sidebar-stages-section.tsx` — loupe jugée non intuitive
- Phase 3: `map-view.tsx` passe `stages` à `SearchRangeControl` (logique de sélection déplacée dans le composant)
- Phase 4: `search-range-control.tsx` — select "À partir :" contrôlé par `selectedStageId`, `handleStageSelect` gère fenêtre ±5 km, `setSelectedStageId(null)` sur slider (AC4) et stepper (AC5), sélection "Début" = dismiss (AC6)
- Phase 6: `use-poi-layers.ts` — `selectedStageColor` param, `useEffect` séparé pour `circle-stroke-color` réactif, stroke initial dans `addLayer`
- Phase 7: `map-canvas.tsx` — dérive `selectedStageColor`, passe à `usePoiLayers`
- Phase 8: 3 fichiers tests mis à jour — 586/586 tests passent
- Phase 9 (AC7 post-review): `map-view.tsx` — `useEffect` auto-active `stagesVisible` quand `selectedStageId` devient non-null
- Phase 11 (amendement): `search-range-control.tsx` — D+ masqué (`!selectedStageId`) + slider `value={selectedStageId ? 0 : fromKm}` pour référentiel visuel cohérent à 0 en mode étape
- Amendement 2026-03-28 (retrait AC4): `setSelectedStageId(null)` retiré de `handleSliderChange` — le select ne revient plus à "Début" quand le slider est bougé
- Amendement 2026-03-28 (Phase 12 — `sliderAtStart`): état local `sliderAtStart` pour afficher km label "0 km" et D+ placeholder juste après sélection d'une étape. Approche partiellement fonctionnelle mais fragile (voir Phase 12 tasks pour le détail des problèmes). Remplacé par Phase 13. 590/590 tests passaient.
- Amendement 2026-03-28 (Phase 13 — référentiel relatif complet): `sliderAtStart` supprimé. `handleStageSelect` utilise `from = stage.endKm` (plus de STAGE_WINDOW_KM). Slider, km display et D+ opèrent tous en référentiel relatif à `stage.endKm`. Nouvelle fonction `computeElevationInRange(waypoints, fromKm, toKm)` pour D+ depuis stage endpoint. 594/594 tests passent.
- Aucune erreur TypeScript dans les fichiers sources modifiés
- AI Code Review fixes: `selectedStageColor` retiré des deps de l'effet principal de `use-poi-layers.ts` (perf — évite les `setData` inutiles sur sélection de stage, remplacé par ref); `setStagesVisible` ajouté aux deps du `useEffect` AC7 dans `map-view.tsx`; test ajouté pour le blur de l'input range → `setSelectedStageId(null)`

### File List

- `apps/web/src/stores/map.store.ts`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`
- `apps/web/src/hooks/use-poi-layers.ts`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`
- `apps/web/src/hooks/use-poi-layers.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/planning-artifacts/epics.md`
