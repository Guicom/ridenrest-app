# Story 17.16 : Corridor — séparer collecte et affichage, et dire ce qui est masqué

Status: review

> **2026-08-20** — Lot unique api + web + mobile. Origine : un camping trouvé par le nouveau prefetch Google, à **3 263 m** de la trace, écarté par le filtre corridor à 3 000 m — pour 263 mètres. L'écran affichait « Camping (0) », indiscernable d'une absence réelle.

## Contexte

Le filtre corridor est **correct** : il garde l'affichage cohérent avec le couloir annoncé, indépendamment de la forme du rectangle de recherche (mesuré : le rectangle est 40 à 57 % plus grand que le corridor). Deux choses ne l'étaient pas.

**Une constante pour deux décisions sans rapport.** `CORRIDOR_WIDTH_M` gouvernait à la fois le tampon de la bbox envoyée à Google et Overpass (`pois.service.ts`) et le seuil d'affichage à la lecture (`pois.repository.ts`). Impossible d'élargir l'affichage sans élargir la zone interrogée.

**La coupe était silencieuse.** Même forme de défaut que la panne Overpass restée invisible cinq mois : rien ne distinguait « il n'y a rien » de « il y a quelque chose juste au-delà de la limite ». Volumétrie mesurée en base : **599 POI** au-delà de 3 000 m — 469 Google (20,3 %) et 130 Overpass (27,3 %), le plus lointain à 10 444 m.

## Décision de conception : endpoint séparé, pas un champ de plus

Le `ResponseInterceptor` place le tableau de POI **directement** dans `data`. Ajouter un champ à la réponse de `/pois` transformerait `data` d'un tableau en objet et **casserait les binaires mobiles déjà distribués**, qui parlent à l'API de prod. D'où `GET /pois/near-miss-count`, séparé et non bloquant.

## Acceptance Criteria

1. **Given** la collecte et l'affichage, **When** on lit les constantes, **Then** deux valeurs distinctes les gouvernent (`POI_BBOX_BUFFER_M`, `CORRIDOR_WIDTH_M`), toutes deux à 3 000 m → **aucun changement de comportement**.
2. **Given** une recherche, **When** des POI tombent dans `]CORRIDOR_WIDTH_M, POI_NEAR_MISS_MAX_M]`, **Then** l'API en renvoie le nombre et la distance du plus proche.
3. **Given** un POI au-delà de `POI_NEAR_MISS_MAX_M` (6 km), **When** on compte, **Then** il est ignoré — au-delà, c'est une autre vallée et le message ne voudrait plus rien dire.
4. **Given** un segment qui n'appartient pas à l'utilisateur, **When** il appelle l'endpoint, **Then** 404 — aucun accès POI sans contrôle de propriété.
5. **Given** aucun calque visible, **When** le client s'apprête à compter, **Then** aucune requête ne part (`categories: []` serait interprété par l'API comme « toutes »).
6. **Given** la recherche étendue coupée, **When** on compte, **Then** les POI Overpass sont exclus du compte comme ils le sont de l'affichage.
7. **Given** plusieurs segments couverts, **When** on agrège, **Then** somme des comptes et minimum des distances.
8. **Given** des POI masqués, **When** l'utilisateur regarde les compteurs, **Then** une ligne discrète le dit, avec le seuil et la distance du plus proche — **sans rien changer à ce qui est rendu sur la carte**.
9. **Given** le web et le mobile, **When** on compare, **Then** même comportement et même message (parité).

## Tâches

- [x] **T1** — `packages/shared` : `CORRIDOR_WIDTH_M` (affichage) documentée, `POI_BBOX_BUFFER_M` (collecte) et `POI_NEAR_MISS_MAX_M` (borne du signalement) ajoutées.
- [x] **T2** — `pois.service.ts` utilise `POI_BBOX_BUFFER_M` pour la bbox ; `pois.repository.ts` garde `CORRIDOR_WIDTH_M` pour la lecture.
- [x] **T3** — `countNearMissPois()` (repository) + `segmentBelongsToUser()` (contrôle de propriété par EXISTS, sans charger les waypoints).
- [x] **T4** — `CountNearMissDto`, méthode de service, endpoint `GET /pois/near-miss-count` déclaré avant `@Get(':id')`.
- [x] **T5** — Web : `getNearMissCount`, requête portée par `usePois` (une par segment), `NearMissNotice` sous les compteurs.
- [x] **T6** — Mobile : même chose, + clés i18n FR/EN et `formatNearMissDistance` locale-aware.
- [x] **T7** — Tests : +4 API, +10 web, +7 mobile.
- [ ] **T8** — Validation par Guillaume : sur la fenêtre où le camping à 3 263 m a été trouvé, la ligne doit apparaître et annoncer « le plus proche à 3,3 km ».

## Ce que ce lot ne fait PAS

Il ne change **rien** à ce qui s'affiche. Aucun POI supplémentaire n'apparaît sur la carte, aucun seuil n'est déplacé. Il supprime uniquement la partie indéfendable : l'invisibilité de la coupe.

L'affichage différencié — pin atténué + distance d'accès **réelle** issue de BRouter, déjà calculée dans `accommodations_cache` (`access_distance_m`, `access_variants`) — reste à faire. C'est la suite naturelle : on filtre aujourd'hui sur une distance perpendiculaire à vol d'oiseau alors qu'on possède le détour routé. Voir `action-plan.md`.

## Gate

| | |
|---|---|
| API | **475/475** (39 suites) — +4 |
| Web | **1183/1183** (101 fichiers) — +10 |
| Mobile | **657/657** (97 suites) — +7 |
| Packages | shared 41 · gpx 22 · analytics 26 |
| `turbo lint` + `turbo typecheck` | 16/16 |

## Change Log

| Date | Auteur | Changement |
|---|---|---|
| 2026-08-20 | Claude Opus 5 (dev) | Story créée et implémentée (T1→T7). Défaut trouvé en cours d'implémentation et corrigé : la requête de comptage partait même sans calque visible, donc avec `categories: []` — que l'API interprète comme « toutes les catégories ». Gardée derrière `nearMissCategories.length > 0` des deux côtés. |
