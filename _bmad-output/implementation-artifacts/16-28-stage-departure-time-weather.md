# Story 16.28: Heure de Depart par Etape + Meteo Ajustee

Status: done

## Story

As a **cyclist planning a multi-day adventure**,
I want to set a departure time for each stage,
so that the weather forecast shows the conditions I'll actually encounter when I ride each stage — not just a flat estimate from a single global departure time.

## Acceptance Criteria

1. **Given** l'utilisateur est sur la page planning (map) avec des etapes definies,
   **When** il consulte une etape dans la sidebar (section Etapes),
   **Then** un champ "Depart" est visible sur chaque etape, affichant l'heure de depart configuree ou un placeholder "Definir" si non definie.

2. **Given** l'utilisateur clique sur le champ "Depart" d'une etape,
   **When** un date-time picker s'ouvre (inline ou popover),
   **Then** il peut saisir une date et heure de depart (format `datetime-local`), et la valeur est sauvegardee via `PATCH /adventures/:adventureId/stages/:stageId` avec le champ `departureTime`.

3. **Given** une etape a une `departureTime` definie,
   **When** la meteo de cette etape est demandee (via `StageWeatherBadge`),
   **Then** l'API utilise la `departureTime` de l'etape (pas le `departureTime` global) pour calculer l'ETA au `endKm` de l'etape : `ETA = stage.departureTime + (stage.distanceKm / speedKmh) × 3600000ms`.

4. **Given** une etape n'a PAS de `departureTime` definie,
   **When** la meteo de cette etape est demandee,
   **Then** le comportement actuel est preserve : le `departureTime` global (localStorage) est utilise en fallback, ou l'heure actuelle si aucun n'est defini.

5. **Given** l'utilisateur modifie la `departureTime` d'une etape,
   **When** la valeur change,
   **Then** le `StageWeatherBadge` de cette etape se rafraichit automatiquement (le queryKey TanStack Query change → refetch).

6. **Given** l'utilisateur supprime la `departureTime` d'une etape (vide le champ),
   **When** la valeur est effacee,
   **Then** `departureTime` repasse a `null` en DB et le fallback global reprend effet.

7. **Given** au moins une etape a une `departureTime` definie,
   **When** l'utilisateur active le layer meteo sur la carte,
   **Then** le weather layer (trace coloree) utilise les `departureTime` des etapes pour calculer l'ETA a chaque km (au lieu du depart global), le champ "date de depart" dans `WeatherControls` est masque (remplace par un message indiquant que les dates viennent des etapes), et les `StageWeatherBadge` dans la sidebar ne sont plus affiches (la meteo est deja visible sur le layer carte).

8. **Given** aucune etape n'a de `departureTime` definie,
   **When** l'utilisateur active le layer meteo,
   **Then** le comportement actuel est preserve : le champ depart global dans `WeatherControls` est affiche normalement, et les `StageWeatherBadge` restent affiches dans la sidebar.

## Tasks / Subtasks

- [x] Task 1: Schema DB — ajouter `departure_time` a `adventure_stages` (AC: #2)
  - [x] 1.1 Ajouter `departureTime: timestamp('departure_time')` (nullable) dans `packages/database/src/schema/adventure-stages.ts`
  - [x] 1.2 Generer la migration : `cd packages/database && pnpm drizzle-kit generate`
  - [x] 1.3 Verifier le SQL genere (ALTER TABLE adventure_stages ADD COLUMN departure_time timestamp)

- [x] Task 2: API — accepter et retourner `departureTime` sur les stages (AC: #2, #3, #4)
  - [x] 2.1 `UpdateStageDto` : ajouter `departureTime?: string` (ISO 8601, `@IsOptional() @IsISO8601()`)
  - [x] 2.2 `updateStageSchema` (shared) : ajouter `departureTime: z.string().datetime().optional().nullable()`
  - [x] 2.3 `StagesService.updateStage()` : persister `departureTime` (convertir ISO string → Date ou null)
  - [x] 2.4 `StagesService.toResponse()` : ajouter `departureTime: s.departureTime?.toISOString() ?? null`
  - [x] 2.5 `AdventureStageResponse` (shared types) : ajouter `departureTime: string | null`

- [x] Task 3: API — meteo par etape utilise `stage.departureTime` en priorite (AC: #3, #4)
  - [x] 3.1 `StagesService.getStageWeather()` : lire `stage.departureTime` depuis le stage DB
  - [x] 3.2 Logique de priorite : `stage.departureTime ?? dto.departureTime` (le depart de l'etape prend precedence sur le global passe en query param)
  - [x] 3.3 Calcul ETA : `stage.departureTime + (stage.distanceKm / speedKmh) × 3600000ms` pour arriver au `endKm` de l'etape (pas `stage.departureTime + (stage.endKm / speed)` qui partirait du km 0)
  - [x] 3.4 Tests : `stages.service.test.ts` — tester les 3 cas : stage.departureTime defini, dto.departureTime fallback, aucun (heure actuelle)

- [x] Task 4: Frontend — champ `departureTime` sur chaque etape (AC: #1, #2, #5, #6)
  - [x] 4.1 Dans `sidebar-stages-section.tsx`, ajouter un `<input type="datetime-local">` dans chaque carte d'etape, sous la ligne ETA/D+
  - [x] 4.2 Au `onChange`, appeler `onUpdateStage(stageId, { departureTime: value || null })`
  - [x] 4.3 Afficher la valeur formatee (ex: "Mar 8 avr, 07:00") quand definie, sinon un bouton discret "Definir le depart"

- [x] Task 5: Frontend — `StageWeatherBadge` utilise `stage.departureTime` (AC: #3, #5)
  - [x] 5.1 Modifier `StageWeatherBadge` pour accepter un prop `stageDepartureTime?: string | null`
  - [x] 5.2 Logique : passer `stageDepartureTime ?? departureTime` (global) au hook `useStageWeather`
  - [x] 5.3 `stageDepartureTime` inclus dans le queryKey via `effectiveDepartureTime` — refetch automatique quand la valeur change

- [x] Task 6: Tests backend (weather priority)
  - [x] 6.1 Test `getStageWeather` : stage.departureTime defini → appelle `getWeatherAtKmWithEta` avec stage.distanceKm
  - [x] 6.2 Test `getStageWeather` : stage.departureTime null + global → fallback sur `getWeatherAtKm` classique
  - [x] 6.3 Test `getStageWeather` : ni stage ni global → `getWeatherAtKm` avec undefined

- [x] Task 7: API — weather trace utilise les `departureTime` des etapes (AC: #7, #8)
  - [x] 7.1 `GET /weather` (trace forecast) : accepter un parametre optionnel `stageDepartures` (JSON stringifie, array [{startKm, endKm, departureTime}])
  - [x] 7.2 `WeatherService.getWeatherForecast()` : pour chaque waypoint, determiner dans quelle etape il tombe (par km range), et utiliser le `departureTime` de cette etape pour le calcul ETA au lieu du depart global
  - [x] 7.3 Fallback : si un waypoint n'est dans aucune etape ou si l'etape n'a pas de departureTime, utiliser le depart global (comportement actuel preserve)

- [x] Task 8: Frontend — weather layer utilise les dates des etapes (AC: #7, #8)
  - [x] 8.1 Dans `map-view.tsx`, detecter si au moins une etape a un `departureTime` defini (`hasAnyStageDeparture`)
  - [x] 8.2 Si `hasAnyStageDeparture`, construire la map `stageDepartures` et la passer au query `weatherQueries` au lieu du `paceParams.departureTime` global
  - [x] 8.3 `stageDepartures` inclus dans le queryKey pour declencher le refetch quand une date d'etape change

- [x] Task 9: Frontend — masquer le champ depart global et badges quand les etapes ont des dates (AC: #7, #8)
  - [x] 9.1 Dans `WeatherControls`, ajouter une prop `stagesHaveDepartures: boolean`
  - [x] 9.2 Quand `stagesHaveDepartures === true`, masquer l'input datetime-local et afficher "Dates definies par etape"
  - [x] 9.3 Quand `stagesHaveDepartures === false`, afficher l'input normalement (inchange)
  - [x] 9.4 `SidebarStagesSection` : masquer `StageWeatherBadge` quand `stagesHaveDepartures === true`

## Dev Notes

### Fichiers a modifier

| Fichier | Action |
|---------|--------|
| `packages/database/src/schema/adventure-stages.ts` | Ajouter colonne `departure_time` nullable |
| `packages/shared/src/types/adventure.types.ts` | Ajouter `departureTime` a `AdventureStageResponse` |
| `packages/shared/src/schemas/stage.schema.ts` | Ajouter `departureTime` a `updateStageSchema` |
| `apps/api/src/stages/dto/update-stage.dto.ts` | Ajouter `departureTime` avec validation ISO 8601 |
| `apps/api/src/stages/stages.service.ts` | Persister `departureTime`, utiliser dans `getStageWeather` |
| `apps/api/src/stages/stages.service.test.ts` | Tests meteo avec/sans stage.departureTime |
| `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` | Champ datetime-local par etape |
| `apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.tsx` | Prop `stageDepartureTime` prioritaire |
| `apps/web/src/hooks/use-stage-weather.ts` | QueryKey incluant stage departure time |

### Architecture du calcul meteo (avant/apres)

**Avant (actuel) :**
```
GET /stages/:id/weather?departureTime=2026-04-08T07:00:00Z&speedKmh=15
→ ETA = departureTime + (stage.endKm / speedKmh) × 3600000
→ Probleme : departureTime est le depart global (km 0), endKm est le km absolu
→ Pour l'etape 3 (150km → 200km), l'ETA est calcule depuis le km 0 ce qui est correct
```

**Apres (avec departure par etape) :**
```
GET /stages/:id/weather?departureTime=2026-04-08T07:00:00Z&speedKmh=15
→ stage.departureTime existe ? utiliser : stage.departureTime + (stage.distanceKm / speedKmh) × 3600000
→ stage.departureTime null ? fallback : dto.departureTime + (stage.endKm / speedKmh) × 3600000 (inchange)
```

Le calcul cle : quand `stage.departureTime` est defini, l'ETA au endKm est calcule depuis le debut de CETTE etape (pas du km 0). `stage.distanceKm` est la longueur de l'etape, pas le km absolu.

### Pattern UI existant pour les etapes

La sidebar des etapes (`sidebar-stages-section.tsx`) affiche deja pour chaque etape :
- Nom + couleur (badge colore)
- `startKm → endKm` | `distanceKm km` | `↑ D+ m` | `~ETA`
- `StageWeatherBadge` (emoji + temperature + vent)

Le champ `departureTime` s'insere naturellement sous la ligne de stats, comme un petit `<input type="datetime-local">` discret ou un bouton "Definir le depart" qui ouvre un champ.

### Drizzle migration — workflow obligatoire

```bash
# 1. Editer le schema
packages/database/src/schema/adventure-stages.ts

# 2. Generer la migration
cd packages/database && pnpm drizzle-kit generate

# 3. Ne JAMAIS ecrire le SQL a la main
```

### Regressions a eviter

- Ne PAS casser le calcul meteo global (quand aucune etape n'a de departureTime, tout fonctionne comme avant)
- Ne PAS supprimer le `departureTime` du `WeatherControls` (champ de depart global) — il reste le fallback
- Ne PAS modifier le endpoint `GET /weather` (trace weather) — seul `GET /stages/:id/weather` est impacte
- L'ETA affiche dans la liste des etapes (`etaMinutes`) ne change PAS — c'est la duree de parcours de l'etape, pas l'heure d'arrivee
- Le champ `departureTime` par etape est optionnel — UX non bloquante

### Type `departureTime` en DB

`timestamp('departure_time')` sans timezone — coherent avec `created_at` et `updated_at` existants. Le frontend envoie en ISO 8601, le backend convertit avec `new Date(dto.departureTime)`.

### References

- [Source: packages/database/src/schema/adventure-stages.ts] — schema Drizzle, colonnes existantes
- [Source: apps/api/src/stages/stages.service.ts:238-251] — `getStageWeather` actuel
- [Source: apps/api/src/weather/weather.service.ts:128-160] — `getWeatherAtKm` avec calcul ETA
- [Source: apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.tsx] — badge meteo par etape
- [Source: apps/web/src/hooks/use-stage-weather.ts] — hook TanStack Query
- [Source: apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx] — rendu des etapes
- [Source: apps/web/src/lib/weather-pace.ts] — departureTime global (localStorage)
- [Source: packages/shared/src/schemas/stage.schema.ts] — schemas Zod stage
- [Source: packages/shared/src/types/adventure.types.ts:66-79] — AdventureStageResponse

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- All 247 API tests pass (34 stages service tests including 5 weather priority tests)
- Shared, database, API, and web builds all pass without errors

### Completion Notes List
- Task 1: Added `departure_time` timestamp nullable column to `adventure_stages` schema + generated migration `0011_mighty_union_jack.sql`
- Task 2: Added `departureTime` to `UpdateStageDto` (class-validator), `updateStageSchema` (Zod), `AdventureStageResponse` (shared types), `StagesService.updateStage()` (persistence), and `toResponse()` (serialization)
- Task 3: Updated `findByIdWithAdventureUserId` to return `distanceKm` and `departureTime`. Added `getWeatherAtKmWithEta` to `WeatherService` for stage-relative ETA calculation. `getStageWeather` now uses stage departure time as priority over global, with correct ETA formula: `stage.departureTime + (stage.distanceKm / speedKmh) * 3600000ms`
- Task 4: Created `StageDepartureInput` component with 3 states: "Définir le départ" button (no value), formatted display with clear button (value set), datetime-local input (editing). Uses `useCallback` for stable handler.
- Task 5: Added `stageDepartureTime` prop to `StageWeatherBadge`, computes `effectiveDepartureTime = stageDepartureTime ?? departureTime` and passes to hook. QueryKey auto-updates because `departureTime` is already in the key.
- Task 6: Added 5 weather priority tests: stage departure → `getWeatherAtKmWithEta`, global fallback → `getWeatherAtKm`, no departure time → undefined. Updated `makeStage` and mock to include `departureTime` field.
- Task 7: Added `stageDepartures` JSON query param to `GET /weather` DTO. `WeatherService.getWeatherForecast()` parses stage departures and computes per-waypoint ETA based on which stage each waypoint falls in (`adventureKm >= startKm && adventureKm <= endKm`). Falls back to global departure time for waypoints outside any stage.
- Task 8: In `map-view.tsx`, computed `stageDeparturesJson` (useMemo) and `hasAnyStageDeparture` from stages. Weather queries pass `stageDepartures` when available, skip global `departureTime` in that case. `stageDepartures` included in queryKey for auto-refetch.
- Task 9: `WeatherControls` shows "Dates définies par étape" message instead of datetime input when `stagesHaveDepartures=true`. `SidebarStagesSection` hides `StageWeatherBadge` when `stagesHaveDepartures=true`. Prop chain: `map-view → SidebarWeatherSection → WeatherControls` and `map-view → SidebarStagesSection`.

### File List
- `packages/database/src/schema/adventure-stages.ts` — added `departureTime` column
- `packages/database/migrations/0011_mighty_union_jack.sql` — generated migration
- `packages/database/migrations/meta/_journal.json` — auto-updated by drizzle-kit
- `packages/shared/src/types/adventure.types.ts` — added `departureTime` to `AdventureStageResponse`
- `packages/shared/src/schemas/stage.schema.ts` — added `departureTime` to `updateStageSchema`
- `apps/api/src/stages/dto/update-stage.dto.ts` — added `departureTime` with `@IsISO8601()` validation
- `apps/api/src/stages/stages.service.ts` — persist `departureTime` in `updateStage()`, priority logic in `getStageWeather()`
- `apps/api/src/stages/stages.repository.ts` — `findByIdWithAdventureUserId` now returns `distanceKm` + `departureTime`
- `apps/api/src/weather/weather.service.ts` — added `getWeatherAtKmWithEta()` + `stageDepartures` ETA logic in `getWeatherForecast()`
- `apps/api/src/weather/dto/get-weather.dto.ts` — added `stageDepartures` optional string param + `StageDeparture` interface
- `apps/api/src/stages/stages.service.test.ts` — 5 weather priority tests, updated `makeStage` helper
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — `StageDepartureInput` component + `stagesHaveDepartures` prop
- `apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.tsx` — `stageDepartureTime` prop
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — `stageDeparturesJson` + `hasAnyStageDeparture` + updated weather queries
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-weather-section.tsx` — `stagesHaveDepartures` prop passthrough
- `apps/web/src/app/(app)/map/[id]/_components/weather-controls.tsx` — conditional departure input vs "Dates définies par étape"
- `apps/web/src/lib/api-client.ts` — `stageDepartures` param in `GetWeatherParams` + `getWeatherForecast()`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — added `departureTime: null` to fixtures
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx` — added `departureTime: null` to fixtures
- `apps/web/src/app/(app)/map/[id]/_components/elevation-profile.test.tsx` — added `departureTime: null` to fixtures
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx` — added `departureTime: null` to fixtures
- `apps/web/src/app/(app)/live/[id]/page.test.tsx` — added `departureTime: null` to fixtures
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx` — added `departureTime: null` to fixtures

### Review Findings

- [x] [Review][Patch] Global departure fallback — Message d'avertissement UX quand certaines étapes n'ont pas de date de départ. [weather-controls.tsx, map-view.tsx, sidebar-weather-section.tsx]
- [x] [Review][Patch] `@IsISO8601()` rejette `null` — Ajout `@ValidateIf((o) => o.departureTime !== null)`. [update-stage.dto.ts:21]
- [x] [Review][Patch] `stageDepartures` JSON sans validation de structure — Filtrage des entrées invalides après parsing. [weather.service.ts:61]
- [x] [Review][Patch] `StageDepartureInput` état local désynchronisé — Ajout `key={stage.id + (stage.departureTime ?? '')}` pour forcer remount. [sidebar-stages-section.tsx:293]
