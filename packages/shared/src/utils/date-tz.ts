/**
 * Arithmétique calendaire préservant l'heure murale — sans dépendance.
 *
 * Le monorepo n'a ni `date-fns`, ni `luxon`, ni `dayjs` : tout est en `Date` natif. `Intl`
 * suffit ici, et la convention du projet est le petit helper pur et testé (cf.
 * `mapWithConcurrency`, `poi-dedup`).
 *
 * ## Pourquoi ce fichier existe
 *
 * La génération d'étapes (story 17.18) chaîne les départs à « veille + 1 jour, même heure ».
 * Ajouter `86 400 000 ms` semble suffire — c'est faux dès qu'un changement d'heure tombe dans
 * l'aventure : un départ à 08:00 le 24 octobre devient **07:00** le 25 (fin de l'heure d'été en
 * Europe), et cette heure fausse part ensuite dans la prévision météo de l'étape. Une aventure
 * de 8 jours fin octobre suffit à le déclencher.
 *
 * On incrémente donc la **date** (arithmétique pure, aucun DST en jeu sur une date nue) puis on
 * résout l'instant correspondant à l'heure murale voulue dans le fuseau demandé.
 */

interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * `true` si `timeZone` est un identifiant IANA que l'environnement sait résoudre.
 *
 * À utiliser sur toute valeur venant d'un client : un identifiant invalide **lève** un
 * `RangeError` à la construction du formateur, ce qui transformerait une valeur bidon en 500.
 */
export function isValidTimeZone(timeZone: string | undefined | null): boolean {
  if (!timeZone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

/** `timeZone` si utilisable, sinon `'UTC'`. */
export function resolveTimeZone(timeZone: string | undefined | null): string {
  return isValidTimeZone(timeZone) ? (timeZone as string) : 'UTC'
}

/** Heure murale d'un instant, telle qu'elle est lue dans `timeZone`. */
function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23', // sans ça, minuit remonte en « 24 » sur certains ICU
  }).formatToParts(instant)

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type)
    return part ? Number(part.value) : 0
  }

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  }
}

/** Décalage du fuseau, en ms, à un instant donné (positif à l'est de Greenwich). */
function offsetMsAt(instant: Date, timeZone: string): number {
  const wc = wallClockIn(instant, timeZone)
  const asIfUtc = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second)
  // La seconde près suffit : on compare deux lectures de la même seconde.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * Instant correspondant à une heure murale dans un fuseau.
 *
 * Deux passes : le décalage dépend de l'instant, or c'est l'instant qu'on cherche. La première
 * passe donne un candidat, la seconde corrige quand le candidat est tombé de l'autre côté d'un
 * changement d'heure.
 *
 * Cas limites, MESURÉS puis figés par les tests (`date-tz.test.ts`) — jamais atteints par un
 * départ à 08:00, mais autant que le comportement soit décidé plutôt que subi :
 * - heure murale **inexistante** (02:30 le jour du passage à l'heure d'été) → résolution vers
 *   l'avant, soit 03:30 locale ;
 * - heure murale **ambiguë** (02:30 le jour du retour à l'heure d'hiver, qui existe deux fois)
 *   → **seconde** occurrence, celle déjà en heure d'hiver.
 *
 * Les deux sont idempotents : réappliquer le helper sur son propre résultat ne dérive pas.
 */
export function wallClockToInstant(wc: WallClock, timeZone: string): Date {
  const naiveUtc = Date.UTC(wc.year, wc.month - 1, wc.day, wc.hour, wc.minute, wc.second)
  const firstGuess = new Date(naiveUtc - offsetMsAt(new Date(naiveUtc), timeZone))
  const corrected = new Date(naiveUtc - offsetMsAt(firstGuess, timeZone))
  return corrected
}

/**
 * `baseIso` décalé de `days` jours calendaires, **à la même heure murale** dans `timeZone`.
 *
 * @param baseIso  instant de référence (ISO 8601)
 * @param days     nombre de jours à ajouter (peut être 0 ou négatif)
 * @param timeZone identifiant IANA ; une valeur invalide retombe sur `'UTC'`
 * @returns un instant ISO 8601, ou `null` si `baseIso` n'est pas une date valide
 */
export function addDaysPreservingWallClock(
  baseIso: string,
  days: number,
  timeZone: string | undefined | null,
): string | null {
  const base = new Date(baseIso)
  if (Number.isNaN(base.getTime())) return null

  const tz = resolveTimeZone(timeZone)
  const wc = wallClockIn(base, tz)

  // Incrément de la DATE via l'arithmétique UTC : `Date.UTC` normalise les débordements de mois
  // et d'année, et aucun changement d'heure n'intervient sur une date sans fuseau.
  const shifted = new Date(Date.UTC(wc.year, wc.month - 1, wc.day + days))

  return wallClockToInstant(
    {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: wc.hour,
      minute: wc.minute,
      second: wc.second,
    },
    tz,
  ).toISOString()
}
