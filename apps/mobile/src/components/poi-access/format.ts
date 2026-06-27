// Formatage distance / élévation / ETA pour les métriques d'accès (MOB-4.6 / T4 —
// port du web `apps/web/src/components/poi-access/format.ts`).
//
// FONCTIONS DE FORMATAGE PURES — elles ne recalculent JAMAIS une distance/un temps : les
// valeurs (`distanceM`, `elevationGainM`, `etaS`) sont déjà calculées serveur (BRouter)
// et renvoyées par l'API.
//
// Règle projet (archi §Units) : séparateur décimal **virgule** (FR), parité web.
// - distance < 1000 m → "X m" (entier) ; ≥ 1000 m → "X,X km" (1 décimale)
// - élévation → "X m" (entier)

/** Distance d'accès : "740 m" sous le km, sinon "1,4 km" (virgule FR). */
export function formatAccessDistance(distanceM: number): string {
  // Choix de l'unité sur la valeur ARRONDIE : 999,6 m → "1,0 km" (et non "1000 m").
  if (Math.round(distanceM) < 1000) return `${Math.round(distanceM)} m`;
  const km = distanceM / 1000;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

/** Élévation (D+/D-) : entier en mètres, "X m". */
export function formatAccessElevation(elevationM: number): string {
  return `${Math.round(elevationM)} m`;
}

/**
 * Temps de trajet estimé (BRouter `etaS`, en secondes) → "~XhMM" au-delà d'une heure,
 * "~X min" sinon, "<1 min" pour une durée positive qui arrondirait à 0, "—" si vide.
 * Contrairement au web (qui dérive l'ETA d'une vitesse), on affiche directement l'`etaS`
 * fourni par BRouter — c'est le critère de tri des variantes (story 4.6 / T5).
 */
export function formatAccessEta(etaS: number): string {
  if (!Number.isFinite(etaS) || etaS <= 0) return '—';
  const totalMinutes = Math.round(etaS / 60);
  if (totalMinutes < 1) return '<1 min';
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m} min`;
}
