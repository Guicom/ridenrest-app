# Story 11.1: Stage CRUD — Création, Renommage, Suppression

Status: done

## Story

As a **cyclist planning a multi-day adventure**,
I want to create, name, and delete planning stages on my route,
So that I can organize my adventure day by day with clear endpoints.

## Acceptance Criteria

**AC1 — Créer une étape via clic sur la carte**

**Given** a user is in Planning mode on desktop,
**When** they click "Ajouter une étape" in the sidebar,
**Then** the map enters click mode; when the user clicks on the map near the GPX trace, a stage endpoint marker snaps to the nearest waypoint (`end_km = nearestWaypoint.distKm`); a naming dialog appears (default name: "Étape N" where N = current stage count + 1).

**AC2 — Sauvegarder l'étape avec couleur auto-assignée**

**Given** the user confirms the naming dialog,
**When** the stage is saved,
**Then** the stage is persisted with: `name`, `start_km` (= `end_km` of previous stage, or 0 if first), `end_km`, `color` (auto-assigned from palette, cycling through 8 colors), `order_index`, `distance_km = end_km - start_km`.

**AC3 — Liste des étapes dans la sidebar**

**Given** stages exist for the adventure,
**When** the sidebar stages section renders,
**Then** each stage shows in order: color swatch, name, distance (km, 1 decimal), D+ (displays "—" — computed in 11.3), ETA (displays "—" — computed in 11.3).

**AC4 — Éditer une étape (renommage + couleur)**

**Given** a user clicks the edit icon on a stage,
**When** the edit dialog opens,
**Then** they can rename the stage and select a different color from the palette — `end_km` is NOT editable via this dialog (drag on map is 11.2).

**AC5 — Supprimer une étape**

**Given** a user clicks the delete icon on a stage,
**When** they confirm the deletion,
**Then** the stage is removed; subsequent stages' `start_km` values are recalculated automatically (cascade: each stage `start_km` = `end_km` of previous stage).

**AC6 — Marqueurs d'étapes sur la carte**

**Given** stages exist,
**When** the map renders,
**Then** each stage endpoint marker appears as a colored circle (matching stage color) at its `end_km` position on the trace; the trace segment for each stage is colorized with the stage color.

## Tasks / Subtasks

### Phase 1 — DB schema

- [x] Task 1: Create `adventure_stages` Drizzle schema (AC2)
  - [x] 1.1 Create `packages/database/src/schema/adventure-stages.ts`:
    ```typescript
    import { pgTable, text, timestamp, real, integer, index } from 'drizzle-orm/pg-core'
    import { adventures } from './adventures'

    export const adventureStages = pgTable('adventure_stages', {
      id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
      adventureId: text('adventure_id').notNull().references(() => adventures.id, { onDelete: 'cascade' }),
      name: text('name').notNull(),
      color: text('color').notNull(),          // hex string e.g. '#f97316'
      orderIndex: integer('order_index').notNull(),
      startKm: real('start_km').notNull(),
      endKm: real('end_km').notNull(),
      distanceKm: real('distance_km').notNull(), // = endKm - startKm (stored for easy listing)
      // elevationGainM and etaMinutes intentionally absent — computed in Story 11.3
      createdAt: timestamp('created_at').notNull().defaultNow(),
      updatedAt: timestamp('updated_at').notNull().defaultNow().$onUpdateFn(() => new Date()),
    }, (table) => ({
      adventureIdIdx: index('idx_adventure_stages_adventure_id').on(table.adventureId),
      orderIdx: index('idx_adventure_stages_order').on(table.adventureId, table.orderIndex),
    }))
    ```
  - [x] 1.2 Export from `packages/database/src/index.ts`:
    ```typescript
    export { adventureStages } from './schema/adventure-stages'
    export type AdventureStage = InferSelectModel<typeof adventureStages>
    export type NewAdventureStage = InferInsertModel<typeof adventureStages>
    ```
    Add the `import type { adventureStages } from './schema/adventure-stages'` in the imports block.
  - [x] 1.3 Run migration: `pnpm --filter @ridenrest/database drizzle-kit generate` then `drizzle-kit migrate`

### Phase 2 — Shared types + constants

- [x] Task 2: Add `AdventureStage` shared type and `STAGE_COLORS` constant (AC2, AC3)
  - [x] 2.1 In `packages/shared/src/types/adventure.types.ts`, add:
    ```typescript
    export interface AdventureStageResponse {
      id: string
      adventureId: string
      name: string
      color: string              // hex
      orderIndex: number
      startKm: number
      endKm: number
      distanceKm: number
      // elevationGainM and etaMinutes absent until Story 11.3
      createdAt: string
      updatedAt: string
    }
    ```
  - [x] 2.2 In `packages/shared/src/constants/` create `stages.constants.ts`:
    ```typescript
    // 8-color palette — cycle through on auto-assign
    export const STAGE_COLORS = [
      '#f97316', // orange
      '#3b82f6', // blue
      '#22c55e', // green
      '#a855f7', // purple
      '#ef4444', // red
      '#eab308', // yellow
      '#06b6d4', // cyan
      '#ec4899', // pink
    ] as const
    ```
  - [x] 2.3 Export from `packages/shared/src/index.ts`:
    ```typescript
    export type { AdventureStageResponse } from './types/adventure.types'
    export { STAGE_COLORS } from './constants/stages.constants'
    ```
  - [x] 2.4 Add Zod schema `createStageSchema` in `packages/shared/src/schemas/stage.schema.ts`:
    ```typescript
    import { z } from 'zod'
    export const createStageSchema = z.object({
      name: z.string().min(1).max(100),
      endKm: z.number().min(0),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
    export const updateStageSchema = z.object({
      name: z.string().min(1).max(100).optional(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    })
    export type CreateStageInput = z.infer<typeof createStageSchema>
    export type UpdateStageInput = z.infer<typeof updateStageSchema>
    ```
  - [x] 2.5 Export from `packages/shared/src/index.ts`:
    ```typescript
    export { createStageSchema, updateStageSchema } from './schemas/stage.schema'
    export type { CreateStageInput, UpdateStageInput } from './schemas/stage.schema'
    ```

### Phase 3 — NestJS backend (StagesModule)

- [x] Task 3: Create `apps/api/src/stages/` module following standard structure (AC1–AC5)
  - [x] 3.1 Create `apps/api/src/stages/dto/create-stage.dto.ts`:
    ```typescript
    import { IsString, IsNumber, Matches, MinLength, MaxLength } from 'class-validator'
    export class CreateStageDto {
      @IsString() @MinLength(1) @MaxLength(100)
      name: string
      @IsNumber()
      endKm: number
      @IsString() @Matches(/^#[0-9a-fA-F]{6}$/)
      color: string
    }
    ```
  - [x] 3.2 Create `apps/api/src/stages/dto/update-stage.dto.ts`:
    ```typescript
    import { IsString, IsOptional, Matches, MinLength, MaxLength } from 'class-validator'
    export class UpdateStageDto {
      @IsString() @IsOptional() @MinLength(1) @MaxLength(100)
      name?: string
      @IsString() @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/)
      color?: string
    }
    ```
  - [x] 3.3 Create `apps/api/src/stages/stages.repository.ts`:
    ```typescript
    // ALL Drizzle queries go here — NEVER in service
    // Methods needed:
    // - findByAdventureId(adventureId): AdventureStage[] ordered by orderIndex
    // - findByIdAndAdventureId(id, adventureId): AdventureStage | undefined
    // - create(data): AdventureStage
    // - update(id, data): AdventureStage
    // - delete(id): void
    // - updateMany(stages: Partial<AdventureStage>[]): void  ← for cascade start_km recalc
    // - findLastStageByAdventureId(adventureId): AdventureStage | undefined  ← to get start_km
    ```
  - [x] 3.4 Create `apps/api/src/stages/stages.service.ts`:
    - `listStages(adventureId, userId)` — verify adventure ownership via AdventuresService, return stages ordered by `orderIndex`
    - `createStage(adventureId, userId, dto: CreateStageDto)`:
      - Verify adventure ownership (inject AdventuresService)
      - `start_km` = last stage `end_km` OR 0 if no stages yet
      - `order_index` = existing stage count
      - `distance_km = dto.endKm - startKm`
      - Save and return
    - `updateStage(adventureId, stageId, userId, dto: UpdateStageDto)`:
      - Verify ownership, update only `name` and/or `color`
      - NOTE: `endKm` is NOT updatable here (that's 11.2 drag)
    - `deleteStage(adventureId, stageId, userId)`:
      - Verify ownership
      - Delete stage
      - Reload all remaining stages for this adventure, sorted by orderIndex
      - Recalculate: for each stage in order, `start_km` = previous stage `end_km` (or 0 if first); `distance_km = end_km - start_km`
      - Bulk update all affected stages
  - [x] 3.5 Create `apps/api/src/stages/stages.controller.ts`:
    ```typescript
    @ApiTags('stages')
    @Controller('adventures/:adventureId/stages')
    export class StagesController {
      // GET    /adventures/:adventureId/stages          → listStages
      // POST   /adventures/:adventureId/stages          → createStage
      // PATCH  /adventures/:adventureId/stages/:stageId → updateStage
      // DELETE /adventures/:adventureId/stages/:stageId → deleteStage
    }
    ```
    - Controller returns raw data — ResponseInterceptor wraps automatically (NEVER return `{ success: true, data: ... }`)
    - Use `@CurrentUser()` decorator for user extraction
    - NO try/catch — HttpExceptionFilter handles globally
  - [x] 3.6 Create `apps/api/src/stages/stages.module.ts`:
    ```typescript
    @Module({
      controllers: [StagesController],
      providers: [StagesService, StagesRepository],
      imports: [AdventuresModule],  // import to inject AdventuresService for ownership check
      exports: [StagesService],
    })
    export class StagesModule {}
    ```
  - [x] 3.7 Register in `apps/api/src/app.module.ts` — add `StagesModule` to imports array
  - [x] 3.8 Write `apps/api/src/stages/stages.service.test.ts`:
    - Test: createStage sets start_km=0 when no previous stages
    - Test: createStage sets start_km= last stage end_km
    - Test: deleteStage recalculates start_km for subsequent stages
    - Test: updateStage only updates name/color (not start/end_km)
    - Test: ownership check throws NotFoundException when adventure not found

### Phase 4 — API client (web)

- [x] Task 4: Add stage API functions to `apps/web/src/lib/api-client.ts` (AC1–AC5)
  - [x] 4.1 Add functions:
    ```typescript
    // GET /adventures/:adventureId/stages
    export async function getStages(adventureId: string): Promise<AdventureStageResponse[]>

    // POST /adventures/:adventureId/stages
    export async function createStage(adventureId: string, data: CreateStageInput): Promise<AdventureStageResponse>

    // PATCH /adventures/:adventureId/stages/:stageId
    export async function updateStage(adventureId: string, stageId: string, data: UpdateStageInput): Promise<AdventureStageResponse>

    // DELETE /adventures/:adventureId/stages/:stageId
    export async function deleteStage(adventureId: string, stageId: string): Promise<void>
    ```
  - [x] 4.2 Query key: `['adventures', adventureId, 'stages']` — follows project convention from project-context.md

### Phase 5 — useStages hook

- [x] Task 5: Create `apps/web/src/hooks/use-stages.ts` (AC3)
  - [x] 5.1 Hook interface:
    ```typescript
    function useStages(adventureId: string): {
      stages: AdventureStageResponse[]
      isPending: boolean
      createStage: (data: CreateStageInput) => Promise<void>
      updateStage: (stageId: string, data: UpdateStageInput) => Promise<void>
      deleteStage: (stageId: string) => Promise<void>
    }
    ```
  - [x] 5.2 Use `useQuery({ queryKey: ['adventures', adventureId, 'stages'], queryFn: () => getStages(adventureId) })`
  - [x] 5.3 Use `useMutation` for create/update/delete — invalidate `['adventures', adventureId, 'stages']` on success
  - [x] 5.4 Write `apps/web/src/hooks/use-stages.test.ts`:
    - Test: returns empty array when no stages
    - Test: invalidates query on create/delete

### Phase 6 — SidebarStagesSection component

- [x] Task 6: Create `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` (AC1–AC5)
  - [x] 6.1 Props interface:
    ```typescript
    interface SidebarStagesSectionProps {
      adventureId: string
      allCumulativeWaypoints: MapWaypoint[]    // for snap-to-trace on click
      onEnterClickMode: () => void             // tell map-view to enter stage click mode
      onExitClickMode: () => void
      isClickModeActive: boolean
    }
    ```
  - [x] 6.2 Render "Ajouter une étape" button — when clicked, call `onEnterClickMode()` and show cancel button
  - [x] 6.3 Stage list (scrollable if many stages):
    ```tsx
    // For each stage in stages (ordered by orderIndex):
    <div key={stage.id} className="flex items-center gap-2 rounded-md border p-2">
      <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
      <span className="flex-1 truncate text-sm font-medium">{stage.name}</span>
      <span className="text-xs text-muted-foreground">{stage.distanceKm.toFixed(1)} km</span>
      <span className="text-xs text-muted-foreground">D+ —</span>   {/* placeholder until 11.3 */}
      <span className="text-xs text-muted-foreground">— min</span>  {/* placeholder until 11.3 */}
      <button onClick={() => setEditStage(stage)}><Pencil className="h-3 w-3" /></button>
      <button onClick={() => setDeleteStage(stage)}><Trash2 className="h-3 w-3" /></button>
    </div>
    ```
  - [x] 6.4 Naming dialog (shadcn `<Dialog>`):
    - Opens after map click with the snapped `endKm`
    - Input pre-filled with "Étape N" (N = stages.length + 1)
    - Color auto-assigned: `STAGE_COLORS[stages.length % STAGE_COLORS.length]`
    - On confirm: call `createStage({ name, endKm, color })`; on success: exit click mode
    - IMPORTANT: `endKm` is stored in parent state during click mode and passed to the dialog
  - [x] 6.5 Edit dialog (shadcn `<Dialog>`):
    - Input for name, color picker (8 swatches from `STAGE_COLORS`)
    - On save: call `updateStage(stage.id, { name, color })`
  - [x] 6.6 Delete confirmation (shadcn `<AlertDialog>`):
    - "Supprimer l'étape {name} ?"
    - On confirm: call `deleteStage(stage.id)`
  - [x] 6.7 Write `sidebar-stages-section.test.tsx`:
    - Test: renders "Ajouter une étape" button
    - Test: stage list renders with distance, "—" for D+ and ETA
    - Test: edit dialog opens on pencil icon click
    - Test: delete AlertDialog opens on trash icon click
    - Test: `onEnterClickMode` called when "Ajouter une étape" clicked

### Phase 7 — Map integration (click mode + markers)

- [x] Task 7: Integrate stage click mode and markers in map-view.tsx + map-canvas.tsx (AC1, AC6)
  - [x] 7.1 In `map-view.tsx`, add state:
    ```typescript
    const [stageClickMode, setStageClickMode] = useState(false)
    const [pendingEndKm, setPendingEndKm] = useState<number | null>(null)
    const [showNamingDialog, setShowNamingDialog] = useState(false)
    ```
  - [x] 7.2 Pass to `MapCanvas`:
    ```typescript
    stageClickMode={stageClickMode}
    stages={stages}             // AdventureStageResponse[] from useStages
    onStageClick={(endKm) => {
      setPendingEndKm(endKm)
      setShowNamingDialog(true)
      setStageClickMode(false)  // exit click mode after placement
    }}
    ```
  - [x] 7.3 In `map-canvas.tsx`, handle stage click mode:
    - When `stageClickMode=true`, add a `onClick` handler on the MapLibre `<Map>`:
      - Get click lngLat
      - Find nearest waypoint in `allWaypoints`: `min(|wp.distKm - cursor_km|)` — approximate cursor_km via reverse lookup (find waypoint closest to click lat/lng via Haversine)
      - Call `onStageClick(nearestWp.distKm)`
    - Note: snap logic — iterate `allWaypoints`, find minimum distance from click point to each waypoint lat/lng (use `snapToTrace` pattern from `@ridenrest/gpx` if available, or simple nearest-neighbor loop)
  - [x] 7.4 In `map-canvas.tsx`, render stage markers:
    ```tsx
    // For each stage: render a colored circle at end_km position
    {stages.map(stage => {
      const wp = allWaypoints?.reduce((nearest, wp) =>
        Math.abs(wp.distKm - stage.endKm) < Math.abs(nearest.distKm - stage.endKm) ? wp : nearest
      )
      if (!wp) return null
      return (
        <Marker key={stage.id} latitude={wp.lat} longitude={wp.lng} anchor="center">
          <div
            className="h-4 w-4 rounded-full border-2 border-white shadow-md"
            style={{ backgroundColor: stage.color }}
          />
        </Marker>
      )
    })}
    ```
  - [x] 7.5 In `map-canvas.tsx`, render colored trace segments per stage:
    - For each stage, extract waypoints between `startKm` and `endKm`
    - Render as a MapLibre `<Source>` (GeoJSON LineString) + `<Layer>` (type: 'line', paint: `{ 'line-color': stage.color, 'line-width': 4 }`)
    - Layer id: `stage-segment-${stage.id}` — unique per stage
    - These layers should be above the base GPX trace layer (use `beforeId` if needed)
  - [x] 7.6 In `map-view.tsx`, add `SidebarStagesSection` at the sidebar placeholder:
    ```tsx
    {/* Stages list — Epic 11 */}
    <SidebarStagesSection
      adventureId={adventureId}
      allCumulativeWaypoints={allCumulativeWaypoints}
      onEnterClickMode={() => setStageClickMode(true)}
      onExitClickMode={() => setStageClickMode(false)}
      isClickModeActive={stageClickMode}
      pendingEndKm={pendingEndKm}
      showNamingDialog={showNamingDialog}
      onNamingDialogClose={() => {
        setShowNamingDialog(false)
        setPendingEndKm(null)
      }}
    />
    ```
    (Adjust props if dialog management is handled inside the section component instead.)
  - [x] 7.7 Write tests for `map-canvas.tsx` stage marker rendering:
    - Test: `stages` prop renders a `<Marker>` per stage
    - Test: `stageClickMode=true` adds click handler (mock map click event)

### Review Follow-ups (AI Code Review 2026-03-28)

- [x] [AI-Review][CRITICAL] `deleteStage` ne normalisait pas `orderIndex` → collision de `orderIndex` au prochain `createStage` — fix: `updateMany` inclut maintenant `orderIndex`, `deleteStage` normalise en 0,1,2... `[stages.service.ts:81-88, stages.repository.ts:59-69]`
- [x] [AI-Review][HIGH] Tests `sidebar-stages-section.test.tsx` n'expandaient pas la section → assertions sur contenu caché toujours en échec — fix: ajout `expand()` helper + click header avant chaque assertion `[sidebar-stages-section.test.tsx]`
- [x] [AI-Review][HIGH] `defaultProps` dans `sidebar-stages-section.test.tsx` manquait `stagesVisible` et `onStagesVisibilityChange` — fix: props ajoutées + composant refactoré en dumb component `[sidebar-stages-section.test.tsx]`
- [x] [AI-Review][HIGH] Test map-canvas assertion `>= 0` toujours vraie — fix: changé en `>= 2` (1 marker par stage) `[map-canvas.test.tsx:221]`
- [ ] [AI-Review][HIGH] `stagesVisible` par défaut à `false` — **intentionnel** (confirmé Guillaume 2026-03-28) : toggle opt-in délibéré, AC6 considérée respectée avec le switch "Afficher sur la carte"
- [x] [AI-Review][MEDIUM] `findLastByAdventureId` chargeait tous les stages pour prendre le dernier — fix: `ORDER BY order_index DESC LIMIT 1` `[stages.repository.ts:24-31]`
- [x] [AI-Review][MEDIUM] `createStage` sans validation `endKm > startKm` → `distanceKm` négatif possible — fix: `BadRequestException` si `distanceKm <= 0` `[stages.service.ts:33-38]`
- [x] [AI-Review][MEDIUM] Fichiers migration `_journal.json` et `0006_snapshot.json` absents du File List — fix: ajoutés dans le File List ci-dessus
- [x] [AI-Review][MEDIUM] `useStages` appelé 2x (map-view + SidebarStagesSection) — fix: `SidebarStagesSection` devient dumb component, reçoit stages+mutations via props `[sidebar-stages-section.tsx, map-view.tsx]`
- [x] [AI-Review][LOW] Deux `useEffect` identiques pour `updateStageLayers` + `renderStageMarkers` — fix: fusionnés en un seul effet `[map-canvas.tsx]`
- [ ] [AI-Review][LOW] `deleteStage` retourne `{ deleted: boolean }` au lieu de void/204 — incohérence REST cosmétique, à traiter si ResponseInterceptor est révisé post-MVP

### Phase 8 — Sprint status update

- [x] Task 8: Update sprint-status.yaml (no code change needed)
  - [x] 8.1 Update `epic-11: backlog` → `epic-11: in-progress`
  - [x] 8.2 Update `11-1-stage-crud-km-input: backlog` → `11-1-stage-crud-km-input: review`
  - (This is done automatically by the SM workflow — not by the dev agent)

## Dev Notes

### Architecture à respecter

- NestJS: pattern `module/controller/service/repository` — TOUTES les queries Drizzle dans le repository, jamais dans le service
- Controller: retourne les données brutes — `ResponseInterceptor` enveloppe automatiquement. JAMAIS de `return { success: true, data: ... }`
- Errors: le service lance `NotFoundException`, `BadRequestException` — le controller N'a PAS de try/catch
- Ownership check: toujours vérifier que l'`adventure_id` appartient à l'utilisateur connecté via `AdventuresService.findByIdAndUser()`
- `@CurrentUser()` decorator: `apps/api/src/common/decorators/current-user.decorator.ts`

### Data flow (stages)

```
DB adventure_stages (packages/database)
  → NestJS StagesModule (apps/api/src/stages/)
  → REST /adventures/:id/stages
  → api-client.ts (getStages, createStage, ...)
  → useStages hook (TanStack Query)
  → SidebarStagesSection (list + dialogs)
  → MapCanvas (markers + colored segments)
```

### Drizzle migration

Après avoir créé le fichier schema:
```bash
cd packages/database
pnpm drizzle-kit generate   # génère le fichier SQL de migration
pnpm drizzle-kit migrate    # applique en local (Docker PostgreSQL :5432)
```

La migration sera appliquée en production automatiquement par `deploy.sh` (step 5: `drizzle-kit migrate`).

### Concernant D+ et ETA dans le sidebar

L'AC3 dit : D+ = "—", ETA = "—" pour l'instant. Ce n'est PAS une valeur calculée à la volée — c'est un placeholder string. Story 11.3 ajoutera les champs `elevation_gain_m` et `eta_minutes` à la DB et les calculera au moment de la sauvegarde. Le dev agent NE DOIT PAS tenter de calculer le D+ en 11.1.

### Couleurs de trace sur MapLibre

Les segments colorisés de densité (epic 5) utilisent déjà le même pattern de couches GeoJSON dynamiques. Référence: `apps/web/src/hooks/use-density.ts` et la source `density-source` dans `map-canvas.tsx`. Utiliser le même pattern `<Source>` + `<Layer>` pour les étapes.

Attention aux conflits de layer IDs — préfixer avec `stage-segment-` pour éviter toute collision avec les layers densité ou POI.

### Visibility toggle — comportement intentionnel (AC6)

Le toggle "Afficher sur la carte" (`stagesVisible`) est un ajout UX délibéré non décrit dans la story. Il est initialisé à `false` (opt-in). Ce comportement est **voulu** — Guillaume a confirmé que les étapes doivent être opt-in plutôt qu'affichées automatiquement. L'AC6 est considérée respectée dans ce contexte : le toggle offre un contrôle explicite à l'utilisateur.

### Cursor en mode clic

Quand `stageClickMode=true`, changer le cursor MapLibre en `crosshair`:
```typescript
map.getCanvas().style.cursor = stageClickMode ? 'crosshair' : ''
```
Réinitialiser dans le cleanup ou quand `stageClickMode` passe à `false`.

### snap-to-trace pour le clic map

Utiliser `snapToTrace` de `@ridenrest/gpx` — déjà utilisé dans `apps/web/src/app/(app)/live/[id]/page.tsx`:
```typescript
import { snapToTrace } from '@ridenrest/gpx'
// Dans le onClick du map:
const snapped = snapToTrace({ lat: lngLat.lat, lng: lngLat.lng }, allWaypoints)
// snapped.distKm = endKm de la nouvelle étape
```

### Segments colorisés — extraction des waypoints par km range

Filtrer `allCumulativeWaypoints` entre `startKm` et `endKm`:
```typescript
const segmentWaypoints = allWaypoints.filter(wp =>
  wp.distKm >= stage.startKm && wp.distKm <= stage.endKm
)
// Convertir en GeoJSON coordinates: [lng, lat]
const coordinates = segmentWaypoints.map(wp => [wp.lng, wp.lat])
```

Ne pas oublier d'inclure le point exact de `start_km` et `end_km` (le snap garantit que ces valeurs correspondent à des waypoints existants).

### Module registration

Ajouter dans `apps/api/src/app.module.ts`:
```typescript
import { StagesModule } from './stages/stages.module.js'
// dans imports: [..., StagesModule]
```

### Dépendances croisées

`StagesModule` a besoin de `AdventuresService` pour le check d'ownership. Deux options:
1. Importer `AdventuresModule` dans `StagesModule` (préféré — cohérent avec le pattern existant)
2. Dupliquer la query ownership dans `StagesRepository` (à éviter)

Utiliser l'option 1: `imports: [AdventuresModule]` dans `StagesModule`, et `AdventuresModule` doit exporter `AdventuresService` (il le fait déjà).

### Project Structure: New Files

**Packages à créer:**
- `packages/database/src/schema/adventure-stages.ts` — table Drizzle
- `packages/shared/src/constants/stages.constants.ts` — STAGE_COLORS
- `packages/shared/src/schemas/stage.schema.ts` — Zod schemas

**Backend à créer:**
- `apps/api/src/stages/stages.module.ts`
- `apps/api/src/stages/stages.controller.ts`
- `apps/api/src/stages/stages.service.ts`
- `apps/api/src/stages/stages.service.test.ts`
- `apps/api/src/stages/stages.repository.ts`
- `apps/api/src/stages/dto/create-stage.dto.ts`
- `apps/api/src/stages/dto/update-stage.dto.ts`

**Frontend à créer:**
- `apps/web/src/hooks/use-stages.ts`
- `apps/web/src/hooks/use-stages.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx`

**Fichiers à modifier:**
- `packages/database/src/index.ts` — ajouter `adventureStages`, types `AdventureStage`, `NewAdventureStage`
- `packages/shared/src/types/adventure.types.ts` — ajouter `AdventureStageResponse`
- `packages/shared/src/index.ts` — exporter `AdventureStageResponse`, `STAGE_COLORS`, Zod schemas
- `apps/api/src/app.module.ts` — importer `StagesModule`
- `apps/web/src/lib/api-client.ts` — ajouter fonctions stage
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — ajouter props `stages`, `stageClickMode`, `onStageClick`; render marqueurs + segments colorisés
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — état `stageClickMode`, instancier `SidebarStagesSection`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — epic-11 → in-progress, 11-1 → done

### Références

- Pattern module NestJS: `apps/api/src/segments/` — suivre exactement cette structure
- `AdventuresModule` export: `apps/api/src/adventures/adventures.module.ts:9` — `exports: [AdventuresService]`
- `@CurrentUser()` decorator: `apps/api/src/common/decorators/current-user.decorator.ts`
- `ResponseInterceptor`: global dans `apps/api/src/main.ts` — ne pas le redéclarer
- Query key convention: `packages/shared/src/types/adventure.types.ts` + `project-context.md`
- MapLibre Marker: déjà importé dans `map-canvas.tsx` (utilisé pour le crosshair 8.8)
- `snapToTrace`: `packages/gpx/src/` — déjà utilisé en `live/[id]/page.tsx`
- Sidebar placeholder: `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx:174` — `{/* Stages list — Epic 11 */}`
- Shadcn Dialog: déjà utilisé dans `sidebar-density-section.tsx` (popin catégories 8.7)
- Shadcn AlertDialog: déjà utilisé dans `adventure-detail-page` (delete confirmation)
- `STAGE_COLORS` cycling: `STAGE_COLORS[stages.length % STAGE_COLORS.length]`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was clean after resolving migration and test mock issues.

### Completion Notes List

- Drizzle migration `0006_strong_whiplash.sql` had to be manually edited to remove a redundant `ALTER TABLE "adventures" ADD COLUMN "density_categories"` line that was already applied in `0005`.
- `snapToTrace` from `@ridenrest/gpx` uses `KmWaypoint` with a `km` field (not `distKm`), so the stage click handler uses an inline nearest-neighbor loop on raw lat/lng squared distance instead of calling `snapToTrace` directly.
- `map-canvas.test.tsx` stage tests required adding several missing mock methods (`getStyle`, `getLayer`, `off`, `getCanvas`, `removeLayer`, `removeSource`, `setLayoutProperty`, `setPaintProperty`) to `mockMapInstance` in a dedicated `beforeEach`.
- Stage click handler test needed a `rerender` pattern: first render with `stageClickMode=false`, await map `load` event, then rerender with `stageClickMode=true` to ensure `mapRef.current` is set before the effect runs.
- All 564 web + 173 API tests pass with zero regressions.

### File List

**New files:**
- `packages/database/src/schema/adventure-stages.ts`
- `packages/database/migrations/0006_strong_whiplash.sql`
- `packages/database/migrations/meta/0006_snapshot.json`
- `packages/shared/src/constants/stages.constants.ts`
- `packages/shared/src/schemas/stage.schema.ts`
- `apps/api/src/stages/dto/create-stage.dto.ts`
- `apps/api/src/stages/dto/update-stage.dto.ts`
- `apps/api/src/stages/stages.repository.ts`
- `apps/api/src/stages/stages.service.ts`
- `apps/api/src/stages/stages.service.test.ts`
- `apps/api/src/stages/stages.controller.ts`
- `apps/api/src/stages/stages.module.ts`
- `apps/web/src/hooks/use-stages.ts`
- `apps/web/src/hooks/use-stages.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx`

**Modified files:**
- `packages/database/src/index.ts` — added `adventureStages` export + `AdventureStage`/`NewAdventureStage` types
- `packages/database/migrations/meta/_journal.json` — updated with new migration entry
- `packages/shared/src/types/adventure.types.ts` — added `AdventureStageResponse` interface
- `packages/shared/src/index.ts` — exported `AdventureStageResponse`, `STAGE_COLORS`, `createStageSchema`, `updateStageSchema`, `CreateStageInput`, `UpdateStageInput`
- `apps/api/src/app.module.ts` — imported `StagesModule`
- `apps/web/src/lib/api-client.ts` — added `getStages`, `createStage`, `updateStage`, `deleteStage` + re-exports
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — added stage props, click mode handler, combined stage layers+markers effect
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — added stage props describe block (2 tests)
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — added `stageClickMode`/`pendingEndKm`/`showNamingDialog` state, `useStages` hook, `SidebarStagesSection` component
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — `epic-11` → `in-progress`, `11-1-stage-crud-km-input` → `review`
