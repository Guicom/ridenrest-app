# Story 6.2: Wind Arrows Proportional to Wind Speed

Status: done

## Story

As a **cyclist user**,
I want the wind direction arrows on the map to be sized proportionally to the wind speed,
so that I can immediately gauge wind intensity spatially — a small arrow means calm, a large arrow means strong headwind.

## Acceptance Criteria

1. **Given** the weather layer is active in wind dimension,
   **When** the map renders wind arrows,
   **Then** arrow size scales with `windSpeedKmh` using a continuous interpolation: calm (0 km/h) → small, moderate (30 km/h) → medium, strong (60+ km/h) → large.

2. **Given** wind speed is near zero (< 5 km/h),
   **When** the arrow renders,
   **Then** it is displayed at minimal size with reduced opacity (0.4) — indicating calm conditions without cluttering the map.

3. **Given** the user opens the popup by clicking the weather trace,
   **When** the popup renders,
   **Then** it shows the wind speed value in km/h alongside the proportional arrow emoji — consistent with what's visible on the map.

## Tasks / Subtasks

- [x] Task 1: Update `weather-wind-arrows` layer in `weather-layer.tsx` (AC: #1, #2)
  - [x] 1.1 Replace fixed `text-size: 14` with a data-driven `interpolate` expression on `windSpeedKmh`:
    ```typescript
    'text-size': ['interpolate', ['linear'], ['get', 'windSpeedKmh'],
      0,  8,   // calm
      20, 12,  // light breeze
      40, 18,  // strong breeze
      60, 24,  // storm
    ]
    ```
  - [x] 1.2 Add `text-opacity` expression for near-calm winds:
    ```typescript
    'text-opacity': ['interpolate', ['linear'], ['coalesce', ['get', 'windSpeedKmh'], 0],
      0, 0.4,   // barely visible (AC #2)
      5, 1.0,   // fully visible from 5 km/h
    ]
    ```
  - [x] 1.3 Update `weather-layer.test.tsx` — add test asserting `text-size` paint property is a data-driven expression (not a fixed number)

- [x] Task 2: Ensure `windSpeedKmh` is present in wind arrow GeoJSON features (AC: #1)
  - [x] 2.1 Verify `buildWindArrowPoints()` in `weather-geojson.ts` already includes `windSpeedKmh` in feature properties — if not, add it
  - [x] 2.2 Update `weather-geojson.test.ts` — add assertion that `windSpeedKmh` is present in Point feature properties

## Dev Notes

### MapLibre Data-Driven `text-size`

MapLibre `text-size` accepts an `interpolate` expression exactly like `line-color`. The `windSpeedKmh` property is already available in the `weather-wind-arrows` GeoJSON source (set in `buildWindArrowPoints()`).

Scale reference:
| Wind speed | Beaufort | Arrow size |
|---|---|---|
| 0–5 km/h | Calm | 8px, opacity 0.4 |
| 5–20 km/h | Light breeze | 8–12px |
| 20–40 km/h | Moderate | 12–18px |
| 40–60 km/h | Strong | 18–24px |
| 60+ km/h | Storm | 24px (capped) |

### No Backend Changes

All data is already in the `WeatherPoint` type (`windSpeedKmh`) and passed through the GeoJSON pipeline established in Story 6.1. This is a pure rendering change.

### References

- `weather-layer.tsx`: `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx`
- `weather-geojson.ts`: `apps/web/src/lib/weather-geojson.ts`
- MapLibre `interpolate` expression pattern: already used for `line-color` in the same file

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward. `windSpeedKmh` was already present in GeoJSON features (Task 2.1 confirmed no changes needed to `weather-geojson.ts`).

### Completion Notes List

- ✅ Task 1.1: Replaced fixed `text-size: 14` with a `['interpolate', ['linear'], ['coalesce', ['get', 'windSpeedKmh'], 0], ...]` expression in `weather-layer.tsx`. Stops at 24px for 60+ km/h winds. Added `coalesce` guard for null windSpeedKmh (unavailable weather points).
- ✅ Task 1.2: Added `text-opacity` paint property with interpolation from 0.4 (calm, per AC #2) to 1.0 (from 5 km/h). Added `coalesce` guard. Cast as `maplibregl.ExpressionSpecification` for TypeScript type safety.
- ✅ Task 1.3: Updated tests in `weather-layer.test.tsx` — strengthened AC #1 test (checks interpolate + actual stop values 8/24), AC #2 test (checks 0.4 opacity per AC), added AC #3 test (popup shows → arrow emoji).
- ✅ AC #3: Added rotated `→` arrow emoji in popup wind line, consistent with map layer symbol.
- ✅ Task 2.1: `buildWindArrowPoints()` already had `windSpeedKmh: wp.windSpeedKmh` in feature properties — no changes needed.
- ✅ Task 2.2: Added 2 new tests in `weather-geojson.test.ts` asserting `windSpeedKmh` is present and correct (including null case).

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Completion Notes had typo "replaced fixed `text-size: 16`" — original was 14 (per Task 1.1 spec). [6-2-wind-arrows-proportional-size.md:87]
- [ ] [AI-Review][LOW] `eslint-disable-next-line react-hooks/exhaustive-deps` pre-existing — `sourceLines/sourceArrows/layerLines/layerArrows` should be wrapped in `useMemo` to express stable derivation from `id` explicitly. [weather-layer.tsx:169]

### File List

- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx` — data-driven `text-size`/`text-opacity` with coalesce guards; rotated → arrow emoji in popup (AC #3)
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.test.tsx` — strengthened AC #1/#2 tests; added AC #3 popup arrow test
- `apps/web/src/lib/weather-geojson.test.ts` — 2 tests verifying `windSpeedKmh` in Point feature properties
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated to `review`
