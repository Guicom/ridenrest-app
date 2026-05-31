import { computeDivergentSegment, computeDivergentElevation } from './compute-divergent-segment.js'
import type { GeoJSONLineString, SqlExecutor } from '../types/access-result.types.js'

function makeDb(results: Array<{ rows: Record<string, unknown>[] }>): {
  db: SqlExecutor
  execute: jest.Mock
} {
  const execute = jest.fn()
  for (const r of results) execute.mockResolvedValueOnce(r)
  return { db: { execute }, execute }
}

const ROUTE: GeoJSONLineString = {
  type: 'LineString',
  coordinates: [
    [2.0, 48.0, 100],
    [2.001, 48.001, 110],
    [2.002, 48.002, 105],
  ],
}

describe('computeDivergentSegment', () => {
  it('parse la longueur divergente (arrondie) et la géométrie simplifiée', async () => {
    const divergent: GeoJSONLineString = {
      type: 'LineString',
      coordinates: [
        [2.001, 48.001],
        [2.002, 48.002],
      ],
    }
    const { db, execute } = makeDb([
      { rows: [{ divergent_length_m: 842.4, divergent_geojson: JSON.stringify(divergent) }] },
      {
        rows: [
          { ele: 100, within_trace: true },
          { ele: 110, within_trace: false },
          { ele: 105, within_trace: false },
        ],
      },
    ])

    const metrics = await computeDivergentSegment(db, ROUTE, 'adv-1', 10)

    expect(metrics.distanceM).toBe(842) // arrondi, ± 1 m
    expect(metrics.geometry).toEqual(divergent)
    // Seuls les 2 points hors buffer comptent : delta 110→105 = -5 → D- = 5, D+ = 0.
    expect(metrics.elevationGainM).toBe(0)
    expect(metrics.elevationLossM).toBe(5)
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('retourne un MultiLineString natif sans aplatissement (portions divergentes disjointes)', async () => {
    const multi = {
      type: 'MultiLineString',
      coordinates: [
        [[2.0, 48.0], [2.001, 48.001]],
        [[2.005, 48.005], [2.006, 48.006]],
      ],
    }
    const { db } = makeDb([
      { rows: [{ divergent_length_m: 10, divergent_geojson: JSON.stringify(multi) }] },
      { rows: [] },
    ])

    const metrics = await computeDivergentSegment(db, ROUTE, 'adv-1', 10)

    expect(metrics.geometry.type).toBe('MultiLineString')
    expect(metrics.geometry.coordinates).toEqual([
      [[2.0, 48.0], [2.001, 48.001]],
      [[2.005, 48.005], [2.006, 48.006]],
    ])
  })

  it('géométrie nulle (aucune divergence) → LineString vide, distance 0', async () => {
    const { db } = makeDb([
      { rows: [{ divergent_length_m: 0, divergent_geojson: null }] },
      { rows: [] },
    ])

    const metrics = await computeDivergentSegment(db, ROUTE, 'adv-1', 10)

    expect(metrics.distanceM).toBe(0)
    expect(metrics.geometry).toEqual({ type: 'LineString', coordinates: [] })
  })
})

describe('computeDivergentElevation', () => {
  it('somme D+/D- sur l\'approche finale (run hors buffer terminant au POI)', () => {
    const result = computeDivergentElevation([
      { ele: 100, within_trace: false },
      { ele: 120, within_trace: false }, // +20
      { ele: 110, within_trace: false }, // -10
      { ele: 130, within_trace: false }, // +20
    ])
    expect(result).toEqual({ elevationGainM: 40, elevationLossM: 10 })
  })

  it('s\'arrête au 1er contact trace en remontant depuis le POI (approche finale)', () => {
    const result = computeDivergentElevation([
      { ele: 100, within_trace: false },
      { ele: 200, within_trace: true }, // dans le buffer → borne l'approche finale
      { ele: 50, within_trace: false }, // nouvelle référence
      { ele: 60, within_trace: false }, // +10
    ])
    expect(result).toEqual({ elevationGainM: 10, elevationLossM: 0 })
  })

  it('ne compte QUE le dernier run hors-trace, pas les runs côté origine (fix demi-tour)', () => {
    // origin → [100,130 hors trace : +30] → [contact trace] → [50,80 hors trace : +30] → POI
    // Ancien comportement : somme des 2 runs = +60. Nouveau : approche finale seule = +30.
    const result = computeDivergentElevation([
      { ele: 100, within_trace: false },
      { ele: 130, within_trace: false }, // run côté origine (ignoré)
      { ele: 200, within_trace: true }, // contact trace
      { ele: 50, within_trace: false }, // approche finale
      { ele: 80, within_trace: false }, // +30
    ])
    expect(result).toEqual({ elevationGainM: 30, elevationLossM: 0 })
  })

  it('ignore les points sans altitude (ele null)', () => {
    const result = computeDivergentElevation([
      { ele: null, within_trace: false },
      { ele: 100, within_trace: false },
      { ele: 90, within_trace: false }, // -10
    ])
    expect(result).toEqual({ elevationGainM: 0, elevationLossM: 10 })
  })
})
