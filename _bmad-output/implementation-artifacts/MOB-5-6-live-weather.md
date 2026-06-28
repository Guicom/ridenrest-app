---
baseline_commit: 065f82865e494d552df49ef99b1bf9b3781abc88
---

# Story MOB-5.6 : Météo en mode Live

Status: done

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

- [x] **T1 — Façade météo : confirmer/étendre `fromKm`** (AC: 1)
  - [x] `lib/api/weather.ts` `getWeatherForecast` accepte **déjà** `fromKm` + `segmentId`/`departureTime`/`speedKmh` (vérifié l.9-27). **Réutilisé tel quel** — `speedKmh`/`departureTime` bien transmis. **RGPD : pas de lat/lng.** Aucune modif nécessaire.

- [x] **T2 — Hook `hooks/use-live-weather.ts`** (AC: 1, 2, 3, 5)
  - [x] **Porté** depuis `apps/web/src/hooks/use-live-weather.ts`. Query key `['weather', 'live', { segmentId, fromKm: fromKmRounded, departureTime: userDepartureTime }]` — distincte de la clé planning.
  - [x] **Seuil 5 km** : `lastFetchKmRef` + `activeFetchKm` ; refetch quand `|currentKmOnRoute − lastFetchKm| >= 5` (`TRIGGER_THRESHOLD_KM=5`). `fromKmRounded = round(activeFetchKm / 5) * 5`.
  - [x] **Départ pace-adjusted** calculé **dans le `queryFn`** (pas au rendu → règle `react-hooks/purity` : `Date.now()` interdit en rendu) : `new Date(Date.now() − (activeFetchKm / speedKmh) × 3_600_000).toISOString()`. Override `userDepartureTime` (depuis `weatherDepartureTime`) prioritaire. Sans allure → ni `departureTime` ni `speedKmh` → fallback serveur (AC2, FR-055).
  - [x] `enabled: isLiveModeActive && weatherActive && activeFetchKm !== null && !!segmentId` (garde `weatherActive` ajoutée — anti-saturation Open-Meteo) ; `staleTime: 5min` ; **`placeholderData: (prev) => prev`** ; `isGpsLost`. **Pas de garde `isOnline`** dans `enabled` : `onlineManager` (NetInfo) met la query en `paused` hors-ligne — gater `isOnline` la passerait `disabled` → skeleton infini (interdit project-context).
  - [x] **Offline (AC5)** : write-through `setCachedWeather('${adventureId}:live', [forecast])` + fallback `getCachedWeather('${adventureId}:live')`. **Clé de cache distincte** (`:live`) — déviation justifiée : éviter d'écraser le cache planning multi-segment de la même aventure (qui stocke le `WeatherForecast[]` complet). **`weather-cache.ts` était DÉJÀ typé `WeatherForecast[]`** (fait en MOB-4.8 — le TODO « MOB-5/6 » était déjà résolu, aucune modif).

- [x] **T3 — Affichage météo Live (réutilise le rendu planning)** (AC: 4)
  - [x] Réutilisé `weather-geojson.ts` + `weather-layer.tsx` (overlay ligne colorée + flèches vent proportionnelles, conversion `(deg−90+360)%360`). Source `id` distincte via nouvelle prop `sourceIdPrefix="weather-live"` (défaut `'weather'` = planning inchangé).
  - [x] `live-weather-strip.tsx` : cartes scrollables (icône WMO/`iconEmoji`, ETA relative, température, vent, précip %, km). Points `null` → « indisponible » grisé. `formatRelativeEta` → « maintenant » / « dans ~Xh MM » / « dans ~Mmin » (i18n). Erreur **inline** (`live.weather.error`), jamais la bannière globale.
  - [x] **Décision (Open Q1, validée Guillaume)** : parité web/planning → **strip (panneau) + overlay carte**. Toggle météo = `useMapStore.weatherActive`/`weatherDimension` (réutilisés du planning), via la section météo du tiroir filtres Live.

- [x] **T4 — Branchement écran Live + champ départ** (AC: 1, 2, 5)
  - [x] `(app)/live/[id].tsx` : hook monté + overlay `<WeatherLayer>` (avant les pins) + `<LiveWeatherStrip>` via le slot `weatherContent` de `LiveControls` (visible quand `weatherActive`). **Champ « heure de départ »** (texte « AAAA-MM-JJ HH:MM », parité planning `SidebarWeatherSection` — **pas de picker natif**, donc pas de prebuild ; Open Q2 validée Guillaume « même fonctionnel que web ») dans la **section météo du tiroir filtres Live**, persisté à la fermeture. Conversion texte→ISO via `parseDeparture` (extrait dans `weather-pace.ts`).
  - [x] Chargement météo = **skeleton paused-safe du strip** (`isPending && fetchStatus !== 'paused'`, calculé dans le hook) — pas d'overlay carte séparé (évite le doublon avec l'overlay POI). Erreur **inline** dans le strip (pas la bannière globale).

- [x] **T5 — i18n + a11y** (AC: 2, 4, 5)
  - [x] `live.weather.{title,error,unavailable,gpsLost,now,inHours,inMinutes,showOnMap,departureLabel,cardA11y}` FR/EN. Dimensions réutilisent `map.weather.*` (déjà présents). a11y : `cardA11y` (résumé par carte), `gpsLost` (alert). Zéro chaîne en dur.

- [x] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 5)
  - [x] `use-live-weather.test.tsx` (10 tests) : query key `['weather','live',{…}]`, seuil 5 km (pas de refetch < 5, refetch ≥ 5), `fromKm` arrondi /5 + brut envoyé, pace-adjusted, override `weatherDepartureTime`, sans allure → fallback, `placeholderData` fn + `staleTime` 5 min, `weatherActive=false` → pas de fetch, write-through clé `:live`, `isGpsLost`, fallback offline (`onlineManager.setOnline(false)`).
  - [x] `weather-cache` déjà typé `WeatherForecast[]` (MOB-4.8) — couvert par `use-weather.test.tsx` existant.
  - [x] `live-weather-strip.test.tsx` (7 tests) : icône WMO, ETA relative i18n, point `null` → indisponible, skeleton (pending sans data), erreur inline, erreur masquée si data en cache, bandeau GPS perdu. Flèche vent ∝ vitesse couverte par les tests `weather-geojson` existants.
  - [x] Gate : `jest` 593 ✓ · `tsc` 0 · `lint` 0 · `check:native-config` OK · `expo export` iOS OK.

- [x] **T7 — Validation device (Maestro, runner fail-closed)** (AC: 1, 2, 3, 4, 5)
  - [x] Flows créés : `.maestro/live-weather.yaml` (iOS) + `.maestro/android/live-weather.yaml` — Live → tiroir filtres → activer météo + dimension « Vent » → fermer → strip `live-weather-strip` monté + screenshot (overlay flèches vent + strip). Voir Completion Notes pour l'état réel par plateforme.

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

claude-opus-4-8 (Claude Opus 4.8) — bmad-dev-story.

### Debug Log References

- Lint `react-hooks/purity` : `Date.now()` ne doit pas être lu pendant le rendu → calcul pace-adjusted déplacé dans le `queryFn` (appelé au fetch). Résolu.
- Garde `isOnline` retirée du `enabled` : hors-ligne, `onlineManager` (NetInfo) met la query en `fetchStatus: 'paused'`. La gater sur `isOnline` la passait `disabled` (status `pending`, fetchStatus `idle`) → le strip aurait affiché un skeleton infini hors-ligne (interdit, cf. project-context « fetchStatus paused »). Test offline pilote `onlineManager.setOnline(false)`.
- Sémantique km vérifiée serveur (`weather.service.ts:122` `km = cumulativeStartKm + wp.dist_km`) → cumulé aventure pour planning ET live ; le hook Live retourne `data.waypoints` **sans ré-offset** (≠ planning multi-segment) pour aligner l'overlay sur les `waypoints.distKm` cumulés.

### Completion Notes List

- **Décisions de design (Open Questions, validées par Guillaume)** : Q1 affichage = parité web/planning → **strip dans le panneau Live + overlay carte** (`WeatherLayer` réutilisé). Q2 heure de départ = **même fonctionnel que web** → champ texte « heure de départ » dans le tiroir filtres Live (parité `SidebarWeatherSection` planning, pas de `@react-native-community/datetimepicker` → **aucun module natif, pas de prebuild**).
- `weather-cache.ts` était **déjà typé `WeatherForecast[]`** (résolu en MOB-4.8) — le TODO « MOB-5/6 » du squelette n'existait plus. Aucune modif du fichier.
- **Déviation cache offline** (Doc Sync) : write-through/fallback sous une **clé dédiée `${adventureId}:live`** au lieu de `adventureId` brut (comme suggéré par T2). Raison : le cache planning de la même aventure stocke le `WeatherForecast[]` multi-segment complet ; écrire la prévision Live (1 segment, sparse) sous la même clé l'écraserait → régression offline du planning. Clé séparée = isolation propre.
- **Déviation `WeatherLayer`** : ajout d'une prop optionnelle `sourceIdPrefix` (défaut `'weather'`) — le Live passe `'weather-live'` (T3 demandait une source `id` distincte). Planning inchangé.
- **Refactor DRY** : `parseDeparture` (texte « AAAA-MM-JJ HH:MM » → ISO) extrait de `map/[id].tsx` vers `lib/weather-pace.ts`, réutilisé par le planning et le Live.
- **Garde `weatherActive` ajoutée** au `enabled` du hook (anti-saturation Open-Meteo : pas de fetch quand la météo n'est pas affichée). Le web ne la met pas mais l'overlay/strip ne sont visibles que si `weatherActive` → fetch utile uniquement.
- **Hors scope, à vérifier** : le hook **planning** `use-weather.ts` ré-offsette les `WeatherPoint.km` par `cumulativeStartKm`, alors que le serveur renvoie déjà du km cumulé → **double offset potentiel pour les aventures multi-segments** (invisible en mono-segment où `cumulativeStartKm=0`). Non corrigé ici (MOB-4.8 `done`, hors scope) — à investiguer séparément.
- **Validation device (Maestro, runner fail-closed, BUILD=1 rebuild iOS+Android)** :
  - **iOS ✓** (iPhone 17 Pro, iOS 26.1) : `smoke` + `live-weather` verts. Tous les asserts COMPLETED (Live → tiroir filtres → scroll → `weather-toggle` → `weather-dim-wind` → `filters-close-btn` → **`live-weather-strip` visible**). Screenshot `live-weather-wind.png` : strip rendu — 4 cartes WMO (⛅) avec ETA relative pace-adjusted (« dans ~19min/~39min/~59min/~1h19 »), température, vent km/h, précip %, km. Panneau intact, **0 crash**.
  - **Android ✓** (émulateur `ridenrest_pixel`) : `smoke` + `live-weather` verts. Asserts par libellé (testID non surfacé sur Fabric). Screenshot `android-live-weather-wind.png` : section météo du tiroir confirmée — toggle « Afficher la météo sur la carte » (ON), sélecteur Temp/Pluie/**Vent** (Vent sélectionné), champ « Heure de départ ». **0 crash**.
  - Runner : « Plateformes testées : iOS Android — Validation device OK (0 crash) ».
  - **Réserve honnête** : les **flèches de vent de l'overlay carte** ne sont pas mises en évidence dans ces 2 captures (focus strip iOS / tiroir Android). L'overlay réutilise le `WeatherLayer` **identique** déjà validé visuellement en planning (MOB-4.8, `weather.yaml`) — seul `sourceIdPrefix` a été ajouté (défaut planning inchangé). Une revue visuelle ciblée de l'overlay Live peut être faite en code-review.

### File List

**Nouveaux fichiers :**
- `apps/mobile/src/hooks/use-live-weather.ts`
- `apps/mobile/src/hooks/use-live-weather.test.tsx`
- `apps/mobile/src/components/live/live-weather-strip.tsx`
- `apps/mobile/src/components/live/live-weather-strip.test.tsx`
- `apps/mobile/.maestro/live-weather.yaml`
- `apps/mobile/.maestro/android/live-weather.yaml`

**Fichiers modifiés :**
- `apps/mobile/src/components/live/live-filters-drawer.tsx` (section météo : toggle + dimension + champ heure de départ, persist à la fermeture)
- `apps/mobile/src/components/live/live-controls.tsx` (slot `weatherContent`)
- `apps/mobile/src/components/map/weather-layer.tsx` (prop `sourceIdPrefix`)
- `apps/mobile/src/app/(app)/live/[id].tsx` (hook + overlay `WeatherLayer` + strip)
- `apps/mobile/src/app/(app)/map/[id].tsx` (import `parseDeparture` partagé, suppression du doublon local)
- `apps/mobile/src/lib/weather-pace.ts` (export `parseDeparture`)
- `apps/mobile/src/lib/stores/live.store.ts` (commentaire `weatherDepartureTime` : texte brut)
- `apps/mobile/src/lib/i18n/locales/fr.json` (`live.weather.*`)
- `apps/mobile/src/lib/i18n/locales/en.json` (`live.weather.*`)
- `_bmad-output/implementation-artifacts/MOB-5-6-live-weather.md` (frontmatter `baseline_commit`, Tasks, Dev Agent Record, Status)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (statut MOB-5-6)

### Review Findings

- [x] [Review][Decision] `speedKmh` absent de la queryKey — décision Guillaume : **ajouter `speedKmh` à la queryKey** (refetch à chaque changement d'allure). Appliqué mobile + web. `apps/mobile/src/hooks/use-live-weather.ts` + `apps/web/src/hooks/use-live-weather.ts`
- [x] [Review][Decision] Query key TQ `['weather','live',{…}]` déviait de la convention stricte — décision Guillaume : **restructurer en `['weather', segmentId, 'live', {fromKm, departureTime, speedKmh}]`** (pattern sub-ressource conforme) + même fix web. Appliqué. `apps/mobile/src/hooks/use-live-weather.ts` + `apps/web/src/hooks/use-live-weather.ts`
- [x] [Review][Patch] **faux positif — guard déjà en place** : `isValidLngLat` filtré dans `buildWeatherLineSegments`/`buildWindArrowPoints` ; `WeatherPoint.km` est `number` (jamais null). Aucune modif requise. `apps/mobile/src/lib/map/weather-geojson.ts`
- [x] [Review][Patch] `lastFetchKmRef` non réinitialisé à la désactivation du mode Live — `useEffect` de reset ajouté (`isLiveModeActive → false` → `lastFetchKmRef.current = null` + `setActiveFetchKm(null)`). Appliqué mobile + web. `apps/mobile/src/hooks/use-live-weather.ts`
- [x] [Review][Patch] `useRelativeEta` retournait une nouvelle référence de fonction à chaque render — retour enveloppé dans `useCallback([t])`. `apps/mobile/src/components/live/live-weather-strip.tsx`
- [x] [Review][Patch] `key={i}` (index tableau) sur les cartes météo — remplacé par `key={wp.km}`. `apps/mobile/src/components/live/live-weather-strip.tsx`
- [x] [Review][Defer] `parseDeparture` interprète la saisie utilisateur en heure locale puis convertit en UTC via `toISOString()` — un utilisateur en UTC+2 saisissant « 07:30 » envoie « 05:30Z » au backend (décalage égal au fuseau). Comportement pré-existant identique dans `map/[id].tsx` avant extraction (planning mode déjà en prod). `apps/mobile/src/lib/weather-pace.ts:40` — deferred, pre-existing
- [x] [Review][Defer] `isGpsLost` vérifie `currentPosition === null`, mais après le premier fix GPS `currentPosition` ne repasse jamais à `null` pendant une session (le store ne l'annule qu'à `deactivateLiveMode`). Le bandeau GPS perdu ne s'affichera donc jamais en conditions réelles. Correction nécessite un mécanisme de timeout GPS dans le store (MOB-5.1/5.2, hors scope). `apps/mobile/src/hooks/use-live-weather.ts:153-154` — deferred, pre-existing

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-27 | 0.1 | Création story MOB-5.6 (ready-for-dev) — météo Live : `use-live-weather` (fromKm=`currentKmOnRoute`, seuil 5 km anti-saturation, départ pace-adjusted `now−fromKm/speed`, fallback heure actuelle FR-055, key `['weather','live',…]`, `placeholderData:(prev)`, offline cache typé `WeatherForecast`), réutilise `weather-geojson`/`weather-layer` (flèches vent proportionnelles, WMO, points null grisés), erreur inline (pas bannière globale), GPS perdu. Façade `fromKm` déjà OK. Backend Open-Meteo transparent, RGPD sans GPS. Tout JS → pas de prebuild. i18n FR/EN, tests. Clôt l'epic MOB-5. | bmad-create-story (Story Context Engineer) |
| 2026-06-28 | 1.0 | Implémentation MOB-5.6 (dev-story → review). `use-live-weather` (seuil 5 km, pace-adjusted dans `queryFn`, override départ, fallback serveur, `placeholderData`, offline cache clé `:live` dédiée, garde `weatherActive`, paused-safe). `live-weather-strip` (cartes WMO/ETA/temp/vent/précip, point null grisé, erreur inline, GPS perdu). Overlay carte via `WeatherLayer` (`sourceIdPrefix='weather-live'`). Section météo du tiroir filtres Live (toggle + dimension + heure de départ texte). `parseDeparture` extrait dans `weather-pace.ts`. i18n FR/EN `live.weather.*`. 17 tests neufs (jest 593 ✓ · tsc 0 · lint 0 · check:native-config OK · expo export iOS OK). Validation device Maestro `live-weather` (BUILD=1) — état par plateforme dans Completion Notes. Décisions Open Q1/Q2 validées par Guillaume (strip+overlay ; champ départ texte, pas de module natif). Aucune migration/serveur, pas de prebuild. | Amelia (bmad-dev-story) |
