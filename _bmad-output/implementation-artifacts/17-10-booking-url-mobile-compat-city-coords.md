# Story 17.10: URLs Booking.com — compatibilite mobile (city + coords)

Status: done

## Story

As a **cyclist using the Booking.com link on mobile**,
I want the Booking mobile app to correctly display search results for my location,
So that I can find accommodations near my route without seeing stale results from a previous session.

## Context & Probleme

L'app native Booking.com sur iOS/Android ne parse pas correctement les chaines `ss=` complexes contenant code postal + region + pays (ex: `ss=La Puerta De Segura 23360, Andalusia, Spain`). Quand l'app ne reconnait pas la chaine, elle **fallback silencieusement sur la derniere recherche de l'utilisateur** — UX tres confusante.

**Tests effectues par Guillaume (2026-04-15) :**
- `?ss=La+Puerta+De+Segura+23360,+Andalusia,+Spain` → **KO** sur mobile (derniere recherche affichee)
- `?ss=Almaz%C3%A1n+42200,+Castile+and+Leon,+Spain` → **OK** sur mobile (ville connue de Booking)
- `?ss=La+Puerta+De+Segura&dest_type=city` → **OK** sur mobile (nom seul + hint type)
- `?ss=La+Puerta+De+Segura&dest_type=city&latitude=38.38&longitude=-2.84` → **OK** sur mobile
- `?latitude=38.38&longitude=-2.84&dest_type=latlong` (coords seules) → **KO** sur mobile
- Tous les formats fonctionnent sur desktop

**Solution validee** : `?ss={city}&dest_type=city&latitude={lat}&longitude={lng}` — nom de ville seul dans `ss=`, coordonnees GPS pour la desambiguation geographique, `dest_type=city` pour hinter l'app.

**Historique** : les stories 16.16, 16.21 et 16.31 avaient enrichi le `ss=` avec code postal + region + pays pour desambiguer sur desktop. Ce changement les remplace par des coordonnees GPS — plus fiable cross-platform.

## Acceptance Criteria

1. **Given** la fonction `buildBookingSearchUrl` dans `booking-url.ts`,
   **When** elle est appelee avec une ville et des coordonnees,
   **Then** l'URL generee est `https://www.booking.com/searchresults.html?ss={city}&dest_type=city&latitude={lat}&longitude={lng}`.

2. **Given** la fonction `buildBookingSearchUrl`,
   **When** elle est appelee avec une ville SANS coordonnees (center = null),
   **Then** l'URL generee est `https://www.booking.com/searchresults.html?ss={city}&dest_type=city` (pas de latitude/longitude).

3. **Given** le composant `SearchOnDropdown`,
   **When** `city` et `center` sont disponibles,
   **Then** le lien Booking utilise le format ville + coords (`?ss={city}&dest_type=city&latitude=...&longitude=...`).

4. **Given** le composant `SearchOnDropdown`,
   **When** `city` est null mais `center` est disponible,
   **Then** le fallback `buildBookingCoordUrl` est utilise (inchange : `?latitude=...&longitude=...&dest_type=latlong`).

5. **Given** les parametres `postcode`, `adminArea`, `country`,
   **When** `buildBookingSearchUrl` est appelee,
   **Then** ces parametres ne sont plus utilises dans l'URL — la signature les supprime.

6. **Given** le module API `go/` (redirect proxy),
   **When** la story est terminee,
   **Then** le module est supprime (`go.module.ts`, `go.controller.ts`, `go.controller.test.ts`) et deregistre de `app.module.ts`.

7. **Given** tous les tests existants,
   **When** la story est implementee,
   **Then** tous les tests passent apres mise a jour (API + web).

## Tasks / Subtasks

### Phase 1 — Modifier `buildBookingSearchUrl` (AC: #1, #2, #5)

- [x] Task 1 — Nouvelle signature et implementation
  - [x] 1.1 — `apps/web/src/lib/booking-url.ts` : modifier `buildBookingSearchUrl` :
    - Ancienne signature : `(city: string, postcode?: string | null, adminArea?: string | null, country?: string | null): string`
    - Nouvelle signature : `(city: string, center?: { lat: number; lng: number } | null): string`
    - Corps : `ss=${encodeURIComponent(city)}&dest_type=city` + si center : `&latitude=${center.lat}&longitude=${center.lng}`
  - [x] 1.2 — `apps/web/src/lib/booking-url.test.ts` : mettre a jour les tests :
    - Supprimer les tests postcode/adminArea/country (devenus obsoletes)
    - Ajouter test : ville + center → URL avec ss + dest_type + lat/lng
    - Ajouter test : ville sans center → URL avec ss + dest_type uniquement
    - Garder les tests de base (encoding, caracteres speciaux)

### Phase 2 — Mettre a jour les appelants (AC: #3, #4)

- [x] Task 2 — `SearchOnDropdown` (AC: #3, #4)
  - [x] 2.1 — `apps/web/src/components/shared/search-on-dropdown.tsx` :
    - Changer l'appel : `buildBookingSearchUrl(city, postcode, adminArea, country)` → `buildBookingSearchUrl(city, center)`
    - Supprimer les props `postcode`, `adminArea`, `country` de l'interface `SearchOnDropdownProps`
    - Le fallback `buildBookingCoordUrl(center)` reste inchange quand city est null
  - [x] 2.2 — `apps/web/src/components/shared/search-on-dropdown.test.tsx` : mettre a jour les tests pour refleter la nouvelle signature (plus de postcode/adminArea/country dans les props)

- [x] Task 3 — Mettre a jour les appelants de `SearchOnDropdown`
  - [x] 3.1 — Grep exhaustif `postcode=|adminArea=|country=` dans les fichiers qui utilisent `<SearchOnDropdown>` et supprimer ces props

### Phase 3 — Supprimer le module API `go/` (AC: #6)

- [x] Task 4 — Supprimer le redirect proxy
  - [x] 4.1 — Supprimer le dossier `apps/api/src/go/` (3 fichiers : `go.module.ts`, `go.controller.ts`, `go.controller.test.ts`)
  - [x] 4.2 — `apps/api/src/app.module.ts` : supprimer `GoModule` de l'import et du tableau `imports`

### Phase 4 — Tests & validation (AC: #7)

- [x] Task 5 — Verification complete
  - [x] 5.1 — `pnpm turbo test` : tous les tests passent (982/982)
  - [x] 5.2 — `pnpm turbo lint` : zero erreur (warnings pre-existants uniquement)
  - [ ] 5.3 — Verifier manuellement sur mobile que les liens Booking fonctionnent pour des petits villages

### Review Findings

- [x] [Review][Patch] Entrée obsolète dans `deferred-work.md` référençant `/api/go/booking` supprimé [`_bmad-output/implementation-artifacts/deferred-work.md:71`]
- [x] [Review][Defer] `useReverseCity` retourne encore `postcode/state/country` — dead data non consommée [`apps/web/src/hooks/use-reverse-city.ts`] — deferred, pre-existing
- [x] [Review][Defer] `extractCityFromOsmRawData` retourne encore `postcode` — champ mort [`apps/web/src/lib/booking-url.ts:36-44`] — deferred, pre-existing

## Dev Notes

### Architecture & patterns existants

- **`buildBookingSearchUrl`** : fonction pure dans `apps/web/src/lib/booking-url.ts`. Les stories 16.16, 16.21 et 16.31 avaient progressivement enrichi le `ss=` avec code postal, region et pays. Ce changement simplifie radicalement la fonction — le code postal/region/pays ne sont plus passes car ils cassent l'app mobile Booking.
- **`buildBookingCoordUrl`** : reste inchange — utilise quand il n'y a pas de ville disponible (fallback coordonnees pures).
- **`SearchOnDropdown`** : composant utilise dans la sidebar planning ET les controles live mode. Il recoit actuellement `city`, `postcode`, `adminArea`, `country` en props. Apres ce changement, seuls `city` et `center` sont necessaires.
- **Module API `go/`** : cree dans story 17.9 comme redirect proxy pour contourner Universal Links. Les tests ont montre que ca ne resout pas le probleme — le module est mort et doit etre supprime.

### Pourquoi les coordonnees en complement (pas en remplacement)

Les coordonnees GPS seules (`?latitude=X&longitude=Y&dest_type=latlong`) ne fonctionnent PAS sur l'app mobile Booking. Mais en complement d'un `ss=` avec nom de ville, elles servent de **desambiguateur geographique** — elles remplacent le role que jouaient le code postal + region + pays sur desktop.

### Appelants de `SearchOnDropdown` a verifier

Faire un grep pour trouver tous les fichiers passant `postcode=`, `adminArea=`, `country=` a `SearchOnDropdown` :
```bash
grep -r "SearchOnDropdown" apps/web/src/ --include="*.tsx" -l
grep -r "postcode=" apps/web/src/ --include="*.tsx" -l
```

### Appelants de `buildBookingSearchUrl` a verifier

Le seul appelant est `SearchOnDropdown` (verifie via grep dans cette conversation). Mais faire un grep de confirmation pour s'assurer qu'aucun nouvel usage n'a ete ajoute.

### Impact sur les props des composants parents

Les composants qui passent `postcode`, `adminArea`, `country` a `SearchOnDropdown` feront probablement un appel Geoapify reverse geocoding pour obtenir ces valeurs. Apres cette story, ces appels deviennent **inutiles pour Booking** (mais ils peuvent encore servir pour d'autres usages — verifier avant de supprimer les appels).

### Project Structure Notes

- Fichiers modifies : `booking-url.ts`, `booking-url.test.ts`, `search-on-dropdown.tsx`, `search-on-dropdown.test.tsx`, `app.module.ts`
- Fichiers supprimes : `apps/api/src/go/go.module.ts`, `apps/api/src/go/go.controller.ts`, `apps/api/src/go/go.controller.test.ts`
- Zero nouveau fichier, zero migration DB

### References

- [Source: apps/web/src/lib/booking-url.ts] — buildBookingSearchUrl, buildBookingCoordUrl
- [Source: apps/web/src/components/shared/search-on-dropdown.tsx] — Composant dropdown liens Booking/Airbnb
- [Source: apps/api/src/go/] — Module redirect proxy a supprimer
- [Source: apps/api/src/app.module.ts] — Registre des modules (GoModule a retirer)
- [Source: Story 16.16] — City-based Booking URLs (introduction du ss= avec ville)
- [Source: Story 16.21] — Ajout code postal au ss=
- [Source: Story 16.31] — Ajout region/pays au ss=
- [Source: Story 17.9] — Redirect proxy (a supprimer)
- [Tests manuels Guillaume 2026-04-15] — Validation du format ss=city&dest_type=city&lat&lng sur iOS

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

N/A — implementation straightforward, no debugging needed.

### Completion Notes List

- **Phase 1** : `buildBookingSearchUrl` simplifié — nouvelle signature `(city, center?)`, génère `?ss={city}&dest_type=city&latitude=X&longitude=Y`. Tests mis à jour (9 tests remplacent 16 tests obsolètes postcode/adminArea/country).
- **Phase 2** : `SearchOnDropdown` — props `postcode`, `adminArea`, `country` supprimées. Appel changé vers `buildBookingSearchUrl(city, center)`. 6 fichiers appelants nettoyés (search-range-control, live-controls, live/page, poi-popup, poi-detail-sheet). Destructuring `useReverseCity` simplifié partout (seul `city` est extrait). 4 fichiers test mis à jour (mocks + assertions).
- **Phase 3** : Module `go/` (redirect proxy) supprimé — 3 fichiers + déregistrement `GoModule` de `app.module.ts`.
- **Phase 4** : 982/982 tests passent, 0 erreurs lint.
- **Note** : Task 5.3 (vérification manuelle mobile) reste à faire par Guillaume.

### Change Log

- 2026-04-15: Story 17.10 implémentée — URLs Booking mobile compat (city + coords), suppression module go/

### File List

**Modified:**
- `apps/web/src/lib/booking-url.ts`
- `apps/web/src/lib/booking-url.test.ts`
- `apps/web/src/components/shared/search-on-dropdown.tsx`
- `apps/web/src/components/shared/search-on-dropdown.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-control.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-popup.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx`
- `apps/web/src/app/(app)/live/[id]/page.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`
- `apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx`
- `apps/api/src/app.module.ts`

**Deleted:**
- `apps/api/src/go/go.module.ts`
- `apps/api/src/go/go.controller.ts`
- `apps/api/src/go/go.controller.test.ts`
