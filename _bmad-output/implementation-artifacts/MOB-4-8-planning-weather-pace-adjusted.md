# Story MOB-4.8 : Météo planifiée le long de la trace (pace-adjusted)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur planifiant**,
I want **voir la météo prévue à chaque point selon mon heure de départ et mon allure**,
So that **j'anticipe les conditions de mon étape**.

> **Dépend de MOB-4.1** (carte + trace + waypoints). Cette story ajoute : la saisie **heure de départ + allure**, la **météo pace-adjusted** par point km (calculée **serveur**), le **rafraîchissement horaire** (via `staleTime`), le **fallback heure actuelle**, et un **affichage** (strip météo + flèches de vent proportionnelles).
>
> ⚠️ **DIVERGENCE avec l'AC d'epic** : l'epic dit « données **WeatherAPI.com** ». L'implémentation réelle utilise **Open-Meteo** (codes WMO). **Le client n'appelle jamais le fournisseur directement** — c'est le backend NestJS qui interroge Open-Meteo (Redis-cached). Le mobile appelle **`GET /weather`** / **`GET /stages/:id/weather`** : le fournisseur est donc **transparent** côté mobile. (Voir Open Questions.)
>
> **Backend météo livré (web `done`)** — **rien à recréer**. Tout le calcul d'ETA pace-adjusted est **serveur** : le mobile passe `departureTime`/`speedKmh`/`stageDepartures` et reçoit des points déjà calés.

## Acceptance Criteria

1. **Given** le mode Planification
   **When** je saisis une **heure de départ** et une **allure** (vitesse)
   **Then** la météo affichée est **calée sur l'heure d'arrivée estimée** à chaque point km (pace-adjusted, calculé serveur) (FR-050, FR-051)
   **And** les données (température, vent vitesse+direction, précipitations, icône) proviennent de `GET /weather?segmentId&departureTime&speedKmh[&fromKm&stageDepartures]` (réponse `WeatherForecast { waypoints: WeatherPoint[] }`) (FR-053, via Open-Meteo serveur)

2. **Given** la météo affichée
   **When** une heure s'écoule
   **Then** les prévisions sont **automatiquement rafraîchies** — via `staleTime = WEATHER_CACHE_TTL * 1000` (= 3 600 000 ms) sur la query (parité web : pas de `refetchInterval`, le cache serveur Redis a un TTL 1 h) (FR-054)
   **And** la query key inclut `{ segmentId, departureTime, speedKmh, stageDepartures }` (changer la saisie → refetch)

3. **Given** **aucune allure** saisie
   **When** la météo est demandée
   **Then** elle correspond à l'**heure actuelle** au point (fallback serveur quand `departureTime`/`speedKmh` absents) (FR-055)

4. **Given** des **étapes avec heure de départ** définie (`departureTime` par étape)
   **When** la météo est calculée
   **Then** les départs **par étape** priment (`stageDepartures` JSON passé à `GET /weather`) sur le départ global ; sinon le départ global s'applique (parité web `hasAnyStageDeparture`)

5. **Given** la météo affichée
   **When** je consulte le vent
   **Then** des **flèches de vent** orientées (direction) et **proportionnelles** (taille ∝ vitesse) sont rendues ; le vent quasi-nul est atténué (opacité) (FR-051 support / story web 6.2)

6. **Given** la carte hors-ligne **ou** des points au-delà de l'horizon de prévision
   **When** la météo s'affiche
   **Then** la dernière météo en cache (`weather-cache.ts`) reste consultable hors-ligne ; les points `null` (au-delà de l'horizon Open-Meteo) sont rendus en « indisponible » (grisé), sans erreur bloquante

## Tasks / Subtasks

- [ ] **T1 — Façade `lib/api/weather.ts`** (AC: 1, 2, 3, 4)
  - [ ] `getTraceWeather(params): Promise<WeatherForecast>` → `apiFetch('/weather?segmentId=…[&departureTime=…&speedKmh=…&fromKm=…&stageDepartures=…]')`. `stageDepartures` = JSON-encodé `Array<{ startKm, endKm, departureTime }>`.
  - [ ] (Optionnel, badge par étape) `getStageWeather(stageId, { departureTime?, speedKmh? }): Promise<StageWeatherPoint | null>` → `apiFetch('/stages/${stageId}/weather?…')`.
  - [ ] Types **`WeatherForecast` / `WeatherPoint` / `StageWeatherPoint`** importés racine `@ridenrest/shared`. **Attention** : `WeatherPoint.precipitationProbability` (0-100 %) vs `StageWeatherPoint.precipitationMmH` (mm/h) — ne pas confondre. `WeatherPoint.km` = **km cumulés aventure**.

- [ ] **T2 — Pace store (heure départ + allure)** (AC: 1, 3, 4)
  - [ ] Pace **global** persisté local (parité web `weather-pace.ts` localStorage → **AsyncStorage** mobile) : `{ departureTime?, speedKmh? }`, clé `ridenrest:weather-pace`. Helper `lib/weather-pace.ts` (get/set). (`@react-native-async-storage/async-storage` déjà présent.)
  - [ ] Pace **par étape** : `departureTime` est en **DB** (`adventure_stages.departure_time`) ; la vitesse vient de `adventure.avgSpeedKmh` (global) ou `stage.speedKmh`. **Pas de saisie d'étape ici** si l'écran étapes n'existe pas encore sur mobile (les étapes mobiles = epic ultérieur) → au MVP, **pace global** ; si des `stageDepartures` existent (via l'aventure), les passer. Documenter la frontière.
  - [ ] `hasAnyStageDeparture` → si vrai, construire `stageDepartures` et **masquer** le champ départ global (parité web).

- [ ] **T3 — Hook `hooks/use-weather.ts`** (AC: 1, 2, 3, 6)
  - [ ] `useTraceWeather({ segmentId, departureTime, speedKmh, stageDepartures })` → `useQuery({ queryKey: ['weather', { segmentId, departureTime, speedKmh, stageDepartures }], queryFn, staleTime: WEATHER_CACHE_TTL * 1000 })`. `WEATHER_CACHE_TTL = 3600` (`@ridenrest/shared`). **Pas de `refetchInterval`** (le refresh horaire = `staleTime` + refetch on focus). Une query par segment ready (parité `useQueries`).
  - [ ] **Offline (AC6)** : write-through `setCachedWeather(adventureId, forecast)` au succès ; fallback `getCachedWeather` offline. **Typer `weather-cache.ts`** : remplacer `CachedWeather = unknown` par `WeatherForecast` (`@ridenrest/shared`) — la story météo est précisément le moment prévu (TODO du fichier).

- [ ] **T4 — Données de rendu `lib/weather-geojson.ts`** (AC: 1, 5, 6)
  - [ ] Porter (web `apps/web/src/lib/weather-geojson.ts`) :
    - `buildWeatherLineSegments(waypoints, weatherPoints)` → LineString par intervalle, `available = temperatureC !== null`, GeoJSON `[lng, lat]`.
    - `buildWindArrowPoints(weatherPoints, waypoints)` → Points avec `windDirectionMaplibre`, `windSpeedKmh`, `km`.
    - Conversion vent : `windDirectionMaplibre = (windDirection - 90 + 360) % 360` (météo → MapLibre 0=Est). **Constante load-bearing à copier exactement.**

- [ ] **T5 — Affichage : `components/map/weather-strip.tsx` (+ couche carte optionnelle)** (AC: 1, 5, 6)
  - [ ] **`weather-strip.tsx`** (a des **stories** Storybook — archi L1054) : bande horizontale de points météo (par km) : icône (`iconEmoji` / `WMO_ICON`), température, précip (%), vent. Points `null` → état grisé « indisponible ». Réutiliser `Card`/`Text`/tokens.
  - [ ] **Flèches de vent (AC5)** : si rendu sur la carte (couche symbole `→` rotation `windDirectionMaplibre`, taille interpolée sur `windSpeedKmh` : stops `0→16, 20→24, 40→36, 60→48`, opacité `0→0.4 … 5→1.0`). Si rendu hors-carte (dans le strip), une flèche `<Svg>` orientée + taille ∝ vitesse (réutiliser `react-native-svg`). **Décider** strip vs couche carte (Open Question) — le strip est plus simple et a des stories.
  - [ ] **Icônes WMO** : `WMO_ICON` / `WMO_ICON_FALLBACK` (`@ridenrest/shared`) — **réutiliser**, ne pas remapper.

- [ ] **T6 — Saisie départ/allure `components/map/weather-controls.tsx`** (AC: 1, 3, 4)
  - [ ] Champ **heure de départ** (date/heure — composant natif : `@react-native-community/datetimepicker` à installer **si** retenu, ou saisie simple ISO ; **décider** — éviter une grosse dép si possible). Champ **allure/vitesse** (numérique). Persistance via pace store (T2).
  - [ ] Si `hasAnyStageDeparture` → masquer le champ départ global (« Dates définies par étape »). Sans allure → fallback heure actuelle (AC3) géré serveur (ne rien envoyer).
  - [ ] Brancher la saisie → query key change → refetch (AC2).

- [ ] **T7 — Intégration route map + i18n** (AC: 1, 2, 3, 4, 5, 6)
  - [ ] Monter `weather-controls` + `weather-strip` (panneau carte). Lifter `departureTime/speedKmh` à l'écran (cohérent avec les autres états carte).
  - [ ] Bloc i18n `weather.*` (parité FR/EN) :
    - `weather.departureLabel` / `weather.speedLabel` / `weather.stageDatesNotice`
    - `weather.temp` / `weather.wind` / `weather.precip` / `weather.unavailable`
    - `weather.refreshNotice` (optionnel) / labels a11y vent
  - [ ] **Zéro chaîne en dur**.

- [ ] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5, 6)
  - [ ] `use-weather` : query key `{ segmentId, departureTime, speedKmh, stageDepartures }` ; `staleTime = WEATHER_CACHE_TTL*1000` ; **pas** de `refetchInterval` ; write-through + fallback cache offline (mock `weather-cache`).
  - [ ] `weather-geojson` (pur) : `buildWeatherLineSegments` (available si temp non null, `[lng,lat]`) ; `buildWindArrowPoints` ; conversion `(deg-90+360)%360`.
  - [ ] pace store : get/set AsyncStorage ; `hasAnyStageDeparture` masque le départ global.
  - [ ] `weather-strip` : icône WMO, points `null` → indisponible ; flèche vent taille ∝ vitesse. Stories Storybook.
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` OK.

- [ ] **T9 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5, 6) — ⏳ build Dev Client
  - [ ] Saisir départ + allure → météo par point calée sur l'ETA ; sans allure → heure actuelle. Étapes avec départ → priment.
  - [ ] Flèches vent orientées + proportionnelles ; vent nul atténué. Points au-delà de l'horizon → grisés.
  - [ ] Couper réseau → dernière météo en cache visible. (Refresh horaire difficile à valider à la main — vérifier `staleTime`.)

## Dev Notes

### Backend météo — réutilisé tel quel (PROVIDER = Open-Meteo, pas WeatherAPI.com)

- **`GET /weather`** — query `GetWeatherDto` : `segmentId` (uuid, requis), `departureTime?` (ISO 8601), `speedKmh?` (1-100), `fromKm?`, `stageDepartures?` (JSON `[{startKm,endKm,departureTime}]`). Réponse `WeatherForecast { segmentId, waypoints: WeatherPoint[], cachedAt, expiresAt }`. [Source: apps/api/src/weather/weather.controller.ts:15-23 ; dto/get-weather.dto.ts:11-40]
  ```ts
  interface WeatherPoint {
    km: number;                 // ADVENTURE-cumulé
    forecastAt: string;         // ETA ISO
    temperatureC: number|null; precipitationProbability: number|null; // 0-100 %
    windSpeedKmh: number|null;  windDirection: number|null;           // deg météo (0=N)
    weatherCode: number|null;   iconEmoji: string|null;               // WMO
  }
  ```
  `null` = au-delà de l'horizon de prévision. [Source: packages/shared/src/types/weather.types.ts:10-26]
- **`GET /stages/:id/weather`** → `StageWeatherPoint | null` : `{ forecastAt, temperatureC, precipitationMmH /* mm/h ! */, windSpeedKmh, windDirectionDeg, iconEmoji }`. [Source: apps/api/src/stages/stages.controller.ts:59-70 ; weather.types.ts:1-8]
- **ETA pace-adjusted = SERVEUR** : `etaMs = departure + (adventureKm / speedKmh) * 3.6e6` (ou par étape) ; sans pace → `new Date()`. Échantillonnage 5 km. **Aucun helper partagé** → le mobile ne recalcule rien, il passe les params. [Source: apps/api/src/weather/weather.service.ts:76-96]
- **Open-Meteo** (serveur, Redis 1 h) : `hourly=temperature_2m,wind_speed_10m,wind_direction_10m,precipitation_probability,precipitation,weather_code`. Le mobile ne l'appelle jamais. [Source: apps/api/src/weather/providers/open-meteo.provider.ts:56-64]
- **Refresh horaire** : web utilise `staleTime: WEATHER_CACHE_TTL * 1000` (1 h), **pas** `refetchInterval`. Query key `['weather', { segmentId, departureTime, speedKmh, stageDepartures }]`. [Source: apps/web/.../map-view.tsx:209-219 ; packages/shared/src/constants/api.constants.ts:11]

### Pace / départ (modèle de données)

- **Pace global** : web localStorage `ridenrest:weather-pace` `{ departureTime?, speedKmh? }` → mobile **AsyncStorage**. [Source: apps/web/src/lib/weather-pace.ts]
- **Départ par étape** : DB `adventure_stages.departure_time` (`AdventureStageResponse.departureTime: string|null`), écrit via `PATCH /adventures/:aid/stages/:sid { departureTime }`. Vitesse = `adventure.avgSpeedKmh` (pas de champ vitesse de trace dédié) ou `stage.speedKmh`. **Précédence** : si une étape a un départ → `stageDepartures` JSON prime + champ global masqué. [Source: packages/shared/src/types/adventure.types.ts:85 ; apps/web/.../map-view.tsx:196-205]
- **Frontière mobile** : la **gestion d'étapes** (CRUD étapes/départ par étape) n'est pas dans MOB-4 → au MVP, **pace global** ; consommer `stageDepartures` **si** l'aventure en porte déjà. Documenter.

### Rendu (référence web → RN)

- `buildWeatherLineSegments` / `buildWindArrowPoints` + conversion `windDirectionMaplibre = (windDirection - 90 + 360) % 360`. Tailles flèches (stops vitesse) + opacité (vent nul). [Source: apps/web/src/lib/weather-geojson.ts:9-81 ; weather-layer.tsx:142-171]
- **`WMO_ICON` / `WMO_ICON_FALLBACK`** partagés (`@ridenrest/shared`) — réutiliser. [Source: packages/shared/src/constants/weather.constants.ts:2-13]
- `weather-strip.tsx` a des **stories** (archi L1054). La couche carte météo (flèches) est optionnelle MVP.

### Réutilisation du code mobile existant

- **MOB-4.1** : carte + trace + waypoints/`cumulativeStartKm`. `src/lib/cache/weather-cache.ts` (**typer `WeatherForecast`** — TODO du fichier). `@react-native-async-storage/async-storage` (pace store). `react-native-svg` (flèches). `@ridenrest/shared` (types météo + `WMO_ICON` + `WEATHER_CACHE_TTL`).
- `src/lib/api/api-client.ts` (`apiFetch`), `src/components/ui/{card,skeleton,input,error-banner}.tsx`, `src/lib/cn.ts`, `src/lib/i18n`, `src/hooks/use-network-status.ts`.

### Conventions

- Refresh = `staleTime` (pas d'intervalle). Points `null` → grisé non bloquant. Couleurs (flèches/segments météo) = inline/expression. Tests hors `src/app/`, `userEvent`, mocks sans JSX. i18n FR/EN parité.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/lib/api/weather.ts
apps/mobile/src/hooks/use-weather.ts
apps/mobile/src/lib/weather-pace.ts
apps/mobile/src/lib/weather-geojson.ts
apps/mobile/src/components/map/weather-strip.tsx (+ weather-strip.stories.tsx)
apps/mobile/src/components/map/weather-controls.tsx
apps/mobile/src/components/map/weather-layer.tsx (optionnel — flèches sur carte)
+ tests co-localisés
```
**Modifs** :
```
apps/mobile/src/lib/cache/weather-cache.ts        (CachedWeather → WeatherForecast)
apps/mobile/src/app/(app)/map/[id].tsx            (weather-controls + weather-strip)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (bloc weather.*)
apps/mobile/package.json (?)                       (datetimepicker si retenu)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : façade `/weather` (+ `/stages/:id/weather`), `use-weather` (staleTime 1 h, query key, offline cache typé), pace store global, `weather-geojson` + conversion vent, `weather-strip` (icônes WMO, points null), flèches proportionnelles, fallback heure actuelle, précédence stage-departures (si présent), i18n, tests.
- **Exclu** : CRUD étapes / saisie départ par étape → epic ultérieur ; météo **Live** (GPS) → **MOB-5** ; carte/trace de base (MOB-4.1) ; tout calcul d'ETA côté client (c'est serveur).

### Open Questions

1. **WeatherAPI.com (AC epic) vs Open-Meteo (réel)** : le mobile n'appelle pas le fournisseur (backend transparent) → divergence sans impact mobile, mais **corriger la mention** « WeatherAPI.com » dans l'epic/UI si elle apparaît. _(Recommandation : ne rien afficher du fournisseur, ou « Open-Meteo ».)_
2. **Sélecteur date/heure** : `@react-native-community/datetimepicker` (natif, prebuild) vs saisie simple. _(Recommandation : datetimepicker pour l'UX ; sinon saisie ISO minimaliste au MVP.)_
3. **Flèches vent** : couche carte (parité web) vs dans le `weather-strip`. _(Recommandation : strip au MVP, couche carte ensuite.)_

### References

- [Source: epics-mobile.md#Story MOB-4.8 (l.865-884)] — AC d'origine (FR-050/051/053/054/055) — **mention WeatherAPI.com = divergence**
- [Source: apps/api/src/weather/weather.controller.ts:15-23 ; dto/get-weather.dto.ts:11-40] — `GET /weather`
- [Source: apps/api/src/stages/stages.controller.ts:59-70] — `GET /stages/:id/weather`
- [Source: packages/shared/src/types/weather.types.ts:1-26] — `WeatherForecast`, `WeatherPoint`, `StageWeatherPoint`
- [Source: apps/api/src/weather/weather.service.ts:76-96] — ETA pace-adjusted serveur
- [Source: apps/api/src/weather/providers/open-meteo.provider.ts:56-64] — Open-Meteo (provider réel)
- [Source: packages/shared/src/constants/weather.constants.ts:2-13 ; api.constants.ts:11] — `WMO_ICON`, `WEATHER_CACHE_TTL`
- [Source: apps/web/.../map-view.tsx:196-219 ; lib/weather-pace.ts ; lib/weather-geojson.ts] — staleTime/query key, pace store, geojson + conversion vent
- [Source: apps/mobile/src/lib/cache/weather-cache.ts] — squelette à typer `WeatherForecast`
- [Source: _bmad-output/implementation-artifacts/MOB-4-1-maplibre-native-trace-themes-attribution.md] — carte/trace (dépendance)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.8 (ready-for-dev) — météo pace-adjusted via `GET /weather` (ETA calculé serveur), `use-weather` (`staleTime` 1 h = refresh horaire, query key {segmentId,departureTime,speedKmh,stageDepartures}, offline cache typé `WeatherForecast`), pace store global (AsyncStorage), `weather-strip` (icônes WMO, points null grisés), flèches vent proportionnelles + conversion `(deg-90+360)%360`, fallback heure actuelle, précédence stage-departures. **DIVERGENCE documentée : provider réel = Open-Meteo (pas WeatherAPI.com), transparent côté mobile.** i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
