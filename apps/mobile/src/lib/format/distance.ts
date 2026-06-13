// Formatage des distances (MOB-3.3 / T6, AC4). FONCTION DE FORMATAGE PURE — elle ne
// recalcule JAMAIS une distance (anti-pattern explicitement proscrit par l'archi
// mobile : pas de haversine/parse GPX côté UI). Les valeurs `cumulativeStartKm` /
// `distanceKm` / `totalDistanceKm` sont déjà calculées serveur
// (`SegmentsService.recomputeCumulativeDistances` via `@ridenrest/gpx`) et renvoyées
// par l'API ; ce helper se contente de les afficher.
//
// `Intl.NumberFormat` est dispo sous Hermes (RN 0.85 / SDK 56). Le séparateur
// décimal suit la locale (`,` en FR, `.` en EN) — zéro hardcoding. Le suffixe
// « km » vit dans les chaînes i18n (`adventures.segments.*`), pas ici, pour rester
// composable.

/**
 * Formate un nombre de kilomètres avec au plus 1 décimale, séparateur localisé.
 *
 * @param km    valeur déjà fournie par le serveur (ne pas recalculer).
 * @param locale BCP-47 (`'fr'`, `'en'`…). Défaut `'fr'`.
 * @returns ex. `formatKm(42.34, 'fr') === '42,3'`, `formatKm(0) === '0'`.
 */
export function formatKm(km: number, locale = 'fr'): string {
  const value = Number.isFinite(km) ? km : 0;
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
  }).format(value);
}
