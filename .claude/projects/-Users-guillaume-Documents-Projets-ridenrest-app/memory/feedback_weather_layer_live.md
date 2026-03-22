---
name: Weather layer in live mode is intentional
description: Do NOT remove the WeatherLayer or LiveWeatherOverlay from live mode — user explicitly wants weather map layer with toggle/dimension/departure controls, same as planning mode
type: feedback
---

Keep the weather map layer (WeatherLayer) and weather overlay controls (LiveWeatherOverlay) in live mode. The story dev notes saying "Do NOT add a MapLibre weather layer in live mode" were overridden by the user's actual UX decision.

**Why:** Guillaume explicitly wants the live map to have the same weather layer overlay as planning mode (temperature/precipitation/wind colored trace + dimension selector + departure time input). The strip panel (LiveWeatherPanel) in the bottom drawer is ALSO wanted — both coexist.

**How to apply:** In code reviews for live mode, do NOT flag the WeatherLayer as a spec violation. Both the map layer overlay AND the bottom strip panel are part of the intended UX.
