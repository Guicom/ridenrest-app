/**
 * Formatage distance / élévation pour les métriques d'accès (Discovery #4).
 *
 * Règle projet (archi §Format Patterns §Units) :
 * - distance < 1000 m → "X m" (entier)
 * - distance ≥ 1000 m → "X,X km" (1 décimale, séparateur français virgule)
 * - élévation → "X m" (entier)
 *
 * Doc Sync : aucun helper `formatDistance`/`formatElevation` n'existait dans
 * `apps/web/src/lib/` (le formatage était inliné dans chaque composant POI, et
 * avec un point décimal). Ce module centralise la règle avec la virgule française.
 */
export function formatAccessDistance(distanceM: number): string {
  // Choix de l'unité sur la valeur ARRONDIE : 999,6 m doit s'afficher "1,0 km"
  // (et non "1000 m"), conformément à la règle ≥ 1000 m → km.
  if (Math.round(distanceM) < 1000) return `${Math.round(distanceM)} m`
  const km = distanceM / 1000
  return `${km.toFixed(1).replace('.', ',')} km`
}

export function formatAccessElevation(elevationM: number): string {
  return `${Math.round(elevationM)} m`
}

/**
 * Temps estimé pour parcourir la distance d'accès à la vitesse cycliste donnée.
 * `~XhYY` au-delà d'une heure, `~Z min` sinon, et `<1 min` pour une distance positive
 * qui arrondirait à 0 min (POI très proche de la trace). `—` si entrées non exploitables.
 */
export function formatAccessEta(distanceKm: number, speedKmh: number): string {
  if (speedKmh <= 0 || distanceKm <= 0) return '—'
  const totalMinutes = Math.round((distanceKm / speedKmh) * 60)
  if (totalMinutes < 1) return '<1 min' // distance positive mais < 30 s → évite un trompeur "~0 min"
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m} min`
}
