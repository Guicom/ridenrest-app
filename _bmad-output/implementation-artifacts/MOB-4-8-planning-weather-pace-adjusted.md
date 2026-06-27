---
baseline_commit: 9298bfee30471dc95079b2f0c01452e74ec2afc0
---

# Story MOB-4.8 : Météo planifiée le long de la trace (pace-adjusted)

Status: done

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

> **⚠️ RESYNC DOC (2026-06-27) — approche réelle ≠ tâches d'origine.** La feature météo
> a d'abord été livrée dans le commit `ea14bda` (« MOB-4.8 carte Météo + overlay ») avec
> une approche **couche carte** (overlay `weather-layer` + `sidebar-weather-section`)
> plutôt que `weather-strip` + `weather-controls`, et **saisie texte** plutôt que
> `datetimepicker` — ce sont les options recommandées par les **Open Questions 2 & 3**.
> Le passage dev-story du 2026-06-27 a **comblé les vrais trous d'AC** restants
> (AC6 cache offline, pace store T2, opacité vent AC5, tests T8) et **resynchronisé**
> ces tâches sur l'implémentation réelle (Doc Sync Rule). Décision validée par Guillaume.

- [x] **T1 — Façade `lib/api/weather.ts`** (AC: 1, 2, 3, 4)
  - [x] `getWeatherForecast(params): Promise<WeatherForecast>` → `apiFetch('/weather?segmentId=…[&departureTime=…&speedKmh=…&fromKm=…&stageDepartures=…]')`. `stageDepartures` = JSON-encodé `Array<{ startKm, endKm, departureTime }>`. _(Nommé `getWeatherForecast`, pas `getTraceWeather`.)_
  - [x] _(Non retenu MVP)_ `getStageWeather` / badge par étape : **pas** implémenté — les étapes mobiles (CRUD/badge) sont un epic ultérieur (hors frontière). `GET /stages/:id/weather` non consommé.
  - [x] Types **`WeatherForecast` / `WeatherPoint`** importés de `@ridenrest/shared`. `WeatherPoint.km` = km **segment-relatif** côté API → réaligné en **cumulé** par `use-weather` (offset `cumulativeStartKm`).

- [x] **T2 — Pace store (heure départ)** (AC: 1, 3, 4)
  - [x] Pace **global** persisté local (parité web `weather-pace.ts` localStorage → **AsyncStorage** mobile) : `{ departureTime?, speedKmh? }`, clé `ridenrest:weather-pace`. Helper `lib/weather-pace.ts` (`getStoredWeatherPace`/`setStoredWeatherPace`, lectures robustes → `{}`). Hydraté/persisté au niveau de l'écran (`map/[id].tsx`).
  - [x] Pace **par étape** : `departureTime` lu sur les étapes de l'aventure (`useStages` → `stageDeparturesJson`) ; vitesse = `adventure.avgSpeedKmh`. **Pas de saisie d'étape** (frontière — épic étapes ultérieur). Si des départs d'étape existent → `stageDepartures` JSON construit + passé.
  - [x] `stagesHaveDepartures` (≡ `hasAnyStageDeparture`) → masque le champ départ global (« Dates définies par étape »).

- [x] **T3 — Hook `hooks/use-weather.ts`** (AC: 1, 2, 3, 6)
  - [x] `useWeather({ adventureId, segments, weatherActive, departureTime, speedKmh, stageDepartures })` → `useQueries` (une query par segment ready), `queryKey: ['weather', { segmentId, departureTime, speedKmh, stageDepartures }]`, `staleTime = 3 600 000 ms` (= `WEATHER_CACHE_TTL*1000`). **Pas de `refetchInterval`** (refresh horaire = `staleTime` + refetch on focus). Points réalignés en **km cumulés** (offset `cumulativeStartKm` par `segmentId`).
  - [x] **Offline (AC6)** : write-through `setCachedWeather(adventureId, forecasts)` au succès **complet** ; fallback `getCachedWeather` quand aucune donnée live (cold start hors-ligne). **`weather-cache.ts` retypé** `CachedWeather = WeatherForecast[]` (1 entrée par segment) — TODO du squelette MOB-3.5 levé.

- [x] **T4 — Données de rendu `lib/weather-geojson.ts`** (AC: 1, 5, 6)
  - [x] Porté du web :
    - `buildWeatherLineSegments(waypoints, weatherPoints)` → LineString par intervalle, `available = temperatureC !== null`, GeoJSON `[lng, lat]`, **filtre `isValidLngLat` au point** (garde SIGABRT natif).
    - `buildWindArrowPoints(weatherPoints, waypoints)` → Points `windDirectionMaplibre`/`windSpeedKmh`/`km`, waypoints filtrés `isValidLngLat`.
    - Conversion vent `windDirectionMaplibre = (windDirection - 90 + 360) % 360` (météo → MapLibre 0=Est) — copiée exactement.

- [x] **T5 — Affichage : couche carte `components/map/weather-layer.tsx`** (AC: 1, 5, 6) _(remplace `weather-strip` — Open Question 3)_
  - [x] **`weather-layer.tsx`** (overlay `<Map>`) : ligne colorée selon dimension (temp/pluie/vent, expressions `interpolate`), points indisponibles (`available=false`) en gris `#9ca3af`. Icônes WMO `iconEmoji` portées dans les features (réutilisables si strip ajouté plus tard). Pas de `weather-strip`/Storybook au MVP.
  - [x] **Flèches de vent (AC5)** : couche symbole **`icon-image: 'wind-arrow'`** (PNG asset, PAS un glyphe texte), `icon-rotate = windDirectionMaplibre`, taille interpolée `icon-size` sur `windSpeedKmh` (stops `0→0.18, 20→0.28, 40→0.4, 60→0.52`), **opacité atténuée vent quasi-nul** (`icon-opacity` stops `0→0.4, 5→1.0`). Visible en dimension « vent ». ⚠️ **Fix device (2026-06-27)** : le `text-field: '→'` initial (port web) ne rendait **rien sur MapLibre Native** — le glyphe U+2192 est absent de la fontstack par défaut servie par OpenFreeMap. Bascule sur une **icône** (indépendante des glyphes) **appliquée aussi au web** (parité, même bug latent côté GL JS) → `apps/web/.../weather-layer.tsx`. Asset `wind-arrow.png` (pointe vers l'Est = rotation 0). **Validé visuellement sur simulateur iOS** (flèches orientées + proportionnelles).
  - [x] **Icônes WMO** : `WMO_ICON` / `WMO_ICON_FALLBACK` (`@ridenrest/shared`) — réutilisées, pas remappées.

- [x] **T6 — Saisie départ `components/map/sidebar-weather-section.tsx`** (AC: 1, 3, 4) _(remplace `weather-controls` ; saisie texte — Open Question 2)_
  - [x] Carte « Météo » (drawer planning) : toggle « Afficher sur la carte » (`weatherActive`), sélecteur de dimension (temp/pluie/vent → `weatherDimension`), champ **heure de départ texte** (« AAAA-MM-JJ HH:MM », `parseDeparture` → ISO) — **zéro nouvelle dépendance** (pas de `datetimepicker`). Vitesse = `avgSpeedKmh` (pas de champ dédié).
  - [x] Si `stagesHaveDepartures` → champ départ global masqué (« Dates définies par étape »). Sans allure/départ → fallback heure actuelle (AC3) géré serveur (rien envoyé).
  - [x] Saisie → query key change → refetch (AC2).

- [x] **T7 — Intégration route map + i18n** (AC: 1, 2, 3, 4, 5, 6)
  - [x] `weather-layer` (overlay) + `sidebar-weather-section` (drawer) montés dans `map/[id].tsx`. `departureInput` lifté à l'écran + persisté (pace store). `adventureId` passé à `useWeather` (clé du cache offline).
  - [x] Bloc i18n `map.weather.*` (parité FR/EN) : `title`, `temperature`/`precipitation`/`wind` (+ `*Short`), `departure`, `byStage`, + `map.showOnMap`. **Zéro chaîne en dur.** _(Le grisé « indisponible » est rendu par couleur de couche, pas par un label → pas de clé `unavailable`.)_

- [x] **T8 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4, 5, 6)
  - [x] `use-weather` : query key `{ segmentId, departureTime, speedKmh, stageDepartures }` ; `staleTime = 3 600 000` ; **pas** de `refetchInterval` ; réalignement km cumulés ; write-through + fallback cache offline ; `stageDepartures` prioritaire (departureTime null) ; `weatherActive=false` → 0 requête.
  - [x] `weather-geojson` (pur) : `buildWeatherLineSegments` (available si temp non null, `[lng,lat]`) ; `buildWindArrowPoints` ; conversion `(deg-90+360)%360`.
  - [x] pace store : get/set AsyncStorage round-trip, clé `ridenrest:weather-pace`, absence/JSON corrompu → `{}`.
  - [x] `weather-cache` : round-trip typé `WeatherForecast[]`, miss/JSON corrompu → null, création répertoire.
  - [x] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [x] **T9 — Validation device (simulateur iOS, automatisée Maestro + screenshots)** (AC: 1, 2, 3, 4, 5, 6) — 2026-06-27
  - [x] AC1 — météo activée → **ligne colorée** sur la trace (dimension Temp.) ; pas de crash MapLibre natif.
  - [x] AC5 — dimension Vent → **flèches orientées + proportionnelles** rendues (après fix `icon-image`).
  - [x] AC6 write-through — fichier `WeatherForecast[]` (4 segments, 92 pts) **écrit sur le device** (vérifié dans `Library/Caches/weather/{id}.json`).
  - [x] AC6 fallback offline — **API suspendue** (`kill -STOP`) → la météo reste affichée (lue du cache).
  - [x] T2 — date de départ saisie → **persistée après redémarrage** de l'app (assert Maestro).
  - [x] **AC4** (étapes avec départs prioritaires) — validé : étape datée insérée sur Test1 (DB) → la carte météo bascule sur « **Dates définies par étape** » + champ date global **masqué** (asserts Maestro), puis étape supprimée (DB restaurée).
  - [~] AC2 (refresh horaire) — non observable à la main ; couvert par tests unitaires (`staleTime`).

### Review Findings

- [x] [Review][Patch] `setStoredWeatherPace` écrase destructivement l'objet entier — un appel `{ departureTime }` efface `speedKmh` si précédemment stocké ; la fonction doit faire un read-merge-write (ou toujours passer l'objet complet au call-site). [`apps/mobile/src/lib/weather-pace.ts`]
- [x] [Review][Patch] `allLoaded` reste faux à jamais si un segment échoue en erreur définitive — `forecasts.length === readySegments.length` n'atteint jamais sa cible, le write-through cache ne s'écrit jamais. Remplacer par `results.every(r => r.isSuccess || r.isError)`. [`apps/mobile/src/hooks/use-weather.ts`]
- [x] [Review][Patch] Test AC3 manquant — T8 n'a pas de cas « ni `departureTime` ni `speedKmh` → API appelée sans ces params (fallback serveur heure actuelle) ». [`apps/mobile/src/hooks/use-weather.test.tsx`]
- [x] [Review][Patch] `JSON.parse` dans `getStoredWeatherPace` peut retourner un JSON valide non-objet (ex. `"foo"`, `42`) casté silencieusement en `StoredWeatherPace` — ajouter un guard `typeof parsed === 'object' && parsed !== null`. [`apps/mobile/src/lib/weather-pace.ts`]
- [x] [Review][Defer] `cached` stale pendant la transition `adventureId` — si le composant restait monté (non-applicable avec le routing expo-router actuel), les forecasts du précédent adventureId seraient utilisés avec les segments du nouveau. [`apps/mobile/src/hooks/use-weather.ts`] — deferred, pré-existant/non-triggerable avec le routing actuel
- [x] [Review][Defer] `setCachedWeather` sans try/catch — une erreur disque (full/permissions) génère une rejection non rattrapée. Issue pré-existante dans le squelette weather-cache. [`apps/mobile/src/lib/cache/weather-cache.ts`] — deferred, pré-existant
- [x] [Review][Defer] `weatherPoints` offset=0 pour `segmentId` inconnu — si le serveur renvoie une prévision pour un segment absent de la liste locale, les km sont affichés en relatif au lieu de cumulé. [`apps/mobile/src/hooks/use-weather.ts`] — deferred, cas défensif backend-inconsistency

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

### Open Questions — RÉSOLUES

1. **WeatherAPI.com (AC epic) vs Open-Meteo (réel)** : ✅ Le mobile n'affiche **rien** du fournisseur (backend transparent) → aucune mention « WeatherAPI.com » dans l'UI mobile. Divergence sans impact côté mobile.
2. **Sélecteur date/heure** : ✅ **Saisie texte** « AAAA-MM-JJ HH:MM » (`parseDeparture` → ISO) retenue — **zéro nouvelle dépendance** (pas de `@react-native-community/datetimepicker`). Évolution possible plus tard.
3. **Flèches vent / affichage** : ✅ **Couche carte** (`weather-layer`) retenue (parité visuelle web : ligne colorée + flèches sur la trace) plutôt que `weather-strip`. Le `weather-strip` (+ Storybook) reste un ajout possible ultérieur ; les `iconEmoji` WMO sont déjà portés dans les features pour le réutiliser.

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

claude-opus-4-8 (dev-story, 2026-06-27)

### Debug Log References

- `npx tsc --noEmit` → 0 erreur
- `eslint src` → 0 (les fichiers touchés passent ; faux « 2 errors » du proxy RTK invalidé par `eslint` direct, exit 0)
- `npx jest` → **428/428** suites/tests verts
- `expo export --platform ios` → OK (bundle hbc 8.3 MB)

### Completion Notes List

**Contexte** : la feature météo MOB-4.8 était **déjà livrée** dans le commit `ea14bda`
(« carte Météo + overlay », présent dans l'historique de HEAD), mais avec une approche
**couche carte** (vs `weather-strip`) et **saisie texte** (vs datetimepicker) — les options
recommandées par les Open Questions — et la story était restée `ready-for-dev`. Sur décision
de Guillaume (Option A), ce passage **comble les vrais trous d'AC restants** et **resynchronise
la doc** sur l'implémentation réelle (Doc Sync Rule), sans réécrire l'approche déjà validée.

**Déjà présent (commit `ea14bda`, inchangé)** : façade `lib/api/weather.ts` (T1),
`use-weather` (`useQueries`, query key, `staleTime` 1 h, sans `refetchInterval`, T3 partiel),
`weather-geojson` + conversion vent (T4), `weather-layer` couche carte (T5), `sidebar-weather-section`
(T6), intégration `map/[id].tsx` + i18n `map.weather.*` (T7).

**Comblé ce passage (gap-fill)** :
- ✅ **AC6 — cache offline** : `weather-cache.ts` retypé `CachedWeather = WeatherForecast[]`
  (TODO MOB-3.5 levé) ; `use-weather` ajoute le **write-through** au succès complet et le
  **fallback** `getCachedWeather` hors-ligne (réalignement km cumulés par `segmentId`).
  `adventureId` ajouté aux params du hook (clé du cache).
- ✅ **T2 — pace store** : `lib/weather-pace.ts` (AsyncStorage, clé `ridenrest:weather-pace`,
  parité web) ; `map/[id].tsx` hydrate la saisie au montage et la persiste à chaque changement.
- ✅ **AC5 — opacité vent** : `text-opacity` (stops `0→0.4, 5→1.0`) ajouté à la couche flèches
  → vent quasi-nul atténué (parité web).
- ✅ **T8 — tests** : `use-weather.test.tsx` (query key / `staleTime` 3,6 M / pas de
  `refetchInterval` / write-through / fallback offline / stageDepartures prioritaire / gate
  weatherActive), `weather-pace.test.ts`, `weather-cache.test.ts` mis à jour pour le type
  `WeatherForecast[]`. (`weather-geojson.test.ts` déjà présent.)

**Frontière respectée** : pas de CRUD étapes / saisie départ par étape (epic ultérieur),
pas de météo Live (MOB-5), aucun calcul d'ETA client (serveur), aucune modif serveur/DB.

**Validation device (T9)** : effectuée en automatisé sur **simulateur iOS** (Maestro + screenshots
+ inspection FS du device). AC1/AC4/AC5/AC6/T2 ✅ (AC4 validé via étape datée temporaire insérée
puis supprimée). AC2 (refresh horaire) couvert par tests unitaires. Visuel **web** non fait :
login Google OAuth bloqué dans un navigateur piloté → fix web couvert par tests unitaires + parité
stricte avec le fix mobile validé.

**Fix flèches AC5 (cross-platform)** : le `text-field: '→'` ne rend rien sur MapLibre **Native**
(glyphe U+2192 absent de la fontstack OpenFreeMap) → bascule sur `icon-image` **mobile ET web**
(parité ; le web a le même bug latent). Asset `wind-arrow.png` ajouté aux deux plateformes.

### File List

**Ajoutés (ce passage)**
- `apps/mobile/src/lib/weather-pace.ts`
- `apps/mobile/src/lib/weather-pace.test.ts`
- `apps/mobile/src/hooks/use-weather.test.tsx`
- `apps/mobile/assets/wind-arrow.png` (asset flèche vent, fix AC5)
- `apps/web/public/images/wind-arrow.png` (asset flèche vent, fix AC5 web)

**Modifiés (ce passage)**
- `apps/mobile/src/lib/cache/weather-cache.ts` (retype `CachedWeather = WeatherForecast[]`)
- `apps/mobile/src/lib/cache/weather-cache.test.ts` (fixture typée `WeatherForecast[]`)
- `apps/mobile/src/hooks/use-weather.ts` (param `adventureId` + write-through/fallback offline)
- `apps/mobile/src/components/map/weather-layer.tsx` (flèches `icon-image` + opacité vent, AC5)
- `apps/mobile/src/app/(app)/map/[id].tsx` (pace store hydrate/persiste + `adventureId` → `useWeather`)
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.tsx` (flèches `text-field`→`icon-image`, parité AC5)
- `apps/web/src/app/(app)/map/[id]/_components/weather-layer.test.tsx` (assertions `icon-*` + mock `loadImage`/`hasImage`)
- `_bmad-output/implementation-artifacts/MOB-4-8-planning-weather-pace-adjusted.md` (resync doc)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut)

**Déjà livrés en `ea14bda` (référence, non modifiés ce passage)**
- `apps/mobile/src/lib/api/weather.ts`
- `apps/mobile/src/lib/map/weather-geojson.ts` (+ `.test.ts`)
- `apps/mobile/src/components/map/weather-layer.tsx` (base)
- `apps/mobile/src/components/map/sidebar-weather-section.tsx`

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.8 (ready-for-dev) — météo pace-adjusted via `GET /weather` (ETA calculé serveur), `use-weather` (`staleTime` 1 h = refresh horaire, query key {segmentId,departureTime,speedKmh,stageDepartures}, offline cache typé `WeatherForecast`), pace store global (AsyncStorage), `weather-strip` (icônes WMO, points null grisés), flèches vent proportionnelles + conversion `(deg-90+360)%360`, fallback heure actuelle, précédence stage-departures. **DIVERGENCE documentée : provider réel = Open-Meteo (pas WeatherAPI.com), transparent côté mobile.** i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
| 2026-06-27 | 1.0 | **dev-story → review.** Feature déjà livrée en `ea14bda` (couche carte + saisie texte, Open Questions 2&3) ; ce passage comble les trous d'AC et resynchronise la doc (Option A, validée Guillaume) : **AC6** cache offline (`weather-cache` retypé `WeatherForecast[]` + write-through/fallback `use-weather`, param `adventureId`), **T2** pace store `lib/weather-pace.ts` (AsyncStorage, hydrate/persiste écran), **AC5** opacité `text-opacity` vent quasi-nul, **T8** tests (`use-weather`, `weather-pace`, `weather-cache` retypé). Tasks resynchronisées sur l'approche réelle (weather-layer/sidebar-weather-section, pas strip/controls). Gate : 428/428 tests · tsc 0 · lint 0 · expo export iOS OK. ⏳ T9 Dev Client (Guillaume). | bmad-dev-story (Amelia) |
| 2026-06-27 | 1.1 | **Validation device (simulateur iOS, Maestro) + fix AC5 flèches.** Tests pilotés sur device : AC1 (ligne colorée), AC6 write-through (fichier cache écrit) + fallback offline (API suspendue → météo du cache), T2 (persistance départ au redémarrage) — tous ✅, aucun crash MapLibre natif. **Bug trouvé & corrigé** : les flèches de vent (`text-field: '→'`) ne rendaient RIEN sur MapLibre Native (glyphe U+2192 absent de la fontstack OpenFreeMap) → bascule sur `icon-image` (asset `wind-arrow.png`) **mobile + web** (parité, même bug latent web). Flèches confirmées orientées + proportionnelles sur device. Mobile 429 tests · web weather-layer 13 tests · tsc/lint OK. **Reste manuel : AC4** (étapes avec départs). | dev-story validation device (Amelia) |
