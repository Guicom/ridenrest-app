---
baseline_commit: d6f610deee0e7ae3ecd305692e60ecc0b4a8f706
---

# Story MOB-4.5 : Deep links de réservation, transparence affiliés & tracking

Status: done

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

- [x] **T1 — `lib/external-links.ts` (builders + openURL)** (AC: 1, 2, 4)
  - [x] Builders web (`apps/web/src/lib/booking-url.ts`) — ⚠️ **divergence vs spec** : déjà portés à l'identique en MOB-4.3 dans `apps/mobile/src/lib/booking-url.ts` (dropdown corridor). Pour ne **pas dupliquer** (règle project-context), `external-links.ts` les **ré-exporte** au lieu de les recréer :
    - `buildBookingSearchUrl(city, center?)` → `https://www.booking.com/searchresults.html?ss={enc(city)}&dest_type=city[&latitude=&longitude=]`
    - `buildBookingCoordUrl(center)` → `…?latitude=&longitude=&dest_type=latlong` (fallback sans ville)
    - `buildAirbnbSearchUrl(center)` → `https://www.airbnb.com/s/homes?ne_lat=&ne_lng=&sw_lat=&sw_lng=` (±0.2° ≈ 22 km)
    - `extractCityFromOsmRawData(rawData)` (addr:city > town > village) — **ajouté** dans `external-links.ts`
  - [x] **Aucun** `aid`/`label`/ID affilié (le web n'en a pas) — documenté en tête de `external-links.ts` (liens de **recherche publics**).
  - [x] `openExternalUrl(url): Promise<{ ok, error? }>` — wrapper `Linking.openURL` avec try/catch → renvoie un statut exploitable par l'UI (jamais de throw). `canOpenURL` omis (toujours `true` pour http(s) ; Android exigerait `<queries>`). `Linking` (RN) déjà présent.

- [x] **T2 — Source de ville (parité web)** (AC: 1, 4)
  - [x] Ordre de résolution ville (parité `poi-popup.tsx:162-166`) : `reverseCity` (via `useReverseCity`) **>** `googleDetails?.locality` (`usePoiGoogleDetails`) **>** `extractCityFromOsmRawData(poi.rawData)` **>** `null`. Résolu **dans `poi-popup.tsx`** (réutilise les hooks d'enrichissement MOB-4.2, aucun nouvel appel) puis passé à `<BookingLinks city>`.
  - [x] `center` = coords du POI (`poi.lng/lat`) pour le fallback latlong + bbox Airbnb.

- [x] **T3 — Composant `components/shared/booking-links.tsx` (slot fiche)** (AC: 1, 2, 3)
  - [x] **UX dropdown — parité web** (`search-on-dropdown.tsx`, variant `action`) : **un seul CTA** « Rechercher sur » (bouton brand vert plein, `bg-primary`) qui **déploie** au press un menu avec les deux entrées **Booking.com** (`#003580`) + **Airbnb** (`#FF5A5F`) — couleurs de marque **inline**. Icône `ExternalLink` + label i18n + **mention « lien partenaire »** (transparence FR-061). _(Correction post-revue Guillaume 2026-06-16 : 1re version affichait les 2 boutons directement → refondu en dropdown pour matcher le web.)_
  - [x] Au press → `trackBookingClick({...})` (dans un try/catch — non bloquant) **puis** `openExternalUrl(url)` (`void … .then` ; l'ouverture ne dépend pas du tracking).
  - [x] Monté **dans `poi-popup.tsx`** (le slot booking de MOB-4.2 vit dans `PoiCard.children`, fiche refondue « liquid glass » — `poi-detail-sheet.tsx` n'existe plus sous ce nom), **uniquement** si `poi.category ∈ accommodations` (gate parité web).
  - [x] A11y : `accessibilityRole="link"` + label explicite (« Rechercher sur Booking.com — lien partenaire »).

- [x] **T4 — Tracking `@ridenrest/analytics`** (AC: 3)
  - [x] `trackBookingClick` importé de `@ridenrest/analytics` (ajouté en dep mobile `workspace:*`). `BookingClickProps = { source; poi_type; page; user_tier }`. Ici `page: 'map'`, `poi_type = poi.category`.
  - [x] `user_tier` dérivé dans `poi-popup.tsx` : `useSession` + `useProfile` → `session ? (profile?.tier ?? 'free') : 'anonymous'`.
  - [x] Transport PostHog RN injecté en **MOB-6.1** via `setAnalyticsClient` — `trackBookingClick` **no-op safe** d'ici là (aucune dép PostHog ajoutée).
  - [x] **RGPD** : aucun GPS/PII dans les props (type/source/page/tier uniquement).

- [x] **T5 — i18n (FR + EN)** (AC: 1, 2, 5)
  - [x] Bloc `pois.booking.*` ajouté (FR + EN, parité) : `searchOn` (label du CTA dropdown), `triggerA11y`, `bookingCom`, `airbnb`, `partnerNotice`, `openFailed`, `bookingA11y`, `airbnbA11y`. _(Pas de `title` autonome — le CTA « Rechercher sur » porte le label, parité web.)_
  - [x] **Zéro chaîne en dur**.

- [x] **T6 — Tests (Jest + RNTL)** (AC: 1, 2, 3, 4)
  - [x] `external-links` (pur) : builders — URLs exactes (parité web), encodage ville, fallback latlong, bbox ±0.2°, **aucun** param affilié ; `openExternalUrl` succès + rejet capturé (pas de throw). (13 tests)
  - [x] `booking-links` : rendu Booking/Airbnb + mention ; press → `trackBookingClick` (bons args) **et** `openExternalUrl` (URL ville / fallback latlong / bbox) ; tracking défaillant n'empêche pas l'ouverture ; échec d'ouverture → message i18n. (7 tests)
  - [x] `poi-popup` : bloc booking **seulement** pour accommodations (gate) ; press Booking → `trackBookingClick` + URL ville (ordre reverseCity). (+3 tests)
  - [x] `trackBookingClick` no-op safe sans client — **déjà couvert** dans `packages/analytics/src/events.test.ts` (pas de duplication).
  - [x] Gate : `test` (379 ✓) | `typecheck` (0 err) | `lint` (0 err) verts + `expo export` iOS OK.

- [ ] **T7 — Validation manuelle (Dev Client)** (AC: 1, 2, 3, 5) — ⏳ **pending Guillaume** (JS-only, **aucun prebuild requis** — `@ridenrest/analytics` est un package JS workspace, `Linking` RN déjà présent)
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

### Review Findings

- [x] [Review][Decision] Mention « lien partenaire » supprimée — Guillaume n'est pas partenaire affilié Booking/Airbnb (liens de recherche publics) ; la mention UI était trompeuse. Supprimée de `booking-links.tsx`, des clés i18n (`partnerNotice`, suffixe `bookingA11y`/`airbnbA11y`) et des tests. [booking-links.tsx, fr.json, en.json]

- [x] [Review][Patch] `open`/`openFailed` non réinitialisés lors du changement de POI — si l'utilisateur switche entre deux hébergements sans fermer le popup, `BookingLinks` reste monté avec l'état `open: true` ou `openFailed: true` du POI précédent. Fix minimal : ajouter `key={poi.id}` sur `<BookingLinks>` dans `poi-popup.tsx` (force le remontage). [apps/mobile/src/components/map/poi-popup.tsx] ✅ appliqué

- [x] [Review][Patch] `city=""` chaîne vide passe le test truthy — `buildBookingSearchUrl("")` produit `?ss=&dest_type=city` (recherche vide sur Booking). `extractCityFromOsmRawData` peut retourner une chaîne vide si un tag OSM existe avec une valeur vide. Fix : normaliser avec `(city || null)` dans l'assignation `bookingCity` de `poi-popup.tsx`. [apps/mobile/src/components/map/poi-popup.tsx:bookingCity] ✅ appliqué

- [x] [Review][Patch] Casts `as string | undefined` non gardés dans `extractCityFromOsmRawData` — une valeur de tag OSM non-string (nombre, objet) est castée sans vérification runtime, pouvant propager une valeur non-string dans `buildBookingSearchUrl`. Fix : `typeof rawData['addr:city'] === 'string' ? rawData['addr:city'] : undefined`. [apps/mobile/src/lib/external-links.ts] ✅ appliqué

- [x] [Review][Patch] Test manquant pour `session=null` → `userTier='anonymous'` dans poi-popup.test — le mock `useSession` retourne toujours un utilisateur connecté ; le chemin non-connecté (tier anonymous) n'est pas couvert dans `poi-popup.test.tsx`. [apps/mobile/src/components/map/poi-popup.test.tsx] ✅ appliqué

- [x] [Review][Defer] `CloudRainIcon` câblé sur l'icône `Copy` au lieu de `CloudRain` [apps/mobile/src/components/ui/icon.tsx] — deferred, pre-existing, pas introduit par MOB-4.5

- [x] [Review][Defer] Race double-pression — deux `Linking.openURL` en vol simultanément [apps/mobile/src/components/shared/booking-links.tsx] — deferred, MVP acceptable, iOS déduplique

- [x] [Review][Defer] `setOpenFailed` setState après démontage [apps/mobile/src/components/shared/booking-links.tsx] — deferred, no-op safe React 19 / RN 0.85 (warning supprimé depuis React 18)

- [x] [Review][Defer] `poi.lat/lng` NaN dans URL builders [apps/mobile/src/components/shared/booking-links.tsx] — deferred, validé en amont par `isValidLngLat` (garde GeoJSON MOB-4.4, pré-existant)

- [x] [Review][Defer] Dropdown `position:absolute` potentiellement clippée par `overflow:hidden` iOS [apps/mobile/src/components/shared/booking-links.tsx] — deferred, approche validée par Guillaume en revue v1.2 ; à confirmer en validation device T7

- [x] [Review][Defer] Pas de test offline explicite pour AC5 [booking-links.test.tsx] — deferred, comportement couvert by design (try/catch `openURL` toujours tenté, tracking try/catch no-op hors ligne)

- [x] [Review][Defer] Double rendu `useProfile` pendant hydratation session [apps/mobile/src/components/map/poi-popup.tsx] — deferred, `user_tier:'free'` transitoire avant résolution profil, documenté dans spec T4, acceptable MVP

<!-- Review Round 2 — 2026-06-27 -->
- [x] [Review][Patch] `getCorridorCenter` re-exporté depuis `external-links.ts` — hors domaine ; la spec T1 liste uniquement `buildBookingSearchUrl`, `buildBookingCoordUrl`, `buildAirbnbSearchUrl`, `extractCityFromOsmRawData` ; `getCorridorCenter` est un utilitaire corridor accidentellement inclus. [apps/mobile/src/lib/external-links.ts] ✅ appliqué

- [x] [Review][Patch] `useProfile` appelé pour tous les types de POI — pour un restaurant ou ravito, le profil est fetché inutilement avant même que `<BookingLinks>` soit monté. Fix : `useProfile(Boolean(session) && isAccommodation)`. [apps/mobile/src/components/map/poi-popup.tsx] ✅ appliqué

- [x] [Review][Patch] `?? null` dead code en fin de chaîne `bookingCity` — `extractCityFromOsmRawData(...).city` retourne déjà `string | null` ; le `?? null` terminal est inopérant. [apps/mobile/src/components/map/poi-popup.tsx] ✅ appliqué

- [x] [Review][Defer] Dropdown sans fermeture au tap extérieur — appuyer ailleurs dans la fiche (hors pin) laisse la dropdown ouverte ; `setOpen(false)` ne se déclenche qu'au re-press du CTA ou au tap d'une entrée. Acceptable MVP. [apps/mobile/src/components/shared/booking-links.tsx] — deferred, pre-existing design, à confirmer T7

## Dev Agent Record

### Agent Model Used

claude-opus-4-8[1m] (bmad-dev-story)

### Debug Log References

- `npx tsc --noEmit` (apps/mobile) → 0 erreur
- `npx eslint` (fichiers modifiés) → 0 issue
- `npx jest` (apps/mobile) → 379 tests verts, 0 échec
- `npx expo export --platform ios` → bundle OK (pas de casse de route)

### Completion Notes List

- **T1** : `external-links.ts` créé. ⚠️ **Divergence vs spec assumée** : les builders Booking/Airbnb existaient déjà à l'identique dans `apps/mobile/src/lib/booking-url.ts` (portés en MOB-4.3 pour le dropdown corridor « Rechercher sur »). Plutôt que de les **recréer** (interdit : duplication, règle project-context), `external-links.ts` les **ré-exporte** et **ajoute** `extractCityFromOsmRawData` + `openExternalUrl`. Aucun ID affilié (parité web : liens de recherche publics).
- **T1** : `openExternalUrl` renvoie `{ ok, error? }` (pas `Promise<void>`) → l'UI peut afficher un message d'échec sans try/catch propre. `canOpenURL` volontairement omis (toujours `true` pour http(s) ; sur Android nécessiterait des `<queries>` manifeste — le try/catch sur `openURL` est le chemin robuste).
- **T2** : résolution ville (`reverseCity > Google locality > OSM > null`) faite **dans `poi-popup.tsx`** (réutilise `useReverseCity`/`usePoiGoogleDetails` MOB-4.2, aucun appel réseau supplémentaire), passée en prop `city` à `<BookingLinks>` (composant volontairement **pur** — pas de hook réseau → testable sans QueryClientProvider).
- **T3** : ⚠️ **Le slot booking de MOB-4.2 vit dans `PoiCard.children`**, pas dans un `poi-detail-sheet.tsx` (la fiche a été refondue en popin « liquid glass » `poi-popup.tsx` + `poi-card.tsx` en MOB-4.2 ; `poi-detail-sheet.tsx` n'existe pas). `<BookingLinks>` est monté comme `children` de `<PoiCard>`, gaté `isAccommodation`.
- **T4** : `@ridenrest/analytics` ajouté en dep mobile (`workspace:*`). Tier dérivé via `useSession` + `useProfile` (existant). `trackBookingClick` enveloppé dans un try/catch → un client analytics défaillant n'empêche jamais l'ouverture du lien (AC3). No-op safe tant que PostHog RN n'est pas injecté (MOB-6.1).
- **T6** : « no-op safe sans client » déjà couvert dans `packages/analytics/src/events.test.ts` → pas de test dupliqué côté mobile.
- **T7** : validation device manuelle laissée à Guillaume. **Aucun `expo prebuild` requis** : pas de nouveau module natif (analytics = package JS workspace ; `Linking` RN déjà dispo). Un simple `expo start` sur le Dev Client existant suffit.

### File List

**Ajouts :**
- `apps/mobile/src/lib/external-links.ts`
- `apps/mobile/src/lib/external-links.test.ts`
- `apps/mobile/src/components/shared/booking-links.tsx`
- `apps/mobile/src/components/shared/booking-links.test.tsx`

**Modifs :**
- `apps/mobile/src/components/map/poi-popup.tsx` (montage `<BookingLinks>` dans le slot `PoiCard.children`, accommodations only ; résolution ville ; dérivation `user_tier`)
- `apps/mobile/src/components/map/poi-popup.test.tsx` (mocks session/profil/analytics + tests gate booking & tracking)
- `apps/mobile/src/components/shared/poi-card.tsx` — _inchangé_ (le slot `children` existait déjà depuis MOB-4.2)
- `apps/mobile/src/components/ui/icon.tsx` (ajout `ExternalLinkIcon`)
- `apps/mobile/src/lib/i18n/locales/fr.json` + `en.json` (bloc `pois.booking.*`)
- `apps/mobile/package.json` (dep `@ridenrest/analytics: workspace:*`)
- `pnpm-lock.yaml` (lockfile)

## Change Log

| Date | Version | Description | Auteur |
|---|---|---|---|
| 2026-06-16 | 1.2 | Ajustements UX post-revue Guillaume : (1) re-clic sur « Rechercher sur » **referme** la dropdown (toggle — test de régression ajouté) ; (2) menu de la dropdown en **`position: absolute`** au-dessus du CTA (`bottom: 44+6`, `bg-card` opaque + liseré + ombre, z-50) → la fiche **ne s'agrandit plus** à l'ouverture (parité web `bottom-full`). 381 tests verts, tsc/lint/expo export OK. | bmad-dev-story (Amelia) |
| 2026-06-16 | 1.1 | Correction post-revue Guillaume : CTA refondu en **dropdown** « Rechercher sur » (un seul bouton brand qui déploie Booking + Airbnb) — parité web `search-on-dropdown.tsx` variant `action` (1re version affichait les 2 boutons directement). i18n : `title` → `searchOn` + `triggerA11y`. Tests adaptés (pattern dropdown + flush async React 19 sur `fireEvent.press`). 380 tests verts, tsc/lint/expo export OK. | bmad-dev-story (Amelia) |
| 2026-06-16 | 1.0 | Implémentation MOB-4.5 (T1–T6) : `external-links.ts` (ré-export builders + `extractCityFromOsmRawData` + `openExternalUrl`), composant `booking-links.tsx` (Booking #003580 / Airbnb #FF5A5F, mention partenaire, `accessibilityRole="link"`), montage dans `poi-popup.tsx` (slot `PoiCard.children`, accommodations only, résolution ville reverseCity>Google>OSM, tier via session/profil), tracking `booking_click` non bloquant (no-op safe avant MOB-6.1), i18n FR/EN, `ExternalLinkIcon`, dep `@ridenrest/analytics`. 20 tests ajoutés (379 verts), tsc/lint/expo export OK. T7 (device) pending Guillaume — pas de prebuild requis. Status → review. | bmad-dev-story (Amelia) |
| 2026-06-13 | 0.1 | Création story MOB-4.5 (ready-for-dev) — deep links **Booking.com + Airbnb** (parité builder web, **sans ID affilié** — divergence epic Hotels.com/affiliés documentée), `openExternalUrl` via `Linking.openURL`, composant `booking-links` (accommodations only, mention partenaire, couleurs marque inline), tracking `booking_click` via `@ridenrest/analytics` (no-op safe avant MOB-6.1), source ville réutilisée (reverseCity>google>osm). i18n FR/EN, tests. | bmad-create-story (Story Context Engineer) |
