# Story 17.15 : Recherche Google en Text Search Pro, et parité mobile du découplage

Status: review

> **2026-08-20** — Un seul lot couvrant **api + mobile**, conformément au changement de méthode acté le jour même : l'unité de travail est la fonctionnalité, pas le répertoire. Découper « option B » et « parité mobile » en deux stories aurait reproduit exactement la divergence que la 17.14 a créée.

## Contexte

Deux constats mesurés le 2026-08-20 sur la bbox `48.197,7.536 → 48.608,7.778` (plage 0-50 km d'un segment réel).

**Google ne rendait pas ce qu'il avait.** Le `textQuery` unique par calque (`"accommodation"`) écrasait des catégories entières — `includedType` ne filtre pas, Google score d'abord par pertinence textuelle. Et le `nextPageToken` n'était pas suivi : `lodging` saturait à 20 en annonçant qu'il en avait d'autres.

| | résultat |
|---|---|
| `campground` + `"accommodation"` | **0** |
| `campground` + `"camping"` | **10** |
| `motel` + `"accommodation"` | **0** |
| `motel` + `"motel"` | **3** |
| union 16 types, 1 page (code d'alors) | 32 `place_id` |
| union + pagination | **114 `place_id`** |

Zéro camping et zéro motel sur 50 km, pour une app de bikepacking. Le même défaut faussait l'**analyse de densité**, qui signalait « gap critique » un tronçon ne contenant que des campings.

**Le mobile n'avait pas le découplage.** 6 fichiers web le portaient, 0 fichier mobile. Le travail avait été proposé en option le 2026-08-19 et la question était restée sans réponse.

## Acceptance Criteria

1. **Given** le prefetch carte, **When** il collecte les POI, **Then** il n'appelle **aucun** Place Details — identité, position et types viennent du Text Search.
2. **Given** un type Google, **When** on l'interroge, **Then** le `textQuery` lui est propre (`TYPE_TEXT_QUERY`), pas générique au calque.
3. **Given** une réponse portant un `nextPageToken`, **When** on est sur le chemin d'affichage, **Then** les pages suivantes sont demandées (plafond 3).
4. **Given** une requête ne demandant qu'un calque, **When** le prefetch tourne, **Then** seul ce calque est interrogé, et le marqueur de couverture est porté par (segment, calque, bbox).
5. **Given** un calque dont la requête échoue, **When** les autres réussissent, **Then** seuls les réussis sont marqués couverts.
6. **Given** l'analyse de densité, **When** elle compte les hébergements, **Then** elle utilise toujours le masque **IDs Only gratuit**, sans pagination.
7. **Given** le mobile avec recherche étendue active, **When** l'utilisateur recherche (planning ou live), **Then** deux requêtes partent et les POI Google s'affichent sans attendre Overpass.
8. **Given** un échec Overpass sur mobile, **When** Google a répondu, **Then** la recherche n'est pas en erreur et un statut annonce des résultats partiels.
9. **Given** la règle 10 de `project-context.md`, **When** on la lit, **Then** elle **nomme** ses quatre points d'application au lieu de dire « obligatoire ».

## Tâches

- [x] **T1** — `google-places.provider.ts` : `TYPE_TEXT_QUERY`, masques `MASK_IDS_ONLY` / `MASK_PRO`, primitive `textSearch` avec pagination optionnelle, `searchLayerPlaces` (Pro) et `searchLayerPlaceIds` (IDs Only, inchangé pour la densité).
- [x] **T2** — `getPlaceDetails` repassé en Pro-only ; le palier `essentials` et la clé `google_place_basic` (introduits la veille pour le prefetch) sont retirés, leur appelant ayant disparu.
- [x] **T3** — `pois.service.ts` : prefetch sans Place Details, `resolveRequestedLayers()`, marqueur par (segment, calque, bbox), marquage par calque réussi.
- [x] **T4** — Mobile : `source` dans la façade API, dans `PoiQueryKeyParams`, deux flux dans `use-pois` et `use-live-poi-search`, états primaires isolés d'Overpass.
- [x] **T5** — Mobile : `ExtendedSearchStatus` (RN) + clés i18n FR/EN, monté sur l'écran planning et l'écran live ; bannière « Aucun résultat » gatée par `!overpassPending`.
- [x] **T6** — Règle 10 réécrite avec ses points d'application nommés ; règles 11 et 11b réécrites (SKU, garde-fou densité, calibrage du `textQuery`).
- [x] **T7** — Tests : +9 API, +18 mobile.
- [ ] **T8** — Validation par Guillaume : sur une zone froide, vérifier que des campings et motels Google apparaissent enfin, et que sur mobile les pins Google précèdent ceux d'Overpass.

## Déviation assumée : pas de filtre corridor avant insertion

`action-plan.md` prévoyait de filtrer le corridor **avant** d'insérer, pour ne pas payer des POI jetés à la lecture. **Non fait, délibérément**, pour deux raisons apparues en implémentant :

1. **La justification économique a disparu avec le Place Details.** Le pré-filtre servait à ne pas payer d'appel par POI hors corridor. Il n'y a plus d'appel par POI : un Text Search Pro rapporte 20 lieux pour un appel facturé, que 4 d'entre eux soient hors corridor ou non. Le gain se réduit à des lignes en base, mesuré à **20,3 %** (469 lignes sur 2 316).
2. **Le prefetch est partagé avec le mode live**, dont la sémantique est un **rayon autour d'un point**, pas un couloir. Y appliquer un filtre corridor supprimerait des POI que le live veut légitimement.

Le filtre corridor à la **lecture** (`findCachedPois`, `dist_from_trace_m <= CORRIDOR_WIDTH_M`) reste en place et suffit.

## Résultats mesurés

| | avant | après |
|---|---|---|
| `place_id` trouvés (bbox de référence) | 32 | **114** |
| appels facturés / bbox froide | 32 Place Details Essentials | **10 Text Search Pro** |
| coût / POI | 0,0050 $ | **0,0028 $** |
| bboxes froides gratuites / mois | ~312 | **~500** |
| campings Google sur la plage | 0 | 10 |
| fichiers mobile portant le découplage | 0 | 6 |

## Validation partielle — mesure du 2026-08-20 (segment `Test DE`, fenêtre 144-159 km)

Sonde directe sur la bbox réelle de cette fenêtre, `campground` + `"camping"` :

| POI | distance à la trace | position | affiché ? |
|---|---|---|---|
| **Zeltplatz für Radfahrer** | 197 m | km 151,8 | ✅ dans la fenêtre |
| **Pension und Camping** | 2 058 m | km 157,8 | ✅ dans la fenêtre |
| Radler-Zeltplatz « Donauversickerung » | 79 m | km 142,3 | juste avant la fenêtre |

Avec l'ancienne requête (`"accommodation"`), la même sonde renvoie **0**. Les noms sont éloquents :
*Zeltplatz für Radfahrer* et *Radler-Zeltplatz* — « camping pour cyclistes », à 79 et 197 mètres
de la trace, invisibles jusqu'ici.

⚠️ Le premier test local a conclu à tort à une régression : le serveur exécutait encore le code
de la veille (`nest start --watch` n'avait pas repris les modifications). Voir la règle 13 de
`project-context.md`.

## Gate

| | |
|---|---|
| API | **471/471** (39 suites) — +9 |
| Mobile | **650/650** (96 suites) — +18 |
| Web | **1173/1173** |
| Packages | shared 41 · gpx 22 · analytics 26 |
| `turbo typecheck` | 7/7 |
| `turbo lint` | 9/9, 0 erreur (2 warnings mobile préexistants) |

## Change Log

| Date | Auteur | Changement |
|---|---|---|
| 2026-08-20 | Claude Opus 5 (dev) | Story créée et implémentée (T1→T7). Lot unique api+mobile. Piège de coût évité en cours de route : `searchLayerPlaceIds` a un second consommateur, l'analyse de densité (84 tronçons × 16 types = 1 344 requêtes par analyse) — le basculer en Pro aurait coûté ~43 $ et 27 % du quota mensuel par analyse. D'où deux méthodes distinctes plutôt qu'une. |
