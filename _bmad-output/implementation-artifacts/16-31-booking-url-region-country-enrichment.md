# Story 16.31: Booking URL — Ajouter Région et Pays au Paramètre de Recherche

Status: in-progress

> **Ajouté 2026-04-08** — Suite directe de 16.16 (city-based) et 16.21 (postal code). Enrichit le `?ss=` Booking avec région/province et pays pour éliminer les ambiguïtés géographiques restantes (ex: "Valencia 46001" → Espagne ou Venezuela ?). Zéro coût API additionnel.

## Story

As a **cyclist using Booking.com deep links from the app**,
I want the Booking search URL to include the region/province and country alongside city and postal code,
So that search results always target the correct geographic location — even for ambiguous city names that exist across countries or regions.

## Acceptance Criteria

1. **Given** un POI hébergement avec Google Places details chargés,
   **When** `getPlaceDetails()` retourne les `addressComponents`,
   **Then** le `administrative_area_level_1` est extrait et exposé dans `GooglePlaceDetails.adminArea`, et le `country` est extrait et exposé dans `GooglePlaceDetails.country`.

2. **Given** un POI hébergement,
   **When** l'URL Booking est construite,
   **Then** le paramètre `?ss=` utilise les noms natifs Geoapify (ville, code postal, région, pays) au format `{ville} {codepostal}, {région}, {pays}` (ex: `?ss=Pinoso%2003650%2C%20Comunidad%20Valenciana%2C%20Espa%C3%B1a`). Google Places/OSM = fallback uniquement si Geoapify indisponible. Raison : Google Places francise les noms (`languageCode=fr`) ce qui casse les résultats Booking.com.

3. **Given** le `SearchOnDropdown` global (sidebar planning ou live controls — pas de POI spécifique),
   **When** `useReverseCity` résout la zone via Geoapify,
   **Then** le `state` et `country` Geoapify sont aussi retournés et passés à `buildBookingSearchUrl()`.

4. **Given** une ville est disponible MAIS la région ou le pays est absent (partiel),
   **When** l'URL Booking est construite,
   **Then** seuls les composants disponibles sont inclus dans `?ss=` (dégradation gracieuse, pas de virgules vides).

5. **Given** un POI Overpass (opt-in) sans Google Place Details,
   **When** l'URL Booking est construite,
   **Then** le `useReverseCity` Geoapify fournit `city`, `postcode`, `state` et `country` (même source primaire que pour les POIs Google).

6. **Given** le cache Redis `geo:cityv2:` existant,
   **When** le service est déployé avec les nouveaux champs,
   **Then** la clé cache passe à `geo:cityv3:` et inclut `{ city, postcode, state, country }`. Les anciennes `geo:cityv2:` expirent en 7 jours.

## Chaîne de Priorité Région/Pays

> **Geoapify = source primaire** pour TOUS les params Booking URL (city, postcode, state, country). Google Places francise les noms (`languageCode=fr` → Valencia→Valence, España→Espagne) ce qui produit des résultats incorrects sur Booking.com. Geoapify retourne les noms natifs. Google/OSM = fallback uniquement si Geoapify indisponible.

| Contexte | Source city + postcode + state + country | Priorité |
|----------|------------------------------------------|----------|
| POI popup (hébergement Google ou Overpass) | Geoapify `useReverseCity` (noms natifs) → Google/OSM fallback | Geoapify PRIMARY |
| SearchOnDropdown sidebar (zone) | Geoapify `useReverseCity` (pas de POI spécifique) | Geoapify uniquement |
| SearchOnDropdown live controls (zone) | Geoapify `useReverseCity` (pas de POI spécifique) | Geoapify uniquement |

## Format URL Final

```
?ss={ville} {codepostal}, {région}, {pays}
```

Exemples :
- `?ss=Valencia%2046001%2C%20Comunidad%20Valenciana%2C%20Spain`
- `?ss=Saint-Jean-de-Luz%2064500%2C%20Nouvelle-Aquitaine%2C%20France`
- `?ss=Pamplona%2031001%2C%20Navarra%2C%20Espa%C3%B1a`

Si composants manquants, omettre les parties absentes :
- Pas de postcode : `?ss=Valencia%2C%20Comunidad%20Valenciana%2C%20Spain`
- Pas de région : `?ss=Valencia%2046001%2C%20Spain`
- Ni région ni pays : `?ss=Valencia%2046001` (comportement actuel, pas de régression)

## Tasks / Subtasks

- [x] Task 1: Shared Types — Étendre `GooglePlaceDetails` (AC: #1)
  - [x] 1.1 Ajouter `adminArea: string | null` à `GooglePlaceDetails` dans `packages/shared/src/types/google-place.types.ts`
  - [x] 1.2 Ajouter `country: string | null` à `GooglePlaceDetails`

- [x] Task 2: API — Extraire `adminArea` et `country` depuis Google Places (AC: #1)
  - [x] 2.1 Dans `google-places.provider.ts` → `getPlaceDetails()` : extraire `administrative_area_level_1` depuis `addressComponents` (même pattern exact que `locality` et `postal_code` lignes 127-134)
  - [x] 2.2 Extraire `country` depuis `addressComponents` type `country`
  - [x] 2.3 Retourner `adminArea` et `country` dans l'objet `GooglePlaceDetails`
  - [x] 2.4 Mettre à jour `google-places.provider.test.ts` — ajouter `administrative_area_level_1` et `country` au mock `addressComponents`

- [x] Task 3: API — Étendre `GeoService.reverseCity()` avec state + country (AC: #3, #5, #6)
  - [x] 3.1 Modifier le type de retour de `reverseCity()` dans `geo.service.ts` : `{ city, postcode, state, country }`
  - [x] 3.2 Extraire `result?.state` et `result?.country` de la réponse Geoapify (déjà présents dans `results[0]`)
  - [x] 3.3 Bump clé cache Redis : `geo:cityv2:` → `geo:cityv3:` avec JSON `{ city, postcode, state, country }`
  - [x] 3.4 Adapter `GeoController.reverseCity()` dans `geo.controller.ts` : retourner les 4 champs
  - [x] 3.5 Mettre à jour `geo.service.test.ts`

- [x] Task 4: Frontend — Adapter `api-client.ts` et `useReverseCity` hook (AC: #3)
  - [x] 4.1 Modifier `getReverseCity()` dans `api-client.ts` : type de retour `{ city, postcode, state, country }`
  - [x] 4.2 Modifier `useReverseCity()` dans `use-reverse-city.ts` : retourner `{ city, postcode, state, country, isPending }`

- [x] Task 5: Frontend — Adapter `booking-url.ts` (AC: #2, #4)
  - [x] 5.1 Modifier `buildBookingSearchUrl(city, postcode?, adminArea?, country?)` : format `?ss={city} {postcode}, {adminArea}, {country}` avec omission des parties nulles
  - [x] 5.2 Mettre à jour `booking-url.test.ts` — couvrir tous les cas de combinaisons partielles (4 composants, 3, 2, 1)

- [x] Task 6: Frontend — Adapter les consommateurs (AC: #2, #3, #4, #5)
  - [x] 6.1 `SearchOnDropdown` : ajouter props `adminArea?: string | null` et `country?: string | null`, passer à `buildBookingSearchUrl()`
  - [x] 6.2 `poi-popup.tsx` : chaîne de priorité adminArea = `details?.adminArea` (Google, PRIMARY) → `reverseCity.state` (Geoapify fallback). Idem pour country = `details?.country` → `reverseCity.country`. Passer au `SearchOnDropdown`.
  - [x] 6.3 `poi-detail-sheet.tsx` : même chaîne de priorité que poi-popup.tsx
  - [x] 6.4 `search-range-control.tsx` : passer `state` et `country` du `useReverseCity` (Geoapify zone) à `SearchOnDropdown`
  - [x] 6.5 `live/[id]/page.tsx` : passer `state` et `country` du `useReverseCity` à `LiveControls`
  - [x] 6.6 `live-controls.tsx` : accepter `adminArea` + `country` props, forward au `SearchOnDropdown`
  - [x] 6.7 Mettre à jour les tests : `search-on-dropdown.test.tsx`, `poi-popup.test.tsx`, `poi-detail-sheet.test.tsx`, `search-range-control.test.tsx`, `live-controls.test.tsx`

## Dev Notes

### Continuité avec Stories 16.16 et 16.21

Cette story étend le même pattern exact établi dans 16.16 (city) et 16.21 (postal code). La chaîne de priorité `Google Places → OSM → Geoapify` est déjà en place — on ajoute 2 champs supplémentaires à chaque niveau de la chaîne.

### Google Places `addressComponents` — Types Pertinents

Le `fieldMask` actuel dans `getPlaceDetails()` (ligne 80-93 de `google-places.provider.ts`) inclut déjà `addressComponents`. Aucune modification du fieldMask nécessaire. Les types à extraire :

```typescript
// Déjà extrait (lignes 127-134) :
// - 'locality' → GooglePlaceDetails.locality
// - 'postal_code' → GooglePlaceDetails.postalCode

// NOUVEAU — même pattern exact :
const adminArea = data.addressComponents?.find(
  (c) => c.types?.includes('administrative_area_level_1'),
)?.longText ?? null

const country = data.addressComponents?.find(
  (c) => c.types?.includes('country'),
)?.longText ?? null
```

**Coût additionnel : ZÉRO** — `addressComponents` est déjà dans le fieldMask.

### Geoapify Response — Champs Déjà Disponibles

La réponse Geoapify (utilisée dans `geo.service.ts` ligne 51-53) contient déjà :

```json
{
  "results": [{
    "city": "Valencia",
    "postcode": "46001",
    "state": "Comunidad Valenciana",
    "country": "Spain",
    "municipality": "...",
    "formatted": "..."
  }]
}
```

Le code actuel (ligne 55) extrait `city`, `town`, `village`, `municipality`, `postcode` mais ignore `state` et `country`. Il suffit d'ajouter :

```typescript
const state = result?.state ?? null
const country = result?.country ?? null
```

### `buildBookingSearchUrl` — Logique de Construction

```typescript
export function buildBookingSearchUrl(
  city: string,
  postcode?: string | null,
  adminArea?: string | null,
  country?: string | null,
): string {
  // Base: "Valencia 46001"
  let ss = postcode ? `${city} ${postcode}` : city
  // Append region if available: ", Comunidad Valenciana"
  if (adminArea) ss += `, ${adminArea}`
  // Append country if available: ", Spain"
  if (country) ss += `, ${country}`
  return `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(ss)}`
}
```

### POI Popup — Chaîne de Résolution Complète

Dans `poi-popup.tsx` (lignes 120-131), ajouter après `poiPostcode` :

```typescript
const poiAdminArea = isAccommodation
  ? (details?.adminArea ?? reverseCity.state ?? null)
  : null
const poiCountry = isAccommodation
  ? (details?.country ?? reverseCity.country ?? null)
  : null
```

**Note :** Pas de fallback OSM pour `adminArea`/`country` car les tags OSM (`addr:state`, `addr:country`) sont rarement renseignés. Geoapify est le fallback suffisant.

### Redis Cache Migration

- **Clé actuelle** : `geo:cityv2:{lat.3}:{lng.3}` → JSON `{ city, postcode }`
- **Nouvelle clé** : `geo:cityv3:{lat.3}:{lng.3}` → JSON `{ city, postcode, state, country }`
- Les anciennes `geo:cityv2:` expirent naturellement en 7 jours (TTL `GEOAPIFY_CACHE_TTL`)
- Pas de migration manuelle nécessaire

### Naming Convention : `adminArea` vs `state`

- `adminArea` côté Google Places (terme officiel Google : `administrative_area_level_1`)
- `state` côté Geoapify (champ de la réponse API Geoapify)
- Côté `useReverseCity` et composants : utiliser `state` (convention Geoapify, plus court)
- Côté `GooglePlaceDetails` : utiliser `adminArea` (convention Google)
- Côté `buildBookingSearchUrl` : paramètre nommé `adminArea` (source agnostique)

### Project Structure Notes

- Tous les fichiers à modifier existent déjà — aucun fichier à créer
- Patterns identiques à 16.21 : même fichiers, mêmes positions dans le code
- Tests co-localisés (`.test.ts` à côté de chaque fichier)
- `apps/api/` : Jest ; `apps/web/` : Vitest

### Files to Modify

| File | Change |
|------|--------|
| `packages/shared/src/types/google-place.types.ts` | Ajouter `adminArea: string \| null` et `country: string \| null` |
| `apps/api/src/pois/providers/google-places.provider.ts` | Extraire `administrative_area_level_1` et `country` |
| `apps/api/src/pois/providers/google-places.provider.test.ts` | Ajouter mock addressComponents |
| `apps/api/src/geo/geo.service.ts` | Retourner `{ city, postcode, state, country }`, bump `geo:cityv3:` |
| `apps/api/src/geo/geo.service.test.ts` | Mettre à jour pour 4 champs |
| `apps/api/src/geo/geo.controller.ts` | Retourner 4 champs |
| `apps/web/src/lib/api-client.ts` | Type retour `getReverseCity` → 4 champs |
| `apps/web/src/hooks/use-reverse-city.ts` | Retourner `{ city, postcode, state, country, isPending }` |
| `apps/web/src/lib/booking-url.ts` | `buildBookingSearchUrl(city, postcode?, adminArea?, country?)` |
| `apps/web/src/lib/booking-url.test.ts` | Tests combinaisons partielles |
| `apps/web/src/components/shared/search-on-dropdown.tsx` | Props `adminArea` + `country` |
| `apps/web/src/components/shared/search-on-dropdown.test.tsx` | Mettre à jour |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx` | Chaîne priorité : Google → Geoapify |
| `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx` | Mettre à jour mocks |
| `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx` | Même chaîne que poi-popup |
| `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx` | Mettre à jour mocks |
| `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx` | Passer `state` + `country` Geoapify |
| `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx` | Mettre à jour |
| `apps/web/src/app/(app)/live/[id]/page.tsx` | Passer `state` + `country` à LiveControls |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx` | Props `adminArea` + `country` |
| `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx` | Mettre à jour |

### Risques

- **Zéro coût API supplémentaire** : Google `addressComponents` déjà dans le fieldMask, Geoapify retourne déjà `state`/`country`
- **Cache Redis backward compat** : bump `geo:cityv3:` — anciennes entrées expirent en 7j
- **Dégradation gracieuse** : composants nullables → omis dans l'URL, pas de virgules vides
- **Pas de régression** : si ni adminArea ni country dispo → même URL qu'avant (ville + postcode)

### References

- [Source: apps/api/src/pois/providers/google-places.provider.ts:76-151] — getPlaceDetails + addressComponents extraction
- [Source: packages/shared/src/types/google-place.types.ts] — GooglePlaceDetails type
- [Source: apps/api/src/geo/geo.service.ts:21-61] — reverseCity avec Geoapify
- [Source: apps/web/src/lib/booking-url.ts:24-27] — buildBookingSearchUrl actuel
- [Source: apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx:120-131] — chaîne résolution city/postcode
- [Source: apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx:58-68] — chaîne résolution city/postcode
- [Source: _bmad-output/implementation-artifacts/16-21-booking-url-postal-code.md] — Story précédente (même pattern)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
N/A

### Completion Notes List
- Ajouté `adminArea` et `country` à `GooglePlaceDetails` (shared types)
- Extraction `administrative_area_level_1` et `country` depuis Google Places `addressComponents` (zéro coût API — déjà dans fieldMask)
- Étendu `GeoService.reverseCity()` avec `state` et `country` Geoapify, bump cache `geo:cityv2:` → `geo:cityv3:`
- Étendu `GeoController.reverseCity()` retour 4 champs
- Étendu `getReverseCity()` API client + `useReverseCity` hook (4 champs + isPending)
- Étendu `buildBookingSearchUrl()` avec `adminArea?` et `country?` — dégradation gracieuse (omission parties nulles)
- **CORRECTIF POST-IMPL** : Geoapify = source primaire pour TOUS les params Booking URL (city, postcode, state, country). Google Places francise les noms (Valencia→Valence, España→Espagne) ce qui casse les résultats Booking.com. Geoapify retourne les noms natifs compatibles Booking. Google/OSM = fallback uniquement si Geoapify indisponible.
- `SearchOnDropdown`, `LiveControls`, `search-range-control`, `live/[id]/page` — props `adminArea` + `country` ajoutées
- 7 nouveaux tests booking-url (combinaisons partielles) — total web 914 tests passants
- Tests API mis à jour (geo.service.test, google-places.provider.test) — 270 tests passants
- Aucune régression : si ni adminArea ni country dispo → même URL qu'avant

### Change Log
- 2026-04-08: Implémentation complète story 16.31 — région/pays dans URL Booking

### File List
- packages/shared/src/types/google-place.types.ts
- apps/api/src/pois/providers/google-places.provider.ts
- apps/api/src/pois/providers/google-places.provider.test.ts
- apps/api/src/geo/geo.service.ts
- apps/api/src/geo/geo.service.test.ts
- apps/api/src/geo/geo.controller.ts
- apps/web/src/lib/api-client.ts
- apps/web/src/hooks/use-reverse-city.ts
- apps/web/src/lib/booking-url.ts
- apps/web/src/lib/booking-url.test.ts
- apps/web/src/components/shared/search-on-dropdown.tsx
- apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx
- apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx
- apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx
- apps/web/src/app/(app)/live/[id]/page.tsx
- apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx

### Review Findings

- [x] [Review][Decision] Aligner la spec (AC2, tâche 6.2) avec le comportement réel — AC2 et AC5 mis à jour : Geoapify = source primaire pour tous les params Booking URL, Google/OSM = fallback. Chaîne de priorité et section "Chaîne de Priorité" alignées.

- [x] [Review][Patch] Durcir `buildBookingSearchUrl` contre les chaînes blanches — Ajout `.trim()` sur postcode, adminArea, country. Tests ajoutés pour whitespace-only.

- [x] [Review][Patch] Couverture tests composant — 2 tests ajoutés dans `search-on-dropdown.test.tsx` : href Booking avec adminArea+country, et dégradation gracieuse null.

- [x] [Review][Patch] Préciser les JSDoc de `SearchOnDropdown` — JSDoc mis à jour : « typically Geoapify state/country » au lieu de mentionner Google.

- [x] [Review][Defer] Champs `GooglePlaceDetails.adminArea`/`country` extraits côté API mais non utilisés pour construire l’URL Booking sur le web — cohérent avec le correctif « noms natifs Booking » ; valeur résiduelle pour d’autres usages ou évolutions. — deferred, pré-existant / intentionnel post-story
