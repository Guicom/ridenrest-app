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

/**
 * Borne du signalement « POI proches mais masqués ».
 *
 * Un POI entre `CORRIDOR_WIDTH_M` et cette valeur est un quasi-manqué digne d'être annoncé —
 * cas réel : un camping à 3 263 m, écarté pour 263 m, sans que rien ne l'indique à l'écran.
 * Au-delà, c'est une autre vallée : le compter dirait « 12 masqués » et ne voudrait plus rien
 * dire. Mesuré sur la base : 599 POI sont au-delà de 3 000 m, le plus lointain à 10 444 m.
 */
export const POI_NEAR_MISS_MAX_M = 6000

/** Maximum km range for a single POI corridor search (planning mode) */
export const MAX_SEARCH_RANGE_KM = 50

/** Maximum radius in km for live mode POI search (distance from trace) */
export const MAX_LIVE_RADIUS_KM = 20

/** Maximum GPX file size in bytes (10MB) */
export const MAX_GPX_FILE_SIZE_BYTES = 10 * 1024 * 1024

/** Default cycling speed for ETA estimates when no user preference is set */
export const DEFAULT_CYCLING_SPEED_KMH = 15
