import type { PoiCategory } from '@ridenrest/shared';

// Libellé contextualisé de l'itinéraire d'accès vers un POI d'hébergement (MOB-4.6 /
// T3, AC4 — port du web `apps/web/src/lib/poi-labels.ts`, non partagé, **reproduit ici
// via i18n**). Fonction PURE : elle renvoie une **clé i18n** (pas une chaîne traduite)
// → testable sans i18n, et le composant fait `t(getAccessLabelKey(category))`.
//
// Catégories d'hébergement réelles (`LAYER_CATEGORIES.accommodations`) : hotel, hostel,
// camp_site, shelter, guesthouse. Toute autre catégorie (ou `null`) retombe sur le
// fallback « Itinéraire d'accès ».

const ACCESS_LABEL_CATEGORIES: PoiCategory[] = [
  'hotel',
  'hostel',
  'camp_site',
  'shelter',
  'guesthouse',
];

export const ACCESS_LABEL_FALLBACK_KEY = 'pois.access.label.fallback';

/**
 * Renvoie la clé i18n du libellé d'accès pour une catégorie de POI.
 * @example getAccessLabelKey('hotel') === 'pois.access.label.hotel'
 * @example getAccessLabelKey('restaurant') === 'pois.access.label.fallback'
 * @example getAccessLabelKey(null) === 'pois.access.label.fallback'
 */
export function getAccessLabelKey(
  category: PoiCategory | null | undefined,
): string {
  if (category && ACCESS_LABEL_CATEGORIES.includes(category)) {
    return `pois.access.label.${category}`;
  }
  return ACCESS_LABEL_FALLBACK_KEY;
}
