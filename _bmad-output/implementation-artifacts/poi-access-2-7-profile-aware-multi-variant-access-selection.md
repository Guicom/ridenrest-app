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

---

## Itérations post-merge (2026-05-31, suite test terrain prod — PR #5)

> Après mise en prod du lot initial (PR #4), les tests de Guillaume sur le **Refugio de La Dehesa**
> (Hortigüela, profil `road`) ont révélé que la feature « fonctionnait » mais donnait de mauvais
> résultats. Enquête approfondie (BRouter réel + base locale) → la cause n'était **ni** les
> candidats **ni** un bug de calcul, mais le **modèle de coût du profil**. D'où une refonte de
> l'approche, livrée en **PR #5**.

### Diagnostic (preuves)

- **Doublons.** Deux variantes affichées « 17,5 km · ~1h10 » identiques. Vérifié en base :
  géométries **byte-identiques** (mêmes distance/D+/D-), seul `etaS` différait. Cause : deux
  points d'entrée distincts SUR la trace donnent le **même segment divergent** (le tronçon POI→trace
  est identique ; seule la portion parcourue *sur* la trace, exclue du tracé, diffère). Le
  dédoublonnage initial comparait `etaS` (qui inclut la portion on-trace) → ne fusionnait pas.
- **« Pas par la N-234 ».** Mesuré sur BRouter le même trajet trace→POI selon le profil :
  `fastbike` = 17 454 m · `trekking` = 14 052 m · `gravel` = 23 621 m. Depuis le meilleur point
  d'entrée : `fastbike` = 21 km vs `trekking` = 10,3 km. → **`fastbike` ÉVITE délibérément les
  routes nationales** (OSM `highway=trunk`, ex. N-234) pour la sécurité cycliste, et préférait un
  long détour par pistes. `trekking` les emprunte (comme le vélo Google Maps : 8 km pour ce POI).
- **Limite physique.** L'accès *depuis la trace* reste ~10 km (pas 7 km) : la trace passe de l'autre
  côté du Río Arlanza ; le point le plus proche est à 2,3 km au sud de Cascajares, rive opposée.

### Décisions produit (Guillaume)

- **Suppression du choix de profil de routage** (gravel/fastbike/bikepacking). L'app est indicative
  (pas un GPS) ; pour rejoindre un hébergement on veut le **chemin le plus court, nationales
  autorisées**. → profil d'accès UNIQUE `trekking`.
- **Indicateur danger** : signaler les variantes qui empruntent une **nationale** (`highway=trunk`
  uniquement) par une **icône rouge ⚠️**, laissant le cycliste choisir son risque.
- **Multi-variantes conservé** : l'utilisateur voit p. ex. « 10 km ⚠️ » (N-234) et « 17,5 km »
  (pistes) et choisit.

### Acceptance Criteria additionnels (PR #5)

8. **Profil d'accès unique.** Tout calcul d'accès utilise `ACCESS_ROUTING_PROFILE` (constante config,
   défaut `trekking`), indépendant du `routing_profile` de l'aventure. `PROFILE_MAP` supprimé.
9. **Détection nationale.** Chaque variante porte `usesMainRoad` (bool) + `mainRoadDistanceM`,
   dérivés des `WayTags` BRouter (`messages`) — `highway=trunk` uniquement (pas `trunk_link`).
10. **UI danger.** Icône rouge ⚠️ (+ `aria-label`) sur les cellules de variante empruntant une
    nationale. Le sélecteur de profil est retiré de la page aventure.
11. **Dédoublonnage par métriques affichées.** Les variantes sont fusionnées sur (distance ±50 m,
    D+ ±5 m, D- ±5 m) — PAS sur `etaS` — pour collapser les tracés identiques (entrées distinctes,
    même segment divergent).
12. **Invalidation déterministe.** `ACCESS_ENGINE_VERSION` est une **constante de code** (plus
    surchargeable par `.env`) → tout déploiement invalide le cache partout. Champs `usesMainRoad`/
    `mainRoadDistanceM` **optionnels avec défaut** côté schéma partagé → pas d'échec de parse front
    sur des variantes en cache antérieures (robustesse rollout).

### Tasks (PR #5)

- [x] `routing.service` : parse `WayTags` → `BrouterRoute.usesMainRoad` + `mainRoadDistanceM` (trunk)
- [x] `access.config` : `ACCESS_ROUTING_PROFILE` (défaut trekking) ; `ACCESS_ENGINE_VERSION` figé en
      constante (`brouter-1.7.9+access-trekking-v3`)
- [x] `access-calculator` : `resolveProfile` → profil unique ; variantes portent `usesMainRoad` ;
      dédoublonnage sur métriques affichées
- [x] Shared : `AccessVariantSchema` + `usesMainRoad`/`mainRoadDistanceM` (optionnels + défaut)
- [x] `AccessMetrics` : icône danger ⚠️ par variante ; retrait `RoutingProfileSelector` de la page aventure
- [x] Tests (API 408/408 ; web poi-access 51 ; shared 13) + détection validée sur BRouter réel

### Notes & suivi

- **Limite assumée** : pas de variante « 7 km » possible pour ce POI (barrière Río Arlanza) — le
  7 km partait de Cascajares, hors trace.
- **Dette/cleanup différé** : la colonne `adventures.routing_profile`, l'endpoint PATCH profil, le
  composant `routing-profile-selector.tsx` et l'event `adventure.profile-changed` deviennent
  inutilisés (profil d'accès unique) → suppression complète à planifier (migration + handlers).
- **Régression évitée** : avoir fait dépendre l'invalidation d'un override `.env` masquait le
  problème (cache jamais invalidé localement, et risque identique en prod) → corrigé par la constante.

### File List additionnel (PR #5)

- apps/api/src/routing/routing.types.ts, routing.service.ts (+ .spec)
- apps/api/src/config/access.config.ts
- apps/api/src/pois/access-calculator/types/access-result.types.ts
- apps/api/src/pois/access-calculator/access-calculator.service.ts (+ .spec)
- packages/shared/src/schemas/poi-access.ts (+ .test)
- apps/web/src/components/poi-access/AccessMetrics.tsx (+ .test), AccessMapLayer.test.tsx,
  LiveAccessPolyline.test.tsx, useAccess.test.ts
- apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx (retrait du sélecteur)

---

## Polish UI POI Access (2026-05-31, post-merge PR #5)

> Lot **purement UI** (aucun changement de calcul/contrat) destiné à rendre l'accès POI lisible
> sur la carte et à fiabiliser l'avertissement « route nationale ». Réparti entre le commit `a86baa3`
> (déjà mergé via **PR #5** + déployé prod) et le dernier correctif `5f6b6dc`
> (branche `fix/poi-access-single-variant-national-road-warning`, mono-variante). **Tout est mutualisé
> Planning ↔ Live** (mêmes composants `PoiPopup`, `AccessMapLayer`/`LiveAccessPolyline`, `AccessMetrics`)
> → aucune divergence entre les deux modes.

### Changements

1. **Carte POI « liquid glass »** (`poi-popup.tsx`, composant `PoiPopup`, partagé Planning + Live).
   La carte du popup POI est désormais en **verre dépoli permanent** : fond translucide
   (`--popup-glass` ≈ `rgba(255,255,255,0.28)`), `backdrop-filter: blur(8px) saturate(...) brightness(1.05)`
   (+ préfixe `-webkit-` pour Safari/iOS), liseré spéculaire via `box-shadow`. But : laisser
   transparaître le routing (la trace d'accès passe parfois **sous** la carte) tout en gardant le
   contenu net par-dessus. Inspiré de [kube.io/blog/liquid-glass-css-svg](https://kube.io/blog/liquid-glass-css-svg)
   (la vraie réfraction SVG `feDisplacementMap` y est Chrome-only → on s'en tient à `blur`+`saturate`,
   cross-browser). **État 100 % statique, aucune transition** : plusieurs pistes d'animation (fondu
   transitoire « peek », défilé de pointillés, pulse glow largeur+flou) ont été testées puis **retirées**
   à la demande.

2. **Trait d'itinéraire d'accès sur la carte** (`AccessMapLayer.tsx`, partagé Planning + Live via
   `LiveAccessPolyline`).
   - Couleur : ambre `#f59e0b` → (brièvement vert sage `#2D6A4A`) → finalement **magenta/fuchsia
     `#e6007e`** (constante `ACCESS_ROUTE_COLOR`), qui tranche sur tous les fonds OpenFreeMap
     (Liberty/Bright/Positron/Dark) sans collision avec le bleu de la trace, l'orange des pins POI
     ni le vert du terrain.
   - **Liseré blanc continu** ajouté (calque `poi-access-casing`, `#ffffff`, largeur 7, sous le trait)
     pour « décoller » l'itinéraire de n'importe quel fond (technique Google/Komoot). Empilement
     bas→haut : fantômes gris (variantes non sélectionnées) → liseré blanc → trait magenta pointillé.

3. **Sélecteur d'itinéraires + métriques** (`AccessMetrics.tsx`).
   - Accent de l'option sélectionnée aligné sur le magenta `#e6007e` (cohérence carte ↔ popup).
   - Fond gris du conteneur des boutons d'options retiré (les boutons « flottent » sur le verre).
   - **Avertissement « ⚠ Route nationale »** (icône `TriangleAlert` rouge + texte) ajouté à droite du
     label « ITINÉRAIRES » quand la variante affichée/sélectionnée emprunte une nationale
     (`usesMainRoad`).
   - **Correctif mono-variante** (`5f6b6dc`) : l'avertissement s'affiche désormais **même quand il n'y
     a qu'une seule variante**. Avant, `VariantSelector` faisait `return null` dès `variants.length <= 1`,
     ce qui masquait aussi l'avertissement. Dissociation : le **choix d'itinéraires** (label + boutons)
     n'apparaît qu'à partir de **2 variantes** ; l'**avertissement nationale** apparaît dès que la
     variante affichée passe par une nationale, quel que soit le nombre de variantes.

### Tests

- `AccessMapLayer.test.tsx` : calque liseré (`poi-access-casing`) + couleur magenta.
- `AccessMetrics.test.tsx` : avertissement nationale, **dont le cas mono-variante**.
- Tous verts.

### Statut livraison

- Commit `a86baa3` (liquid glass + magenta + liseré + avertissement multi-variantes) **mergé via PR #5
  + déployé prod**.
- Correctif mono-variante (`5f6b6dc`) **en cours de merge** (nouvelle PR).

### File List (polish UI)

- apps/web/src/app/(app)/map/[id]/_components/poi-popup.tsx
- apps/web/src/components/poi-access/AccessMapLayer.tsx (+ .test)
- apps/web/src/components/poi-access/AccessMetrics.tsx (+ .test)
