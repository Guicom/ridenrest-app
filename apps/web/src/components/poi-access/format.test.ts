import { describe, it, expect } from 'vitest'
import { formatAccessDistance, formatAccessElevation, formatAccessEta } from './format'

describe('formatAccessDistance', () => {
  it('formats sub-kilometer distances as integer meters', () => {
    expect(formatAccessDistance(0)).toBe('0 m')
    expect(formatAccessDistance(450)).toBe('450 m')
    expect(formatAccessDistance(999)).toBe('999 m')
  })

  it('rounds meters to the nearest integer', () => {
    expect(formatAccessDistance(450.4)).toBe('450 m')
    expect(formatAccessDistance(450.6)).toBe('451 m')
  })

  it('switches to kilometers at the rounded ≥ 1000 m boundary', () => {
    // 999,6 m arrondi = 1000 m → doit basculer en km (et non afficher "1000 m")
    expect(formatAccessDistance(999.6)).toBe('1,0 km')
    expect(formatAccessDistance(1000)).toBe('1,0 km')
    expect(formatAccessDistance(1000.4)).toBe('1,0 km')
  })

  it('formats kilometers with one decimal and a French comma separator', () => {
    expect(formatAccessDistance(1500)).toBe('1,5 km')
    expect(formatAccessDistance(12345)).toBe('12,3 km')
    expect(formatAccessDistance(49949)).toBe('49,9 km')
  })
})

describe('formatAccessElevation', () => {
  it('formats elevation as rounded integer meters', () => {
    expect(formatAccessElevation(0)).toBe('0 m')
    expect(formatAccessElevation(120)).toBe('120 m')
    expect(formatAccessElevation(120.6)).toBe('121 m')
  })
})

describe('formatAccessEta', () => {
  it('returns — for non-usable inputs', () => {
    expect(formatAccessEta(0, 15)).toBe('—')
    expect(formatAccessEta(5, 0)).toBe('—')
    expect(formatAccessEta(-1, 15)).toBe('—')
  })

  it('formats minutes under an hour', () => {
    expect(formatAccessEta(5, 15)).toBe('~20 min') // 5/15 h = 20 min
  })

  it('formats hours and padded minutes beyond an hour', () => {
    expect(formatAccessEta(30, 15)).toBe('~2h00') // 30/15 = 2 h
    expect(formatAccessEta(20, 15)).toBe('~1h20') // 20/15 h = 80 min
  })

  it('floors a positive distance that rounds to 0 min to "<1 min" (review 3.3)', () => {
    // 50 m à 15 km/h ≈ 0,2 min → arrondi 0 : doit afficher "<1 min", pas "~0 min".
    expect(formatAccessEta(0.05, 15)).toBe('<1 min')
  })
})
