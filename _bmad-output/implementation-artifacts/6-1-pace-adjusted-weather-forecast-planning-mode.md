# Story 6.1: Pace-Adjusted Weather Forecast (Planning Mode)

Status: done

## Story

As a **cyclist user**,
I want to enter my departure time and estimated speed to see weather conditions overlaid directly on my route trace,
so that I can instantly see — spatially — what temperature, wind and rain to expect at each point based on my real pace.

## Acceptance Criteria

1. **Given** a user opens the map page with a ready segment,
   **When** they activate the weather layer via the layer toggles,
   **Then** a compact pace form appears (departure time + speed in km/h) and the trace is immediately colored by temperature using pace-adjusted ETAs — or by current-time weather if no pace is entered (FR-050, FR-051, FR-055).

2. **Given** the API requests weather data for each sampled waypoint,
   **When** Open-Meteo returns forecasts,
   **Then** results are cached in Upstash Redis keyed by `weather:{lat_4dp}:{lng_4dp}:{YYYY-MM-DD}:{HH}` with TTL 1h — subsequent requests for the same waypoint/hour serve from cache (NFR-042).

3. **Given** the weather layer is active,
   **When** the map renders,
   **Then** the route trace is color-coded by the selected weather dimension (temperature, precipitation, or wind speed) at ~5 km intervals — with wind direction arrow symbols superimposed at each sampled waypoint (FR-053).

4. **Given** a user taps/clicks any point on the weather-colored trace,
   **When** the tap hits within ~10px of the trace,
   **Then** a MapLibre popup appears showing: km position, temperature (°C), wind speed + direction arrow, precipitation probability (%), and a WMO weather icon.

5. **Given** a user changes the weather dimension selector (temperature / precipitation / wind),
   **When** they select a new dimension,
   **Then** the trace recolors instantly from cached data — no new API call needed.

6. **Given** a user changes their departure time or speed and resubmits,
   **When** the new values are submitted,
   **Then** ETAs are recomputed, a new API query fires (cache hit if hour unchanged), and the trace recolors.

7. **Given** the route extends beyond Open-Meteo's 16-day forecast horizon,
   **When** waypoints beyond the horizon are encountered,
   **Then** those segments render in neutral grey with a "Prévisions non disponibles" label in the popup — visible segments still show correct data.

## Tasks / Subtasks

### Backend — NestJS `apps/api/src/weather/`

- [x] Task 1: Create `OpenMeteoProvider` (AC: #2, #7)
  - [x] 1.1 Create `apps/api/src/weather/providers/open-meteo.provider.ts`
  - [x] 1.2 Implement `fetchHourlyForecast(lat, lng, forecastDatetime: Date): Promise<OpenMeteoHour | null>`
  - [x] 1.3 API call: `GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lng}&hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code&start_date={YYYY-MM-DD}&end_date={YYYY-MM-DD}&timezone=auto&forecast_days=16`
  - [x] 1.4 Find matching hour index: `data.hourly.time.findIndex(t => t === targetHourStr)` where `targetHourStr = "2026-03-22T14:00"` format
  - [x] 1.5 Return `null` if index not found (beyond horizon) or fetch fails — DO NOT throw
  - [x] 1.6 Redis cache key: `weather:{lat.toFixed(4)}:{lng.toFixed(4)}:{YYYY-MM-DD}:{HH}` TTL `WEATHER_CACHE_TTL` (3600s)
  - [x] 1.7 **No API key needed** — no env var required
  - [x] 1.8 Create `apps/api/src/weather/providers/open-meteo.provider.test.ts` (Jest — mock `fetch` + Redis)

- [x] Task 2: Create `WeatherRepository` (AC: #2)
  - [x] 2.1 Create `apps/api/src/weather/weather.repository.ts`
  - [x] 2.2 Implement `findSegmentByIdAndUserId(segmentId, userId)` — joins `adventure_segments → adventures` to verify ownership, returns segment with `waypoints`, `cumulativeStartKm`, `distanceKm`
  - [x] 2.3 Implement `upsertWeatherPoints(points: InsertWeatherPoint[])` — bulk upsert into `weather_cache` using `onConflictDoUpdate` on unique constraint `(segment_id, waypoint_km, forecast_at)`

- [x] Task 3: Create `GetWeatherDto` (AC: #1)
  - [x] 3.1 Create `apps/api/src/weather/dto/get-weather.dto.ts`
  - [x] 3.2 Fields: `segmentId: string` (IsUUID), `departureTime?: string` (IsISO8601, optional), `speedKmh?: number` (IsNumber, Min(1), Max(100), optional)

- [x] Task 4: Create `WeatherService` (AC: #1, #6, #7)
  - [x] 4.1 Create `apps/api/src/weather/weather.service.ts`
  - [x] 4.2 Inject `WeatherRepository`, `OpenMeteoProvider`
  - [x] 4.3 Implement `getWeatherForecast(dto, userId)`:
    - Verify ownership: `weatherRepo.findSegmentByIdAndUserId()` → `NotFoundException` if not found or not parsed
    - Load waypoints from `segment.waypoints` (`MapWaypoint[]`)
    - Sample at 5 km intervals (see sampling strategy in Dev Notes)
    - Compute ETA per sampled waypoint: `eta = departureTime + ((segment.cumulativeStartKm + waypoint.distKm) / speedKmh) * 3_600_000 ms`
    - Fallback if no pace: `eta = new Date()` for all waypoints (FR-055)
    - Fetch via `OpenMeteoProvider.fetchHourlyForecast(lat, lng, eta)` — `Promise.allSettled` for parallel fetches
    - Map WMO `weather_code` to icon emoji (see WMO mapping in Dev Notes)
    - Return `WeatherForecast` with `WeatherPoint[]`
  - [x] 4.4 Create `apps/api/src/weather/weather.service.test.ts` (Jest — mock repo + provider)

- [x] Task 5: Create `WeatherController` (AC: #1)
  - [x] 5.1 Create `apps/api/src/weather/weather.controller.ts`
  - [x] 5.2 `@Get()` → `GET /api/weather` with `@Query() dto: GetWeatherDto`
  - [x] 5.3 `@CurrentUser()` → pass `user.id` to service

- [x] Task 6: Create `WeatherModule` and register (AC: #1)
  - [x] 6.1 Create `apps/api/src/weather/weather.module.ts` — providers: `OpenMeteoProvider`, `WeatherRepository`, `WeatherService`, controllers: `WeatherController`
  - [x] 6.2 Add `WeatherModule` to `AppModule` imports in `apps/api/src/app.module.ts`

### Frontend — Next.js `apps/web/`

- [x] Task 7: Add `getWeatherForecast()` to api-client (AC: #1)
  - [x] 7.1 Add to `apps/web/src/lib/api-client.ts`

- [x] Task 8: Create `use-weather.ts` hook (AC: #1, #6)
  - [x] 8.1 Create `apps/web/src/hooks/use-weather.ts`
  - [x] 8.2 Query key: `['weather', { segmentId, departureTime: departureTime ?? null, speedKmh: speedKmh ?? null }]`
  - [x] 8.3 `staleTime: WEATHER_CACHE_TTL * 1000` (import from `@ridenrest/shared`)
  - [x] 8.4 `enabled: !!segmentId`
  - [x] 8.5 Create `apps/web/src/hooks/use-weather.test.ts` (Vitest — mock `api-client`)

- [x] Task 9: Build weather GeoJSON helpers (AC: #3, #5, #7)
  - [x] 9.1 Create `apps/web/src/lib/weather-geojson.ts`
  - [x] 9.2 `buildWeatherLineSegments(waypoints: MapWaypoint[], weatherPoints: WeatherPoint[]): GeoJSON.FeatureCollection`
  - [x] 9.3 `buildWindArrowPoints(weatherPoints: WeatherPoint[]): GeoJSON.FeatureCollection`
  - [x] 9.4 For unavailable waypoints (`temperatureC === null`): `available: false` → neutral grey
  - [x] 9.5 Create `apps/web/src/lib/weather-geojson.test.ts` (Vitest)

- [x] Task 10: Create `weather-layer.tsx` — MapLibre layer (AC: #3, #4, #5, #7)
  - [x] 10.1 Create `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx`
  - [x] 10.2 Props: `map: maplibregl.Map | null`, `weatherPoints: WeatherPoint[]`, `segmentWaypoints: MapWaypoint[]`, `dimension: 'temperature' | 'precipitation' | 'wind'`
  - [x] 10.3 Add/update MapLibre sources `weather-lines` and `weather-wind-arrows` on data change
  - [x] 10.4 `weather-lines` layer — `line` type, `line-width: 5`, `line-color` paint expression with temperature/precipitation/wind interpolation
  - [x] 10.5 `weather-wind-arrows` layer — `symbol` type, text `→`, `text-rotate: ['get', 'windDirectionMaplibre']` (pre-converted), visible only when `dimension === 'wind'`
  - [x] 10.6 On click on `weather-lines`: show `maplibregl.Popup` with temp, wind, rain%, icon emoji, km
  - [x] 10.7 Cleanup on unmount: remove layers and sources
  - [x] 10.8 Create `weather-layer.test.tsx` (Vitest — test source/layer add/remove lifecycle)

- [x] Task 11: Create `weather-controls.tsx` — pace form + dimension selector (AC: #1, #5, #6)
  - [x] 11.1 Create `apps/web/src/app/(app)/map/[id]/_components/weather-controls.tsx`
  - [x] 11.2 Local state: `departureTime`, `speedKmh` — submitted to parent on form submit
  - [x] 11.3 Dimension toggle: 3 buttons — 🌡 Température / 🌧 Précip / 💨 Vent
  - [x] 11.4 Color legend sub-component per dimension (scale bar with min/max labels)
  - [x] 11.5 `<Skeleton />` during `isPending`
  - [x] 11.6 Create `weather-controls.test.tsx` (Vitest)

- [x] Task 12: Integrate into `map-canvas.tsx`, `map-view.tsx`, `map.store.ts` (AC: #1, #3)
  - [x] 12.1 Add to `map.store.ts`: `weatherActive: boolean`, `weatherDimension: 'temperature' | 'precipitation' | 'wind'`, `setWeatherActive`, `setWeatherDimension`
  - [x] 12.2 In `map-canvas.tsx`: render `<WeatherLayer>` when `weatherActive`
  - [x] 12.3 In `map-view.tsx`: add weather toggle button, render `<WeatherControls>` panel when active
  - [x] 12.4 Create `map.store.test.ts` update (Vitest — add weather state tests)

## Dev Notes

### Architecture: New `weather/` Module (NestJS)

Module to create from scratch — `density/` is the closest reference pattern.

```
apps/api/src/weather/
  weather.module.ts
  weather.controller.ts
  weather.service.ts
  weather.service.test.ts
  weather.repository.ts          ← ALL Drizzle queries here, NEVER in service
  dto/
    get-weather.dto.ts
  providers/
    open-meteo.provider.ts
    open-meteo.provider.test.ts
```

### Open-Meteo Integration

**No API key required.** Decision: chosen over WeatherAPI.com (3-day free limit) for 16-day ECMWF forecast horizon — essential for multi-day bikepacking adventures.

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}
  &longitude={lng}
  &hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,weather_code
  &start_date={YYYY-MM-DD}
  &end_date={YYYY-MM-DD}
  &timezone=auto
  &forecast_days=16
```

**Response structure (parallel arrays):**
```typescript
data.hourly.time[i]                      // "2026-03-22T14:00"
data.hourly.temperature_2m[i]            // °C, float
data.hourly.wind_speed_10m[i]            // km/h, float
data.hourly.wind_direction_10m[i]        // degrees, 0=N, 90=E (clockwise)
data.hourly.precipitation_probability[i] // 0–100, integer
data.hourly.weather_code[i]              // WMO code integer
```

**Finding the target hour:**
```typescript
// Format ETA as "YYYY-MM-DDTHH:00" to match Open-Meteo time strings
const targetStr = eta.toISOString().substring(0, 13) + ':00'
// e.g. "2026-03-22T14:00" (UTC — Open-Meteo uses UTC when timezone=auto with lat/lng)
const idx = data.hourly.time.findIndex(t => t === targetStr)
if (idx === -1) return null  // beyond horizon
```

**WMO weather code → icon emoji mapping:**
```typescript
const WMO_ICON: Record<number, string> = {
  0: '☀️', 1: '🌤', 2: '⛅', 3: '☁️',
  45: '🌫', 48: '🌫',
  51: '🌦', 53: '🌦', 55: '🌧',
  61: '🌧', 63: '🌧', 65: '🌧',
  71: '❄️', 73: '❄️', 75: '❄️',
  80: '🌦', 81: '🌧', 82: '⛈',
  95: '⛈', 96: '⛈', 99: '⛈',
}
// Fallback: '🌡' for unknown codes
```

Store this mapping in `packages/shared/src/constants/weather.constants.ts` and export it — used by both the API (for `iconUrl` field) and the frontend popup.

### Redis Cache Strategy

```typescript
// Key: weather:{lat.toFixed(4)}:{lng.toFixed(4)}:{YYYY-MM-DD}:{HH}
// 4 decimal places ≈ 11m precision — sufficient to share cache across users on same road
// TTL: WEATHER_CACHE_TTL = 3600s (from @ridenrest/shared/constants/api.constants.ts)
const key = `weather:${lat.toFixed(4)}:${lng.toFixed(4)}:${dateStr}:${hourStr}`
```

Check Redis first → HIT: return immediately. MISS: call Open-Meteo → store result in Redis + upsert into `weather_cache` DB table (fire-and-forget).

### DB Cache: `weather_cache` Table

Already exists in `packages/database/src/schema/weather-cache.ts`. Unique constraint on `(segment_id, waypoint_km, forecast_at)`:

```typescript
await db.insert(weatherCache).values(points).onConflictDoUpdate({
  target: [weatherCache.segmentId, weatherCache.waypointKm, weatherCache.forecastAt],
  set: { temperatureC: sql`excluded.temperature_c`, windSpeedKmh: sql`excluded.wind_speed_kmh`, ... }
})
```

### Waypoint Sampling Strategy

```typescript
// Sample 1 waypoint every 5 km — avoids excessive API calls
// Typical 200km segment → ~40 calls (Redis cache reduces this further on repeat)
const SAMPLE_KM = 5
const sampled: MapWaypoint[] = []
for (const wp of waypoints) {
  if (sampled.length === 0 || wp.distKm - sampled.at(-1)!.distKm >= SAMPLE_KM) {
    sampled.push(wp)
  }
}
```

**ETA computation:** `distKm` in `MapWaypoint` is segment-relative (0 at segment start). Adventure-level offset is `segment.cumulativeStartKm`:

```typescript
const adventureKm = segment.cumulativeStartKm + waypoint.distKm
const etaMs = departureTime.getTime() + (adventureKm / speedKmh) * 3_600_000
const eta = new Date(etaMs)
```

### Ownership Verification

```typescript
// weather.repository.ts — join to verify segment belongs to user
async findSegmentByIdAndUserId(segmentId: string, userId: string) {
  const [row] = await db
    .select({ id: adventureSegments.id, waypoints: adventureSegments.waypoints,
              cumulativeStartKm: adventureSegments.cumulativeStartKm })
    .from(adventureSegments)
    .innerJoin(adventures, eq(adventureSegments.adventureId, adventures.id))
    .where(and(
      eq(adventureSegments.id, segmentId),
      eq(adventures.userId, userId),
      eq(adventureSegments.parseStatus, 'done'),
    ))
  return row ?? null
}
```

### NestJS Rules (Critical)

- ResponseInterceptor global → return raw data from controller, never `{ success, data }`
- No try/catch in controller → `HttpExceptionFilter` handles globally
- `JwtAuthGuard` is global → no `@UseGuards` needed
- `RedisModule` is `@Global()` → no explicit import in `WeatherModule`

### Frontend: GeoJSON Strategy

Between two adjacent sampled waypoints A and B:
- Use **all full-resolution waypoints** between A.distKm and B.distKm as the LineString geometry
- Assign weather properties from point A to the entire segment
- This preserves trace shape while applying a uniform color per interval

```typescript
// weather-geojson.ts
for (let i = 0; i < sampled.length - 1; i++) {
  const fromKm = sampled[i].distKm
  const toKm = sampled[i + 1].distKm
  const coords = allWaypoints
    .filter(wp => wp.distKm >= fromKm && wp.distKm <= toKm)
    .map(wp => [wp.lng, wp.lat])  // GeoJSON = [lng, lat]
  features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords },
                  properties: { ...weatherAt(sampled[i]), available: weatherAt(sampled[i]) !== null } })
}
```

⚠️ GeoJSON coordinates are `[lng, lat]` — opposite of `MapWaypoint { lat, lng }`. Do not confuse.

### Wind Direction Conversion

Open-Meteo `wind_direction_10m`: meteorological convention (0°=North, clockwise).
MapLibre `text-rotate`: 0°=East, clockwise.
Conversion: `maplibreAngle = (windDeg - 90 + 360) % 360`

Pre-compute this in `buildWindArrowPoints()` and store as `windDirectionMaplibre` property.

### MapLibre Layer Ordering

Insert weather line layer **before** POI symbol layer to keep pins on top:
```typescript
map.addLayer(weatherLineLayer, 'poi-symbols')  // second arg = beforeId
```

The density color layer (story 5.2) should remain below weather — check `map-canvas.tsx` for the exact layer IDs used.

### Color Scale Reference

| Dimension | Low | Mid | High |
|---|---|---|---|
| Temperature (°C) | `#3b82f6` (0°) | `#fbbf24` (15°) | `#ef4444` (30°+) |
| Precipitation (%) | `#86efac` (0%) | `#facc15` (50%) | `#1d4ed8` (100%) |
| Wind (km/h) | `#d1fae5` (0) | `#fb923c` (30) | `#7c3aed` (60+) |
| Unavailable | `#9ca3af` | | |

### Project Structure Notes

- No `WEATHERAPI_KEY` env var needed — Open-Meteo requires no authentication
- `WMO_ICON` mapping → `packages/shared/src/constants/weather.constants.ts` (new file, export from `packages/shared/src/index.ts`)
- `weather-geojson.ts` → `apps/web/src/lib/` (pure functions, no React dependency)
- `WeatherLayer` component follows same lifecycle pattern as density layer in `map-canvas.tsx`

### Implementation Notes

- `WeatherPoint` type updated: replaced `precipitationMm` with `precipitationProbability` (0-100%) and added `iconEmoji` field; `weatherCode` is now `number | null` (was `string | null`). DB column `precipitation_mm` stores the probability value for now.
- `use-weather` hook uses `isFetching` (not `isPending`) so it returns `false` when `enabled=false` (segmentId is null)
- `WeatherControls` uses `data-testid` attributes for reliable testing
- `weather-controls.test.tsx` requires explicit `afterEach(cleanup())` to prevent duplicate renders across tests

### References

- Density layer (closest MapLibre reference): `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- Shared types: `packages/shared/src/types/weather.types.ts` — `WeatherForecast`, `WeatherPoint`
- Shared constants: `packages/shared/src/constants/api.constants.ts` — `WEATHER_CACHE_TTL`
- DB schema: `packages/database/src/schema/weather-cache.ts` — table exists, no migration needed
- Query key convention: `['weather', { segmentId, ... }]` [Source: `_bmad-output/project-context.md`]
- Open-Meteo docs: `https://open-meteo.com/en/docs`
- WMO weather codes: `https://open-meteo.com/en/docs#weathervariables`

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `open-meteo.provider.ts:62` — `timezone: 'UTC'` used instead of spec's `timezone: 'auto'`. Functionally equivalent but diverges from documentation. Consider aligning with spec or updating spec.
- [ ] [AI-Review][LOW] `weather.types.ts:3` — Comment says `km` is "segment-relative" but service returns adventure-cumulative value. Fix comment to: `// Adventure-cumulative position (cumulativeStartKm + wp.dist_km)`.
- [ ] [AI-Review][LOW] `open-meteo.provider.ts:55-62` — Missing `forecast_days: '16'` parameter in Open-Meteo API call. Not strictly needed with explicit `start_date`/`end_date`, but spec-compliant to include.
- [ ] [AI-Review][LOW] `weather-controls.tsx:56` / `map-view.tsx:44` — `weatherDimension` not persisted to localStorage. Resets to `'temperature'` on every page load while pace params are restored. Consider persisting dimension alongside pace.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `use-weather` hook: used `isFetching` instead of `isPending` — when `enabled: false`, TanStack Query v5 returns `isPending: true` even though no request is made. `isFetching` correctly returns `false` in this case.
- `weather-controls.test.tsx`: `getByText`/`getByRole` found multiple elements. Fixed by using `data-testid` attributes on buttons. Added explicit `afterEach(cleanup())` to prevent DOM accumulation across tests.
- API test files: Removed `@jest/globals` imports; used global `jest` to match project conventions and avoid TypeScript unsafe-type-check lint errors.

### Completion Notes List

- ✅ Task 1: `OpenMeteoProvider` — Redis cache (4dp precision), null-on-error pattern, no API key, 8 unit tests
- ✅ Task 2: `WeatherRepository` — ownership join with `parseStatus='done'`, bulk upsert with onConflictDoUpdate
- ✅ Task 3: `GetWeatherDto` — IsUUID, IsISO8601, IsNumber with Min/Max validation
- ✅ Task 4: `WeatherService` — 5km sampling, ETA computation, Promise.allSettled parallel fetch, WMO mapping, fire-and-forget DB upsert; 9 unit tests
- ✅ Task 5: `WeatherController` — GET /api/weather with @Query + @CurrentUser
- ✅ Task 6: `WeatherModule` registered in AppModule
- ✅ Task 7: `getWeatherForecast()` added to api-client.ts
- ✅ Task 8: `use-weather` hook with isFetching, staleTime=1h, enabled=!!segmentId; 5 unit tests
- ✅ Task 9: `weather-geojson.ts` — buildWeatherLineSegments + buildWindArrowPoints with [lng,lat] ordering, maplibre angle conversion; 10 unit tests
- ✅ Task 10: `WeatherLayer` — MapLibre sources/layers lifecycle, color interpolation expressions, popup on click, wind arrow visibility, proper cleanup; 8 unit tests
- ✅ Task 11: `WeatherControls` — pace form, dimension selector, color legend, Skeleton during loading; 7 unit tests
- ✅ Task 12: Store weather state in map.store.ts, render WeatherLayer in map-canvas.tsx, weather toggle + controls panel in map-view.tsx; 6 new store tests
- ✅ `WMO_ICON` + `WMO_ICON_FALLBACK` constants added to `packages/shared/src/constants/weather.constants.ts` and exported from index.ts
- ✅ `WeatherPoint` type updated: `precipitationProbability` (not `precipitationMm`), `iconEmoji`, `weatherCode` as number
- Total: 139 API tests + 223 web tests passing, 0 lint errors

**Code Review Fixes (2026-03-18):**
- ✅ HIGH-1: Removed `weatherSubmitted` gate — weather now fetches immediately on toggle (current-time fallback per FR-055) — `map-view.tsx`
- ✅ HIGH-2: Added "Prévisions non disponibles" popup for unavailable (grey) segments — `weather-layer.tsx`
- ✅ MEDIUM-1: Removed dead `use-weather.ts` hook (never used — `map-view.tsx` uses `useQueries` directly)
- ✅ MEDIUM-2: Corrected misleading comment about `dimension` deps in `weather-layer.tsx`
- ✅ MEDIUM-3: Clarified `weatherCode` string conversion comment in `weather.repository.ts`
- ✅ MEDIUM-4: Added 2 popup-behavior tests to `weather-layer.test.tsx` (AC #4 available popup, AC #7 unavailable popup)

### File List

**New files:**
- `apps/api/src/weather/weather.module.ts`
- `apps/api/src/weather/weather.controller.ts`
- `apps/api/src/weather/weather.service.ts`
- `apps/api/src/weather/weather.service.test.ts`
- `apps/api/src/weather/weather.repository.ts`
- `apps/api/src/weather/dto/get-weather.dto.ts`
- `apps/api/src/weather/providers/open-meteo.provider.ts`
- `apps/api/src/weather/providers/open-meteo.provider.test.ts`
- `packages/shared/src/constants/weather.constants.ts`
- ~~`apps/web/src/hooks/use-weather.ts`~~ — removed (dead code, map-view.tsx uses useQueries directly)
- ~~`apps/web/src/hooks/use-weather.test.ts`~~ — removed
- `apps/web/src/lib/weather-geojson.ts`
- `apps/web/src/lib/weather-geojson.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/weather-controls.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/weather-controls.test.tsx`

**Modified files:**
- `apps/api/src/app.module.ts` — added WeatherModule import
- `packages/shared/src/index.ts` — export weather.constants
- `packages/shared/src/types/weather.types.ts` — updated WeatherPoint type
- `apps/web/src/lib/api-client.ts` — added getWeatherForecast()
- `apps/web/src/stores/map.store.ts` — added weatherActive, weatherDimension state
- `apps/web/src/stores/map.store.test.ts` — added weather state tests
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — integrated WeatherLayer
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — weather toggle + controls
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — status: review
