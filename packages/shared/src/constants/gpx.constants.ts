/** Maximum number of GPX track points after RDP simplification */
export const MAX_GPX_POINTS = 2000

/** RDP epsilon in km — 0.0001 ≈ 10m deviation threshold */
export const RDP_EPSILON = 0.0001

/**
 * Seuil d'AFFICHAGE d'un POI : au-delà de cette distance perpendiculaire à la trace, le POI
 * n'est pas rendu (`findCachedPois` filtre `dist_from_trace_m <= CORRIDOR_WIDTH_M`).
 *
 * ⚠️ Cette constante gouvernait AUSSI le tampon de la bbox de collecte jusqu'au 2026-08-20 :
 * un seul nombre pour deux décisions sans rapport, donc impossible d'élargir l'affichage sans
 * élargir la zone interrogée chez Google et Overpass. Voir `POI_BBOX_BUFFER_M`.
 */
export const CORRIDOR_WIDTH_M = 3000

/**
 * Tampon appliqué à la bbox envoyée aux fournisseurs externes (Google, Overpass).
 *
 * Séparé de `CORRIDOR_WIDTH_M` le 2026-08-20 : les deux valent 3 000 m, donc **aucun changement
 * de comportement**, mais les deux leviers sont désormais indépendants. Élargir celui-ci coûte
 * de la surface de recherche ; élargir l'autre ne coûte rien depuis que le prefetch ne fait plus
 * d'appel par POI (cf. règle 11 de `project-context.md`).
 */
export const POI_BBOX_BUFFER_M = 3000



/** Maximum km range for a single POI corridor search (planning mode) */
export const MAX_SEARCH_RANGE_KM = 50

/**
 * Rayon de recherche maximal — **planning ET live**, même plafond parce que c'est le même
 * concept côté utilisateur : « chercher dans un rayon de X km ».
 *
 * Le planning imposait 3 km en dur et invisible, alors que le live laissait déjà régler
 * (défaut 5 km, jusqu'à 20). L'app était donc plus généreuse sur le vélo qu'au bureau, et ne
 * laissait ajuster que là où c'est le moins pratique — corrigé le 2026-08-20.
 */
export const MAX_SEARCH_RADIUS_KM = 20

/** @deprecated Utiliser `MAX_SEARCH_RADIUS_KM` — même valeur, nom devenu trop étroit. */
export const MAX_LIVE_RADIUS_KM = MAX_SEARCH_RADIUS_KM

/**
 * Rayon par défaut d'une recherche planning : **3 km**, soit le comportement historique.
 *
 * Le mode live part de 5 km, et aligner les deux était tentant — écarté par Guillaume le
 * 2026-08-20 : les marqueurs de couverture Google sont indexés sur la bbox, donc changer le
 * défaut aurait relancé un prefetch sur **toutes** les zones déjà cherchées. Le réglage étant
 * désormais à la main de l'utilisateur, il n'y a pas de raison de lui imposer ce coût.
 *
 * Garder la même valeur que `CORRIDOR_WIDTH_M` n'est pas une coïncidence : c'est ce qui rend
 * l'ajout du réglage strictement additif, sans changement de comportement par défaut.
 */
export const DEFAULT_SEARCH_RADIUS_KM = 3

/** Maximum GPX file size in bytes (10MB) */
export const MAX_GPX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/** Default cycling speed for ETA estimates when no user preference is set */
export const DEFAULT_CYCLING_SPEED_KMH = 15
