# Story MOB-4.5 : Deep links de réservation, transparence affiliés & tracking

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur**,
I want **ouvrir un lien de réservation depuis une fiche hébergement**,
So that **je réserve rapidement, en sachant qu'il s'agit d'un lien affilié**.

> **Dépend de MOB-4.2** (fiche détail POI `poi-detail-sheet.tsx` avec **slot booking** prévu). Cette story remplit ce slot : un composant `booking-links` (deep links Booking.com / Airbnb), ouverture via `Linking.openURL`, identification visuelle « lien affilié », et **tracking analytics** du clic.
>
> ⚠️ **Divergences avec l'AC d'epic (à valider — voir Open Questions)** :
> - L'epic cite **Hotels.com**. L'implémentation **web réelle n'utilise PAS Hotels.com** — seulement **Booking.com** et **Airbnb**. → On porte le comportement **réel** (Booking + Airbnb).
> - L'epic dit « identifiés comme **liens affiliés** ». Le builder web **n'ajoute AUCUN identifiant affilié** (`aid`/`label`/env var) — ce sont des **liens de recherche publics**. La « transparence affiliés » (FR-061) est donc, au mieux, une **mention UI** (« lien partenaire ») sans monétisation réelle aujourd'hui. → Implémenter la **mention** + le tracking ; ne pas inventer d'ID affilié.
>
> **Tracking** : événement `booking_click` via **`@ridenrest/analytics`** (`trackBookingClick`). Le **transport mobile (PostHog RN)** est injecté en **MOB-6.1** (`setAnalyticsClient`) — l'appel reste **sans effet (no-op safe)** tant que le client n'est pas injecté. Émettre quand même (forward-compatible).

## Acceptance Criteria

1. **Given** une fiche **hébergement** (POI dont la catégorie ∈ `LAYER_CATEGORIES.accommodations`)
   **When** je consulte ses liens
   **Then** des **deep links de recherche paramétrés** vers **Booking.com** et **Airbnb** sont présents (FR-033, FR-060), construits depuis la ville/coordonnées du POI (parité builder web)
   **And** ils sont **identifiés visuellement** comme liens partenaires/affiliés (mention + couleurs de marque Booking `#003580`, Airbnb `#FF5A5F`) (FR-061)
   **And** le bloc n'apparaît **que** pour les hébergements (jamais sur restaurant/ravito/vélo)

2. **Given** un lien de réservation
   **When** je tape dessus
   **Then** il s'ouvre via **`Linking.openURL`** (app native si installée, sinon navigateur système) (FR-060)
   **And** un échec d'ouverture (`Linking.openURL` rejette / `canOpenURL` false) est géré proprement (message i18n, jamais de crash)

3. **Given** un clic sur un lien de réservation
   **When** il est déclenché
   **Then** un événement analytics `booking_click` est tracé via `@ridenrest/analytics` `trackBookingClick({ source, poi_type, page: 'map', user_tier })` (FR-062)
   **And** **aucune PII / GPS** n'est envoyée (RGPD — seuls type de POI, source, page, tier) ; le tracking **ne bloque jamais** l'ouverture du lien

4. **Given** une ville du POI résolvable
   **When** la fiche est affichée
   **Then** le lien Booking utilise la **ville** (`?ss={ville}&dest_type=city`), avec fallback **coordonnées** (`latitude/longitude&dest_type=latlong`) si pas de ville ; Airbnb utilise un **bbox** autour du POI (±0.2°) (parité builder web)

5. **Given** la fiche ouverte hors-ligne
   **When** je tape un lien
   **Then** `Linking.openURL` est tenté (le système ouvrira le navigateur/app qui gérera l'absence de réseau) ; le tracking est simplement omis/différé sans erreur

## Tasks / Subtasks

- [ ] **T1 — `lib/external-links.ts` (builders + openURL)** (AC: 1, 2, 4)
  - [ ] Porter les builders web (`apps/web/src/lib/booking-url.ts`) — **web-only, à reproduire** (pas dans `packages/*`) :
    - `buildBookingSearchUrl(city, center?)` → `https://www.booking.com/searchresults.html?ss={enc(city)}&dest_type=city[&latitude=&longitude=]`
    - `buildBookingCoordUrl(center)` → `…?latitude=&longitude=&dest_type=latlong` (fallback sans ville)
    - `buildAirbnbSearchUrl(center)` → `https://www.airbnb.com/s/homes?ne_lat=&ne_lng=&sw_lat=&sw_lng=` (±0.2° ≈ 22 km)
    - `extractCityFromOsmRawData(rawData)` (addr:city > town > village)
  - [ ] **Reproduire à l'identique** : aucun `aid`/`label`/ID affilié (le web n'en a pas). Documenter dans le code que ce sont des liens de **recherche publics**.
  - [ ] `openExternalUrl(url): Promise<void>` — wrapper `Linking.openURL` (+ `canOpenURL` optionnel) avec try/catch → renvoie un statut/erreur exploitable par l'UI (jamais de throw non géré). `expo-linking` est **déjà présent** (`Linking` RN ou `expo-linking`).

- [ ] **T2 — Source de ville (parité web)** (AC: 1, 4)
  - [ ] Ordre de résolution ville (parité `poi-popup.tsx:162-166`) : `reverseCity` (Geoapify via `useReverseCity`, MOB-4.2) **>** `googleDetails?.locality` (`usePoiGoogleDetails`, MOB-4.2) **>** `extractCityFromOsmRawData(poi.rawData)` **>** `null`. Réutiliser les hooks d'enrichissement de MOB-4.2 (pas de nouvel appel).
  - [ ] `center` = coords du POI (`poi.lng/lat`) pour le fallback latlong + bbox Airbnb.

- [ ] **T3 — Composant `components/shared/booking-links.tsx` (slot fiche)** (AC: 1, 2, 3)
  - [ ] Deux entrées : **Booking.com** (`#003580`) + **Airbnb** (`#FF5A5F`) — couleurs de marque **inline**. Icône/label i18n + **mention « lien partenaire »** (transparence FR-061).
  - [ ] Au press → `trackBookingClick({...})` **puis** `openExternalUrl(url)` (tracking non bloquant : émettre sans `await` bloquant, ou `Promise.resolve().then` ; l'ouverture ne dépend pas du tracking).
  - [ ] Monté **dans `poi-detail-sheet.tsx`** (slot MOB-4.2), **uniquement** si `poi.category ∈ accommodations` (gate parité web).
  - [ ] A11y : `accessibilityRole="link"` + label explicite (« Rechercher sur Booking.com — lien partenaire »).

- [ ] **T4 — Tracking `@ridenrest/analytics`** (AC: 3)
  - [ ] Importer `trackBookingClick` de `@ridenrest/analytics` (vendor-agnostic). `BookingClickProps = { source: 'booking.com'|'airbnb'; poi_type: string; page: 'map'|'live'; user_tier: 'free'|'pro'|'team'|'anonymous' }`. Ici `page: 'map'`.
  - [ ] `user_tier` : dériver de la session (`useSession`) — `session ? (profile.tier ?? 'free') : 'anonymous'`. Au MVP mobile, si le tier n'est pas dispo, `'free'` (connecté) / `'anonymous'`.
  - [ ] **Le transport (PostHog RN) est injecté en MOB-6.1** via `setAnalyticsClient` — `trackBookingClick` est **no-op safe** sans client. Documenter : émettre dès maintenant (forward-compatible), pas de dép PostHog ajoutée ici.
  - [ ] **RGPD** : aucun GPS/PII dans les props (type/source/page/tier uniquement).

- [ ] **T5 — i18n (FR + EN)** (AC: 1, 2, 5)
  - [ ] Bloc `pois.booking.*` (parité) :
    - `pois.booking.title` (« Réserver à proximité »)
    - `pois.booking.bookingCom` / `pois.booking.airbnb` (labels)
    - `pois.booking.partnerNotice` (« Lien partenaire »)
    - `pois.booking.openFailed` (« Impossible d'ouvrir le lien »)
    - labels a11y `pois.booking.bookingA11y` / `airbnbA11y`
  - [ ] **Zéro chaîne en dur**.

- [ ] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4)
  - [ ] `external-links` (pur) : `buildBookingSearchUrl`/`buildBookingCoordUrl`/`buildAirbnbSearchUrl`/`extractCityFromOsmRawData` — URLs exactes (parité web), encodage ville, fallback latlong, bbox ±0.2°. **Aucun** param affilié.
  - [ ] `openExternalUrl` : `Linking.openURL` appelé ; rejet géré (pas de throw) → statut erreur. (mock `Linking`/`expo-linking`)
  - [ ] `booking-links` : rendu **seulement** pour accommodations ; press → `trackBookingClick` avec bons args **et** `openExternalUrl` ; ordre ville (reverseCity > google > osm) ; tracking n'empêche pas l'ouverture (mock analytics). (`userEvent`)
  - [ ] `trackBookingClick` no-op safe sans client (smoke).
  - [ ] Gate : `test|typecheck|lint` verts + `expo export` OK.

- [ ] **T7 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 5) — ⏳ build Dev Client
  - [ ] Fiche hébergement → bloc Booking + Airbnb (couleurs marque, mention partenaire). Restaurant/ravito → pas de bloc.
  - [ ] Tap Booking → ouvre l'app/navigateur sur la recherche (ville si dispo, sinon coords). Tap Airbnb → recherche bbox.
  - [ ] (MOB-6.1) une fois PostHog branché : vérifier l'événement `booking_click`. Hors-ligne → l'OS gère, pas de crash.

## Dev Notes

### Réalité d'implémentation (web) — divergences avec l'epic

- **Builders** (`apps/web/src/lib/booking-url.ts`, **web-only à reproduire**) :
  - `buildBookingSearchUrl(city, center?)` (`:24-28`), `buildBookingCoordUrl(center)` (`:48-50`), `buildAirbnbSearchUrl(center)` (`:53-56`, ±0.2°), `getCorridorCenter`/`extractCityFromOsmRawData` (`:7-22,:34-45`).
  - **Aucun ID affilié nulle part** (`aid`/`label`/env var absents) — liens de recherche **publics**. [Source: apps/web/src/lib/booking-url.ts]
  - **Hotels.com NON utilisé** (malgré le commentaire `Poi.bookingUrl`) — seulement **Booking.com + Airbnb**.
  - Les enrichissements 16-21 (code postal) / 16-31 (région/pays) **ne sont PAS shippés** dans le builder live (ville seule). [Source: rapport agent web §E]
- **Source ville** (popup web) : `reverseCity (Geoapify) ?? googleDetails.locality ?? osm.city ?? null`. [Source: apps/web/.../poi-popup.tsx:162-166]
- **UI/tracking** (`search-on-dropdown.tsx`) : `<a target="_blank" rel="noopener noreferrer">` × 2 ; couleurs Booking `#003580`, Airbnb `#FF5A5F` ; au clic `trackBookingClick({ source, poi_type, page, user_tier })`. Rendu **accommodations only** (`poi-popup.tsx:498-509`). [Source: apps/web/src/components/shared/search-on-dropdown.tsx:102,117]

### Tracking analytics (`@ridenrest/analytics`)

- `trackBookingClick(props: BookingClickProps)` → événement `'booking_click'` ; `BookingClickProps = { source:'booking.com'|'airbnb'; poi_type:string; page:'map'|'live'; user_tier:'free'|'pro'|'team'|'anonymous' }`. [Source: packages/analytics/src/events.ts:33 ; types.ts:36-41]
- Le package est **vendor-agnostic** : transport injecté via `setAnalyticsClient(client)`. Le **client PostHog RN** est branché en **MOB-6.1** — d'ici là, `trackBookingClick` est **no-op safe**. [Source: packages/analytics/src/client.ts:11 ; architecture-mobile.md#L828]
- **RGPD** : jamais de GPS/PII ; ids d'aventure hashés côté package. [Source: packages/analytics/src/events.ts:24]

### Réutilisation du code mobile existant

- **MOB-4.2** : `poi-detail-sheet.tsx` (slot booking), `usePoiGoogleDetails`, `useReverseCity`, type `Poi`, `LAYER_CATEGORIES.accommodations` (gate hébergement).
- `expo-linking` **déjà présent** (`Linking.openURL`). `@ridenrest/analytics` workspace package (vérifier qu'il est en dep mobile ; sinon `workspace:*`).
- `src/lib/auth/client` (`useSession`) pour `user_tier`. `src/components/ui/button.tsx`, `src/lib/cn.ts`, `src/lib/i18n`.

### Conventions

- Couleurs de marque (Booking/Airbnb) = **inline** (pas Tailwind JIT).
- Erreur d'ouverture → message i18n inline (jamais `Alert.alert` pour une erreur ; un toast/inline OK). Tracking non bloquant.
- Tests hors `src/app/`, `userEvent`, mocks sans JSX. i18n FR/EN parité.

### Project Structure Notes

**Ajouts** :
```
apps/mobile/src/lib/external-links.ts
apps/mobile/src/components/shared/booking-links.tsx
+ tests co-localisés (external-links, booking-links)
```
**Modifs** :
```
apps/mobile/src/components/map/poi-detail-sheet.tsx   (monter <BookingLinks> dans le slot, accommodations only)
apps/mobile/src/lib/i18n/locales/fr.json + en.json    (bloc pois.booking.*)
apps/mobile/package.json (?)                          (si @ridenrest/analytics pas encore en dep)
```
**Aucune** migration DB / modif serveur.

### Frontière de story

- **Inclus** : builders Booking/Airbnb (parité web, sans ID affilié), `openExternalUrl`, composant `booking-links` (accommodations only, mention partenaire, couleurs marque), tracking `booking_click` (no-op safe avant MOB-6.1), source ville réutilisée, i18n, tests.
- **Exclu** : Hotels.com (non utilisé web) ; IDs affiliés réels (n'existent pas) ; injection PostHog RN → **MOB-6.1** ; fiche détail de base + enrichissement (MOB-4.2) ; accès POI (MOB-4.6).

### Open Questions (à trancher — divergences epic vs réalité)

1. **Hotels.com** : l'epic le cite mais le web ne l'implémente pas. → Confirmer qu'on **ne** l'ajoute **pas** (porter Booking + Airbnb comme le web). _(Recommandation : ne pas ajouter Hotels.com.)_
2. **Transparence affiliés (FR-061)** : sans ID affilié réel, la « transparence » se réduit à une **mention UI** (« lien partenaire »). → Confirmer ce niveau, ou décider d'intégrer un vrai programme affilié (hors périmètre mobile, dépendrait du web `booking-url.ts`).

### References

- [Source: epics-mobile.md#Story MOB-4.5 (l.792-808)] — AC d'origine (FR-033, FR-060, FR-061, FR-062) — **cite Hotels.com + liens affiliés (divergence)**
- [Source: apps/web/src/lib/booking-url.ts:7-56] — builders Booking/Airbnb (pas d'ID affilié)
- [Source: apps/web/src/components/shared/search-on-dropdown.tsx:102,117] — couleurs marque + `trackBookingClick`
- [Source: apps/web/.../poi-popup.tsx:162-166,498-509] — source ville + gate accommodations
- [Source: packages/analytics/src/events.ts:33 ; types.ts:36-41 ; client.ts:11] — `trackBookingClick`, `BookingClickProps`, `setAnalyticsClient`
- [Source: architecture-mobile.md#L825,#L828,#L42,#L1191] — `lib/external-links.ts`, `Linking.openURL`, deep links + PostHog
- [Source: _bmad-output/implementation-artifacts/MOB-4-2-poi-layers-pins-clusters-detail-sheet.md] — fiche détail + slot + enrichissement (dépendance)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-13 | 0.1 | Création story MOB-4.5 (ready-for-dev) — deep links **Booking.com + Airbnb** (parité builder web, **sans ID affilié** — divergence epic Hotels.com/affiliés documentée), `openExternalUrl` via `Linking.openURL`, composant `booking-links` (accommodations only, mention partenaire, couleurs marque inline), tracking `booking_click` via `@ridenrest/analytics` (no-op safe avant MOB-6.1), source ville réutilisée (reverseCity>google>osm). i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
