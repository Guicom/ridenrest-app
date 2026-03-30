# Story 11.5: Stage-Scoped Weather

Status: review

## Story

As a **cyclist planning stages**,
I want weather forecasts aligned with my expected arrival time at each stage endpoint,
So that I know what conditions to expect at my overnight stop.

## Acceptance Criteria

**AC1 — Weather fetched at stage endpoint with ETA-adjusted datetime**

Given stages are defined, `weatherActive = true`, and a `departureTime` + `speedKmh` are set in the weather controls,
When weather is requested for a stage,
Then `etaDatetime = departureTime + (stage.endKm / speedKmh) * 3_600_000` (ms), and the weather forecast is fetched at the stage endpoint coordinates for that datetime. The backend finds the lat/lng for `stage.endKm` by looking up the closest waypoint in the adventure's segments.

**AC2 — Fallback to current time if no departure time**

Given no `departureTime` is set in the weather controls (field empty),
When weather for a stage is requested,
Then the weather is fetched at `stage.endKm` coordinates using `new Date()` as the forecast time — same fallback behavior as Epic 6.

**AC3 — Compact weather badge per stage in sidebar**

Given `weatherActive = true` and stages are defined,
When the stages section renders in the sidebar,
Then each stage row shows a compact weather badge: temperature (e.g., "14°"), precipitation icon (rain drop, shown only if > 0.5 mm/h), wind speed (e.g., "12 km/h" with arrow rotated to wind direction). The badge appears to the right of the ETA display. While loading, show a skeleton shimmer.

**AC4 — Backend: `GET /stages/:stageId/weather` endpoint**

Given a valid `stageId` (UUID), optional `departureTime` (ISO 8601), optional `speedKmh` (number 1–100),
When the endpoint is called by an authenticated user,
Then the API:
1. Loads the stage (ownership check: stage → adventure → user)
2. Computes `etaDatetime = departureTime + (stage.endKm / speedKmh) * 3_600_000` (fallback: `new Date()` if no departureTime)
3. Finds the lat/lng at `stage.endKm` from the adventure's segment waypoints
4. Fetches Open-Meteo hourly forecast for that lat/lng; picks the slot matching `etaDatetime`
5. Returns: `{ forecastAt: string, temperatureC: number, precipitationMmH: number, windSpeedKmh: number, windDirectionDeg: number, iconEmoji: string }`

**AC5 — Weather hidden when `weatherActive = false`**

Given `weatherActive = false` in MapStore,
When the stages section renders,
Then no weather badges appear on stage rows (component not mounted).

**AC6 — No redundant fetches: one query per stage**

Given multiple stages exist and weather is active,
When the sidebar renders,
Then each stage fires a separate TanStack Query with key `['stages', stageId, 'weather', { departureTime, speedKmh }]`. Queries share cache if two stages happen to use the same `{ stageId, departureTime, speedKmh }`.

## Tasks / Subtasks

### Phase 1 — Backend: DTO + Service method for stage weather

- [x] Task 1: Create `GetStageWeatherDto` in `apps/api/src/stages/dto/`
  - [x] 1.1 Create `apps/api/src/stages/dto/get-stage-weather.dto.ts`:
    ```typescript
    import { IsOptional, IsISO8601, IsNumber, Min, Max } from 'class-validator'
    import { Type } from 'class-transformer'

    export class GetStageWeatherDto {
      @IsOptional()
      @IsISO8601()
      departureTime?: string

      @IsOptional()
      @Type(() => Number)
      @IsNumber()
      @Min(1)
      @Max(100)
      speedKmh?: number
    }
    ```

### Phase 2 — Backend: Weather lookup helper in WeatherService

- [x] Task 2: Add `getWeatherAtKm` method to `WeatherService`
  - [x] 2.1 In `apps/api/src/weather/weather.service.ts`, add method:
    ```typescript
    async getWeatherAtKm(
      adventureId: string,
      targetKm: number,
      departureTime?: string,
      speedKmh?: number,
    ): Promise<WeatherPoint | null>
    ```
  - [x] 2.2 Logic:
    1. Call `weatherRepository.findSegmentContainingKm(adventureId, targetKm)` → returns segment with waypoints + `cumulativeStartKm`
    2. Find waypoint in segment nearest to `targetKm` (by `Math.abs(wp.distKm - (targetKm - segment.cumulativeStartKm))`)
    3. Compute `etaMs`:
       - If `departureTime` provided: `new Date(departureTime).getTime() + (targetKm / (speedKmh ?? 15)) * 3_600_000`
       - Fallback: `Date.now()`
    4. Call `this.fetchOpenMeteoForPoint(lat, lng, new Date(etaMs))` (extract from existing `getWeatherForSegment`)
    5. Return single `WeatherPoint` or `null` if waypoints unavailable
  - [x] 2.3 Extract shared Open-Meteo fetch logic into private `fetchOpenMeteoForPoint(lat: number, lng: number, forecastAt: Date): Promise<WeatherPoint>` — refactor existing `getWeatherForSegment` to use it
  - [x] 2.4 Default `speedKmh = 15` if not provided (consistent with Epic 6 / story 11.1 default)

- [x] Task 3: Add `findSegmentContainingKm` to `WeatherRepository`
  - [x] 3.1 In `apps/api/src/weather/weather.repository.ts`, add:
    ```typescript
    async findSegmentContainingKm(
      adventureId: string,
      targetKm: number,
    ): Promise<{ id: string; cumulativeStartKm: number; waypoints: WaypointJson[] } | null>
    ```
  - [x] 3.2 Query: load all segments for `adventureId`, ordered by `cumulative_start_km`. Find the segment where `cumulativeStartKm <= targetKm < cumulativeStartKm + distanceKm`. Load its `waypoints` JSONB.
  - [x] 3.3 If `targetKm` is exactly at the boundary of the last segment, include the last segment.

### Phase 3 — Backend: `GET /stages/:stageId/weather` endpoint

- [x] Task 4: Add `getStageWeather` action to `StagesController`
  - [x] 4.1 In `apps/api/src/stages/stages.controller.ts`, add:
    ```typescript
    @Get(':id/weather')
    @UseGuards(JwtAuthGuard)
    getStageWeather(
      @Param('id', ParseUUIDPipe) id: string,
      @Query() dto: GetStageWeatherDto,
      @CurrentUser() user: { id: string },
    ) {
      return this.stagesService.getStageWeather(id, user.id, dto)
    }
    ```
  - [x] 4.2 No `try/catch` in controller — `HttpExceptionFilter` handles errors globally.
  - [x] 4.3 ResponseInterceptor wraps the return automatically — return raw `WeatherPoint | null` from service, NOT `{ data: ... }`.

- [x] Task 5: Add `getStageWeather` to `StagesService`
  - [x] 5.1 In `apps/api/src/stages/stages.service.ts`, inject `WeatherService` (add to constructor):
    ```typescript
    constructor(
      private readonly stagesRepository: StagesRepository,
      private readonly weatherService: WeatherService,
    ) {}
    ```
  - [x] 5.2 Add method:
    ```typescript
    async getStageWeather(
      stageId: string,
      userId: string,
      dto: GetStageWeatherDto,
    ): Promise<WeatherPoint | null> {
      const stage = await this.stagesRepository.findByIdWithAdventureUserId(stageId, userId)
      if (!stage) throw new NotFoundException('Stage not found')
      return this.weatherService.getWeatherAtKm(
        stage.adventureId,
        stage.endKm,
        dto.departureTime,
        dto.speedKmh,
      )
    }
    ```
  - [x] 5.3 Add `findByIdWithAdventureUserId` to `StagesRepository` if not already present:
    - Joins `adventure_stages` → `adventures` on `adventure_id`
    - WHERE `adventure_stages.id = stageId AND adventures.user_id = userId`
    - Returns `{ id, adventureId, endKm, ... }` or `null`

- [x] Task 6: Register `WeatherModule` import in `StagesModule`
  - [x] 6.1 In `apps/api/src/stages/stages.module.ts`, add `WeatherModule` to `imports` array
  - [x] 6.2 Verify `WeatherModule` exports `WeatherService` (add `exports: [WeatherService]` if missing)

### Phase 4 — Frontend: `useStageWeather` hook

- [x] Task 7: Create `apps/web/src/hooks/use-stage-weather.ts`
  - [x] 7.1 Hook signature:
    ```typescript
    export function useStageWeather(
      stageId: string,
      departureTime: string | undefined,
      speedKmh: number | undefined,
      enabled: boolean,
    )
    ```
  - [x] 7.2 TanStack Query key: `['stages', stageId, 'weather', { departureTime, speedKmh }]`
  - [x] 7.3 `queryFn`: `GET /stages/:stageId/weather?departureTime=X&speedKmh=Y` via the API client
  - [x] 7.4 `enabled`: only when `enabled = true && !!stageId`
  - [x] 7.5 `staleTime: 5 * 60 * 1000` (5 minutes — weather doesn't change that fast)
  - [x] 7.6 Return: `{ data: WeatherPoint | null, isPending, isError }`
  - [x] 7.7 Use the shared API client (same pattern as `use-pois.ts` / `use-weather.ts`)

### Phase 5 — Frontend: Read pace from localStorage in stages section

- [x] Task 8: Create utility to read weather pace from localStorage
  - [x] 8.1 Check if a `getWeatherPace()` util already exists (check `weather-controls.tsx` for the localStorage key `ridenrest:weather-pace`)
  - [x] 8.2 If not, add to `apps/web/src/lib/weather-pace.ts` (or inline in the hook):
    ```typescript
    const WEATHER_PACE_KEY = 'ridenrest:weather-pace'

    export function getStoredWeatherPace(): { departureTime?: string; speedKmh?: number } {
      try {
        const raw = localStorage.getItem(WEATHER_PACE_KEY)
        return raw ? JSON.parse(raw) : {}
      } catch {
        return {}
      }
    }
    ```
  - [x] 8.3 **IMPORTANT**: `localStorage` is not reactive. The pace values are read once when the component mounts. This is acceptable: the user sets pace in the weather controls section, then views stage weather — a page reload or re-mount picks up new values. If reactive sync is needed, it can be added post-MVP via a custom storage event listener.

### Phase 6 — Frontend: Weather badge component

- [x] Task 9: Create `StageWeatherBadge` component
  - [x] 9.1 Create `apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.tsx`
  - [x] 9.2 Props:
    ```typescript
    interface StageWeatherBadgeProps {
      stageId: string
      departureTime: string | undefined
      speedKmh: number | undefined
    }
    ```
  - [x] 9.3 Internally calls `useStageWeather(stageId, departureTime, speedKmh, true)`
  - [x] 9.4 Loading state: `<Skeleton className="h-4 w-20" />` (inline skeleton, same pattern as other skeletons in the codebase)
  - [x] 9.5 Loaded state: compact row `{iconEmoji} {temperatureC}° · {windSpeedKmh} km/h {precipitationMmH > 0.5 ? '🌧' : ''}` — all on one line, text-sm
  - [x] 9.6 Error state: silent (no badge rendered) — don't surface weather errors to user in this compact context
  - [x] 9.7 `null` response (no waypoint data): silent render

### Phase 7 — Frontend: Integrate badge in `SidebarStagesSection`

- [x] Task 10: Add weather badges to `sidebar-stages-section.tsx`
  - [x] 10.1 Add new props to `SidebarStagesSection`:
    ```typescript
    weatherActive: boolean
    departureTime?: string
    speedKmh?: number
    ```
  - [x] 10.2 In each stage row, after the ETA display, conditionally render:
    ```tsx
    {weatherActive && (
      <StageWeatherBadge
        stageId={stage.id}
        departureTime={departureTime}
        speedKmh={speedKmh}
      />
    )}
    ```
  - [x] 10.3 Read `weatherActive` from MapStore in `map-view.tsx` (already available) and pass as prop
  - [x] 10.4 Read `departureTime` and `speedKmh` from `getStoredWeatherPace()` in `map-view.tsx` and pass as props

- [x] Task 11: Wire up in `map-view.tsx`
  - [x] 11.1 In `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`:
    - Import `getStoredWeatherPace`
    - Add: `const { departureTime, speedKmh } = getStoredWeatherPace()`
    - Read `weatherActive` from `useMapStore()` (already destructured for MapCanvas)
    - Pass `weatherActive`, `departureTime`, `speedKmh` to `<SidebarStagesSection />`
  - [x] 11.2 No `useState` needed — `getStoredWeatherPace()` is read once at render; fresh on mount

### Phase 8 — Tests

- [x] Task 12: Backend tests
  - [x] 12.1 `apps/api/src/weather/weather.service.test.ts`:
    - Test: `getWeatherAtKm` — with departureTime + speedKmh, computes correct `etaMs` and calls `fetchOpenMeteoForPoint`
    - Test: `getWeatherAtKm` — without departureTime, uses `Date.now()` (mock `Date.now`)
    - Test: `getWeatherAtKm` — when `findSegmentContainingKm` returns null, returns null
  - [x] 12.2 `apps/api/src/stages/stages.service.test.ts`:
    - Test: `getStageWeather` — calls `stagesRepository.findByIdWithAdventureUserId` + `weatherService.getWeatherAtKm` with correct args
    - Test: `getStageWeather` — throws `NotFoundException` when stage not found

- [x] Task 13: Frontend tests
  - [x] 13.1 `apps/web/src/hooks/use-stage-weather.test.ts`:
    - Test: query key includes `stageId`, `departureTime`, `speedKmh`
    - Test: `enabled=false` → no fetch
    - Test: successful response → returns `WeatherPoint`
  - [x] 13.2 `apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.test.tsx`:
    - Test: shows skeleton while loading
    - Test: shows formatted weather text when loaded (`{iconEmoji} {temperatureC}° · {windSpeedKmh} km/h`)
    - Test: shows precipitation icon when `precipitationMmH > 0.5`
    - Test: renders nothing on error (no throw, no visible output)
  - [x] 13.3 `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx`:
    - Test: `StageWeatherBadge` rendered per stage when `weatherActive=true`
    - Test: no `StageWeatherBadge` when `weatherActive=false`

### Phase 9 — Sprint status update

- [x] Task 14: Update sprint-status.yaml
  - [x] 14.1 `11-5-stage-scoped-weather: in-progress` → `review`

## Dev Notes

### Key Insight: Existing Weather Infrastructure is Almost Complete

The `WeatherService.getWeatherForSegment()` already:
- Calculates ETA per waypoint: `etaMs = departureTime + (adventureKm / speedKmh) * 3_600_000`
- Fetches Open-Meteo hourly forecast for lat/lng
- Falls back to current time if no `departureTime` provided

Story 11.5 extracts a single-point version of this logic (`getWeatherAtKm`) and wires it to a new endpoint. Most of the work is plumbing.

### Coordinate Lookup: Finding Lat/Lng at `stage.endKm`

`stage.endKm` is an adventure-wide cumulative km (e.g., 95.4 km on a 300 km adventure).

To get the lat/lng:
1. Find the segment where `cumulativeStartKm <= endKm < cumulativeStartKm + distanceKm`
2. Within that segment's `waypoints` JSONB array, find the waypoint with `distKm` closest to `endKm - cumulativeStartKm` (relative km within segment)
3. Use that waypoint's lat/lng

The `waypoints` JSONB structure (from `adventure_segments.waypoints`) is an array of `{ lat, lng, ele?, distKm }` — same format used in Epic 6 weather service.

### Pace Storage: localStorage Only (No DB Change Required)

`departureTime` and `speedKmh` are NOT stored in the DB. They are user-set in `weather-controls.tsx` and persisted to localStorage key `ridenrest:weather-pace` as `{ departureTime: string, speedKmh: number }`.

**No DB migration needed for this story.**

Story 11.5 reads the same localStorage key. This means:
- If the user hasn't opened the weather section and set a departure time, `departureTime` will be `undefined` → fallback to current time (AC2)
- This is correct behavior — consistent with Epic 6

### ETA Formula: Uses `stage.endKm` Directly (Not Cumulative Stage ETAs)

The epic AC says `eta_datetime = departure_datetime + sum of ETAs of preceding stages + this stage ETA`. This is equivalent to:

```
sum(eta_minutes of stages 1..N) ≈ stage.endKm / speedKmh * 60
```

Because each stage `eta_minutes` is computed as `(distance_km / speedKmh) * 60 + (elevation_gain_m / 100) * 6` (Naismith). The elevation term adds complexity but for weather purposes, using `endKm / speedKmh` is a good-enough approximation that matches the existing weather service formula.

**Decision**: Use the simple formula `(stage.endKm / speedKmh) * 3_600_000` (consistent with `weather.service.ts` line 64), not the Naismith cumulative sum. This avoids fetching all stages in the weather endpoint and keeps the implementation simple. The difference is small (~5-15 min on typical routes) and acceptable for a weather forecast.

If Guillaume wants the Naismith-accurate cumulative ETA in the future, this can be added as an enhancement.

### Default Speed: 15 km/h

Consistent with story 11.1 ("ETA (based on default 15 km/h if no pace set)") and the existing weather service. If `speedKmh` is not provided, default to 15.

### Open-Meteo: Extract Shared Logic

Currently, `weather.service.ts` has inline Open-Meteo fetch logic in `getWeatherForSegment`. For `getWeatherAtKm`, extract it into a private `fetchOpenMeteoForPoint(lat, lng, forecastAt)` method. This avoids code duplication.

The Open-Meteo endpoint returns hourly data. The existing logic already picks the matching hour from the response. Reuse the same extraction logic.

### TanStack Query Key Convention

Following the project's strict convention:
```typescript
['stages', stageId, 'weather', { departureTime, speedKmh }]
```

The last object `{ departureTime, speedKmh }` makes different pace configurations cache independently. If `departureTime` is `undefined`, TanStack Query treats it as `{ departureTime: undefined, speedKmh: undefined }` — consistent cache key.

### NestJS Module Wiring

`StagesModule` needs to import `WeatherModule` (for `WeatherService` injection). `WeatherModule` must export `WeatherService`. Verify and add if missing:

```typescript
// weather.module.ts
@Module({
  providers: [WeatherService, WeatherRepository],
  exports: [WeatherService],  // ← ADD if missing
})
export class WeatherModule {}
```

### ResponseInterceptor Pattern (Project Rule)

`StagesController.getStageWeather` must return raw data — the `ResponseInterceptor` wraps it automatically:
```typescript
// ✅ Correct
return this.stagesService.getStageWeather(...)  // returns WeatherPoint | null

// ❌ Wrong
return { data: weatherPoint }
```

### Anti-Pattern: No GPS in API Request

The frontend NEVER sends GPS coordinates to the backend (RGPD rule). The coordinate lookup happens entirely on the backend: the API resolves lat/lng from `stage.endKm` using the stored waypoints. The frontend only sends `stageId`, `departureTime`, `speedKmh` — no coordinates.

### Project Structure Notes

**Files to create:**
- `apps/api/src/stages/dto/get-stage-weather.dto.ts` — new DTO
- `apps/web/src/hooks/use-stage-weather.ts` — new hook
- `apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.tsx` — new component
- `apps/web/src/lib/weather-pace.ts` — new util (or inline in map-view)

**Files to modify:**
- `apps/api/src/weather/weather.service.ts` — add `getWeatherAtKm`, extract `fetchOpenMeteoForPoint`
- `apps/api/src/weather/weather.repository.ts` — add `findSegmentContainingKm`
- `apps/api/src/stages/stages.service.ts` — add `getStageWeather`
- `apps/api/src/stages/stages.controller.ts` — add `GET :id/weather` route
- `apps/api/src/stages/stages.module.ts` — import `WeatherModule`
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — add `StageWeatherBadge` + new props
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — read pace + weatherActive, pass to SidebarStagesSection

**No DB migration required** — no new tables or columns.

### References

- `apps/api/src/weather/weather.service.ts` — ETA formula + Open-Meteo fetch logic to extract/reuse [Source: weather.service.ts#getWeatherForSegment]
- `apps/api/src/weather/weather.repository.ts` — findSegmentByIdAndUserId pattern to follow [Source: weather.repository.ts#findSegmentByIdAndUserId]
- `apps/web/src/app/(app)/map/[id]/_components/weather-controls.tsx` — localStorage key `ridenrest:weather-pace` [Source: weather-controls.tsx]
- `apps/web/src/hooks/use-live-weather.ts` — TanStack Query pattern for weather hooks [Source: use-live-weather.ts]
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — stage row structure to inject badge [Source: sidebar-stages-section.tsx]
- Story 11.3 — `eta_minutes` formula (Naismith) [Source: 11-3-stage-elevation-computation.md]
- Story 11.4 — `stage.endKm`, `STAGE_COLORS`, stage color as hex in DB [Source: 11-4-stage-scoped-poi-search.md]
- `_bmad-output/project-context.md` — ResponseInterceptor rule, no GPS in API, TanStack Query key convention

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented `StageWeatherPoint` as a new type (not reusing `WeatherPoint`) to include `precipitationMmH` instead of `precipitationProbability` — necessary to support the AC3 threshold of 0.5 mm/h for rain icon display
- Added `precipitation` field to Open-Meteo API request (in addition to existing `precipitation_probability`) — additive change, no regressions
- Endpoint URL is `GET /stages/:stageId/weather` via a new `StagesWeatherController` class at `@Controller('stages')` in `stages.controller.ts` — ownership check done via `findByIdWithAdventureUserId` (stageId + JWT userId, no adventureId in URL)
- `JwtAuthGuard` not needed on the new controller — it is applied globally via `APP_GUARD` in `app.module.ts`
- `getStoredWeatherPace()` reads from localStorage once at mount in `map-view.tsx` — not reactive per story dev notes (acceptable for MVP)
- All 197 backend tests + 612 frontend tests pass (59 test files), no regressions
- Updated `open-meteo.provider.test.ts` to include new `precipitation` array in mock response

### File List

**Created:**
- `apps/api/src/stages/dto/get-stage-weather.dto.ts`
- `apps/web/src/lib/weather-pace.ts`
- `apps/web/src/hooks/use-stage-weather.ts`
- `apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.tsx`
- `apps/web/src/hooks/use-stage-weather.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/stage-weather-badge.test.tsx`

**Modified:**
- `packages/shared/src/types/weather.types.ts` — added `StageWeatherPoint` interface
- `packages/shared/src/index.ts` — exported `StageWeatherPoint`
- `apps/api/src/weather/providers/open-meteo.provider.ts` — added `precipitation` field to request + `precipitationMmH` to `OpenMeteoHour`
- `apps/api/src/weather/weather.repository.ts` — added `WaypointJson`, `SegmentForKmLookup`, `findSegmentContainingKm`
- `apps/api/src/weather/weather.service.ts` — added `getWeatherAtKm`
- `apps/api/src/weather/weather.module.ts` — added `exports: [WeatherService]`
- `apps/api/src/stages/stages.repository.ts` — added `findByIdWithAdventureUserId`
- `apps/api/src/stages/stages.service.ts` — injected `WeatherService`, added `getStageWeather`
- `apps/api/src/stages/stages.controller.ts` — added `StagesWeatherController` class
- `apps/api/src/stages/stages.module.ts` — imported `WeatherModule`, registered `StagesWeatherController`
- `apps/web/src/lib/api-client.ts` — added `getStageWeather`, `GetStageWeatherParams`, `StageWeatherPoint` re-export
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.tsx` — added `weatherActive`, `departureTime`, `speedKmh` props + badge rendering
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — wired up `stagePace` and `weatherActive` to `SidebarStagesSection`
- `apps/api/src/weather/weather.service.test.ts` — added `getWeatherAtKm` tests + updated `SAMPLE_WEATHER` mock
- `apps/api/src/weather/providers/open-meteo.provider.test.ts` — updated mock response + expected result for `precipitation` field
- `apps/api/src/stages/stages.service.test.ts` — added `WeatherService` mock + `getStageWeather` tests
- `apps/web/src/app/(app)/map/[id]/_components/sidebar-stages-section.test.tsx` — added weather badge tests
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — updated `11-5-stage-scoped-weather: review`
