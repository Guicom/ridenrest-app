import { describe, it, expect } from 'vitest'
import {
  addDaysPreservingWallClock,
  isValidTimeZone,
  resolveTimeZone,
  wallClockToInstant,
} from './date-tz'

/** Heure murale lisible dans un fuseau, pour asserter sans dépendre du fuseau de la machine. */
function localHHmm(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso))
}

function localDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

const PARIS = 'Europe/Paris'

describe('isValidTimeZone / resolveTimeZone', () => {
  it('accepte un identifiant IANA connu', () => {
    expect(isValidTimeZone(PARIS)).toBe(true)
    expect(isValidTimeZone('UTC')).toBe(true)
  })

  it('rejette une valeur bidon sans lever', () => {
    // Sans le try/catch interne, `new Intl.DateTimeFormat` lève un RangeError — donc un 500
    // côté API sur une valeur venue du client.
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false)
    expect(isValidTimeZone('')).toBe(false)
    expect(isValidTimeZone(undefined)).toBe(false)
    expect(isValidTimeZone(null)).toBe(false)
  })

  it('retombe sur UTC quand le fuseau est inutilisable', () => {
    expect(resolveTimeZone('Mars/Olympus_Mons')).toBe('UTC')
    expect(resolveTimeZone(undefined)).toBe('UTC')
    expect(resolveTimeZone(PARIS)).toBe(PARIS)
  })
})

describe('addDaysPreservingWallClock', () => {
  it('ajoute un jour ordinaire en gardant l’heure murale', () => {
    // 2026-09-05 08:00 Paris (UTC+2)
    const base = '2026-09-05T06:00:00.000Z'
    const next = addDaysPreservingWallClock(base, 1, PARIS)!
    expect(localDate(next, PARIS)).toBe('2026-09-06')
    expect(localHHmm(next, PARIS)).toBe('08:00')
  })

  it('days=0 renvoie le même instant', () => {
    const base = '2026-09-05T06:00:00.000Z'
    expect(addDaysPreservingWallClock(base, 0, PARIS)).toBe(base)
  })

  it('traverse la FIN de l’heure d’été sans décaler l’heure murale', () => {
    // Le changement d'heure européen 2026 tombe le dimanche 25 octobre.
    // 2026-10-24 08:00 Paris = 06:00Z (UTC+2). Le lendemain, Paris est en UTC+1.
    const base = '2026-10-24T06:00:00.000Z'
    const next = addDaysPreservingWallClock(base, 1, PARIS)!

    expect(localDate(next, PARIS)).toBe('2026-10-25')
    // C'est LE test de la story : `base + 86_400_000` donnerait 07:00.
    expect(localHHmm(next, PARIS)).toBe('08:00')
    expect(next).toBe('2026-10-25T07:00:00.000Z')
    expect(new Date(next).getTime() - new Date(base).getTime()).toBe(25 * 3600 * 1000)
  })

  it('traverse le DÉBUT de l’heure d’été sans décaler l’heure murale', () => {
    // 2026-03-28 08:00 Paris = 07:00Z (UTC+1) ; le 29 mars, Paris passe en UTC+2.
    const base = '2026-03-28T07:00:00.000Z'
    const next = addDaysPreservingWallClock(base, 1, PARIS)!

    expect(localDate(next, PARIS)).toBe('2026-03-29')
    expect(localHHmm(next, PARIS)).toBe('08:00')
    expect(new Date(next).getTime() - new Date(base).getTime()).toBe(23 * 3600 * 1000)
  })

  it('garde l’heure murale sur 8 jours consécutifs à cheval sur le changement d’heure', () => {
    const base = '2026-10-20T06:00:00.000Z' // 08:00 Paris
    for (let i = 0; i < 8; i++) {
      const at = addDaysPreservingWallClock(base, i, PARIS)!
      expect(localHHmm(at, PARIS)).toBe('08:00')
    }
  })

  it('franchit les fins de mois et d’année', () => {
    const base = '2026-12-30T07:00:00.000Z' // 08:00 Paris
    const plus3 = addDaysPreservingWallClock(base, 3, PARIS)!
    expect(localDate(plus3, PARIS)).toBe('2027-01-02')
    expect(localHHmm(plus3, PARIS)).toBe('08:00')
  })

  it('accepte un nombre de jours négatif', () => {
    const base = '2026-09-05T06:00:00.000Z'
    const prev = addDaysPreservingWallClock(base, -1, PARIS)!
    expect(localDate(prev, PARIS)).toBe('2026-09-04')
    expect(localHHmm(prev, PARIS)).toBe('08:00')
  })

  it('retombe sur UTC quand le fuseau est invalide, sans lever', () => {
    const base = '2026-10-24T06:00:00.000Z'
    const next = addDaysPreservingWallClock(base, 1, 'Mars/Olympus_Mons')!
    expect(next).toBe('2026-10-25T06:00:00.000Z') // +24 h pile : UTC n'a pas de DST
  })

  it('renvoie null sur une date invalide', () => {
    expect(addDaysPreservingWallClock('pas-une-date', 1, PARIS)).toBeNull()
  })
})

describe('wallClockToInstant — cas limites de changement d’heure', () => {
  it('heure murale INEXISTANTE (02:30 au passage à l’heure d’été) → résolution vers l’avant', () => {
    // Le 29 mars 2026, Paris saute de 02:00 à 03:00 : 02:30 n'existe pas.
    const instant = wallClockToInstant(
      { year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 },
      PARIS,
    )
    // Comportement figé : on retient 03:30 locale (le décalage post-transition s'applique).
    expect(localHHmm(instant.toISOString(), PARIS)).toBe('03:30')
  })

  it('heure murale AMBIGUË (02:30 au retour à l’heure d’hiver) → seconde occurrence', () => {
    // Le 25 octobre 2026, 02:30 locale existe deux fois : en UTC+2 (00:30Z) puis en UTC+1
    // (01:30Z). Comportement mesuré : la seconde occurrence l'emporte. Les deux réponses sont
    // défendables ; ce qui compte est qu'elle soit stable — d'où ce test.
    const instant = wallClockToInstant(
      { year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 },
      PARIS,
    )
    expect(localHHmm(instant.toISOString(), PARIS)).toBe('02:30')
    expect(instant.toISOString()).toBe('2026-10-25T01:30:00.000Z')
  })

  it('est idempotent sur les cas limites — réappliquer ne dérive pas', () => {
    const ambiguous = wallClockToInstant(
      { year: 2026, month: 10, day: 25, hour: 2, minute: 30, second: 0 },
      PARIS,
    ).toISOString()
    expect(addDaysPreservingWallClock(ambiguous, 0, PARIS)).toBe(ambiguous)

    const nonExistent = wallClockToInstant(
      { year: 2026, month: 3, day: 29, hour: 2, minute: 30, second: 0 },
      PARIS,
    ).toISOString()
    expect(addDaysPreservingWallClock(nonExistent, 0, PARIS)).toBe(nonExistent)
  })
})
