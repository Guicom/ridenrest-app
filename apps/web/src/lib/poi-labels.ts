import type { PoiCategory } from '@ridenrest/shared'

/**
 * Libellé contextualisé de l'itinéraire d'accès vers un POI d'hébergement.
 *
 * Doc Sync (Story 2.4) : la story planifiée référençait un type `PoiSubcategory`
 * (`hotel/camping/refuge/hostel/guesthouse/gite`) qui n'existe pas dans le projet.
 * La source de vérité est `PoiCategory` (`packages/shared/src/types/poi.types.ts`).
 * Les catégories d'hébergement réelles sont : hotel, hostel, camp_site, shelter,
 * guesthouse — d'où le mapping ci-dessous (camp_site → camping, shelter → refuge).
 * Il n'existe pas de catégorie `gite`. Toute autre catégorie retombe sur le fallback.
 */
const ACCESS_LABELS: Partial<Record<PoiCategory, string>> = {
  hotel: "Itinéraire vers l'hôtel",
  hostel: "Itinéraire vers l'auberge",
  camp_site: 'Itinéraire vers le camping',
  shelter: 'Itinéraire vers le refuge',
  guesthouse: "Itinéraire vers la chambre d'hôte",
}

const ACCESS_LABEL_FALLBACK = "Itinéraire d'accès"

export function getAccessLabel(category: PoiCategory | null | undefined): string {
  if (!category) return ACCESS_LABEL_FALLBACK
  return ACCESS_LABELS[category] ?? ACCESS_LABEL_FALLBACK
}
