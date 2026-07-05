// Formatage distance / élévation / ETA pour les métriques d'accès (MOB-4.6 / T4 —
// port du web `apps/web/src/components/poi-access/format.ts`).
//
// FONCTIONS DE FORMATAGE PURES — elles ne recalculent JAMAIS une distance/un temps : les
// valeurs (`distanceM`, `elevationGainM`, `etaS`) sont déjà calculées serveur (BRouter)
// et renvoyées par l'API.
//
// MOB-6.3 / T2 : séparateur décimal **localisé** (`Intl.NumberFormat` + `locale`, défaut
// `'fr'`) — virgule en FR, point en EN. Fini le `.replace('.', ',')` figé (rendait "1,4 km"
// même en anglais). Modèle : `src/lib/format/distance.ts`. `Intl` est dispo sous Hermes.
// - distance < 1000 m → "X m" (entier) ; ≥ 1000 m → "X,X km" / "X.X km" (1 décimale fixe)
// - élévation → "X m" (entier, séparateur de milliers localisé)

/** Distance d'accès : "740 m" sous le km, sinon "1,4 km" (FR) / "1.4 km" (EN). */
export function formatAccessDistance(distanceM: number, locale = 'fr'): string {
  // Choix de l'unité sur la valeur ARRONDIE : 999,6 m → "1,0 km" (et non "1000 m").
  if (Math.round(distanceM) < 1000) return `${Math.round(distanceM)} m`;
  const km = distanceM / 1000;
  // 1 décimale FIXE (min = max) → conserve le "1,0 km"/"2.0 km" de l'ancien `toFixed(1)`.
  const value = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(km);
  return `${value} km`;
}

/** Élévation (D+/D-) : entier en mètres, "X m" (séparateur de milliers localisé). */
export function formatAccessElevation(elevationM: number, locale = 'fr'): string {
  const value = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(Math.round(elevationM));
  return `${value} m`;
}

/**
 * Temps de trajet estimé (BRouter `etaS`, en secondes) → "~XhMM" au-delà d'une heure,
 * "~X min" sinon, "<1 min" pour une durée positive qui arrondirait à 0, "—" si vide.
 * Contrairement au web (qui dérive l'ETA d'une vitesse), on affiche directement l'`etaS`
 * fourni par BRouter — c'est le critère de tri des variantes (story 4.6 / T5).
 *
 * MOB-6.3 / T2 : le paramètre `locale` est accepté pour l'homogénéité de la façade de
 * formatage (les call-sites passent tous `i18n.language`), mais la sortie ("~1h05", "~6 min",
 * "<1 min", "—") ne contient aucun nombre à séparateur → aucune dépendance réelle à la locale.
 */
export function formatAccessEta(etaS: number, locale = 'fr'): string {
  if (!Number.isFinite(etaS) || etaS <= 0) return '—';
  const totalMinutes = Math.round(etaS / 60);
  if (totalMinutes < 1) return '<1 min';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m} min`;
}
