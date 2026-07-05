import { POI_CATEGORY_COLORS } from '@ridenrest/shared';
import type { PoiCategory } from '@ridenrest/shared';
import type { ImageRequireSource } from 'react-native';

// Fabrique des pins POI (MOB-4.2 / AC2, T5). Source de vérité couleur = canon
// `POI_CATEGORY_COLORS` (`@ridenrest/shared`) — JAMAIS de hex hardcodé ici.
//
// ── Rendu « goutte » (parité web) ────────────────────────────────────────────
// Le web rastérise des SVG goutte → `map.addImage()` → `SymbolLayer icon-image`.
// On reproduit la MÊME goutte sur mobile : les 8 SVG web (`apps/web/public/images/
// poi-icons/*.svg`) sont rastérisés en PNG 180×225 (net jusqu'au @3x) dans
// `assets/poi-pins/`, enregistrés via `<Images>` (require), puis référencés par un
// `SymbolLayer icon-image` data-driven (`icon-anchor: 'bottom'`, la pointe sur le
// point GPS). Le clustering natif (`cluster:true`, EXIGÉ par l'AC2) reste compatible :
// seuls les pins individuels passent en symbole ; clusters = cercle + compteur.
//
// Dégradation gracieuse : une catégorie sans image enregistrée n'affiche simplement
// pas de pin (parité web « SVG manquant »), aucune erreur.
//
// Ce module reste **pur** (zéro dépendance React/MapLibre composant) → testable.

/** Couleur canon d'un POI selon sa catégorie (badge fiche, repli). */
export function poiPinColor(category: PoiCategory): string {
  return POI_CATEGORY_COLORS[category];
}

/**
 * Mapping `PoiCategory` → nom de fichier goutte (parité web `CATEGORY_PIN_FILE`).
 * Plusieurs catégories partagent une même goutte (supplies, bike).
 */
export const CATEGORY_PIN_FILE: Record<PoiCategory, string> = {
  hotel: 'hotel',
  camp_site: 'camp-site',
  shelter: 'shelter',
  guesthouse: 'guesthouse',
  hostel: 'hostel',
  restaurant: 'restaurant',
  supermarket: 'supplies',
  convenience: 'supplies',
  bike_shop: 'bike',
  bike_repair: 'bike',
};

/** Clé d'image MapLibre pour une goutte (par FICHIER → dédupe les sources). */
export function poiPinImageKey(file: string): string {
  return `poi-pin-${file}`;
}

/**
 * Sources d'images des gouttes, prêtes pour `<Images images={…} />`. Clé = clé
 * d'image MapLibre (`poi-pin-{file}`), valeur = `require` du PNG bundlé. Une entrée
 * par FICHIER unique (les `require` doivent être statiques en RN — pas de clé dynamique).
 */
export const PIN_IMAGE_SOURCES: Record<string, ImageRequireSource> = {
  'poi-pin-hotel': require('../../../assets/poi-pins/hotel.png'),
  'poi-pin-camp-site': require('../../../assets/poi-pins/camp-site.png'),
  'poi-pin-shelter': require('../../../assets/poi-pins/shelter.png'),
  'poi-pin-guesthouse': require('../../../assets/poi-pins/guesthouse.png'),
  'poi-pin-hostel': require('../../../assets/poi-pins/hostel.png'),
  'poi-pin-restaurant': require('../../../assets/poi-pins/restaurant.png'),
  'poi-pin-supplies': require('../../../assets/poi-pins/supplies.png'),
  'poi-pin-bike': require('../../../assets/poi-pins/bike.png'),
};

/**
 * Expression MapLibre data-driven mappant `category` → clé d'image goutte, pour le
 * `icon-image` du calque de pins individuels. Fallback = `''` (image inconnue →
 * pin invisible, parité web « SVG manquant »). Construite depuis `CATEGORY_PIN_FILE`
 * → aucune clé dupliquée.
 *
 * @example ['match', ['get','category'], 'hotel', 'poi-pin-hotel', …, '']
 */
export function buildCategoryIconExpression(): unknown[] {
  const pairs = (Object.keys(CATEGORY_PIN_FILE) as PoiCategory[]).flatMap(
    (category) => [category, poiPinImageKey(CATEGORY_PIN_FILE[category])],
  );
  return ['match', ['get', 'category'], ...pairs, ''];
}

/**
 * Expression MapLibre data-driven mappant `category` → couleur canon. Conservée
 * comme repli/usage générique (badge, densité) ; non utilisée par le calque pins
 * depuis le passage aux gouttes. Fallback = couleur `hotel`.
 */
export function buildCategoryColorExpression(): unknown[] {
  const pairs = (Object.keys(POI_CATEGORY_COLORS) as PoiCategory[]).flatMap(
    (category) => [category, POI_CATEGORY_COLORS[category]],
  );
  return ['match', ['get', 'category'], ...pairs, POI_CATEGORY_COLORS.hotel];
}
