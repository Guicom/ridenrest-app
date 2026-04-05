# Story 16.21: Booking URL — Ajouter le Code Postal au Paramètre de Recherche

Status: done

## Story

As a **cyclist using Booking.com deep links from the app**,
I want the Booking search URL to include the postal code alongside the city name,
So that search results target the correct location — especially for common city names that exist in multiple regions (e.g. "Saint-Jean-de-Luz 64500" vs just "Saint-Jean-de-Luz").

## Acceptance Criteria

1. **Given** un POI hébergement avec Google Places details chargés,
   **When** `getPlaceDetails()` retourne les `addressComponents`,
   **Then** le `postal_code` est extrait (type `postal_code` dans `addressComponents`) et exposé dans `GooglePlaceDetails`.

2. **Given** un POI hébergement avec `details.postalCode` disponible (Google Places = source primaire),
   **When** l'URL Booking est construite,
   **Then** le paramètre `?ss=` vaut `{ville} {codepostal}` (ex: `?ss=Saint-Jean-de-Luz%2064500`).

3. **Given** un POI Overpass (opt-in) avec `addr:postcode` dans rawData mais sans détails Google,
   **When** l'URL Booking est construite,
   **Then** le `addr:postcode` OSM est utilisé comme fallback pour le code postal.

4. **Given** le `SearchOnDropdown` global (sidebar planning ou live controls — pas de POI spécifique),
   **When** `useReverseCity` résout la zone via Geoapify,
   **Then** le `postcode` Geoapify est aussi retourné et passé à `buildBookingSearchUrl()`.

5. **Given** une ville est disponible MAIS le code postal est absent (aucune source),
   **When** l'URL Booking est construite,
   **Then** le `?ss=` utilise la ville seule (pas de régression).

6. **Given** ni ville ni code postal ne sont disponibles,
   **When** l'URL Booking est construite,
   **Then** le fallback coordonnées GPS `?latitude=&longitude=&dest_type=latlong` est utilisé.

## Postal Code Priority Chain

> **Google Places = source primaire** pour les POIs. Geoapify = fallback zone uniquement.

| Contexte | Source postcode | Priorité |
|----------|----------------|----------|
| POI popup (hébergement) | 1. Google Places `addressComponents[postal_code]` (PRIMARY) → 2. OSM `addr:postcode` (complément) → 3. Geoapify reverse (fallback si ni Google ni OSM) | Google > OSM > Geoapify |
| SearchOnDropdown sidebar (zone) | Geoapify `useReverseCity` (pas de POI spécifique) | Geoapify uniquement |
| SearchOnDropdown live controls (zone) | Geoapify `useReverseCity` (pas de POI spécifique) | Geoapify uniquement |

## Tasks / Subtasks

- [x] Task 1: API — Extraire `postal_code` depuis Google Places `addressComponents` (AC: #1)
  - [x] 1.1 Ajouter `postalCode: string | null` à `GooglePlaceDetails` dans `packages/shared/src/types/google-place.types.ts`
  - [x] 1.2 Dans `google-places.provider.ts` → `getPlaceDetails()` : extraire `addressComponents` type `postal_code` (même pattern que l'extraction `locality` existante ligne 120-122)
  - [x] 1.3 Mettre à jour `google-places.provider.test.ts`
- [x] Task 2: API — Étendre `GeoService.reverseCity()` pour retourner le postcode (AC: #4)
  - [x] 2.1 Modifier `reverseCity()` dans `apps/api/src/geo/geo.service.ts` pour retourner `{ city: string | null; postcode: string | null }`
  - [x] 2.2 Extraire `result?.postcode` de la réponse Geoapify
  - [x] 2.3 Cache Redis : bump clé `geo:cityv2:` → stocker JSON `{"city":"...","postcode":"..."}` (anciennes `geo:city:` expirent en 7j)
  - [x] 2.4 Adapter `GeoController.reverseCity()` dans `geo.controller.ts` : retourner `{ city, postcode }`
  - [x] 2.5 Mettre à jour `geo.service.test.ts`
- [x] Task 3: Frontend — Adapter `api-client.ts` et `useReverseCity` hook (AC: #4)
  - [x] 3.1 Modifier `getReverseCity()` dans `apps/web/src/lib/api-client.ts` : type de retour `{ city: string | null; postcode: string | null }`
  - [x] 3.2 Modifier `useReverseCity()` dans `apps/web/src/hooks/use-reverse-city.ts` : retourner `{ city, postcode, isPending }`
- [x] Task 4: Frontend — Adapter `booking-url.ts` (AC: #2, #3, #5)
  - [x] 4.1 Modifier `extractCityFromOsmRawData()` pour aussi retourner `postcode` (`addr:postcode`)
  - [x] 4.2 Modifier `buildBookingSearchUrl(city: string, postcode?: string | null)` : si postcode → `?ss={city} {postcode}`, sinon `?ss={city}`
  - [x] 4.3 Mettre à jour `booking-url.test.ts`
- [x] Task 5: Frontend — Adapter les consommateurs (AC: #2, #3, #4, #5, #6)
  - [x] 5.1 `SearchOnDropdown` : accepter `postcode?: string | null` prop, passer à `buildBookingSearchUrl()`
  - [x] 5.2 `poi-popup.tsx` : pour le postcode du POI, chaîne de priorité = `details?.postalCode` (Google, PRIMARY) → OSM `addr:postcode` → `reverseCity.postcode` (Geoapify fallback). Passer au `SearchOnDropdown`.
  - [x] 5.3 `search-range-control.tsx` : passer `postcode` du `useReverseCity` (Geoapify zone) à `SearchOnDropdown`
  - [x] 5.4 `live/[id]/page.tsx` → `LiveControls` : passer `postcode` du `useReverseCity` via props
  - [x] 5.5 Mettre à jour `search-on-dropdown.test.tsx`, `live-controls.test.tsx`, `poi-popup.test.tsx`, `poi-detail-sheet.test.tsx`, `search-range-control.test.tsx`

- [x] Task 6 (Review Fix): AC #6 — Fallback coordonnées GPS pour Booking.com quand aucune ville disponible
  - [x] 6.1 Ajouter `buildBookingCoordUrl(center)` dans `booking-url.ts` → `?latitude=X&longitude=Y&dest_type=latlong`
  - [x] 6.2 Adapter `SearchOnDropdown` : si `city` null mais `center` dispo → utiliser URL coord
  - [x] 6.3 Ajouter tests dans `booking-url.test.ts` et `search-on-dropdown.test.tsx`
  - [x] 6.4 Ajouter tests postcode dans `poi-popup.test.tsx`, `poi-detail-sheet.test.tsx`, `live-controls.test.tsx`, `search-range-control.test.tsx`

## Dev Notes

### Architecture Overview — Source Priority

**Google Places API = source primaire de l'app.** Pour les POIs :
- `getPlaceDetails()` demande déjà `addressComponents` dans le fieldMask (ligne 73-86 de `google-places.provider.ts`)
- `locality` est déjà extrait (ligne 120-122) — le `postal_code` suit le même pattern exact
- **Coût additionnel : ZÉRO** — `addressComponents` est déjà dans le fieldMask, le champ `postal_code` est inclus sans requête supplémentaire

Pour les liens zone (sidebar/live) sans POI spécifique :
- `useReverseCity` → Geoapify — seul cas d'usage de Geoapify pour cette feature
- Geoapify retourne `postcode` dans `results[0]`

OSM `addr:postcode` = complément pour les POIs Overpass opt-in qui n'ont pas de Google Place Details.

### Google Places addressComponents

`getPlaceDetails()` retourne déjà :
```typescript
addressComponents?: Array<{ longText?: string; types?: string[] }>
```

Le code extrait déjà `locality` :
```typescript
const locality = data.addressComponents?.find(
  (c) => c.types?.includes('locality'),
)?.longText ?? null
```

Ajouter `postal_code` suit le même pattern :
```typescript
const postalCode = data.addressComponents?.find(
  (c) => c.types?.includes('postal_code'),
)?.longText ?? null
```

### Geoapify Response Format (fallback zone)

```json
{ "results": [{ "city": "Saint-Jean-de-Luz", "postcode": "64500", ... }] }
```

### POI Popup — Postal Code Resolution Chain

Dans `poi-popup.tsx`, la chaîne actuelle pour `city` est :
```typescript
const poiCity = details?.locality ?? extractCityFromOsmRawData(rawData) ?? reverseCity
```

Pour `postcode`, même logique :
```typescript
const poiPostcode = details?.postalCode ?? osmData?.postcode ?? reversePostcode
```

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/types/google-place.types.ts` | Add `postalCode: string \| null` to `GooglePlaceDetails` |
| `apps/api/src/pois/providers/google-places.provider.ts` | Extract `postal_code` from `addressComponents` |
| `apps/api/src/pois/providers/google-places.provider.test.ts` | Update |
| `apps/api/src/geo/geo.service.ts` | Return `{ city, postcode }`, bump cache key |
| `apps/api/src/geo/geo.service.test.ts` | Update |
| `apps/api/src/geo/geo.controller.ts` | Return `{ city, postcode }` |
| `apps/web/src/lib/api-client.ts` | Update `getReverseCity` return type |
| `apps/web/src/hooks/use-reverse-city.ts` | Return `{ city, postcode, isPending }` |
| `apps/web/src/lib/booking-url.ts` | `extractCityFromOsmRawData` returns `{ city, postcode }`, `buildBookingSearchUrl` accepts postcode |
| `apps/web/src/lib/booking-url.test.ts` | Update |
| `apps/web/src/components/shared/search-on-dropdown.tsx` | Accept `postcode` prop |
| `apps/web/src/components/shared/search-on-dropdown.test.tsx` | Update |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` | Postal code chain: Google > OSM > Geoapify |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx` | Update |
| `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` | Pass Geoapify postcode |
| `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx` | Update |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Pass Geoapify postcode to LiveControls |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` | Accept + forward postcode |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` | Update |

### Redis Cache Migration Strategy

**Cache key bump** : `geo:cityv2:` → anciennes entrées `geo:city:` expirent en 7j. Pas de migration.

### Testing Standards

- Co-located `.test.ts`
- `apps/api/` : Jest ; `apps/web/` : Vitest

### Risques

- **Zéro coût API supplémentaire** : Google Places `addressComponents` est déjà dans le fieldMask — pas de requête additionnelle
- **Cache Redis backward compat** : bump de clé `geo:cityv2:` évite toute ambiguïté
- **POIs sans postal_code** : dégradation gracieuse — ville seule dans l'URL

### References

- [Source: apps/api/src/pois/providers/google-places.provider.ts:69-139] — getPlaceDetails with addressComponents extraction
- [Source: packages/shared/src/types/google-place.types.ts] — GooglePlaceDetails type
- [Source: apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx:116-123] — Current city resolution chain
- [Source: apps/api/src/geo/geo.service.ts] — Geoapify reverseCity (fallback zone)
- [Source: apps/web/src/lib/booking-url.ts] — URL builders
- [Source: project-context.md#External API Rate Limits] — Geoapify 3000 req/day, cache 7d

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A — no issues encountered.

### Completion Notes List
- Task 1: Added `postalCode: string | null` to `GooglePlaceDetails` type, extracted `postal_code` from `addressComponents` in `getPlaceDetails()` — zero additional API cost (field already in fieldMask).
- Task 2: Changed `GeoService.reverseCity()` to return `{ city, postcode }`. Bumped Redis cache key to `geo:cityv2:` with JSON payload. Old `geo:city:` entries expire in 7d.
- Task 3: Updated `getReverseCity()` API client and `useReverseCity` hook to expose `postcode`.
- Task 4: `extractCityFromOsmRawData()` now returns `{ city, postcode }` (extracts `addr:postcode`). `buildBookingSearchUrl()` accepts optional `postcode` param → `?ss=City PostalCode`.
- Task 5: All consumers updated with postal code priority chain: Google Places (primary) → OSM `addr:postcode` → Geoapify reverse geocoding. Includes `poi-popup.tsx`, `poi-detail-sheet.tsx`, `search-range-control.tsx`, `live-controls.tsx`, and `SearchOnDropdown`.
- Task 6 (Review Fix): AC #6 implemented — `buildBookingCoordUrl()` provides GPS coordinate fallback when no city available. SearchOnDropdown now falls back to `?latitude=X&longitude=Y&dest_type=latlong`. Postcode resolution chain tests added across all consumer components.
- All 6 Acceptance Criteria satisfied. Graceful degradation when postcode unavailable (AC #5, #6).

### Change Log
- 2026-04-05: Story 16.21 implemented — postal code added to Booking.com search URLs
- 2026-04-05: Code review fix — AC #6 GPS coordinate fallback for Booking.com, postcode test coverage added across all consumers

### File List
- `packages/shared/src/types/google-place.types.ts` — added `postalCode` field
- `apps/api/src/pois/providers/google-places.provider.ts` — extract `postal_code` from addressComponents
- `apps/api/src/pois/providers/google-places.provider.test.ts` — updated
- `apps/api/src/geo/geo.service.ts` — return `{ city, postcode }`, cache key bump `geo:cityv2:`
- `apps/api/src/geo/geo.service.test.ts` — rewritten for new return type
- `apps/api/src/geo/geo.controller.ts` — return `{ city, postcode }`
- `apps/web/src/lib/api-client.ts` — updated `getReverseCity` return type
- `apps/web/src/hooks/use-reverse-city.ts` — expose `postcode`
- `apps/web/src/lib/booking-url.ts` — `extractCityFromOsmRawData` returns `{ city, postcode }`, `buildBookingSearchUrl` accepts postcode
- `apps/web/src/lib/booking-url.test.ts` — updated
- `apps/web/src/components/shared/search-on-dropdown.tsx` — accept `postcode` prop
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` — postal code priority chain
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx` — updated mocks
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` — postal code priority chain
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx` — updated mocks
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` — pass `postcode` to SearchOnDropdown
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx` — updated mocks
- `apps/web/src/app/(app)/live/[id]/page.tsx` — pass `postcode` to LiveControls
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` — accept + forward `postcode`
