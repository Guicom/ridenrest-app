import type { MapLayer, PoiCategory } from '../types/poi.types'

/** Couleur hex par PoiCategory — source de vérité carte + UI */
export const POI_CATEGORY_COLORS: Record<PoiCategory, string> = {
  hotel:        '#F97316',
  camp_site:    '#38BDF8',
  shelter:      '#84CC16',
  guesthouse:   '#EC4899',
  hostel:       '#8B5CF6',
  restaurant:   '#EF4444',
  supermarket:  '#A855F7',
  convenience:  '#A855F7',
  bike_shop:    '#14B8A6',
  bike_repair:  '#14B8A6',
}

/** Couleur unifiée des clusters — vert brand Ride'n'Rest */
export const POI_CLUSTER_COLOR = '#2D6A4A'

/** Couleur représentative par layer — boutons de filtre sidebar/live */
export const POI_LAYER_COLORS: Record<MapLayer, string> = {
  accommodations: '#F97316',
  restaurants:    '#EF4444',
  supplies:       '#A855F7',
  bike:           '#14B8A6',
}
