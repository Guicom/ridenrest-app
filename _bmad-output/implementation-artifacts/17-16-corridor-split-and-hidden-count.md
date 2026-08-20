# Story 17.16 : Rayon de recherche réglable en planning

Status: review

> **2026-08-20** — Lot unique api + web + mobile. Origine : un camping trouvé par le nouveau prefetch Google, à **3 263 m** de la trace, écarté par un filtre corridor à 3 000 m — pour 263 mètres — avec « Camping (0) » à l'écran.

## Contexte

Le corridor de planning était de **3 km, en dur et invisible**. Alors que le mode live laissait déjà l'utilisateur choisir son rayon depuis MOB-5.3 :

| | corridor | réglable ? |
|---|---|---|
| Planning (avant) | 3 km en dur | non, invisible |
| Live | **5 km par défaut**, jusqu'à 20 | oui, par pas de 0,5 km |

L'app était donc **plus généreuse sur le vélo qu'au bureau**, et ne laissait ajuster que là où c'est le moins pratique — alors que c'est en planifiant qu'on a le temps d'arbitrer un détour.

Deuxième problème, structurel : `CORRIDOR_WIDTH_M` gouvernait **deux décisions sans rapport** — le tampon de la bbox envoyée à Google et Overpass, et le seuil d'affichage à la lecture. Impossible d'élargir l'un sans l'autre.

## Changement de conception en cours de route

La première implémentation (commit `3e9e653`) comptait les POI « juste au-delà » du corridor et l'annonçait par un message passif — `GET /pois/near-miss-count` + `NearMissNotice`. Approche **abandonnée après discussion avec Guillaume**, pour deux raisons :

1. **Un message sans action est un cul-de-sac.** Annoncer qu'un résultat existe puis refuser de le montrer est plus frustrant que le silence.
2. **La donnée était déjà là.** Les POI au-delà de 3 km sont en base (599 lignes mesurées) — le filtre corridor est une clause `WHERE` à la lecture. Les afficher ne coûte **aucun appel externe**, juste la même requête PostGIS avec un autre seuil.

Dès lors, le bon geste n'est pas « révéler ce qu'on a caché » mais **donner à l'utilisateur le réglage qu'il a déjà en live**. Tout l'appareillage near-miss a été retiré dans ce lot.

## Acceptance Criteria

1. **Given** la carte Recherche en planning, **When** l'utilisateur la déplie, **Then** un champ « Sur un rayon de » figure **sous** « Rechercher sur », avec le même stepper − / valeur / + et l'unité km.
2. **Given** ce champ, **When** l'utilisateur l'ajuste, **Then** la valeur est bornée à **1–20 km** — même plafond qu'en live, parce que c'est le même concept.
3. **Given** un rayon choisi, **When** la recherche part, **Then** il pilote **à la fois** la zone interrogée chez les fournisseurs externes et le seuil d'affichage.
4. **Given** un changement de rayon, **When** il est appliqué, **Then** `searchCommitted` retombe à `false` — sinon on afficherait le jeu de l'ancien rayon en laissant croire qu'il correspond au nouveau.
5. **Given** une requête sans `radiusKm`, **When** l'API la traite, **Then** elle retombe sur 3 km — contrat des binaires mobiles déjà distribués.
6. **Given** deux rayons différents, **When** on cherche la même fenêtre, **Then** les caches sont distincts (clé TanStack Query et clé Redis géographique).
7. **Given** le web et le mobile, **When** on compare, **Then** même champ, même plafond, même comportement.

## Pourquoi le rayon pilote AUSSI la collecte

Découpler collecte et affichage afficherait un **sous-ensemble arbitraire** au-delà du tampon. La bbox est un rectangle : sa couverture lointaine dépend de la forme de la trace, pas d'un couloir régulier. Distribution mesurée en base :

```
3-4 km : 228 POI      6-7 km :  85
4-5 km : 115          7-8 km :  29
5-6 km : 126
```

Ça décroît — mais pas parce qu'il y a moins d'hébergements à 7 km : parce qu'on y a moins bien cherché. Offrir un curseur jusqu'à 20 km sans élargir la collecte ferait croire à l'utilisateur qu'il voit tout ce qui existe dans son rayon.

Coût de cet élargissement : quasi nul depuis la story 17.15. Un appel Text Search Pro amortit 20 POI, donc agrandir la bbox ne multiplie pas la facture — elle ne bouge que si un type franchit une frontière de page.

## Tâches

- [x] **T1** — Retrait de l'appareillage near-miss (endpoint, DTO, requête de comptage, composants web et mobile, clés i18n, `POI_NEAR_MISS_MAX_M`).
- [x] **T2** — `packages/shared` : `MAX_SEARCH_RADIUS_KM` (20, planning **et** live), `DEFAULT_SEARCH_RADIUS_KM` (5), `MAX_LIVE_RADIUS_KM` déprécié en alias.
- [x] **T3** — `FindPoisDto` : `radiusKm` devient valide en planning (0,5–20). `findCachedPois` prend un `maxDistFromTraceM` (défaut `CORRIDOR_WIDTH_M`).
- [x] **T4** — `PoisService` : le rayon pilote le tampon de bbox et le seuil de lecture ; repli sur les valeurs historiques sans le paramètre.
- [x] **T5** — Web : `searchRadiusKm` + `setSearchRadius` dans `useMapStore`, `radiusKm` dans la clé et la requête, stepper « Sur un rayon de » sous « Rechercher sur ».
- [x] **T6** — Mobile : idem, + clés i18n FR/EN (`radiusLabel`, `radiusDecrement`, `radiusIncrement`).
- [x] **T7** — Tests : +3 API, +6 web, +5 mobile.
- [ ] **T8** — Validation par Guillaume : sur la fenêtre du camping à 3 263 m, passer le rayon à 4 km doit le faire apparaître.

## ⚠️ Changement de comportement à connaître avant déploiement

Le défaut passe de **3 à 5 km** pour aligner planning et live. Deux conséquences :

- Les recherches renvoient davantage de résultats qu'avant, y compris sur des zones déjà explorées.
- Les marqueurs de couverture Google sont indexés sur la bbox : un rayon différent produit une bbox différente, donc **toutes les zones déjà cherchées referont un prefetch** au prochain passage.

Si tu préfères conserver 3 km par défaut, c'est une seule valeur à changer (`DEFAULT_SEARCH_RADIUS_KM`).

## Gate

| | |
|---|---|
| API | **474/474** (39 suites) |
| Web | **1179/1179** (100 fichiers) |
| Mobile | **656/656** (96 suites) |
| Packages | shared 41 · gpx 22 · analytics 26 |
| `turbo lint` + `turbo typecheck` | 16/16 |

## Change Log

| Date | Auteur | Changement |
|---|---|---|
| 2026-08-20 | Claude Opus 5 (dev) | 1re implémentation : comptage des « quasi-manqués » + message passif (`3e9e653`). |
| 2026-08-20 | Claude Opus 5 (dev) | Conception revue avec Guillaume : le message est remplacé par le **réglage** que le live possédait déjà. Appareillage near-miss retiré, `radiusKm` ajouté de bout en bout. Deux effets de tick RNTL/RTL rencontrés dans les tests (deux `fireEvent` dans le même tick lisent la closure précédente) → cas séparés et attente explicite du rendu. |
