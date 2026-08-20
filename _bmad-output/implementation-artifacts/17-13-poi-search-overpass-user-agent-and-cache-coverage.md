# Story 17.13: Recherche POI — réparation Overpass, couverture de cache et dédoublonnage

Status: done

> **Ajouté 2026-08-19** — Story de l'Epic 17 (Quality of Life), **bugfix backend prioritaire**. Origine : trois symptômes rapportés par Guillaume en prod (1) même trace GPX → résultats différents prod vs local, (2) le toggle Overpass ne change rien, ni en prod ni en local, (3) un utilisateur avec Overpass **activé** n'avait **aucun** résultat, et en a obtenu en le **désactivant**. Le RCA a isolé 4 bugs distincts, aucun lié à l'environnement, plus 2 dérives documentaires.

## Contexte / RCA (preuves)

| # | Cause racine | Preuve |
|---|---|---|
| 1 | **`fetch` Node n'envoie aucun `User-Agent`** → `overpass-api.de` répond **406 Not Acceptable**, `overpass.kumi.systems` **429 « Please include a meaningful User-Agent string »**. `OverpassProvider` ne faisait tourner l'instance que sur 403/503/504 : le 406 remontait via `throw err` et **sortait de la boucle** → `overpass.osm.ch`, qui répond 200, n'était jamais essayé. | Logs prod : **100 %** des requêtes `overpassEnabled=true` loguent `Overpass API failed, falling back to DB cache`. Dernier POI `source='overpass'` inséré : **prod 2026-03-29**, **local 2026-03-30** (soit le commit `c3c66ca`, 30/03). Repro : `fetch` sans UA → 406 / 429 / 200 selon l'instance ; **avec** UA → 200 + 56 éléments. |
| 2 | **Le prefetch Google Places était à l'intérieur du `try` Overpass**, après l'appel qui jette → un échec Overpass annulait aussi Google. Overpass ON sur segment froid = 0 POI ; OFF = résultats. | Symptôme utilisateur exact (ami de Guillaume) + capture mobile « Aucun résultat dans cette zone ». |
| 3 | **Court-circuit de cache sur « ai-je un résultat ? »** (`if (dbCached.length > 0) return dbCached`) au lieu de « ai-je déjà cherché cette zone ? ». Un jeu partiel se figeait pour toute la TTL (7 j). | Logs prod 16/08 sur `c0da376b` : 1ʳᵉ recherche `fromKm=86&toKm=89` → prefetch Google → 8 hôtels insérés se projetant à **89,1–93,6 km** (la bbox est un rectangle, la trace y revient). Puis `86→96`, `83→93`, `86→91`, `80→95` → `request completed`, **zéro prefetch**. En local, 1ʳᵉ recherche directement `80→95` → **19 hôtels** (80,1–96,6 km) → 17 dans la fenêtre = le « Hôtel (17) » de la capture. |
| 4 | **Dédoublonnage 100 m agnostique de la source** (`hasNearbyPoi`) : les 4 layers du prefetch tournant en `Promise.allSettled`, il dédoublonnait les POI Google **entre eux**, et purement par distance. | Logs du prefetch prod : ~7 hébergements « deduped » pour 2 insérés, noms clairement distincts (« Haus zum Falken », « Bed and Breakfast Villa Hallau », « Berg & Tal Quartier »). Le survivant dépend de l'ordre d'exécution → non déterminisme entre environnements. Message de log trompeur (« OSM POI within 100m » alors que le segment n'avait aucune ligne overpass). |
| 5 | **Pas de filtre corridor à la lecture** : `findCachedPois` ne filtrait que `dist_along_route_km`, jamais `dist_from_trace_m`. | Capture locale : pins jusqu'à **4 105 m** de la trace, alors que `CORRIDOR_WIDTH_M = 3000`. |
| 7 | **`amenity=shelter` = surtout des abribus** (découvert en validant le correctif : Overpass étant mort depuis mars, la catégorie n'avait jamais été vue peuplée). | Sur la bbox `47.509,7.591 → 47.615,7.897` : **241 des 294 éléments** remontés pour `shelter` sont `shelter_type=public_transport` (dont 237 sans nom), + 12 `picnic_shelter`, 3 `picnic_site`, 2 `gazebo`, 1 `wildlife_hide`. L'UI affichait « Refuge / Abri (189) ». |
| 8 | **Pins POI non peints avant la 1re interaction carte** (web, antérieur à cette story ; découvert en validant les correctifs). Les compteurs sidebar sont corrects mais la carte reste vide — vu de l'utilisateur, « la recherche ne renvoie rien ». | Recherche → « Hôtel (51) » en sidebar, **0 pin** sur la carte ; **un seul cran de zoom les fait apparaître tous instantanément** → la source GeoJSON et les calques contenaient bien les données. Les 8 SVG de pins répondent 200. L'effet `usePoiLayers` se résout (enregistrement d'images async) pendant l'animation de caméra de l'auto-zoom `fitToCorridorRange`, et le placement des symboles se calcule dans le cycle de rendu → aucun repaint demandé. |
| 9 | **Le toggle ne gouvernait que la COLLECTE, pas l'affichage** : les POI `overpass` déjà en cache (TTL **30 j**, contre 7 j pour Google) restaient renvoyés en OFF. Dès qu'une recherche ON avait peuplé une zone, ON et OFF donnaient exactement le même jeu → option perçue comme ignorée. | Fenêtre 0-15 km du segment de test : `findCachedPois` renvoyait **50 lignes `overpass` + 16 `google`** dans les deux modes (expiration au 18/09). |
| 10 | **Place Details Google enchaînés un par un** (`for (const placeId of placeIds) await …`) : sur une bbox froide, 50 à 90 allers-retours HTTP séquentiels. C'est ce qui rendait la 1re recherche d'une zone longue **quel que soit l'état du toggle** — les 4 calques étaient parallèles, pas les POI à l'intérieur. | Recherche froide `[0,25]` observée pendant cette story : 49 POI Google insérés, ~12-15 s de latence ressentie. |
| 11 | **La recherche partait AVANT que le flag Overpass soit connu** (web ET mobile) : `profile?.overpassEnabled ?? false` vaut `false` pendant le chargement du profil, donc une 1re requête partait en **OFF** (prefetch Google complet, coûteux), puis une 2e en **ON** à l'arrivée du profil. Conséquences : travail serveur doublé, résultat OFF rendu en premier, et — après un toggle — le jeu OFF déjà en cache client (`staleTime` 30 j) réaffiché **instantanément et à l'identique**. C'est l'explication complète de « l'option n'est pas prise en compte » + « OFF est long » + « ON instantané avec les mêmes résultats ». | Logs API d'**une seule** recherche navigateur, toggle ON en base : requête **OFF à 12:24:40.118** (prefetch Google, 45 POI insérés) puis requête **ON à 12:24:42.199** (`Cache MISS` → requête Overpass, ~11 s). Après correctif, même scénario : **une seule requête, directement en ON**, aucune requête OFF parasite. |
| 6 | **Dérive doc** : `MAX_SEARCH_RANGE_KM = 50` (shared, web, mobile, API) vs « 30 km max » dans `project-context.md`. | Logs prod avec `fromKm=101&toKm=151`. Valeur portée à 50 en MOB-4.3 (2026-06-14) sans Doc Sync. |

## Acceptance Criteria

1. **Given** l'API interroge Overpass, **When** la requête part, **Then** elle porte un `User-Agent` identifiant l'app (surchargeable via `OVERPASS_USER_AGENT`), et `overpass-api.de` répond 200.

2. **Given** une instance Overpass renvoie un statut inattendu (406, 500…), une erreur réseau ou un corps illisible, **When** `queryPois` s'exécute, **Then** l'instance suivante est essayée ; `queryPois` ne jette **que** si les 3 instances ont échoué (`All Overpass instances unavailable`). Un `429` provoque une attente puis un retry de la **même** instance (2 max) avant rotation.

3. **Given** Overpass échoue (ou est désactivé), **When** une recherche corridor ou live est lancée, **Then** le prefetch Google Places s'exécute quand même et ses résultats sont renvoyés.

4. **Given** la fenêtre demandée contient déjà des POI en cache, **When** la bbox correspondante n'a jamais été prefetchée pour ce segment, **Then** Google Places est appelé (gate = couverture, pas « ai-je un résultat »). **And** si la bbox a déjà été prefetchée pour ce segment, aucun appel Google n'est émis.

5. **Given** un prefetch Google dont au moins un layer a échoué, **When** il se termine, **Then** le marqueur de bbox n'est **pas** posé (la zone retente au lieu d'être verrouillée 7 jours).

6. **Given** un POI Google à moins de 100 m d'un POI d'une **autre** source, **When** les noms se ressemblent (`isLikelySamePlace`), **Then** le POI Google est ignoré ; **When** les noms désignent deux établissements distincts, **Then** il est inséré. Deux POI Google ne se dédoublonnent jamais entre eux.

7. **Given** un POI en cache au-delà de `CORRIDOR_WIDTH_M` de la trace, **When** une recherche corridor est lue, **Then** il n'est pas renvoyé. Le mode live (`findPoisNearPoint`, rayon autour d'un point) n'est pas concerné.

13. **Given** le profil utilisateur encore en cours de chargement, **When** une recherche POI est déclenchée (planning ou live, web ou mobile), **Then** aucune requête n'est émise tant que le flag Overpass n'est pas arrêté ; **And** l'écran reste en état « chargement » (pas de bannière « aucun résultat ») ; **And** une valeur en erreur ou une query `paused` (hors-ligne) débloque la recherche avec un repli sur OFF, sans attente infinie.

12. **Given** la « recherche étendue (Overpass) » désactivée, **When** une recherche corridor ou live lit le cache, **Then** les POI `source='overpass'` sont **exclus du résultat** (le toggle filtre à la lecture, pas seulement à la collecte) ; **And** activée, aucune source n'est masquée.

11. **Given** un prefetch Google sur une bbox froide, **When** les Place Details sont résolus, **Then** ils le sont avec une concurrence **bornée** (`GOOGLE_DETAILS_CONCURRENCY`) et non en série, et l'insertion se fait en **un seul batch par calque**.

10. **Given** une recherche qui vient d'aboutir et déclenche l'auto-zoom corridor, **When** les calques POI sont (re)construits, **Then** un repaint est explicitement demandé (`map.triggerRepaint()`) de sorte que les pins soient peints sans attendre une interaction utilisateur. Idem en mode live, et après l'enregistrement d'images de pins.

9. **Given** une recherche incluant la catégorie `shelter`, **When** la requête Overpass est construite, **Then** `amenity=shelter` n'est retenu qu'avec un `shelter_type` exploitable pour la nuit (`SLEEPABLE_SHELTER_TYPES`), les refuges de montagne passant par `tourism=alpine_hut|wilderness_hut` ; **And** `resolveCategory` applique la même règle (un abribus ne peut pas être classé `shelter`).

8. **Given** la doc de référence, **When** un agent lit `project-context.md`, **Then** la plage max est documentée à 50 km avec `MAX_SEARCH_RANGE_KM` comme source de vérité unique, et les règles 1→5 ci-dessus sont consignées comme patterns durables.

## Tasks / Subtasks

- [x] **T1** — `OverpassProvider` : `User-Agent` (const + override env `OVERPASS_USER_AGENT`), rotation exhaustive (aucun `throw` depuis la boucle), 429 → retry même instance avec délai surchargeable (`OVERPASS_RETRY_DELAY_MS`, 20 s en prod), garde sur corps illisible, logs de statut.
- [x] **T2** — `PoisService.findPois` (corridor) : prefetch Google **hors** du `try` Overpass ; suppression du court-circuit `dbCached.length > 0` ; log d'erreur reformulé (`Overpass API failed — Google Places results are still returned`).
- [x] **T3** — `PoisService.findLiveModePois` : bbox calculée avant le gate, prefetch Google hors du `try`, même suppression de court-circuit ; le HIT Redis Overpass déclenche aussi le prefetch Google (clés indépendantes).
- [x] **T4** — `prefetchGooglePoisOncePerBbox` : marqueur Redis `pois:google:seg:{segmentId}:bbox:{...}` (TTL `GOOGLE_PLACES_CACHE_TTL`), posé seulement si `complete === true` ; `prefetchAndInsertGooglePois` renvoie `{ complete, inserted }` en comptant les layers rejetés.
- [x] **T5** — `poi-dedup.ts` : `normalizePoiName`, `isLikelySamePlace` (égalité / inclusion ≥ 6 car. / Jaccard ≥ 0,5 sur jetons significatifs, mots génériques FR/DE/EN exclus), `POI_DEDUP_RADIUS_M = 100`.
- [x] **T6** — `PoisRepository` : `hasNearbyPoi` → `findNearbyPoisFromOtherSources(lat, lng, radiusM, segmentId, excludeSource)` (renvoie nom + source) ; log de dédoublonnage explicite (source + nom du voisin).
- [x] **T7** — `PoisRepository.findCachedPois` : filtre `dist_from_trace_m <= CORRIDOR_WIDTH_M`.
- [x] **T8** — Tests : `overpass.provider.test.ts` (+6 : UA, 406, 500, erreur réseau, corps illisible, 429→rotation ; le test « throws on 500 » devient une rotation) ; `pois.service.test.ts` (mock `findNearbyPoisFromOtherSources`, +7 : Google malgré échec Overpass corridor & live, gate de couverture corridor & live, marqueur posé/respecté, marqueur non posé si layer en échec, dédoublonnage nom identique / nom différent) ; `poi-dedup.test.ts` (nouveau, 9 cas).
- [x] **T9** — Doc Sync : `project-context.md` (section « Corridor Search » 30→50 km + nouvelle section « POI Search — Sources, Cache & Dédoublonnage »), stories impactées (4.3, 10.3, 16.1, 16.19), `sprint-status.yaml`.
- [x] **T11** — Filtre `shelter` : `CATEGORY_FILTERS` passe à `Record<string, string[][]>` (prédicats ANDés → `node["a"="b"]["c"~"d"]`), `SLEEPABLE_SHELTER_TYPES` exporté (`basic_hut`, `weather_shelter`, `lean_to`, `rock_shelter`), `resolveCategory` aligné. Tests : +1 provider (sélecteur shelter, absence de sélecteur `amenity=shelter` nu), +2 service (mapping des 3 variantes valides / rejet d'un abribus). Purge locale : 336 lignes de bruit + les 2 clés `pois:bbox:*` (elles stockent les POI **bruts** de l'ancienne requête et les auraient ré-insérés au prochain HIT). Prod : rien à purger (0 shelter non expiré, aucune clé `pois:bbox:*` — Overpass étant HS depuis mars, la pollution ne s'y est jamais matérialisée).
- [x] **T15** — Garde `ready` sur le flag Overpass : helper `useOverpassEnabled()` (web `hooks/use-profile.ts`, mobile `hooks/use-profile.ts`) renvoyant `{ overpassEnabled, ready }`, `ready = isSuccess || isError || fetchStatus === 'paused'` (ne jamais bloquer indéfiniment hors-ligne). Câblé sur les 4 points qui déclenchent une requête : web `use-pois` (gate `segmentRanges` + `isPending` inclut l'attente profil pour éviter le flash « aucun résultat »), web `use-live-poi-search` (`canSearch`), mobile `map/[id].tsx` (`enabled`), mobile `use-live-poi-search` (`canSearch`). Les usages purement d'affichage (`settings/page.tsx`, `overpass-toggle-section`) gardent `?? false`. Tests : web +2 (aucune query tant que `ready:false` **et** `isPending` vrai ; query avec `overpassEnabled:true` une fois résolu) + mocks `useOverpassEnabled` ; mobile +1 (`canSearch` faux tant que `ready:false`) + 3 mocks.
- [x] **T13** — Toggle effectif à la lecture : `findCachedPois(…, excludeSources)` (Drizzle `notInArray`) + `findPoisNearPoint(…, excludeSources)` (SQL `source <> ALL(…)`), constante `OVERPASS_SOURCES`, câblés sur les 4 lectures corridor et les 3 lectures live. Tests : +3 (corridor OFF → `['overpass']`, corridor ON → `[]`, live OFF → `['overpass']`) + 2 assertions d'arguments mises à jour.
- [x] **T14** — Latence du prefetch : `mapWithConcurrency` (`src/common/utils/`, nouveau, générique, ordre d'entrée préservé, limite clampée ≥ 1) appliqué aux Place Details avec `GOOGLE_DETAILS_CONCURRENCY = 6`, et **une seule insertion batchée par calque** au lieu d'un INSERT par POI. Le dédoublonnage étant désormais cross-source uniquement, l'ordre de traitement n'a plus d'incidence sur le résultat — c'est ce qui rend la parallélisation sûre. Tests : `map-with-concurrency.test.ts` (nouveau, 6 cas dont pic de concurrence ≤ 6 et > 1, ordre préservé, chaque item traité une seule fois).
- [x] **T12** — Repaint des pins (web) : `map.triggerRepaint()` en fin de construction des calques dans `use-poi-layers.ts` **et** `use-live-poi-layers.ts` (parité — en live l'utilisateur a les mains sur le guidon, l'interaction salvatrice peut ne jamais venir), plus un repaint dans `registerPoiPinImages` **si et seulement si** au moins une image a été ajoutée (un calque symbole qui a rendu avec un `icon-image` manquant ne se redessine pas tout seul quand l'image arrive). Tests : `use-poi-layers.test.ts` (+`triggerRepaint` au mock map, +2 cas : repaint demandé / pas de repaint si l'effet sort tôt sur style non chargé) ; `poi-pin-factory.test.ts` **nouveau** (2 cas : 10 images enregistrées en 120×150 @pixelRatio 2 + 1 repaint ; idempotence → ni `addImage` ni repaint).
- [x] **T10a** — Validation end-to-end locale dans le navigateur connecté de Guillaume (Claude in Chrome) — voir « Validation end-to-end locale » ci-dessous.
- [x] **T10b** — Validation prod par Guillaume après déploiement (voir « Vérification post-déploiement »). — **validé en prod par Guillaume le 2026-08-20** : recherche étendue testée directement sur `ridenrest.app`, fonctionnelle.

## Dev Notes

### Fichiers touchés

| Fichier | Nature |
|---|---|
| `apps/api/src/pois/providers/overpass.provider.ts` | UA + rotation exhaustive |
| `apps/api/src/pois/pois.service.ts` | prefetch hors try, gate de couverture, dédoublonnage |
| `apps/api/src/pois/pois.repository.ts` | `findNearbyPoisFromOtherSources`, filtre corridor |
| `apps/api/src/pois/poi-dedup.ts` | **nouveau** — helpers purs de correspondance de nom |
| `apps/api/src/pois/poi-dedup.test.ts` | **nouveau** |
| `apps/api/src/pois/pois.service.test.ts`, `providers/overpass.provider.test.ts` | tests mis à jour |
| `_bmad-output/project-context.md` | Doc Sync (2 sections) |

### Décisions

- **Plage max : 50 km conservés** (pas de retour à 30). Le code, l'UI web, l'UI mobile et l'usage réel en prod sont à 50 depuis MOB-4.3 ; réduire la valeur serait une régression fonctionnelle visible. La justification d'origine (bbox Overpass trop large) est consignée dans `project-context.md` comme premier levier si Overpass se remet à timeouter.
- **Marqueur de prefetch scopé par segment** et non par bbox seule : les lignes `accommodations_cache` sont insérées par `segment_id`, une clé cross-user ferait hériter « déjà cherché » au segment d'un autre utilisateur, qui resterait vide.
- **Filtre corridor à la lecture (AC7) = changement visible** : les POI déjà en cache entre 3 et 4+ km de la trace disparaissent de l'affichage planning. Assumé — c'est le sens du couloir annoncé par l'UI, et cela supprime une dépendance à la forme du rectangle de recherche.
- **Coût Google** : le gate de couverture augmente le nombre de recherches Text Search (gratuites, tier IDs Only) mais pas les Place Details facturés — `googlePoiExistsInSegment` + cache Redis `google_place_details:{placeId}` (7 j) restent en amont de chaque appel facturé.
- **Dédoublonnage** : rayon inchangé (100 m, échelle de la dérive de coordonnées OSM), c'est la **condition de nom** et la restriction **cross-source** qui font le travail.

### Hors scope (relevé, non traité)

- Aucune remontée UI d'un échec Overpass : quand les 3 instances tombent, l'utilisateur voit des résultats Google sans savoir que la recherche étendue n'a pas abouti. Candidat `deferred-work.md`.
- Le toggle Overpass n'est pas un filtre d'affichage : les POI `source='overpass'` déjà en cache (TTL 30 j) restent visibles après passage en OFF. Comportement d'origine, non modifié.
- `MAX_SEARCH_RANGE_KM` documenté mais toujours dupliqué en alias local `MAX_RANGE_KM` côté web et mobile (import du shared, pas de valeur en dur — acceptable).

## Testing

Gate exécutée le 2026-08-19 :

- `apps/api` : **442/442 tests, 38 suites** (dont 189 sur `src/pois`), `tsc --noEmit` 0 erreur, `eslint src/pois/**` 0 issue.
- Repro terrain (hors CI) : requête Overpass réelle sur la bbox du segment litigieux (47.6488,8.3528 → 47.7556,8.5356) — sans UA : 406 / 429 / 200 ; avec UA : **200, 56 éléments**.

### Validation end-to-end locale (2026-08-19, navigateur connecté)

Exécutée sur l'aventure locale « Test DE » (`segment e69d184a`), profil Guillaume avec **Overpass activé**. État de départ : 41 POI `google`, **0 POI `overpass`**, aucune clé Redis `pois:*`.

| Action | Observation | AC couvert |
|---|---|---|
| Recherche corridor `[0,15]` km | **298 lignes `source='overpass'` insérées** — première insertion Overpass depuis le 2026-03-30. `google` 41 → 68. | AC1, AC2, AC3 |
| — | Clés Redis créées : `pois:bbox:47.509:7.591:47.59:7.803:…` (TTL 30 j) **et** `pois:google:seg:e69d184a…:bbox:47.509:7.591:47.59:7.803` (TTL 7 j, scopée segment). | AC4 |
| Compteurs UI vs SQL | UI : Hôtel **49** · Camping **4** · Refuge/Abri **166** · Auberge **4** · Chambre d'hôte **4**. Requête avec `dist_from_trace_m <= 3000` : **49 / 4 / 166 / 4 / 4** — correspondance exacte. Sans le filtre : 53 / 4 / 216 / 4 / 5 (max observé **5 311 m** de la trace). | AC7 |
| Élargissement `[0,15]` → `[0,25]` km, re-recherche | Nouvelle bbox → **nouvelle** paire de clés (`…:bbox:47.509:7.591:47.615:7.897`) et **nouvel appel Google** malgré une fenêtre déjà peuplée : `google` 68 → **117**, `overpass` 298 → **405**. C'est exactement l'action qui, avec l'ancien court-circuit, renvoyait le jeu figé sans aucun appel API. | AC4 |
| Dédoublonnage | Sur les 117 POI Google du segment, **38 auraient été supprimés par l'ancienne règle** (voisin < 100 m toute source confondue) ; ils sont conservés car les noms diffèrent. | AC6 |
| Filtre `shelter` (T11) | Requête réelle sur la même bbox : **294 → 5 éléments** (3 `weather_shelter` + 2 `lean_to`), les 241 abribus éliminés. Après purge + re-recherche : UI « Refuge / Abri » **166 → 3**, hôtels 51, et les 3 abris restants sont de vrais abris (2 `lean_to`, 1 `weather_shelter`). | AC9 |
| Repaint des pins (T12) | ⚠️ **Non re-vérifié visuellement** : après les éditions web, la carte ne rend plus du tout dans les onglets pilotés (style et sprites en 200, **aucune requête de tuile vectorielle** → contexte WebGL indisponible dans l'onglet automatisé, y compris dans un onglet neuf). Correctif couvert par tests unitaires + diagnostic confirmé (un cran de zoom peignait tout). **Vérification visuelle à faire par Guillaume** : recherche → les pins doivent apparaître sans toucher la carte. | AC10 |
| Toggle effectif (T13) | Même fenêtre `[0,15]`, même trace, navigateur connecté : **Overpass ON → 66 POI** (Hôtel 51 · Camping 4 · Refuge 3 · Auberge 4 · Chambre d'hôte 4) contre **OFF → 16 POI** (Hôtel 13 · Camping 0 · Refuge 0 · Auberge 1 · Chambre d'hôte 2). Requête émise sans `overpassEnabled` → HTTP 200. Conforme au décompte SQL (16 `google` / 50 `overpass` dans la fenêtre). | AC12 |
| Latence (T14) | ⚠️ **Pas de mesure froide comparative** : 163 `google_place_details:*` étaient déjà en cache Redis, donc la recherche testée n'a quasiment pas appelé Google (prefetch bouclé en < 1 s). Forcer une mesure froide impliquait de purger ce cache → appels Place Details **facturés** re-payés : non fait sans ton accord. Gain établi structurellement (6 en vol au lieu de 1) + couvert par test unitaire. | AC11 |
| Double requête (T15) | Avant : logs d'une seule recherche = requête **OFF à 12:24:40** puis **ON à 12:24:42**. Après : **une seule requête, `overpassEnabled=true`**, chemin serveur `Cache HIT` + prefetch Google sauté. Vérifié dans le navigateur connecté, logs API à l'appui. | AC13 |
| Latence mesurée à froid (curl authentifié, fenêtre neuve 120-135 km) | **OFF : 2,1 s → 10 POI** (google seul) · **ON : 10,9 s → 23 POI** (10 google + 13 overpass). Conforme à la promesse de l'UI : OFF plus rapide et moins complet, ON plus lent et plus complet. | AC11, AC12 |
| Console navigateur | 0 erreur. Pins rendus le long de la trace, clusters et auto-zoom corridor fonctionnels. | — |

### Vérification post-déploiement (T10b, Guillaume)

1. Logs API : plus aucun `Overpass API failed` sur les requêtes `overpassEnabled=true`.
2. `select source, count(*), max(cached_at) from accommodations_cache group by 1;` → des lignes `overpass` avec `cached_at` du jour.
3. Toggle Overpass ON/OFF sur une même fenêtre → l'ON doit renvoyer **plus** de résultats (Google + OSM).
4. Recherche sur une fenêtre étroite puis élargissement → le jeu de résultats doit s'enrichir (plus de gel).
5. Contrôle visuel : plus de pin au-delà de ~3 km de la trace en planning.

⚠️ Les caches existants restent en place : les fenêtres déjà « verrouillées » avant déploiement se débloquent au prochain prefetch (nouvelle bbox = nouveau marqueur, l'ancien court-circuit n'existant plus). Aucune purge manuelle nécessaire ; un `DEL pois:*` sur Redis prod accélérerait juste la re-population.

## Change Log

| Date | Auteur | Changement |
|---|---|---|
| 2026-08-19 | Claude Opus 5 (dev) | Story créée après RCA sur logs prod + DB prod/local. T1→T9 implémentés, gate verte (442 tests API). |
| 2026-08-19 | Claude Opus 5 (dev) | T10a : validation end-to-end locale dans le navigateur connecté (Overpass réinsère 405 lignes, gate de couverture re-déclenche Google à l'élargissement, compteurs UI == SQL filtrée corridor, 0 erreur console). T10b (prod) en attente de déploiement. Relevé hors scope : `amenity=shelter` pollue « Refuge / Abri » (238 abribus sur 291) → `deferred-work.md`. |
| 2026-08-20 | Claude Opus 5 (dev) | Déployé en prod (squash merge PR #11 → `main`, sha `822adef`). CI verte : lint 0 erreur / 7 warnings, typecheck 0, API 462/462, mobile 632/632, web 100/100 fichiers. `Deploy to VPS` success ; `api/health` 200, `ridenrest.app` 200. **T10b validé par Guillaume** : recherche étendue vérifiée en conditions réelles → story `done`. |
