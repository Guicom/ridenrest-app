# Story MOB-5.6 : Météo en mode Live

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cycliste en mouvement**,
I want **voir la météo à venir selon ma position GPS et mon allure**,
So that **j'anticipe les conditions sur les prochains kilomètres**.

> **Dépend de MOB-5.1** (`currentKmOnRoute`, `speedKmh`, `weatherDepartureTime`) **et MOB-5.2** (position temps réel). Dernière story de l'epic Live. Ajoute : le **hook météo Live** (`use-live-weather`, calé sur `currentKmOnRoute` + allure), le **seuil de 5 km** (anti-saturation Open-Meteo), le **départ pace-adjusted**, le **fallback heure actuelle**, et l'**affichage** (réutilise l'overlay/strip météo du planning).
>
> **Backend météo livré (web `done`) — rien à recréer.** La façade mobile `lib/api/weather.ts` **`getWeatherForecast` accepte DÉJÀ `fromKm`** (vérifié). **RGPD : le client n'envoie QUE `fromKm` (km relatif cumulé) + `speedKmh` + `departureTime` — jamais de lat/lng** (NFR-012, FR-052 client-side). Provider réel = **Open-Meteo** (transparent côté mobile).
>
> ⚠️ **Aucun module natif neuf — pas de prebuild.** Tout JS (réutilise `weather-geojson.ts`/`weather-layer.tsx` du planning).

## Acceptance Criteria

1. **Given** le mode Live actif avec une **allure** saisie
   **When** la météo est demandée
   **Then** elle est calculée selon ma **position GPS (projetée `currentKmOnRoute`) et mon allure** : `fromKm = currentKmOnRoute`, `departureTime` **pace-adjusted** = `now − (fromKm / speedKmh) × 3 600 000 ms` (sauf override utilisateur) (FR-052)
   **And** le calcul est **client-side** : la requête `GET /weather?segmentId&fromKm&speedKmh&departureTime` ne contient **aucune coordonnée GPS** (NFR-012)

2. **Given** **aucune allure** saisie en Live
   **When** la météo est affichée
   **Then** elle correspond à l'**heure actuelle** au point (fallback serveur quand `departureTime`/`speedKmh` absents) (FR-055)

3. **Given** ma position évolue de **moins de 5 km**
   **When** j'avance
   **Then** la météo **ne re-fetch pas** (seuil 5 km, parité serveur `SAMPLE_KM=5`) ; au-delà de 5 km depuis le dernier fetch, elle se rafraîchit
   **And** la queryKey arrondit `fromKm` au multiple de 5 le plus proche (cache-hits) ; les données précédentes **ne sont pas effacées** pendant le refetch (`placeholderData: (prev) => prev`)

4. **Given** la météo affichée
   **When** je consulte le vent / les conditions
   **Then** l'affichage réutilise le rendu planning (strip/overlay + flèches de vent proportionnelles, icônes WMO) ; les points `null` (au-delà de l'horizon Open-Meteo) sont « indisponibles » (grisés), sans erreur

5. **Given** une erreur météo ou un GPS perdu
   **When** l'affichage se met à jour
   **Then** l'erreur est gérée **inline** dans le panneau météo (« Météo non disponible »), **pas** dans la bannière de statut globale (réservée aux POI) ; la dernière météo en cache reste consultable hors-ligne (NFR-032)

## Tasks / Subtasks

- [ ] **T1 — Façade météo : confirmer/étendre `fromKm`** (AC: 1)
  - [ ] `lib/api/weather.ts` `getWeatherForecast` accepte **déjà** `fromKm` (vérifié l.13,23) + `segmentId`/`departureTime`/`speedKmh`. **Réutiliser tel quel.** Vérifier que `speedKmh`/`departureTime` sont bien transmis (sinon compléter). **RGPD : pas de lat/lng.**

- [ ] **T2 — Hook `hooks/use-live-weather.ts`** (AC: 1, 2, 3, 5)
  - [ ] **Porter** `apps/web/src/hooks/use-live-weather.ts` (64 l, pur TanStack + store, zéro DOM). Query key `['weather', 'live', { segmentId, fromKm: fromKmRounded, departureTime: userDepartureTime }]` — **distinct** de la clé planning `['weather', {…}]` (ne PAS fusionner).
  - [ ] **Seuil 5 km** : `lastFetchKmRef` + `activeFetchKm` ; refetch quand `|currentKmOnRoute − lastFetchKm| >= 5` (`TRIGGER_THRESHOLD_KM=5`). `fromKmRounded = round(activeFetchKm / 5) * 5`.
  - [ ] **Départ pace-adjusted** (sans override + speed>0) : `adjustedDepartureTime = new Date(Date.now() − (activeFetchKm / speedKmh) × 3_600_000).toISOString()`. `weatherDepartureTime` (store) override si présent. Sans allure → ne rien envoyer → fallback serveur (AC2, FR-055).
  - [ ] `enabled: isLiveModeActive && activeFetchKm !== null && !!segmentId` ; `staleTime: 5min` ; **`placeholderData: (prev) => prev`** (ne pas effacer au refetch, AC3). `isGpsLost = isLiveModeActive && currentPosition === null && currentKmOnRoute !== null`.
  - [ ] **Offline (AC5)** : write-through `setCachedWeather(adventureId, forecast)` + fallback `getCachedWeather` hors-ligne. **Typer `weather-cache.ts`** : remplacer `unknown` → `WeatherForecast` (`@ridenrest/shared`) — le TODO « MOB-5/6 » du fichier, c'est maintenant.

- [ ] **T3 — Affichage météo Live (réutilise le rendu planning)** (AC: 4)
  - [ ] Réutiliser `weather-geojson.ts` (`buildWeatherLineSegments`/`buildWindArrowPoints` + conversion `windDirectionMaplibre = (windDirection − 90 + 360) % 360`) et `weather-layer.tsx` (overlay carte ligne + flèches proportionnelles) déjà construits (MOB-4.3 pivot). Source `id` distinct `'live'` pour ne pas entrer en conflit avec le planning.
  - [ ] Strip/résumé météo dans le panneau Live (icône `WMO_ICON`/`iconEmoji`, température, précip %, vent). Points `null` → « indisponible » grisé. `formatRelativeEta(forecastAt)` → « maintenant » / « dans ~Xh MM » / « dans ~Mmin ».
  - [ ] Toggle météo Live (réutiliser `useMapStore.weatherActive`/`weatherDimension` ou un toggle Live dédié — **décider** : parité web a `mapWeatherActive` + overlay toggle).

- [ ] **T4 — Branchement écran Live + champ départ** (AC: 1, 2, 5)
  - [ ] `(app)/live/[id].tsx` : monter le hook + l'overlay/strip. Champ « heure de départ » (override `weatherDepartureTime`) dans le tiroir filtres Live (slot prévu MOB-5.3) — sinon pace-adjusted/fallback automatique.
  - [ ] Overlay de chargement météo gardé `weatherActive && weatherPending && isLiveModeActive` **et** `fetchStatus !== 'paused'` (anti skeleton infini offline). Erreur **inline** (pas la bannière globale).

- [ ] **T5 — i18n + a11y** (AC: 2, 4, 5)
  - [ ] `live.weather.title`, `live.weather.unavailable` (point null), `live.weather.error` (« Météo non disponible »), `live.weather.now`/`live.weather.inHours`/`live.weather.inMinutes` (ETA relative), labels a11y vent. FR/EN parité, zéro chaîne en dur.

- [ ] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 5)
  - [ ] `use-live-weather` : query key `['weather','live',{segmentId,fromKm,departureTime}]` ; seuil 5 km (pas de refetch < 5 km, refetch ≥ 5 km) ; `fromKm` arrondi /5 ; pace-adjusted (`now − fromKm/speedKmh×3.6e6`), override `weatherDepartureTime`, sans allure → pas de departureTime (fallback) ; `placeholderData` ne vide pas ; `isGpsLost` ; write-through/fallback cache.
  - [ ] `weather-cache` typé `WeatherForecast` (plus `unknown`).
  - [ ] strip : icône WMO, point `null` → indisponible, flèche vent ∝ vitesse (réutilise tests `weather-geojson`).
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` iOS OK.

- [ ] **T7 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 4, 5) — ⏳ build Dev Client
  - [ ] Saisir allure → météo calée sur l'ETA à ma position ; sans allure → heure actuelle. Avancer < 5 km → pas de re-fetch ; > 5 km → rafraîchit.
  - [ ] Flèches vent orientées/proportionnelles ; points au-delà de l'horizon grisés. Couper réseau → dernière météo en cache. Erreur → message inline (pas la bannière globale).

## Dev Notes

### Endpoint météo Live (backend livré — RGPD-safe)

- `GET /api/weather?segmentId={uuid}&fromKm={km}&departureTime={iso}&speedKmh={n}` (`get-weather.dto.ts` : `fromKm @Min(0)`, `speedKmh @Min(1)@Max(100)`, `departureTime @IsISO8601`). `fromKm` = **km cumulé aventure** (= `currentKmOnRoute`), serveur filtre `cumulativeStartKm + wp.dist_km >= fromKm`. **Aucune GPS** — km relatif + timestamp seuls. [Source: apps/api/src/weather/dto/get-weather.dto.ts ; weather.service.ts]
- Provider réel **Open-Meteo** (codes WMO, Redis 1 h), transparent côté mobile. `WeatherPoint.km` = cumulé aventure ; `null` = au-delà de l'horizon. [Source: packages/shared/src/types/weather.types.ts:10-26 ; MOB-4-8-…md]

### Hook Live (référence web → port quasi-verbatim)

- `apps/web/src/hooks/use-live-weather.ts` (64 l) : seuil 5 km (`TRIGGER_THRESHOLD_KM=5`, `lastFetchKmRef`/`activeFetchKm`, `:19-34`) ; pace-adjusted (`:36-42`) ; key `['weather','live',{segmentId,fromKm:fromKmRounded,departureTime}]` (`:47`), `fromKmRounded = round(activeFetchKm/5)*5` ; `enabled`+`staleTime:5min`+`placeholderData:(prev)=>prev` (`:54-57`) ; `isGpsLost` (`:59`). [Source: apps/web/src/hooks/use-live-weather.ts]
- **Ne PAS fusionner** avec la clé planning. `fromKm` = cumulé (off-by-`cumulativeStartKm` si confondu avec km intra-segment).

### Affichage (réutilise le planning mobile — MOB-4.3)

- `lib/map/weather-geojson.ts` (existe) : `buildWeatherLineSegments`, `buildWindArrowPoints`, conversion `(deg−90+360)%360` (**constante load-bearing**). `components/map/weather-layer.tsx` (existe) : overlay ligne + flèches proportionnelles (stops vitesse, opacité vent nul). `WMO_ICON`/`WMO_ICON_FALLBACK` (`@ridenrest/shared`). [Source: apps/mobile/src/lib/map/weather-geojson.ts ; components/map/weather-layer.tsx]
- Erreur météo **inline** (pas StatusBanner global — réservé POI). Overlay chargement gardé `fetchStatus !== 'paused'`. [Source: story 7-3 AC#6 ; project-context §Data mobile]

### Réutilisation du code mobile existant

- **MOB-5.1/5.2** : `useLiveStore.currentKmOnRoute`/`speedKmh`/`weatherDepartureTime`/`currentPosition`.
- **MOB-4.3 (pivot)** : `weather.ts` façade (`fromKm` déjà supporté ✓), `use-weather.ts` (planning, modèle), `weather-geojson.ts`, `weather-layer.tsx`, `useMapStore.weatherActive`/`weatherDimension`.
- `lib/cache/weather-cache.ts` (**à typer `WeatherForecast`**), `@ridenrest/shared` (`WeatherForecast`/`WeatherPoint`/`WMO_ICON`/`WEATHER_CACHE_TTL`), `use-network-status`.
- **MOB-5.3** : tiroir filtres Live (slot départ météo).

### Conventions & contraintes

- **RGPD** : `fromKm`/`speedKmh`/`departureTime` seuls, jamais de lat/lng (NFR-012). Refresh par seuil 5 km + `staleTime`, pas de `refetchInterval`. `placeholderData:(prev)` (ne pas vider). Erreur inline. `fetchStatus !== 'paused'` pour l'overlay. Conversion vent exacte. i18n FR/EN. Tests hors `src/app/`. Tout JS → pas de prebuild.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/hooks/use-live-weather.ts
apps/mobile/src/components/live/live-weather-strip.tsx  (résumé météo panneau Live)
+ tests co-localisés
```
**Modifs** :
```
apps/mobile/src/lib/cache/weather-cache.ts        (unknown → WeatherForecast)
apps/mobile/src/lib/api/weather.ts                (confirmer speedKmh/departureTime si absents)
apps/mobile/src/components/map/weather-layer.tsx  (source id 'live' distincte si overlay réutilisé)
apps/mobile/src/app/(app)/live/[id].tsx           (hook + overlay/strip + champ départ)
apps/mobile/src/lib/i18n/locales/fr.json + en.json (live.weather.*)
```
**Aucune** migration DB / modif serveur. **Aucun** module natif neuf → pas de prebuild.

### Frontière de story

- **Inclus** : `use-live-weather` (seuil 5 km, pace-adjusted, fallback heure actuelle, key live, placeholderData, offline cache typé), réutilisation overlay/strip + flèches vent + WMO, erreur inline, GPS perdu. i18n, tests.
- **Exclu** : météo **planning** (MOB-4.8) ; GPS/projection (5.1/5.2) ; panneau/profil (5.4/5.5). Calcul ETA serveur (rien à recalculer côté client au-delà du départ pace-adjusted).

### Open Questions

1. **Overlay carte vs strip seul** : le web a un overlay carte météo Live (`id="live"`, toggle) **et** un strip. Sur mobile, réutiliser `weather-layer.tsx` (overlay) **et/ou** un strip dans le panneau ? _(Recommandation : strip dans le panneau Live au MVP + réutiliser l'overlay si déjà câblé planning ; décider avec Guillaume.)_
2. **Champ heure de départ** : saisie ISO simple vs `@react-native-community/datetimepicker` (module natif → prebuild). _(Recommandation : pace-adjusted automatique au MVP ; saisie minimale si nécessaire, éviter la dép native.)_

### References

- [Source: epics-mobile.md#Story MOB-5.6 (l.1027-1043)] — AC d'origine (FR-052, FR-055)
- [Source: apps/web/src/hooks/use-live-weather.ts ; lib/api-client.ts:371-388] — hook live + façade (fromKm/speedKmh/departureTime)
- [Source: apps/api/src/weather/dto/get-weather.dto.ts ; weather.service.ts] — endpoint (fromKm filter, RGPD)
- [Source: packages/shared/src/types/weather.types.ts:10-26 ; constants/weather.constants.ts] — `WeatherPoint`, `WMO_ICON`
- [Source: apps/mobile/src/lib/api/weather.ts:13,23] — `fromKm` déjà supporté côté mobile
- [Source: apps/mobile/src/lib/map/weather-geojson.ts ; components/map/weather-layer.tsx] — rendu réutilisable (MOB-4.3)
- [Source: apps/mobile/src/lib/cache/weather-cache.ts] — squelette à typer `WeatherForecast`
- [Source: story 7-3-live-mode-weather-gps-based.md] — comportement web (seuil 5km, pace-adjusted, erreur inline)
- [Source: MOB-5-1-…md ; MOB-5-2-…md] — store/GPS (dépendances)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.6 (ready-for-dev) — météo Live : `use-live-weather` (fromKm=`currentKmOnRoute`, seuil 5 km anti-saturation, départ pace-adjusted `now−fromKm/speed`, fallback heure actuelle FR-055, key `['weather','live',…]`, `placeholderData:(prev)`, offline cache typé `WeatherForecast`), réutilise `weather-geojson`/`weather-layer` (flèches vent proportionnelles, WMO, points null grisés), erreur inline (pas bannière globale), GPS perdu. Façade `fromKm` déjà OK. Backend Open-Meteo transparent, RGPD sans GPS. Tout JS → pas de prebuild. i18n FR/EN, tests. Clôt l'epic MOB-5. | bmad-create-story (Story Context Engineer) |
