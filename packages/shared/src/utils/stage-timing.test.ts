import { describe, it, expect } from 'vitest'
import { computeStageArrival, formatDuration } from './stage-timing'

describe('computeStageArrival', () => {
  it('ajoute la durée au départ — le cas signalé : 195 km à 15 km/h', () => {
    // 13 h de trajet depuis 08:00 → 21:00, et non « ETA ~13h00 » comme affiché avant.
    const arrival = computeStageArrival('2026-08-20T08:00:00.000Z', 13 * 60)!
    expect(arrival.iso).toBe('2026-08-20T21:00:00.000Z')
    expect(arrival.nextDay).toBe(false)
  })

  it('signale un franchissement de jour', () => {
    const arrival = computeStageArrival('2026-08-20T18:00:00.000Z', 10 * 60)!
    expect(arrival.nextDay).toBe(true)
  })

  it('inclut la pause, puisque etaMinutes la contient déjà', () => {
    // 6 h de roulage + 1 h de pause = etaMinutes 420 → arrivée à 15:00, pas 14:00.
    const arrival = computeStageArrival('2026-08-20T08:00:00.000Z', 420)!
    expect(new Date(arrival.iso).getTime() - new Date('2026-08-20T08:00:00.000Z').getTime())
      .toBe(7 * 3600 * 1000)
  })

  it('ajoute des millisecondes, pas un jour civil — une étape longue absorbe le changement d’heure', () => {
    // Contraste assumé avec `addDaysPreservingWallClock` : une étape de 13 h dure 13 h, même
    // la nuit du passage à l'heure d'hiver. Son heure murale d'arrivée se décale donc.
    const arrival = computeStageArrival('2026-10-24T20:00:00.000Z', 13 * 60)!
    expect(arrival.iso).toBe('2026-10-25T09:00:00.000Z')
  })

  it('retourne null sans départ, sans durée, ou sur une entrée invalide', () => {
    expect(computeStageArrival(null, 60)).toBeNull()
    expect(computeStageArrival(undefined, 60)).toBeNull()
    expect(computeStageArrival('2026-08-20T08:00:00.000Z', null)).toBeNull()
    expect(computeStageArrival('2026-08-20T08:00:00.000Z', -5)).toBeNull()
    expect(computeStageArrival('pas-une-date', 60)).toBeNull()
  })

  it('accepte une durée nulle', () => {
    expect(computeStageArrival('2026-08-20T08:00:00.000Z', 0)!.iso).toBe('2026-08-20T08:00:00.000Z')
  })
})

describe('formatDuration', () => {
  it('formate heures et minutes sans préfixe ni deux-points', () => {
    expect(formatDuration(780)).toBe('13h')
    expect(formatDuration(390)).toBe('6h30')
    expect(formatDuration(45)).toBe('45 min')
    expect(formatDuration(120)).toBe('2h')
    expect(formatDuration(0)).toBe('0 min')
  })

  it('ne produit jamais un format lisible comme une heure d’horloge', () => {
    // `13h00` était la source de la confusion : une durée pile s'affiche « 13h ».
    expect(formatDuration(780)).not.toBe('13h00')
  })

  it('retourne un tiret sur une entrée inexploitable', () => {
    expect(formatDuration(null)).toBe('—')
    expect(formatDuration(undefined)).toBe('—')
    expect(formatDuration(-1)).toBe('—')
    expect(formatDuration(Number.NaN)).toBe('—')
  })
})
