# Story 16.30: Ajouter les types Google Places manquants pour hébergements

Status: done

## Story

As a cycliste utilisant Ride'n'Rest,
I want que tous les types d'hébergements référencés par Google Places soient inclus dans les recherches,
so that je ne rate pas des hôtels, motels, gîtes, fermes ou campings disponibles le long de ma trace.

## Contexte & Problème

La doc Google Places (catégorie "Hébergement") liste **20 types**. Notre `LAYER_GOOGLE_TYPES.accommodations` n'en requête que **7**. On s'appuie sur `lodging` comme type parapluie, mais `includedType` dans Text Search ne fait **pas** de match hiérarchique garanti — un établissement typé `hotel` peut ne pas être retourné si on ne requête que `lodging`.

### Types actuels vs manquants

| Type Google | Statut | → PoiCategory |
|---|---|---|
| `lodging` | ✅ déjà présent | hotel (fallback) |
| `campground` | ✅ déjà présent | camp_site |
| `camping_cabin` | ✅ déjà présent | camp_site |
| `bed_and_breakfast` | ✅ déjà présent | guesthouse |
| `guest_house` | ✅ déjà présent | guesthouse |
| `private_guest_room` | ✅ déjà présent | guesthouse |
| `hostel` | ✅ déjà présent | hostel |
| **`hotel`** | ❌ **manquant** | hotel |
| **`motel`** | ❌ **manquant** | hotel |
| **`inn`** | ❌ **manquant** | hotel |
| **`extended_stay_hotel`** | ❌ **manquant** | hotel |
| **`resort_hotel`** | ❌ **manquant** | hotel |
| **`cottage`** | ❌ **manquant** | guesthouse |
| **`farmstay`** | ❌ **manquant** | guesthouse |
| **`rv_park`** | ❌ **manquant** | camp_site |
| **`mobile_home_park`** | ❌ **manquant** | camp_site |
| `budget_japanese_inn` | ⏭️ ignoré (hors scope Europe) | — |
| `japanese_inn` | ⏭️ ignoré (hors scope Europe) | — |

### Impact coût

**$0** — toutes les requêtes utilisent `X-Goog-FieldMask: places.id` (IDs Only tier, illimité, gratuit). On passe de 7 à 16 requêtes parallèles via `Promise.allSettled`, déjà géré.

## Acceptance Criteria

1. `LAYER_GOOGLE_TYPES.accommodations` contient les 16 types listés (hors japonais)
2. `mapGoogleTypesToCategory()` classe correctement les nouveaux types :
   - `hotel`, `motel`, `inn`, `extended_stay_hotel`, `resort_hotel` → `'hotel'`
   - `cottage`, `farmstay` → `'guesthouse'`
   - `rv_park`, `mobile_home_park` → `'camp_site'`
3. `GOOGLE_PLACE_TYPES` (mapping legacy ligne 6-16) est mis à jour en cohérence
4. Les tests unitaires existants passent toujours
5. Nouveaux tests pour `mapGoogleTypesToCategory()` couvrant les types ajoutés
6. Aucune régression sur les recherches existantes (planning + live mode)

## Tasks / Subtasks

- [x] Task 1 — Mettre à jour `LAYER_GOOGLE_TYPES.accommodations` (AC: #1)
  - [x] Ajouter : `hotel`, `motel`, `inn`, `extended_stay_hotel`, `resort_hotel`, `cottage`, `farmstay`, `rv_park`, `mobile_home_park`
- [x] Task 2 — Mettre à jour `mapGoogleTypesToCategory()` (AC: #2)
  - [x] Ajouter `motel`, `inn`, `extended_stay_hotel`, `resort_hotel` dans le check `hotel` (fallback déjà ok mais expliciter)
  - [x] Ajouter `cottage` dans le check `guesthouse` (à côté de `guest_house`, `bed_and_breakfast`, `private_guest_room`, `farmstay`)
  - [x] Ajouter `rv_park`, `mobile_home_park` dans le check `camp_site` (à côté de `campground`, `camping_cabin`)
  - [x] Note : `farmstay` est déjà dans le check guesthouse ligne 55 — vérifier
- [x] Task 3 — Mettre à jour `GOOGLE_PLACE_TYPES` (AC: #3)
  - [x] Ajouter les entrées manquantes dans le mapping legacy (lignes 6-16)
- [x] Task 4 — Tests unitaires (AC: #4, #5)
  - [x] Mettre à jour le test `searchLayerPlaceIds` — le commentaire ligne 103 est obsolète (`['lodging', 'campground']` → maintenant 16 types)
  - [x] Ajouter tests `mapGoogleTypesToCategory()` pour chaque nouveau type
  - [x] Vérifier que les tests existants passent sans modification

### Review Findings
- [x] [Review][Defer] `shelter: ['lodging']` dans `GOOGLE_PLACE_TYPES` — entry morte, `mapGoogleTypesToCategory` ne retourne jamais `'shelter'` [google-places.provider.ts:8] — deferred, pre-existing
- [x] [Review][Defer] 16 requêtes parallèles par recherche accommodations — risque QPS théorique [google-places.provider.ts:19-25] — deferred, prévu par la spec ($0 IDs Only tier)
- [x] [Review][Defer] Test dedup mock seulement 2/16 fetches — coverage partielle [google-places.provider.test.ts:103] — deferred, pre-existing
- [x] [Review][Defer] `GOOGLE_PLACE_TYPES` et `mapGoogleTypesToCategory` — sources de vérité dupliquées, risque de drift — deferred, refacto hors scope
- [x] [Review][Defer] `food` type dans `GOOGLE_PLACE_TYPES.restaurant` mais absent de `LAYER_GOOGLE_TYPES.restaurants` — deferred, pre-existing
- [x] [Review][Defer] `GOOGLE_PLACE_TYPES` exporté mais inutilisé en runtime — dead code documentaire — deferred, cleanup hors scope

## Dev Notes

### Fichier unique impacté

**`apps/api/src/pois/providers/google-places.provider.ts`** — toutes les modifications sont dans ce fichier :

1. **`LAYER_GOOGLE_TYPES`** (ligne 21) — ajouter 9 types au tableau `accommodations`
2. **`mapGoogleTypesToCategory()`** (lignes 45-57) — ajouter les nouveaux types dans les conditions existantes
3. **`GOOGLE_PLACE_TYPES`** (lignes 6-16) — mapping legacy, ajouter les entrées manquantes

### Fichier test

**`apps/api/src/pois/providers/google-places.provider.test.ts`** — ajouter tests pour `mapGoogleTypesToCategory`

### Patterns existants à respecter

- `mapGoogleTypesToCategory()` utilise `types.some()` pour checker chaque catégorie — ajouter les nouveaux types dans les arrays existants
- Le fallback `return 'hotel'` (dernière ligne) couvre déjà les hôtels, mais il vaut mieux être explicite pour `motel`, `inn`, etc. au cas où Google renvoie des types inattendus
- `farmstay` est **déjà** dans le check guesthouse ligne 55 — ne pas le dupliquer

### Ce qu'il ne faut PAS faire

- Ne PAS toucher à `PoiCategory` dans `packages/shared/src/types/poi.types.ts` — les catégories internes (`hotel`, `camp_site`, `guesthouse`, `hostel`, `shelter`) restent inchangées
- Ne PAS toucher à `ACCOMMODATION_SUB_TYPES` dans `apps/web/` — les filtres UI restent identiques
- Ne PAS toucher au composant `AccommodationSubTypes` — les chips Hôtel/Camping/Refuge/Auberge/Chambre d'hôte ne changent pas
- Ne PAS ajouter de nouveaux sous-types UI — les nouveaux types Google se fondent dans les catégories existantes
- Ne PAS modifier `POI_CATEGORY_COLORS` — pas de nouvelles couleurs nécessaires

### Référence doc Google

- [Place Types - Hébergement](https://developers.google.com/maps/documentation/places/web-service/place-types#lodging)

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References

### Completion Notes List
- ✅ `LAYER_GOOGLE_TYPES.accommodations` : 7 → 16 types (ajout de hotel, motel, inn, extended_stay_hotel, resort_hotel, cottage, farmstay, rv_park, mobile_home_park)
- ✅ `mapGoogleTypesToCategory()` : ajout mobile_home_park → camp_site, cottage → guesthouse, check explicite hotel/motel/inn/extended_stay_hotel/resort_hotel/lodging → hotel
- ✅ `GOOGLE_PLACE_TYPES` legacy mapping enrichi : hotel (6 types), guesthouse (5 types), camp_site (4 types), hostel (1 type)
- ✅ 18 nouveaux tests ajoutés (mapGoogleTypesToCategory + LAYER_GOOGLE_TYPES validation)
- ✅ 270/270 tests passent, 0 régression

### Change Log
- 2026-04-08: Story 16.30 implémentée — 9 types Google Places hébergement ajoutés, mapping catégorie mis à jour, 18 tests ajoutés

### File List
- apps/api/src/pois/providers/google-places.provider.ts (modified)
- apps/api/src/pois/providers/google-places.provider.test.ts (modified)
