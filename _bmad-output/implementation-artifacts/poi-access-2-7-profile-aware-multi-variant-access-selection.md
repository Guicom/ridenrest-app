---
baseline_commit: 1bc6a5d4cac39613b5d676299ba1eb7679ebade8
---

# Story POI-Access 2.7 : Itinéraires d'accès multiples profil-aware + choix utilisateur

Status: done

> **Origine (2026-05-31).** Story réactive, née de deux constats en test sur le terrain (Guillaume) :
> 1. **Pertinence du point d'entrée.** Avec le profil `fastbike`, l'accès calculé prenait un raccourci par pistes (17,5 km / 1h10) au lieu de la N-234, alors qu'on s'attendait à la nationale. Cause : le point d'entrée sur la trace était choisi **purement géométriquement** (`ST_ClosestPoint`) *avant* tout routage → le profil n'influençait jamais **où** on rejoint la trace.
> 2. **« Itinéraire d'accès indisponible » sur certains POI.** Symptôme d'un **bug bloquant** introduit pendant la 1ʳᵉ itération (cf. AC7) : tous les accès en calcul frais tombaient en erreur.
>
> Décision produit (Guillaume) : plutôt que de parier sur une auto-sélection parfaite, **exposer plusieurs itinéraires candidats et laisser l'utilisateur choisir**. S'applique **identiquement en mode Planning ET Live** (pas de différence demandée).

<!-- Successeur des stories 2.2 (AccessCalculatorService), 2.4 (AccessMetrics), 2.5 (AccessMapLayer). -->

---

## Story

As a **cyclo-voyageur consultant un hébergement sur la carte**,
I want **voir plusieurs itinéraires d'accès possibles depuis ma trace et pouvoir en choisir un**,
so that **je ne dépende pas d'une auto-sélection imparfaite et puisse retenir l'entrée la plus pertinente pour mon profil/terrain (ex. rejoindre une nationale en `fastbike` plutôt qu'un raccourci par pistes)**.

## Acceptance Criteria

1. **Sélection profil-aware du point d'entrée.** Le serveur ne se limite plus au point de trace le plus proche à vol d'oiseau : il génère plusieurs points d'entrée candidats **étalés** le long de la portion de trace proche du POI, route chacun avec le profil, et **trie par coût réel** (temps BRouter `total-time`, profil-aware).
2. **Variantes exposées.** La réponse `POST /pois/:id/access` (status `ok`) renvoie `variants: AccessVariant[]` (≥ 1, triées meilleur-d'abord). `variants[0]` = champs top-level (rétro-compatible). Chaque variante : `entryPoint [lon,lat]`, `distanceM`, `elevationGainM`, `elevationLossM`, `etaS`, `geometry`.
3. **Persistance.** Les variantes sont stockées (`accommodations_cache.access_variants` jsonb) et restituées au cache-hit, sans recalcul. Bump `ACCESS_ENGINE_VERSION` → recalcul lazy peuplant la colonne.
4. **Choix utilisateur (UI).** Le popup POI hébergement affiche un sélecteur « ITINÉRAIRES » (une cellule cliquable par variante : distance + ETA, la sélectionnée en carte ambre). Sélection synchronisée carte ↔ liste.
5. **Carte multi-tracés.** `AccessMapLayer` dessine la variante sélectionnée en ambre gras + les autres en **fantômes gris cliquables** (clic carte = sélection, pattern Google Maps).
6. **Parité Planning / Live.** Le même comportement s'applique aux deux modes (composants `PoiPopup` + `AccessMapLayer` mutualisés ; état de sélection câblé dans `map-view.tsx` et `live/[id]/page.tsx`).
7. **Régression corrigée.** Le crash SQL « window function calls cannot be nested » (génération des candidats) qui faisait tomber **tous** les calculs frais en HTTP 500 (→ « Itinéraire d'accès indisponible ») est corrigé et couvert par validation sur base réelle.

## Tasks / Subtasks

- [x] **Génération des candidats** (AC1, AC7)
  - [x] `resolveOriginCandidates` + `closestPointsOnTrace` (`resolve-origin.ts`) : découpage **positionnel** (`ntile`) de la portion de trace ≤ rayon, point le plus proche par tranche → candidats étalés
  - [x] Correction du modèle « passage contigu » (collapsait à 1 candidat pour ~95 % des POI à grand rayon) → `ntile` par position
  - [x] **Fix** : séparation `LAG`/`SUM` en deux CTE (Postgres interdit l'imbrication de window functions) — cause du crash AC7
  - [x] Dédoublonnage spatial (≥ 250 m) pour éviter des appels BRouter redondants
  - [x] Config `ACCESS_CANDIDATE_RADIUS_M` (10 km) + `ACCESS_MAX_CANDIDATES` (4)
- [x] **Routing & ranking** (AC1, AC2)
  - [x] `routing.service.ts` : parse `total-time` → `BrouterRoute.timeS`
  - [x] `routeBestCandidate` → `routeAndRankCandidates` : route tous les candidats en parallèle (`allSettled`), `computeDivergentSegment` par variante, tri par coût (timeS → distance)
- [x] **Contrat & persistance** (AC2, AC3)
  - [x] `AccessVariantSchema` + champ `variants` dans `AccessResponseSchema` (shared) + re-export index
  - [x] Migration `0018_access_variants` (colonne jsonb) + schéma drizzle
  - [x] `updateCache` écrit `access_variants` ; cache-hit lit/valide via `parseVariants` (garde-fou ligne pré-multicand → recalcul)
  - [x] Reset profil (`access-worker.repository`) nettoie aussi `access_variants`
  - [x] Bump `ACCESS_ENGINE_VERSION` → `+multicand`
- [x] **UI sélection** (AC4, AC5, AC6)
  - [x] `AccessMapLayer` repensé multi-variantes (source unique, layers ghost + selected, clic fantôme → `onSelect`, robustesse style-reload/teardown conservée)
  - [x] `AccessMetrics` : variante active + `VariantSelector` (chips cliquables, design « ITINÉRAIRES », affordance tap mobile)
  - [x] État `selectedVariantIndex` remonté dans `map-view.tsx` (Planning) et `live/[id]/page.tsx` (Live), passé à `PoiPopup` + `AccessMapLayer`/`LiveAccessPolyline`, reset au changement de POI
- [x] **Tests** : shared (variants requis), service (variants renvoyées/persistées/cache-hit, ranking, résilience), `AccessMapLayer` (multi + clic), `AccessMetrics` (sélecteur), `LiveAccessPolyline`, `useAccess`
- [x] **Validation base réelle** : SQL candidats (50 aventures, 0 erreur) + `updateCache` (rollback, contrainte `check` OK)

## Dev Notes

- **Cœur de l'approche.** Le point d'entrée optimal dépend du réseau routier *via le profil*, pas seulement de la distance euclidienne. On échantillonne donc plusieurs entrées et on laisse BRouter (et l'utilisateur) trancher. `ntile` par position (et non par « passage contigu ») garantit l'étalement même quand la trace reste continûment dans le rayon.
- **Coût.** Jusqu'à `maxCandidates` (4) appels BRouter par calcul **frais** (en parallèle, dédoublonnés), uniquement sur cache-miss, puis mis en cache. Le worker eager hérite via `compute()`.
- **Rétro-compatibilité.** `variants[0]` ≡ champs top-level / colonnes `access_*` legacy → aucun consommateur existant cassé. `variants` est requis (`min(1)`) côté schéma ; le serveur le garantit (le court-circuit « POI sur la trace » renvoie une variante dégénérée unique).
- **Parité Live/Planning gratuite** : le popup Live réutilise déjà `PoiPopup`, et `LiveAccessPolyline` enveloppe `AccessMapLayer` → étendre les composants partagés suffit ; seul l'état de sélection est câblé par page.
- **Sélection éphémère** (état UI, reset au changement de POI) — pas de persistance par utilisateur (hors scope retenu).

### Project Structure Notes

- API : module `pois/access-calculator` (calc + stratégies + types), `routing` (wrapper BRouter), `config/access.config.ts`, `pois/access-worker` (reset).
- Web : composants partagés `components/poi-access/*` (montés par `map/[id]` Planning et `live/[id]` Live via `PoiPopup` + `AccessMapLayer`/`LiveAccessPolyline`).
- DB : `packages/database` (schéma + migration drizzle) ; contrat : `packages/shared/schemas/poi-access.ts`.

### References

- Architecture : [Source: _bmad-output/planning-artifacts/architecture-poi-access-routing.md]
- Stories prédécesseurs : 2.2 (calculator), 2.4 (AccessMetrics), 2.5 (AccessMapLayer), 2.6 (profil de routage).
- Pivot `nearest-trace` (2026-05-30) : origine unique Planning+Live, base de cette story.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.8 (1M context)

### Debug Log References

- Crash candidats : `ERROR: window function calls cannot be nested` (reproduit sur base locale, POI « Peña la Bellota ») → fix séparation `LAG`/`SUM` en CTE `edges`/`grouped` puis bascule vers `ntile`.
- Distribution candidats (200 POI) : modèle « passage contigu » = 1 candidat pour 191/200 ; `ntile` = étalement effectif (validé sur l'aventure « Refugio de La Dehesa »).

### Completion Notes List

- Backend : 404 tests unitaires verts (suite API). Web : 50 (poi-access) + 70 (popup/live) + 30 (sheet) + 13 (shared) verts. `tsc` + `eslint` clean sur les fichiers touchés.
- Validation base réelle : SQL candidats 0 erreur / 50 aventures ; `updateCache` (2 variantes jsonb + géométrie + contrainte `check`) en transaction rollback.
- Migration `0018` générée + appliquée en local. **Non encore commité ni déployé** au moment de la rédaction.
- Suivi UX possible : masquer la rangée stats du haut quand le sélecteur est visible (redondance) ; harmoniser le format distance des cellules (`compactDistance` + suffixe ` km`) pour le cas sub-kilomètre.

### File List

**API**
- apps/api/src/config/access.config.ts
- apps/api/src/routing/routing.types.ts
- apps/api/src/routing/routing.service.ts (+ .spec)
- apps/api/src/pois/access-calculator/types/access-result.types.ts
- apps/api/src/pois/access-calculator/strategies/resolve-origin.ts (+ .spec)
- apps/api/src/pois/access-calculator/access-calculator.service.ts (+ .spec)
- apps/api/src/pois/access-worker/access-worker.repository.ts
- apps/api/src/pois/pois.controller.access.spec.ts

**Shared**
- packages/shared/src/schemas/poi-access.ts (+ .test)
- packages/shared/src/index.ts

**Database**
- packages/database/src/schema/accommodations-cache.ts
- packages/database/migrations/0018_access_variants.sql
- packages/database/migrations/meta/0018_snapshot.json, _journal.json

**Web**
- apps/web/src/components/poi-access/AccessMapLayer.tsx (+ .test)
- apps/web/src/components/poi-access/AccessMetrics.tsx (+ .test)
- apps/web/src/components/poi-access/LiveAccessPolyline.tsx (+ .test)
- apps/web/src/components/poi-access/useAccess.test.ts
- apps/web/src/app/(app)/map/[id]/_components/map-view.tsx
- apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx
- apps/web/src/app/(app)/live/[id]/page.tsx
