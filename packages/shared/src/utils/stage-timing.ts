/**
 * Heure d'arrivée d'une étape — dérivée, jamais stockée.
 *
 * ## Pourquoi ce fichier existe
 *
 * `adventure_stages.eta_minutes` est une **durée** (roulage + pause), pas une heure. Le
 * cartouche l'affichait pourtant sous le label « ETA » et au format `~13h00`, qui se lit comme
 * une heure d'horloge : une étape de 195 km partant à 08:00 annonçait « ETA ~13h00 » alors
 * qu'on arrive à 21:00. Retour utilisateur 2026-08-20.
 *
 * On expose donc les deux notions séparément : la **durée** (ce que le serveur calcule) et
 * l'**heure d'arrivée** (déduite du départ). Le nom « ETA » est réservé à la seconde.
 */

export interface StageArrival {
  /** Instant d'arrivée (ISO 8601). */
  iso: string
  /** `true` si l'arrivée ne tombe pas le même jour civil que le départ. */
  nextDay: boolean
}

/**
 * Arrivée = départ + durée.
 *
 * ⚠️ Ici on ajoute bien des **millisecondes**, contrairement au chaînage des départs d'étapes
 * (`addDaysPreservingWallClock`), qui incrémente une date civile. La différence n'est pas une
 * incohérence : une étape de 13 h qui traverse la nuit du changement d'heure dure réellement
 * 13 h, et son heure murale d'arrivée doit donc se décaler. À l'inverse, « le lendemain à la
 * même heure » est une notion civile, insensible à la durée réelle du jour.
 *
 * @returns `null` si le départ est absent/invalide ou la durée non exploitable — l'appelant
 *          retombe alors sur l'affichage de la seule durée.
 */
export function computeStageArrival(
  departureTimeIso: string | null | undefined,
  etaMinutes: number | null | undefined,
): StageArrival | null {
  if (!departureTimeIso) return null
  if (etaMinutes == null || !Number.isFinite(etaMinutes) || etaMinutes < 0) return null

  const departure = new Date(departureTimeIso)
  if (Number.isNaN(departure.getTime())) return null

  const arrival = new Date(departure.getTime() + etaMinutes * 60_000)

  // Comparaison en heure LOCALE : c'est le jour que l'utilisateur lit sur sa montre qui
  // décide s'il faut réafficher la date, pas le jour UTC.
  const nextDay =
    arrival.getFullYear() !== departure.getFullYear() ||
    arrival.getMonth() !== departure.getMonth() ||
    arrival.getDate() !== departure.getDate()

  return { iso: arrival.toISOString(), nextDay }
}

/**
 * Durée en `2h15` / `45 min` / `2h`.
 *
 * Volontairement **sans** `~` ni deux-points : le format `13h00` d'origine était le cœur de la
 * confusion. Le préfixe éventuel est laissé à l'appelant, qui sait s'il parle d'une estimation.
 */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return '—'
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  if (m === 0) return `${h}h`
  return `${h}h${String(m).padStart(2, '0')}`
}
