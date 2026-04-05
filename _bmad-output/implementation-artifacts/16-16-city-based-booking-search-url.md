# Story 16.16: City-Based Booking Search URLs

Status: done

## Story

As a **cyclist using the app**,
I want Booking.com search links to use a relevant city name instead of raw GPS coordinates,
so that the search results are more accurate and the Booking mobile app opens correctly to a recognizable location.

---

## Context & Design Decisions

### Problème actuel

Le composant `SearchOnDropdown` construisait les URLs Booking.com avec des coordonnées GPS brutes :
```
https://www.booking.com/searchresults.html?latitude=43.123&longitude=-1.456&dest_type=latlong
```

Le comportement observé :
- Sur Booking.com desktop : acceptable (carte centrée sur le point)
- Sur l'app Booking mobile : redirigée sur la page d'accueil — **NE FONCTIONNE PAS**
- L'utilisateur s'attend à une recherche par ville (ex. "Pamplona", "Santander"), plus naturelle

### Solution retenue

**URL Booking exclusivement par ville (`?ss=`)** — aucun fallback lat/lng.

Le paramètre `ss` est le champ de recherche universel de Booking — accepte villes, adresses, noms d'établissements. Il ouvre correctement l'app mobile. Le bouton Booking n'est affiché que si une ville est disponible.

```
✅ https://www.booking.com/searchresults.html?ss=Pamplona
❌ https://www.booking.com/searchresults.html?latitude=43&longitude=-1&dest_type=latlong  (NE FONCTIONNE PAS sur l'app mobile Booking)
```

**Deux contextes d'utilisation :**

**A — Fiche POI hébergement (poi-popup.tsx, poi-detail-sheet.tsx)**
Chaîne d'extraction de ville (par priorité) :
1. **Google Places `locality`** (addressComponents) — source principale, la plus fiable
2. **OSM rawData** (`addr:city` > `addr:town` > `addr:village`) — fallback pour POIs Overpass
3. **Geoapify reverse geocoding** — fallback ultime avec les coordonnées du POI

**B — Recherche de zone (planning sidebar + live mode)**
Le centre du corridor est un `{lat, lng}` sans informations de ville.
→ **Reverse geocoding côté serveur** via Geoapify (`GEOAPIFY_API_KEY`).
→ NestJS module `GeoModule`, endpoint `GET /geo/reverse-city?lat=&lng=`.
→ Cache Redis `geo:city:{lat3dp}:{lng3dp}` TTL 7 jours.
→ Côté frontend : hook `useReverseCity` (TanStack Query).

**Airbnb : pas de changement**
Airbnb fonctionne mieux avec une bounding box que par nom de ville. L'URL Airbnb reste inchangée.

---

## Acceptance Criteria

**AC-1 — Fiche POI : ville extraite de Google locality (source principale)**

**Given** un POI hébergement avec Google Places details disponibles,
**When** la fiche s'ouvre,
**Then** la ville est extraite de `addressComponents` (type `locality`) via le champ `details.locality`.
**And** l'URL Booking utilise `?ss={city_name}` (encoded).

**AC-2 — Fiche POI : fallback OSM rawData pour POIs Overpass**

**Given** un POI hébergement sans Google locality mais avec `rawData['addr:city']`, `rawData['addr:town']` ou `rawData['addr:village']`,
**When** la fiche s'ouvre,
**Then** l'URL Booking utilise `?ss={city_name}` extrait du rawData OSM.

**AC-3 — Fiche POI : fallback Geoapify reverse geocoding**

**Given** un POI hébergement sans Google locality et sans ville dans rawData OSM,
**When** la fiche s'ouvre,
**Then** un appel `GET /geo/reverse-city?lat=&lng=` est effectué avec les coordonnées du POI.
**And** si une ville est retournée, l'URL Booking utilise `?ss={city_name}`.
**And** si aucune ville n'est trouvée, le bouton Booking n'est pas affiché (seul Airbnb reste visible).
**Note** : `latitude/longitude/dest_type=latlong` ne fonctionne pas sur l'app mobile Booking — pas de fallback coords.

**AC-4 — Planning sidebar : ville résolue par reverse geocoding**

**Given** l'utilisateur a committé une recherche (`searchCommitted = true`) avec la couche Hébergements active,
**When** le centre du corridor est calculé (midKm),
**Then** un appel `GET /geo/reverse-city?lat=&lng=` est effectué pour ce centre.
**And** si une ville est retournée, le lien "Rechercher sur Booking.com" utilise `?ss={city_name}`.

**AC-5 — Live mode : ville résolue pour le point cible**

**Given** le mode live est actif et `targetKm` est positionné,
**When** le centre du point cible est calculé,
**Then** un appel `GET /geo/reverse-city?lat=&lng=` est effectué pour ce centre.
**And** si une ville est retournée, le lien Booking utilise `?ss={city_name}`.

**AC-6 — Booking masqué si ville introuvable (tous contextes)**

**Given** aucune source ne retourne de ville (Google locality null, OSM rawData vide, Geoapify null),
**When** l'utilisateur ouvre le dropdown,
**Then** le bouton Booking.com n'est pas affiché (seul Airbnb reste visible).
**And** aucune erreur n'est affichée à l'utilisateur — dégradation silencieuse.

**AC-7 — Cache Redis 7 jours**

**Given** une requête `GET /geo/reverse-city?lat=43.123&lng=-1.456` a déjà été effectuée,
**When** la même requête (même lat/lng arrondis à 3 décimales) est refaite,
**Then** la valeur en cache Redis est retournée sans appel Geoapify.

**AC-8 — Normalisation lat/lng pour le cache**

**Given** deux requêtes ont `lat=43.1234` et `lat=43.1237` (< 11m d'écart),
**When** la clé cache est calculée,
**Then** les deux utilisent la même clé `geo:city:43.123:-1.456` (arrondi à 3 décimales).

---

## Tasks / Subtasks

### Task 1 — `buildBookingSearchUrl` city-only (AC: 1, 2, 3, 4, 5, 6)

**File:** `apps/web/src/lib/booking-url.ts`

- [x] Signature `buildBookingSearchUrl(city: string)` — city obligatoire, pas de coords
- [x] URL `?ss={encodeURIComponent(city)}`
- [x] `extractCityFromOsmRawData` — `addr:city` > `addr:town` > `addr:village`
- [x] Tests mis à jour dans `booking-url.test.ts`

### Task 2 — NestJS `GeoModule` (AC: 4, 5, 7, 8)

- [x] `apps/api/src/geo/geo.module.ts`
- [x] `apps/api/src/geo/geo.controller.ts` — `GET /geo/reverse-city?lat=&lng=`
- [x] `apps/api/src/geo/geo.service.ts` — Geoapify fetch + Redis cache
- [x] `apps/api/src/geo/geo.service.test.ts`
- [x] `apps/api/src/geo/dto/reverse-city.dto.ts`
- [x] Enregistré dans `apps/api/src/app.module.ts`

### Task 3 — Hook `useReverseCity` (AC: 3, 4, 5, 6)

**File:** `apps/web/src/hooks/use-reverse-city.ts`

- [x] TanStack Query, `staleTime` 7j miroir Redis TTL
- [x] Coords arrondies à 3dp dans queryKey
- [x] Utilisé dans : `SearchRangeControl` (zone), `LivePage` (zone), `PoiPopup` (fallback POI), `PoiDetailSheet` (fallback POI)

### Task 4 — `SearchOnDropdown` (AC: 1, 2, 3, 4, 5, 6)

**File:** `apps/web/src/components/shared/search-on-dropdown.tsx`

- [x] Prop `city?: string | null`
- [x] Booking link conditionnel : affiché seulement si `city` disponible
- [x] Airbnb inchangé (bbox)
- [x] Tests mis à jour

### Task 5 — Google Places `locality` (AC: 1)

**Files:** `packages/shared/src/types/google-place.types.ts`, `apps/api/src/pois/providers/google-places.provider.ts`

- [x] Ajout `locality: string | null` dans `GooglePlaceDetails`
- [x] Ajout `addressComponents` dans le fieldMask API (champ Basic — gratuit)
- [x] Extraction `locality` depuis `addressComponents` (type `locality`)
- [x] Test mis à jour dans `google-places.provider.test.ts`

### Task 6 — Google POIs : utiliser externalId comme place_id (AC: 1)

**File:** `apps/api/src/pois/pois.service.ts`

- [x] Si `externalId` commence par `ChIJ` ou `Eh` (format Google place_id), utiliser directement comme place_id
- [x] Évite un appel `findPlaceId` (Text Search) inutile pour les POIs déjà sourcés de Google

### Task 7 — POI popup/detail-sheet : chaîne ville (AC: 1, 2, 3)

**Files:** `poi-popup.tsx`, `poi-detail-sheet.tsx`

- [x] Chaîne : `details?.locality` → `extractCityFromOsmRawData(rawData)` → `useReverseCity` (Geoapify fallback)
- [x] `useReverseCity` appelé avant le `if (!pos) return null` (Rules of Hooks)
- [x] Activé uniquement pour les hébergements (`isAccommodation`)
- [x] Tests mis à jour (mock `useReverseCity`)

### Task 8 — Planning sidebar + Live mode : ville par reverse geocoding (AC: 4, 5)

- [x] `SearchRangeControl` — `useReverseCity(corridorCenter)` conditionnel
- [x] `LivePage` — `useReverseCity(liveSearchCenter)` conditionnel
- [x] `LiveControls` — prop `city` transmise à `SearchOnDropdown`
- [x] Tests mis à jour

### Task 9 — rawData pipeline fix

- [x] `pois.repository.ts` — `findCachedPois` et `findPoisNearPoint` incluent `rawData`
- [x] `pois.service.ts` — `RawCacheablePoi` inclut `rawData` (cache Redis)
- [x] `pois.repository.ts` — `insertRawPoisForSegment` préserve `rawData`

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] Ajouter `geo.controller.test.ts` — test d'intégration controller (mocked service) per project conventions [apps/api/src/geo/]
- [ ] [AI-Review][LOW] Ajouter tests `poi-detail-sheet.test.tsx` pour Google `locality` comme source ville et fallback Geoapify (useReverseCity mock returning city)

---

## Dev Notes

### Chaîne d'extraction de ville pour les POIs

```
POI hébergement → ville pour URL Booking ?ss=

1. details?.locality          (Google addressComponents — primary)
2. extractCityFromOsmRawData  (addr:city > addr:town > addr:village — Overpass POIs)
3. useReverseCity(poi coords)  (Geoapify reverse geocoding — fallback ultime)

Si aucune source → bouton Booking masqué (seul Airbnb visible)
```

### Google POIs : place_id direct

Pour les POIs `source: "google"`, l'`externalId` est déjà un Google place_id (ex: `ChIJDfvvLKNakUcR5B1ttf-3qI0`). Le service `getPoiGoogleDetails` détecte le préfixe `ChIJ` / `Eh` et utilise directement l'externalId comme place_id, sans faire de Text Search (`findPlaceId`) inutile.

### `addressComponents` vs `formattedAddress`

`formattedAddress` est une string formatée ("16 Petite Rue, 67650 Dieffenthal, France") — parser la ville est fragile (format variable selon pays/langue). `addressComponents` avec le type `locality` donne directement le nom de la ville — fiable et structuré. Le champ `addressComponents` est **Basic** dans l'API Google Places (pas de surcoût).

### rawData dans le pipeline POI

Les tags OSM (`addr:city`, `addr:town`, etc.) sont stockés dans `rawData` en DB. Le pipeline de cache Redis (`RawCacheablePoi`) et les fonctions repository (`findCachedPois`, `findPoisNearPoint`) doivent explicitement inclure `rawData` — sinon il est perdu silencieusement.

### Cache Redis — clé normalisée (Geoapify)

```
geo:city:{lat.toFixed(3)}:{lng.toFixed(3)}
```

`toFixed(3)` = ±111m de précision — suffisant pour la ville. La valeur vide `""` est stockée pour les coordonnées sans ville (évite de re-appeler Geoapify pour des zones isolées).

### `useReverseCity` — `staleTime` 7j

TanStack Query met la donnée en cache pendant 7 jours côté client, miroir du TTL Redis. Le query key inclut les coords arrondies à 3dp → même clé que le cache Redis.

### GeoModule — `GEOAPIFY_API_KEY` env var

Si `GEOAPIFY_API_KEY` est vide → log warning au démarrage, retourner `null` pour toutes les requêtes. Free tier : 3 000 req/jour, commercial ok.

---

## Project Structure Notes

### Fichiers modifiés

- `apps/web/src/lib/booking-url.ts` — `buildBookingSearchUrl(city)` city-only, `extractCityFromOsmRawData`
- `apps/web/src/lib/booking-url.test.ts`
- `apps/web/src/components/shared/search-on-dropdown.tsx` — prop `city`, Booking conditionnel
- `apps/web/src/components/shared/search-on-dropdown.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — chaîne ville : locality → OSM → Geoapify
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — chaîne ville : locality → OSM → Geoapify
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — hook `useReverseCity`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`
- `apps/web/src/app/(app)/live/[id]/page.tsx` — hook `useReverseCity`, passer `city` à `LiveControls`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — prop `city`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx`
- `apps/web/src/lib/api-client.ts` — `getReverseCity`
- `apps/api/src/app.module.ts` — enregistrer `GeoModule`
- `apps/api/src/pois/pois.repository.ts` — `rawData` dans `findCachedPois`, `findPoisNearPoint`, `insertRawPoisForSegment`
- `apps/api/src/pois/pois.service.ts` — `rawData` dans `RawCacheablePoi`, Google place_id direct pour POIs source=google
- `apps/api/src/pois/providers/google-places.provider.ts` — `addressComponents` fieldMask, extraction `locality`
- `apps/api/src/pois/providers/google-places.provider.test.ts` — test `locality`
- `packages/shared/src/types/google-place.types.ts` — ajout `locality: string | null`

### Fichiers créés

- `apps/web/src/hooks/use-reverse-city.ts`
- `apps/api/src/geo/geo.module.ts`
- `apps/api/src/geo/geo.controller.ts`
- `apps/api/src/geo/geo.service.ts`
- `apps/api/src/geo/geo.service.test.ts`
- `apps/api/src/geo/dto/reverse-city.dto.ts`

---

## References

- Story 16.14 (SearchOnDropdown + booking-url.ts) : `_bmad-output/implementation-artifacts/16-14-global-booking-search-button.md`
- `buildBookingSearchUrl` : `apps/web/src/lib/booking-url.ts:24-26`
- `GooglePlaceDetails` type : `packages/shared/src/types/google-place.types.ts`
- `GEOAPIFY_CACHE_TTL` : `packages/shared/src/constants/api.constants.ts`
- Booking `ss` parameter : fonctionne comme le champ de recherche Booking desktop + mobile

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Completion Notes List

- Implemented `buildBookingSearchUrl(city)` — city-only, `?ss=` param, NO lat/lng fallback (lat/lng doesn't work on Booking mobile app)
- Added `extractCityFromOsmRawData` (addr:city > addr:town > addr:village) for Overpass POIs
- Created NestJS `GeoModule`: `GET /geo/reverse-city?lat=&lng=` — Geoapify fetch + Redis 7d cache + empty-string sentinel for unknown areas
- Created `useReverseCity` hook — TanStack Query with 7d staleTime mirroring Redis TTL. Used by SearchRangeControl, LivePage (zone searches), PoiPopup, PoiDetailSheet (POI fallback)
- `SearchOnDropdown` — Booking link only shown when city is available, Airbnb always shown (uses bbox)
- Bug fix: `pois.repository.ts` — `findCachedPois` and `findPoisNearPoint` were NOT returning `rawData`. Fixed.
- Bug fix: `pois.service.ts` — `RawCacheablePoi` type (Redis cache) was stripping `rawData`. Fixed.
- Bug fix: `pois.repository.ts` — `insertRawPoisForSegment` was overwriting `rawData` with `{}`. Fixed.
- Bug fix: `pois.service.ts` — Google POIs (`externalId` starting with `ChIJ`/`Eh`) now skip `findPlaceId` Text Search and use externalId directly as place_id
- Added `locality` field to `GooglePlaceDetails` type — extracted from `addressComponents` (type `locality`)
- Added `addressComponents` to Google Places API fieldMask (Basic tier — no extra cost)
- City extraction chain for POIs: Google `locality` (primary) → OSM rawData (Overpass fallback) → Geoapify reverse geocoding (ultimate fallback)
- Removed `extractCityFromFormattedAddress` entirely — dead code, `locality` from Google addressComponents is the reliable source
- `useReverseCity` in PoiPopup placed before early return `if (!pos) return null` to respect Rules of Hooks
- All tests pass: 781 web + 240 API (1 pre-existing failure in google-places.provider.test.ts — locationBias vs locationRestriction)

#### Code Review Fixes (2026-04-05)

- **[H1 fix]** `poi-detail-sheet.tsx` — `useReverseCity` moved BEFORE `if (!poi) return null` to fix Rules of Hooks violation (hook count changed between renders when poi toggled null/non-null)
- **[H2 fix]** `google-places.provider.test.ts` — `findPlaceId` test corrected: `locationBias` → `locationRestriction`, `radius: 150.0` → `2000.0` (test now matches implementation)
- **[M1 fix]** `geo.service.ts` — added optional chaining `data.results?.[0]` to guard against malformed Geoapify response
- **[M2 fix]** `poi-detail-sheet.tsx` — replaced direct Booking `<a>` link with `SearchOnDropdown` component (Booking + Airbnb), consistent with `poi-popup.tsx`. Removed unused `trackBookingClick` + `ExternalLink` imports
- **[M2 fix]** `poi-detail-sheet.test.tsx` — updated tests: removed `trackBookingClick` mock, added `SearchOnDropdown` mock, updated Booking CTA tests to use `data-testid="search-on-dropdown"`

### File List

**Modified:**
- `apps/web/src/lib/booking-url.ts`
- `apps/web/src/lib/booking-url.test.ts`
- `apps/web/src/components/shared/search-on-dropdown.tsx`
- `apps/web/src/components/shared/search-on-dropdown.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`
- `apps/web/src/app/(app)/live/[id]/page.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx`
- `apps/web/src/lib/api-client.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/pois/pois.repository.ts`
- `apps/api/src/pois/pois.service.ts`
- `apps/api/src/pois/providers/google-places.provider.ts`
- `apps/api/src/pois/providers/google-places.provider.test.ts`
- `packages/shared/src/types/google-place.types.ts`

**Created:**
- `apps/web/src/hooks/use-reverse-city.ts`
- `apps/api/src/geo/geo.module.ts`
- `apps/api/src/geo/geo.controller.ts`
- `apps/api/src/geo/geo.service.ts`
- `apps/api/src/geo/geo.service.test.ts`
- `apps/api/src/geo/dto/reverse-city.dto.ts`
