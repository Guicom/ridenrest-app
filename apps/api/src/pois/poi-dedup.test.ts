import { isLikelySamePlace, normalizePoiName, POI_DEDUP_RADIUS_M } from './poi-dedup.js'

describe('normalizePoiName', () => {
  it('lowercases, strips diacritics and punctuation', () => {
    expect(normalizePoiName('Hôtel-Restaurant «Bellevue»')).toBe('hotel restaurant bellevue')
  })

  it('collapses whitespace and trims', () => {
    expect(normalizePoiName('  Gasthof   zum   Löwen  ')).toBe('gasthof zum lowen')
  })
})

describe('isLikelySamePlace', () => {
  it('matches identical names', () => {
    expect(isLikelySamePlace('Hôtel Bellevue', 'Hotel Bellevue')).toBe(true)
  })

  it('matches when one name is contained in the other', () => {
    expect(isLikelySamePlace('Hôtel Bellevue', 'Hôtel Bellevue Restaurant & Spa')).toBe(true)
  })

  it('matches on a shared identity token despite different generic wording', () => {
    expect(isLikelySamePlace('Gasthof Schattenmühle', 'Hotel Schattenmuehle')).toBe(false)  // ü ≠ ue
    expect(isLikelySamePlace('Gasthof Schattenmühle', 'Hotel Schattenmühle')).toBe(true)
  })

  // The regression these rules exist for: distinct establishments a few dozen meters apart
  // in the same village were suppressed by a proximity-only dedup.
  it.each([
    ['Haus zum Falken', 'Villa Hallau'],
    ['Berghof Hallau', 'Wein-Stadel Nägeliseehof'],
    ['Ferienwohnung Dück', 'Fewo Sommerhalde'],
    ['Camping Wutachtal', 'Hotel Wutachschlucht'],  // shared word is generic-adjacent, not identical
  ])('does NOT match distinct establishments: %s / %s', (a, b) => {
    expect(isLikelySamePlace(a, b)).toBe(false)
  })

  it('does NOT match on generic words alone', () => {
    expect(isLikelySamePlace('Gasthaus Krone', 'Gasthaus Sonne')).toBe(false)
    expect(isLikelySamePlace('Camping Municipal', 'Camping Les Pins')).toBe(false)
    expect(isLikelySamePlace('Hôtel Restaurant', 'Restaurant Hôtel')).toBe(false)
  })

  it('returns false on empty or unnamed POIs', () => {
    expect(isLikelySamePlace('', 'Hotel Bellevue')).toBe(false)
    expect(isLikelySamePlace('Hotel Bellevue', '')).toBe(false)
    expect(isLikelySamePlace('...', 'Hotel Bellevue')).toBe(false)
  })

  it('is symmetric', () => {
    expect(isLikelySamePlace('Auberge du Pont', 'Auberge du Pont Vieux'))
      .toBe(isLikelySamePlace('Auberge du Pont Vieux', 'Auberge du Pont'))
  })

  it('keeps the dedup radius at OSM drift scale', () => {
    expect(POI_DEDUP_RADIUS_M).toBe(100)
  })
})
