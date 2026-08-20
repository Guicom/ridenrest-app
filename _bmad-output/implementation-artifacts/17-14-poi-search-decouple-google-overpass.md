# Story 17.14: Recherche POI — flux Google et Overpass découplés, affichage progressif

Status: done

> **Ajouté 2026-08-19** — Story de l'Epic 17 (Quality of Life), suite directe de la 17.13. Une fois Overpass réparé, il restait le problème de fond : les deux sources étaient attendues **ensemble**, donc tout le monde payait le pire des deux. Conception proposée par Guillaume : afficher Google immédiatement, laisser Overpass compléter la carte, prévenir si ça traîne, et ne jamais bloquer la navigation.

## Contexte

Mesures du 2026-08-19 sur les instances publiques Overpass, avec la requête « hébergements » réelle :

| | latence observée |
|---|---|
| Google Places (bbox déjà prefetchée) | ~200 ms |
| Google Places (bbox froide) | ~2 s |
| Overpass, cache Redis HIT | 27 – 70 ms |
| Overpass, cache MISS | **1,0 s / 8,9 s / 31,0 s** selon l'état de l'instance publique |

Le 31 s provient d'un `504 Gateway Timeout` sur `overpass-api.de` (~12 s) suivi d'une rotation vers une instance injoignable. Et il n'existe **pas de plan B en ligne** : `private.coffee` répond en 35 s, `maps.mail.ru` échoue une fois sur deux avec ~10-14 s de plancher (y compris sur une requête triviale — le 504 vient de son nginx frontal, pas d'Overpass), `kumi.systems` ne répond plus (URL renommée), et `overpass.osm.ch` est un extrait **suisse** qui renvoie HTTP 200 avec zéro résultat ailleurs.

**Décision** : ne pas raccourcir les timeouts (ce serait jeter des résultats qui allaient arriver), mais sortir Overpass du chemin critique de l'affichage.

## Acceptance Criteria

1. **Given** une recherche corridor avec la recherche étendue active, **When** l'utilisateur clique « Rechercher », **Then** deux requêtes indépendantes partent (`source=google` et `source=overpass`), et les POI Google s'affichent dès leur arrivée sans attendre Overpass.

2. **Given** `source=google`, **When** l'API traite la requête, **Then** aucun appel Overpass n'est émis et la lecture exclut les POI `overpass` ; **Given** `source=overpass`, **Then** aucun appel Google n'est émis et la lecture exclut les POI `google`/`amadeus`.

3. **Given** `source=overpass` alors que l'option « recherche étendue » est désactivée, **When** l'API traite la requête, **Then** rien n'est interrogé et la réponse est vide (le toggle reste maître).

4. **Given** aucun paramètre `source`, **When** l'API traite la requête, **Then** comportement historique : les deux sources dans une seule réponse (le mobile n'est pas découplé).

5. **Given** une recherche en cours, **When** seule la source Overpass est encore en vol, **Then** `isPending` est **faux** — l'overlay de chargement, l'auto-zoom et les squelettes ne dépendent que de la source primaire.

6. **Given** Overpass en vol depuis plus de 5 s, **When** l'utilisateur regarde la carte, **Then** un statut non bloquant indique « Recherche étendue plus longue que prévu — les résultats s'ajouteront », et la navigation (zoom, pan, ouverture de POI) reste possible.

7. **Given** un échec de la recherche étendue, **When** la requête Google a réussi, **Then** un bandeau « Recherche étendue indisponible — résultats partiels » s'affiche et les résultats Google restent visibles ; `hasError` global reste faux.

8. **Given** Google renvoie zéro POI alors qu'Overpass est encore en vol, **When** la carte s'affiche, **Then** la bannière « Aucun résultat dans cette zone » **n'est pas** affichée (Overpass peut encore en ramener).

9. **Given** la liste d'instances Overpass, **When** le provider effectue sa rotation, **Then** `overpass.osm.ch` n'y figure plus (extrait régional suisse — perte de données silencieuse hors de Suisse), `kumi.systems` est remplacée par `private.coffee` (même opérateur, URL renommée), et `maps.mail.ru` figure en dernier recours.

10. **Given** un appel Overpass qui enchaîne rotations et attentes 429, **When** le budget global est dépassé, **Then** l'appel est abandonné — sans quoi une seule recherche pouvait tenir une connexion plusieurs minutes.

11. **Given** un prefetch Google, **When** les Place Details sont résolus, **Then** ils le sont au SKU **Essentials** (identité, position, types — tout ce qu'exige un pin) et mis en cache sous `google_place_basic:{placeId}` ; les champs Pro (note, horaires, téléphone, site) ne sont demandés qu'à l'**ouverture d'une fiche**, via `getPoiGoogleDetails` et sa clé `google_place_details:{placeId}`. Une charge Pro déjà en cache est réutilisée telle quelle par le prefetch.

12. **Given** le mode live, **When** une recherche est lancée, **Then** les deux flux sont découplés comme en planning : `isFetching` ne suit que la source primaire, `overpassPending`/`overpassError` sont exposés, la bannière « Aucun résultat » attend la fin des deux flux et le statut de recherche étendue s'affiche.

## Tasks / Subtasks

- [x] **T1** — DTO : `source?: 'google' | 'overpass'` (`POI_SOURCES`, validé par `@IsIn`), documenté comme optionnel pour préserver le contrat mobile.
- [x] **T2** — `PoisService` : helper `resolveSourcePlan(dto)` → `{ wantsGoogle, wantsOverpass, excludeSources }`, appliqué **aux deux chemins** (corridor et live). Le chemin corridor est réécrit en un seul flux (plus de `return` précoce par branche) : Overpass si demandé (cache Redis puis appel), Google si demandé, lecture unique filtrée, écriture Redis seulement après un fetch Overpass frais.
- [x] **T3** — `OverpassProvider` : liste d'instances assainie (`osm.ch` retirée, `kumi.systems` → `private.coffee`, tableau de mesures en commentaire), budget global `OVERPASS_TOTAL_BUDGET_MS` (45 s) vérifié avant chaque tentative, timeout par instance en variable (`OVERPASS_INSTANCE_TIMEOUT_MS`, 20 s — **non réduit**, l'UI n'attend plus), pause 429 portée à 30 s conformément à la politique d'usage d'`overpass-api.de` et sautée si le budget ne le permet pas, `[timeout:N]` de la requête QL aligné sur le timeout client.
- [x] **T4** — Client web : `getPois` accepte `source` ; `usePois` émet une requête par (segment × calque × **source**), sépare `googleResults` / `overpassResults`, et expose `overpassPending`, `overpassError`, `overpassExpected`. `isPending` et `hasError` ne suivent plus que la source primaire.
- [x] **T5** — UI : composant `ExtendedSearchStatus` (`pointer-events-none`, `role="status"`, seuil de lenteur à 5 s, priorité à l'erreur) ; bannière « Aucun résultat » conditionnée par `!overpassPending`.
- [x] **T6** — Tests : API +5 (les 4 combinaisons de `source` + non-écriture de la clé Redis en `source=google`) ; web +5 sur `usePois` (deux requêtes en ON, une seule en OFF, `isPending` insensible à Overpass, erreur Overpass non bloquante, fusion des deux sources) ; +6 sur `ExtendedSearchStatus`.
- [x] **T7** — Correctif du harnais de test provider : `mockClear()` ne purge pas les implémentations `mockResolvedValueOnce` non consommées — elles fuyaient dans le test suivant, ce qui masquait le nombre réel d'instances. Passé à `mockReset()`, et les tests référencent désormais `OVERPASS_INSTANCES.length` au lieu de coder 3 en dur.
- [x] **T9b** — Liste d'instances : `maps.mail.ru` réintégrée en **dernier** recours (décision Guillaume) — ~50 % d'échecs et 10-14 s de plancher mesurés, mais un repli à moitié fiable vaut mieux que pas de repli maintenant que l'UI n'attend plus. Constat qui a motivé la décision : le 2026-08-19 à 19:27, `private.coffee` est tombée en `fetch failed` alors qu'elle répondait (lentement) le matin même — sans troisième instance, un incident sur `overpass-api.de` ne laisse aucune issue.
- [x] **T10** — Coût Google : `getPlaceDetails(placeId, tier)` avec deux field masks (`ESSENTIALS_FIELDS` / `PRO_FIELDS`). Le prefetch passe en Essentials et écrit sous `google_place_basic:` ; la fiche POI garde le Pro sous `google_place_details:`. Mesure qui a déclenché ce changement : sur une recherche froide, 37 `place_id` trouvés → 14 appels Place Details **facturés au SKU Pro**, dont ~8 pour le calque « restaurants » que l'utilisateur n'avait pas activé. Google facture au SKU le plus élevé des champs demandés ; note/horaires/téléphone/site ne servent qu'à l'ouverture d'une fiche.
- [x] **T11** — Mode live découplé : `useLivePoisSearch` émet deux `useQuery` (`enabled: false`), `refetch()` déclenche les deux (Overpass seulement si l'option est active), `isFetching`/`isError` ne suivent que la source primaire, `pois` fusionne les deux. Page live : bannière « Aucun résultat » conditionnée par `!overpassPending`, `ExtendedSearchStatus` monté. En live c'est encore plus critique qu'en planning : l'utilisateur est sur son vélo.
- [x] **T8** — Doc Sync : `project-context.md` (clé de query étendue à `source`, règles de découplage), `sprint-status.yaml`, cette story.
- [x] **T9** — Validation par Guillaume : parcours complet en conditions réelles (voir « Reste à valider »). — **validé par Guillaume le 2026-08-20** en prod, après déploiement.

## Dev Notes

### Décisions

- **Deux requêtes HTTP plutôt qu'une file BullMQ.** Le serveur écrit en base *avant* de répondre : si l'utilisateur quitte l'écran pendant que la requête Overpass tourne, le travail n'est pas perdu — la prochaine recherche sur cette zone tape le cache Redis et est instantanée. On obtient l'essentiel du bénéfice d'un traitement asynchrone sans la complexité d'une file. La file reste le bon outil pour le précalcul à l'import (item différé).
- **Timeouts non réduits.** Proposition initiale (raccourcir à ~10 s) écartée par Guillaume, à raison : une fois l'UI non bloquante, une requête longue ne coûte rien à l'utilisateur, et la raccourcir ne ferait que jeter des résultats. Le budget global de 45 s est là pour le **serveur** (connexions tenues), pas pour l'utilisateur.
- **`overpass.osm.ch` retirée** : c'est une correction d'exactitude, pas de latence. Le wiki OSM la classe dans « instances with data only for a specific region ». Mesuré : 0 hôtel à Toulouse et à Gérone, 2 contre 7 sur la frontière DE/CH.
- **La source fait partie de la clé de query.** La convention documentée (`['pois', {segmentId, fromKm, toKm, layer}]`) gagne une dimension plutôt que d'être contournée : chaque flux garde son entrée de cache et son état de chargement.

### Points d'attention traités

- **Auto-zoom** : piloté par `isPending`, désormais Google seul → la carte se cale dès le premier affichage et **ne rejoue pas** de zoom à l'arrivée d'Overpass (qui serait vécu comme un saut sous les doigts).
- **Bannière « Aucun résultat »** : conditionnée par `!overpassPending` (AC8).
- **Compteurs qui sautent** (`Hôtel (13)` → `Hôtel (52)`) : assumé et signalé par le statut « recherche étendue en cours ».

### Hors scope

- Le **mobile** reste sur le comportement combiné : il n'envoie pas `source`, et l'API le lui rend inchangé (AC4). Il bénéficie en revanche **gratuitement** de tout le travail serveur : Overpass réparé, liste d'instances assainie, coût Google divisé, dédoublonnage, filtre corridor. Seul l'affichage progressif lui manque — découplage mobile à traiter séparément si besoin.

## Testing

Gate complète du 2026-08-19, monorepo entier :

| | résultat |
|---|---|
| API (Jest) | **462/462**, 39 suites · `tsc` 0 · ESLint 0 |
| Web (Vitest) | **1173/1173**, 100 fichiers · ESLint 0 erreur (3 warnings préexistants, vérifiés identiques avec les modifications remisées) |
| Mobile (Jest) | **632/632**, 95 suites · `tsc` 0 |
| Packages (shared, gpx, analytics) | **89/89** |

Web `tsc` : baseline de 56 erreurs préexistantes dans des fichiers de test, inchangée (vérifiée par `git stash`).

### Validation end-to-end (navigateur connecté, logs API)

| Observation | Résultat |
|---|---|
| Un clic « Rechercher », option active | **Deux requêtes émises à la même milliseconde** : `source=google` et `source=overpass` (19:07:47.075) |
| Overpass forcé à froid (clé Redis supprimée), Google tiède | à **t+8,5 s** : statut affiché « Recherche étendue plus longue que prévu — les résultats s'ajouteront », interface interactive |
| Fin de la recherche étendue | à **t+20 s** : statut disparu, compteurs complets `Hôtel (52) · Camping (4) · Refuge / Abri (3)` |

**Non capturé** : l'instantané intermédiaire montrant les compteurs Google seuls (13 hôtels) pendant qu'Overpass tourne — la sonde a démarré après. Le mécanisme est couvert par les tests unitaires (`isPending` insensible à Overpass, fusion des deux sources), mais l'observation directe reste à faire.

### Reste à valider (T9, Guillaume)

1. Recherche sur une zone froide : les pins Google doivent apparaître **avant** ceux d'Overpass, sans blocage de la carte.
2. Le statut « recherche étendue en cours » puis « plus longue que prévu » s'affiche sans gêner le zoom/pan.
3. Overpass en échec → bandeau « résultats partiels », résultats Google conservés.
4. Zone sans aucun POI → la bannière « Aucun résultat » n'apparaît qu'**après** la fin des deux flux.
5. Option désactivée → une seule requête, aucun statut de recherche étendue.

## Change Log

| Date | Auteur | Changement |
|---|---|---|
| 2026-08-19 | Claude Opus 5 (dev) | Story créée et implémentée (T1→T8). Conception du découplage proposée par Guillaume ; proposition initiale de réduction des timeouts écartée. Validation end-to-end partielle (deux requêtes parallèles + statut de lenteur observés). T9 en attente. |
| 2026-08-20 | Claude Opus 5 (dev) | Déployé en prod avec la 17.13 (PR #11, sha `822adef`). **T9 validé par Guillaume** : recherche étendue testée directement en prod, fonctionnelle → story `done`. |
