# Story 17.17 — Prefetch Google par catégorie demandée (marqueurs par type)

**Statut** : done — 2026-08-20 (validé par Guillaume)
**Épopée** : 17 (recherche POI)
**Suite de** : 17.15 (Text Search Pro sans Place Details)

---

## Problème

Le coût d'une recherche Google suit le **nombre de types interrogés**, pas le nombre de POI
rapportés : `searchPlacesByType` émet un Text Search Pro **par type Google**, facturé qu'il
ramène 20 lieux ou zéro (32 $/1000, 5 000 gratuits/mois).

Or la sélection de catégories de l'utilisateur était honorée **à la lecture**
(`findCachedPois(segmentId, activeCategories, …)`) et **ignorée à la collecte** : le prefetch
prenait le calque et interrogeait `LAYER_GOOGLE_TYPES[layer]` en entier.

Le défaut du produit est `visibleLayers = {accommodations}` + `activeAccommodationTypes = {hotel}`
(identique web et mobile). Le cas nominal payait donc **16 appels pour une demande qui en
justifiait 6**.

## Décision

N'interroger que les types Google des catégories demandées.

| sélection | appels / bbox froide | coût | bboxes gratuites / mois |
|---|---|---|---|
| `hotel` (**le défaut**) | 6 au lieu de 16 | 0,19 $ | **833** au lieu de 312 |
| `hotel` + `camp_site` | 10 | 0,32 $ | 500 |
| les 5 catégories | 16 | 0,51 $ | 312 |
| `shelter` seul | **0** | 0 $ | — |

Changement **serveur uniquement** : web et mobile envoient déjà `categories`.

## Conséquences assumées

**Le filtre devient réellement filtrant.** Avant, cocher « hôtel » affichait aussi les
établissements que les 10 autres requêtes avaient ramenés et que `mapGoogleTypesToCategory`
reclassait en `hotel`. Ces requêtes ne partent plus, donc le jeu « hôtel seul » peut légèrement
rétrécir. C'est le comportement conforme à la case cochée — décision validée par Guillaume le
2026-08-20.

## Implémentation

### 1. Source de vérité des types (`google-places.provider.ts`)

`CATEGORY_GOOGLE_TYPES: Record<PoiCategory, string[]>` remplace `GOOGLE_PLACE_TYPES` (exporté,
**jamais utilisé**, et divergent : il contenait `food` et `supermarket` absents de
`LAYER_GOOGLE_TYPES`, et faisait pointer `shelter` sur `lodging`).

`LAYER_GOOGLE_TYPES` en est désormais **dérivée** via `LAYER_CATEGORIES`, et un test verrouille
l'égalité des deux vues. Seul consommateur restant : `searchLayerPlaceIds` (densité, IDs Only).

`shelter` n'a **aucun** type Google : les refuges viennent d'OSM
(`tourism=alpine_hut|wilderness_hut`). L'ancien `['lodging']` était doublement inutile —
`lodging` appartient déjà à `hotel`, et ses résultats sont classés `hotel`, donc jamais affichés
sous `shelter`.

### 2. `searchLayerPlaces` → `searchPlacesByType`

Prend une liste de types, retourne `TypeSearchOutcome[]` (`{ type, places, ok }`) au lieu d'une
liste fusionnée : l'appelant a besoin de l'issue **par type** pour poser ses marqueurs. Le
dédoublonnage par `place_id` remonte dans le service, qui voit tous les types d'un coup.

### 3. Marqueurs de couverture par type (`pois.service.ts`)

```
pois:google:seg:{segmentId}:type:{googleType}:bbox:{bboxKey}     TTL 7 j
```

Sans ce grain, marquer le calque entier après n'avoir cherché que « hôtel » gèlerait « camping »
à zéro résultat pendant 7 jours — le piège de la règle 3 du contexte projet, un cran plus bas.

**Corrige aussi un bug d'échec partiel préexistant** : `searchLayerPlaces` ne levait que si
**tous** les types du calque échouaient. 15 types morts sur 16 laissaient donc le calque marqué
couvert 7 jours, avec le symptôme « 0 résultat » figé sur une zone qui en contient.

**Compatibilité** : les marqueurs `…:layer:{layer}:…` sont encore **lus** pendant leur TTL
résiduelle (7 j max) comme « tous les types de ce calque ont été interrogés », pour ne pas
re-payer un prefetch complet sur toutes les zones déjà couvertes. On n'en écrit plus.

## Lot 2 — le client demandait tout le calque (2026-08-20, même jour)

Le lot 1 n'a produit **aucune économie réelle** : en planning, web et mobile envoyaient
`categories: LAYER_CATEGORIES[layer]`, c'est-à-dire les 5 catégories d'hébergement quelles que
soient les puces cochées. Le serveur recevait donc toujours les 5 catégories →
`googleTypesForCategories` renvoyait les 16 types → 16 appels facturés, comme avant.

**Comment c'est passé** : le test « n'interroge que les types des catégories demandées » appelle
le service avec `categories: ['hotel']` — une situation qu'aucun client ne produisait. J'ai
vérifié le contrat serveur et jamais ce que le client envoie. Aucun type ne garde cette
frontière : les deux côtés manipulent `PoiCategory[]`, seule la *valeur* différait.

**Symptôme rapporté par Guillaume** : « Chambre d'hôte (1) » affiché alors que seuls Hôtel et
Camping étaient cochés — le compteur portait sur tout ce que l'API avait renvoyé, les puces
n'étant qu'un filtre d'affichage.

Correctifs (parité web + mobile, les 2 points de planning de la règle 10) :

1. `categories` = `visibleLayers` × `activeAccommodationTypes`, comme le fait déjà le live.
   Un calque dont aucun sous-type n'est coché n'est plus interrogé du tout.
2. `categories` entre dans la **clé de cache** (signature triée, ex. `camp_site,hotel`). Sans
   elle, cocher « Camping » puis relancer retomberait sur l'entrée de la recherche « Hôtel
   seul » et afficherait l'ancien jeu sans émettre de requête.
3. Les puces passent en `onlyCountActive` en planning : une puce non cochée n'affiche plus
   « (0) », qui laissait croire qu'on avait cherché sans rien trouver.
4. `toggleAccommodationType` et `resetAccommodationTypes` dégagent `searchCommitted`, comme
   `setSearchRange` et `setSearchRadius`. **Conséquence visible** : cocher un type après une
   recherche ne filtre plus instantanément, il faut recliquer sur « Rechercher ». Arbitrage
   validé par Guillaume — c'est le prix de l'économie, et c'est cohérent avec la règle du
   déclenchement explicite.

## Tâches

- [x] T1 — `CATEGORY_GOOGLE_TYPES` source de vérité ; `LAYER_GOOGLE_TYPES` dérivée
- [x] T2 — `googleTypesForCategories()` (union dédoublonnée, `[]` si aucun type)
- [x] T3 — `searchPlacesByType` : issue par type, plus de fusion ni de `throw` global
- [x] T4 — dédoublonnage `place_id` cross-types remonté dans le service
- [x] T5 — marqueurs par type + shim de lecture des marqueurs de calque hérités
- [x] T6 — tests : partition verrouillée, un appel par type, `shelter` → 0 appel, marquage
      par type, échec isolé retentable, shim hérité (12 tests ajoutés/réécrits)
- [x] T7 — lot 2 : `categories` = sous-types cochés (web + mobile), signature dans la clé,
      `onlyCountActive` en planning, reset de `searchCommitted`, 5 tests ajoutés
- [x] T8 — **validé par Guillaume** (2026-08-20) : recherche conforme en local, plus de
      compteur sur les sous-types non cochés.

## Vérifications

| | résultat |
|---|---|
| api `jest` | 481 / 481, 39 suites |
| web `vitest` | 1182 / 1182 |
| mobile `jest` | 657 / 657, 96 suites |
| `packages/shared` | 41 / 41 |
| `tsc` api + mobile | 0 erreur |
| `tsc` web | 86 erreurs — **identique avant/après**, vérifié par `git stash` (dette préexistante) |
| `eslint` | 0 erreur (web 6 warnings, mobile 1, tous préexistants — vérifiés par `git stash`) |

## Signature de log

Conformément à la règle 13, le nouveau chemin est reconnaissable :

```
[Google prefetch] bbox: {...}, segment: {id}, types: lodging,hotel,motel,...
[Google prefetch] type=campground → 10 lieux (Text Search Pro, paginé)
```

L'ancien loguait `layers: accommodations` et `layer=accommodations → N lieux`.
Second signal : les clés Redis passent de `:layer:` à `:type:`.
