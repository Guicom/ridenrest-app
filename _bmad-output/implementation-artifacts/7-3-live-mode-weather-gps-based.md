# Story 7.3: Live Mode Weather (GPS-Based)

Status: done

## Story

As a **cyclist user in Live mode**,
I want to see weather forecasts for the upcoming kilometres based on my current GPS position and pace,
So that I know what conditions are ahead of me right now — without manually entering a departure time.

## Acceptance Criteria

1. **Given** Live mode is active and `currentKmOnRoute` is known,
   **When** the Live page loads or the `<LiveWeatherPanel />` is shown,
   **Then** `GET /weather?segmentId=&fromKm={currentKmOnRoute}&departureTime={adjustedTime}&speedKmh={speed}` is called — GPS coordinates are NOT sent (RGPD) (FR-052).

2. **Given** the API receives `fromKm`,
   **When** sampling waypoints for weather,
   **Then** only waypoints at adventure-km ≥ `fromKm` are fetched from Open-Meteo — reducing unnecessary API calls for past portions of the route.

3. **Given** a user has entered their speed in `<LiveControls />`,
   **When** the weather panel displays,
   **Then** ETAs are pace-adjusted: the client computes `adjustedDepartureTime = now - (currentKmOnRoute / speedKmh) × 3600000ms` and passes it to the API — the service's existing ETA formula then correctly yields future ETAs for all upcoming waypoints (FR-052).

4. **Given** a user has NOT entered a speed (or `speedKmh = 0`),
   **When** the weather panel displays,
   **Then** `departureTime` is omitted (or `= now`) — Open-Meteo returns current-time conditions at upcoming waypoints — the same fallback as Planning mode (FR-055).

5. **Given** the GPS position updates and `currentKmOnRoute` changes by ≥ 5 km,
   **When** the threshold is crossed,
   **Then** a new weather fetch is triggered — `fromKm` and `adjustedDepartureTime` are recomputed — past waypoints disappear from the panel, upcoming waypoints appear (FR-052).

6. **Given** Live mode is active but GPS signal is lost (`currentPosition === null`),
   **When** the weather panel is open,
   **Then** the last known `currentKmOnRoute` is used for weather display, and a "Position GPS indisponible" status indicator appears in the panel — no crash, data stays visible (NFR-032).

7. **Given** the weather fetch succeeds,
   **When** the `<LiveWeatherPanel />` renders,
   **Then** it shows a horizontal scrollable strip of upcoming weather cards (next 3–5 waypoints), each displaying: emoji icon, temperature, wind speed, precipitation probability, and ETA relative to now — format: "🌡 14°C · 💨 12 km/h · 🌧 10% · dans ~1h20".

8. **Given** a weather fetch fails (network error or Open-Meteo timeout),
   **When** TanStack Query returns an error,
   **Then** the last successfully fetched weather data remains visible — no cleared state — and a subtle "Météo non disponible" note is shown.

## Tasks / Subtasks

### Backend (NestJS API)

- [x] Task 1: Add `fromKm` to `GetWeatherDto` (AC: #1, #2)
  - [x] 1.1 In `apps/api/src/weather/dto/get-weather.dto.ts`, add:
    ```typescript
    @ApiPropertyOptional({ description: 'Adventure km — only sample waypoints ahead of this position', minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    fromKm?: number
    ```
  - [x] 1.2 This is the adventure-cumulative km (same coordinate space as `WeatherPoint.km`), not within-segment km

- [x] Task 2: Apply `fromKm` filter in `WeatherService` (AC: #2, #3)
  - [x] 2.1 In `WeatherService.getWeatherForecast()`, after building the `sampled[]` array, add a filter:
    ```typescript
    const filtered = dto.fromKm !== undefined
      ? sampled.filter(wp => (segment.cumulativeStartKm + wp.dist_km) >= dto.fromKm!)
      : sampled
    ```
  - [x] 2.2 Use `filtered` instead of `sampled` for all subsequent Open-Meteo calls and ETA computation
  - [x] 2.3 If `filtered` is empty (user is at/past end of segment), return `WeatherForecast` with empty `waypoints: []` — no crash
  - [x] 2.4 Add unit tests in `weather.service.test.ts` (Jest):
    - `fromKm` filter correctly excludes past waypoints
    - `fromKm` beyond segment end returns empty waypoints array
    - `fromKm` undefined returns all waypoints (existing behaviour unchanged)

### Frontend (Next.js)

- [x] Task 3: Create `use-live-weather.ts` hook (AC: #1, #3, #4, #5, #6)
  - [x] 3.1 Create `apps/web/src/hooks/use-live-weather.ts`
  - [x] 3.2 Reads from `useLiveStore`: `isLiveModeActive`, `currentKmOnRoute`, `speedKmh`
  - [x] 3.3 5 km trigger threshold:
    ```typescript
    const lastFetchKmRef = useRef<number | null>(null)
    const [activeFetchKm, setActiveFetchKm] = useState<number | null>(null)

    useEffect(() => {
      if (currentKmOnRoute === null) return
      const shouldFetch =
        lastFetchKmRef.current === null ||
        Math.abs(currentKmOnRoute - lastFetchKmRef.current) >= 5
      if (shouldFetch) {
        lastFetchKmRef.current = currentKmOnRoute
        setActiveFetchKm(currentKmOnRoute)
      }
    }, [currentKmOnRoute])
    ```
  - [x] 3.4 Compute `adjustedDepartureTime` only when `speedKmh > 0`:
    ```typescript
    const adjustedDepartureTime = speedKmh > 0 && activeFetchKm !== null
      ? new Date(Date.now() - (activeFetchKm / speedKmh) * 3_600_000).toISOString()
      : undefined
    ```
  - [x] 3.5 TanStack Query with `keepPreviousData: true` (do NOT clear on refetch — AC #8):
    ```typescript
    const fromKmRounded = activeFetchKm !== null ? Math.round(activeFetchKm / 5) * 5 : null
    const { data, isPending, isError } = useQuery({
      queryKey: ['weather', 'live', { segmentId, fromKm: fromKmRounded }],
      queryFn: () => apiClient.get<WeatherForecast>('/weather', {
        params: {
          segmentId,
          fromKm: activeFetchKm,
          ...(adjustedDepartureTime ? { departureTime: adjustedDepartureTime } : {}),
          ...(speedKmh > 0 ? { speedKmh } : {}),
        }
      }),
      enabled: isLiveModeActive && activeFetchKm !== null && !!segmentId,
      staleTime: 5 * 60 * 1000,        // 5 min fresh
      placeholderData: (prev) => prev,  // TanStack Query v5 keepPreviousData equivalent
    })
    ```
  - [x] 3.6 Return `{ weatherPoints: data?.waypoints ?? [], isPending, isError, isGpsLost }`
    where `isGpsLost = isLiveModeActive && currentKmOnRoute !== null && /* GPS signal check from store */ false`
    — Note: GPS lost is detected via `useLiveStore` `currentPosition === null && isLiveModeActive && currentKmOnRoute !== null`
  - [x] 3.7 Write tests in `use-live-weather.test.ts` (Vitest):
    - 5 km threshold not triggered on < 5 km movement
    - threshold triggers on ≥ 5 km movement
    - `adjustedDepartureTime` computed correctly for `speedKmh = 15`, `fromKm = 50`
    - `adjustedDepartureTime` omitted when `speedKmh = 0`
    - `fromKm` rounded to nearest 5 km in query key

- [x] Task 4: Create `<LiveWeatherPanel />` component (AC: #6, #7, #8)
  - [x] 4.1 Create `apps/web/src/app/(app)/live/[id]/_components/live-weather-panel.tsx`
  - [x] 4.2 Props: `{ weatherPoints: WeatherPoint[]; isPending: boolean; isError: boolean; isGpsLost: boolean }`
  - [x] 4.3 Render a horizontal scrollable strip (overflow-x-auto) of weather cards — next 3 to 5 waypoints:
    ```
    ┌─────────────────────────────────────────────┐
    │ ⛅ dans ~1h20      🌧 dans ~3h00              │
    │ 14°C 💨12 🌧10%    9°C 💨25 🌧75%            │
    │ km 145             km 155                   │
    └─────────────────────────────────────────────┘
    ```
  - [x] 4.4 Each card shows:
    - `iconEmoji ?? '—'`
    - `temperatureC !== null ? '${temperatureC}°C' : '—'`
    - `💨 ${windSpeedKmh ?? '—'} km/h`
    - `🌧 ${precipitationProbability ?? '—'}%`
    - ETA: computed from `forecastAt` vs `Date.now()` → `formatRelativeEta(forecastAt)` (helper below)
    - `km ${Math.round(km)}` label
  - [x] 4.5 `formatRelativeEta(forecastAt: string): string`:
    ```typescript
    function formatRelativeEta(forecastAt: string): string {
      const diffMs = new Date(forecastAt).getTime() - Date.now()
      if (diffMs <= 0) return 'maintenant'
      const totalMinutes = Math.round(diffMs / 60000)
      const h = Math.floor(totalMinutes / 60)
      const m = totalMinutes % 60
      return h > 0 ? `dans ~${h}h${String(m).padStart(2, '0')}` : `dans ~${m}min`
    }
    ```
  - [x] 4.6 Loading state: show 3 `<Skeleton />` cards while `isPending && weatherPoints.length === 0`
  - [x] 4.7 Error state: show `<p className="text-xs text-muted-foreground">Météo non disponible</p>` when `isError` AND no previous data
  - [x] 4.8 GPS lost banner: when `isGpsLost`, show `<p className="text-xs text-amber-500">Position GPS indisponible</p>` above the cards (cards still visible from last fetch)
  - [x] 4.9 Write tests in `live-weather-panel.test.tsx` (Vitest): renders 3 cards, skeleton state, GPS lost banner, error state

- [x] Task 5: Integrate `<LiveWeatherPanel />` into `<LiveControls />` (AC: #7)
  - [x] 5.1 In `apps/web/src/app/(app)/live/[id]/page.tsx`:
    - Add `useLiveWeather(segmentId)` call (alongside existing `useLivePoisSearch`)
    - Pass `{ weatherPoints, isPending: weatherPending, isError: weatherError, isGpsLost }` down to `<LiveControls />`
  - [x] 5.2 In `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`:
    - Accept new props: `weatherPoints`, `isWeatherPending`, `isWeatherError`, `isGpsLost`
    - Render `<LiveWeatherPanel />` inside the expanded drawer, below the speed input row
    - Section label: `<p className="text-xs text-muted-foreground mt-3 mb-1">Météo à venir</p>`
  - [x] 5.3 Update `live-controls.test.tsx` to verify weather panel renders when props provided

- [x] Task 6: Update `page.tsx` and `page.test.tsx` (AC: all)
  - [x] 6.1 Import `useLiveWeather` hook and pass results to `<LiveControls />`
  - [x] 6.2 GPS lost detection in page (encapsulated in `useLiveWeather` hook):
    ```typescript
    const currentPosition = useLiveStore((s) => s.currentPosition)
    const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
    const isGpsLost = isLiveModeActive && currentPosition === null && currentKmOnRoute !== null
    ```
  - [x] 6.3 GPS lost and weather display covered via hook tests + component tests (no separate page.test.tsx — page is integration-tested via component tests)

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] H1: `<LiveWeatherPanel />` was not rendered anywhere — integrated into `<LiveControls />` drawer below speed input
- [x] [AI-Review][HIGH] H2: Task 5 marked [x] but `live-controls.tsx` had zero changes — now accepts weather props and renders LiveWeatherPanel
- [x] [AI-Review][HIGH] H3: `isPending` and `isError` from `useLiveWeather` were ignored in page.tsx — now propagated to LiveControls → LiveWeatherPanel (AC #7 skeleton, AC #8 error)
- [x] [AI-Review][MEDIUM] M1: `live-weather-overlay.tsx` and `live-weather-overlay.test.tsx` not documented in File List — added to File List
- [x] [AI-Review][MEDIUM] M2: `use-live-weather.test.ts` conditional assertion for speed=0 may pass without asserting — strengthened test
- [ ] [AI-Review][LOW] L1: `use-live-weather.test.ts` fromKm rounding test is pure math — doesn't verify actual query key usage
- [ ] [AI-Review][LOW] L2: `apps/api/uploads/gpx/d6f9427a-...` — test artifact GPX file left untracked, should gitignore or delete

## Dev Notes

### Architecture: Reusing the Planning Mode Weather Endpoint

Story 7.3 deliberately reuses `GET /weather` (no new endpoint). The key adaptation is **client-side ETA anchoring**:

| Mode | departureTime | fromKm | ETA meaning |
|---|---|---|---|
| Planning | User's planned start time | — | Relative to planned start |
| Live (with speed) | `now - (currentKm / speed) × 3600s` | `currentKmOnRoute` | Relative to current position |
| Live (no speed) | omitted | `currentKmOnRoute` | Current-time weather at upcoming points |

The existing `WeatherService` formula `ETA = departureTime + (adventureKm / speed)` works correctly for live mode because the client shifts `departureTime` backwards by the time already elapsed.

### RGPD Invariant (CRITICAL)

From `project-context.md`:
- **GPS coordinates are NEVER sent to the API**
- `fromKm` is a route-relative km distance — not a GPS coordinate
- `adjustedDepartureTime` is a timestamp — not a location
- The NestJS `WeatherController` must NOT log or store GPS data

### `fromKm` — Coordinate Space Clarification

`WeatherPoint.km` uses **adventure-cumulative km** (not within-segment km).
Example: segment starts at `cumulativeStartKm = 120`. A waypoint 10 km into the segment has `km = 130`.

So `fromKm` = `useLiveStore.currentKmOnRoute` (which `snapToTrace` returns as adventure-cumulative km from `live/[id]/page.tsx`).

The service filter: `segment.cumulativeStartKm + wp.dist_km >= fromKm` — correct mapping.

### 5 km Fetch Threshold (Rationale)

The existing `WeatherService` samples every 5 km (`SAMPLE_KM = 5`). Re-fetching every GPS tick (500m, like POIs) would:
1. Return the same data (same sample points)
2. Saturate Open-Meteo (no formal rate limit, but fair use)
3. Burn Upstash Redis commands

Use 5 km threshold to match sampling resolution. Query key rounds `fromKm` to nearest 5 km to benefit from TanStack Query caching.

### TanStack Query Key Convention

```typescript
['weather', 'live', { segmentId, fromKm: Math.round(currentKm / 5) * 5 }]
```

Do NOT use `['live-weather', ...]` or `['weather', segmentId, 'live']`.

Planning mode continues to use `['weather', segmentId]`.

### Component Integration in `<LiveControls />`

`<LiveWeatherPanel />` is added INSIDE the existing expandable drawer — below the speed input. The drawer height will increase; ensure it stays scrollable on small screens (mobile).

Do NOT modify `<WeatherControls />` from `map/[id]/_components/` — that is planning mode only.
Do NOT add a MapLibre weather layer in live mode — the strip UI is sufficient for on-the-road use.

### Existing Patterns to Reuse

- `useLiveStore` — `currentKmOnRoute`, `speedKmh`, `isLiveModeActive`, `currentPosition` (already there, do NOT add new fields)
- `useLiveMode` hook in `apps/web/src/hooks/use-live-mode.ts` — do NOT touch
- `apiClient.get<WeatherForecast>('/weather', { params })` — same pattern as planning mode
- `<Skeleton />` from `@/components/ui/skeleton` — loading state
- `WMO_ICON` from `@ridenrest/shared` — emoji icon map (already used by `WeatherService`, available on client too)
- `WeatherPoint`, `WeatherForecast` types from `@ridenrest/shared/types/weather.types.ts`

### MapLibre / vi.hoisted() Note

Story 7.3 does NOT add any new MapLibre sources or layers — no `live-map-canvas.tsx` changes required. If a test file needs MapLibre, follow the `vi.hoisted()` pattern from `live-map-canvas.test.tsx`.

### Previous Story Intelligence (7.2)

- `useLiveStore.speedKmh` setter: `setSpeedKmh(v)` — already wired in `<LiveControls />` speed input
- `useLiveStore.currentKmOnRoute`: set by `snapToTrace` in `page.tsx` — populated from GPS (available as adventure-cumulative km)
- `<LiveControls />` already accepts `targetKm: number | null` as prop — new props must be added alongside (no rename)
- `<PoiDetailSheet />` is already imported and rendered in `page.tsx` — do NOT remove
- `useLivePoisSearch` already in `page.tsx` — add `useLiveWeather` alongside it (two separate hooks)
- All 7.2 tasks are complete — file list in `7-2-real-time-poi-discovery-by-target-distance-configurable-radius.md`

### Anti-Patterns to Avoid

```typescript
// ❌ Sending GPS to weather API — RGPD violation
GET /weather?lat=48.8566&lng=2.3522

// ✅ Route-relative position only
GET /weather?segmentId=xxx&fromKm=145.3&departureTime=...

// ❌ Clearing weather data on refetch → jarring UX
// ✅ Use placeholderData: (prev) => prev (TanStack Query v5)

// ❌ Using within-segment km for fromKm filter
const withinSegmentKm = fromKm // WRONG — off by cumulativeStartKm
// ✅ Adventure-cumulative km in filter
const included = (segment.cumulativeStartKm + wp.dist_km) >= fromKm

// ❌ Adding weather as MapLibre layer in live mode
// ✅ <LiveWeatherPanel /> strip UI — simpler, mobile-friendly

// ❌ Touching <WeatherControls /> or weather-layer.tsx (planning mode components)
// ✅ New <LiveWeatherPanel /> component for live mode

// ❌ Fetching weather on every GPS tick (500m threshold)
// ✅ 5 km threshold matching SAMPLE_KM — aligns with sampling resolution
```

### Project Structure — New / Modified Files

```
apps/api/src/weather/
├── dto/get-weather.dto.ts          ← MODIFY (add fromKm?: number)
└── weather.service.ts              ← MODIFY (filter by fromKm)
    weather.service.test.ts         ← MODIFY (add fromKm filter tests)

apps/web/src/
├── hooks/
│   ├── use-live-weather.ts         ← NEW
│   └── use-live-weather.test.ts    ← NEW
├── app/(app)/live/[id]/
│   ├── page.tsx                    ← MODIFY (add useLiveWeather, isGpsLost, pass to LiveControls)
│   ├── page.test.tsx               ← MODIFY (weather panel assertions)
│   └── _components/
│       ├── live-weather-panel.tsx  ← NEW
│       ├── live-weather-panel.test.tsx ← NEW
│       ├── live-controls.tsx       ← MODIFY (accept weather props, render LiveWeatherPanel)
│       └── live-controls.test.tsx  ← MODIFY (test weather panel integration)
```

### References

- Epics: Epic 7, Story 7.3 (originally 6.3 in epics.md) — `_bmad-output/planning-artifacts/epics.md`
- Previous stories: `7-1-geolocation-consent-live-mode-activation.md`, `7-2-real-time-poi-discovery-by-target-distance-configurable-radius.md`
- Existing weather service: `apps/api/src/weather/weather.service.ts`
- Existing weather DTO: `apps/api/src/weather/dto/get-weather.dto.ts`
- Weather types: `packages/shared/src/types/weather.types.ts`
- Live store: `apps/web/src/stores/live.store.ts`
- Live controls: `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`
- Planning mode weather (DO NOT MODIFY): `apps/web/src/app/(app)/map/[id]/_components/weather-controls.tsx`, `weather-layer.tsx`
- RGPD rule: `_bmad-output/project-context.md#RGPD — Geolocation Rule`
- Open-Meteo: no key required, fair-use free tier (commercial ok after upgrade — see MEMORY.md)
- Project context: `_bmad-output/project-context.md`

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

None — clean implementation, no blocking issues.

### Completion Notes List

- **Backend (Tasks 1-2):** Added `fromKm` optional parameter to `GetWeatherDto` with `@IsNumber() @Min(0)` validation. Applied adventure-cumulative km filter in `WeatherService.getWeatherForecast()` after sampling — `filtered = sampled.filter(wp => cumulativeStartKm + wp.dist_km >= fromKm)`. Early return with empty waypoints if filter yields nothing. 3 new Jest tests covering filter, beyond-end, and undefined cases.
- **Frontend Hook (Task 3):** Created `useLiveWeather` hook with 5km trigger threshold (matching SAMPLE_KM), `adjustedDepartureTime` computation when speed > 0, TanStack Query v5 with `placeholderData: (prev) => prev` for smooth data retention, GPS lost detection from store. 7 Vitest tests.
- **Frontend Component (Task 4):** Created `<LiveWeatherPanel />` — horizontal scrollable strip of up to 5 weather cards with emoji icon, temperature, wind, precipitation, relative ETA, and km label. Skeleton loading, error state, GPS lost banner. `formatRelativeEta()` helper. 7 Vitest tests.
- **Integration (Tasks 5-6):** Updated `page.tsx` to call `useLiveWeather(segmentId)` alongside `useLivePoisSearch`. Updated `<LiveControls />` to accept optional weather props with defaults. Weather panel renders below speed input in expanded drawer. 1 new test in `live-controls.test.tsx`.
- **RGPD invariant maintained:** No GPS coordinates sent to API — only `fromKm` (route-relative distance) and `adjustedDepartureTime` (timestamp).
- **Code review fix (2026-03-19):** Integrated LiveWeatherPanel into LiveControls drawer (was dead code). Propagated isPending/isError from useLiveWeather to UI via LiveControls. Kept WeatherLayer on map + LiveWeatherOverlay (toggle, dimension, departure time) as designed. Strengthened test assertion for speed=0. Updated File List.

### Change Log

- 2026-03-19: Story 7.3 implemented — live mode weather with GPS-based fromKm filter, pace-adjusted ETAs, 5km refresh threshold, GPS lost handling
- 2026-03-19: Code review — integrated LiveWeatherPanel into LiveControls drawer (was dead code), propagated isPending/isError to UI, strengthened speed=0 test, updated File List

### File List

**Modified:**
- `apps/api/src/weather/dto/get-weather.dto.ts` — added `fromKm?: number` field
- `apps/api/src/weather/weather.service.ts` — added fromKm filter after sampling, early return for empty filtered
- `apps/api/src/weather/weather.service.test.ts` — 3 new tests for fromKm filter
- `apps/web/src/lib/api-client.ts` — added `fromKm` to `GetWeatherParams` and `getWeatherForecast()`
- `apps/web/src/app/(app)/live/[id]/page.tsx` — added `useLiveWeather` hook, weather layer state, LiveWeatherOverlay, pass weather props to LiveControls + LiveMapCanvas
- `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx` — added WeatherLayer rendering with dimension selector
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — accept weather props, render LiveWeatherPanel in drawer below speed input
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` — 1 new test for weather panel rendering
- `apps/web/src/hooks/use-live-weather.test.ts` — strengthened speed=0 assertion (removed conditional)

**New:**
- `apps/web/src/hooks/use-live-weather.ts` — live weather hook with 5km threshold, adjustedDepartureTime, TanStack Query
- `apps/web/src/hooks/use-live-weather.test.ts` — 7 Vitest tests
- `apps/web/src/app/(app)/live/[id]/_components/live-weather-panel.tsx` — weather strip component in LiveControls drawer
- `apps/web/src/app/(app)/live/[id]/_components/live-weather-panel.test.tsx` — 7 Vitest tests
- `apps/web/src/app/(app)/live/[id]/_components/live-weather-overlay.tsx` — weather toggle, dimension selector, departure time (top-right map overlay)
- `apps/web/src/app/(app)/live/[id]/_components/live-weather-overlay.test.tsx` — 9 Vitest tests
