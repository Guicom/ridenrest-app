import { NotFoundException } from '@nestjs/common'
import { resolveOrigin, resolveOriginCandidates } from './resolve-origin.js'
import type { SqlExecutor } from '../types/access-result.types.js'

/** Stub `db.execute` qui dépile des résultats préprogrammés. */
function makeDb(results: Array<{ rows: Record<string, unknown>[] }>): {
  db: SqlExecutor
  execute: jest.Mock
} {
  const execute = jest.fn()
  for (const r of results) execute.mockResolvedValueOnce(r)
  return { db: { execute }, execute }
}

function pointRow(lon: number, lat: number): { rows: Record<string, unknown>[] } {
  return { rows: [{ point: JSON.stringify({ type: 'Point', coordinates: [lon, lat] }) }] }
}

const ADVENTURE = { adventureId: 'adv-1', lat: 48.5, lng: 2.5 }

describe('resolveOrigin', () => {
  it('stage → lit start_km puis interpole le point projeté sur la trace', async () => {
    const { db, execute } = makeDb([
      { rows: [{ start_km: 12.5 }] },
      pointRow(2.1301, 48.8014),
    ])

    const result = await resolveOrigin(db, { type: 'stage', stageId: 'stage-7' }, ADVENTURE)

    expect(result).toEqual([2.1301, 48.8014])
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('nearest-trace → renvoie le point de la trace le plus proche du POI (ST_ClosestPoint)', async () => {
    const { db, execute } = makeDb([pointRow(2.4987, 48.5012)])

    const result = await resolveOrigin(db, { type: 'nearest-trace' }, ADVENTURE)

    expect(result).toEqual([2.4987, 48.5012])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('nearest-trace sans trace utilisable → NotFoundException', async () => {
    const { db } = makeDb([{ rows: [] }])

    await expect(resolveOrigin(db, { type: 'nearest-trace' }, ADVENTURE)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('stage inexistant → NotFoundException', async () => {
    const { db } = makeDb([{ rows: [] }])

    await expect(resolveOrigin(db, { type: 'stage', stageId: 'ghost' }, ADVENTURE)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('nearest-trace avec point null (trace dégénérée) → NotFoundException', async () => {
    const { db } = makeDb([{ rows: [{ point: null }] }])

    await expect(resolveOrigin(db, { type: 'nearest-trace' }, ADVENTURE)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})

const OPTS = { radiusM: 10_000, maxCandidates: 4 }

function candidateRows(
  ...pts: Array<[lon: number, lat: number, dist: number]>
): { rows: Record<string, unknown>[] } {
  return { rows: pts.map(([lon, lat, dist_m]) => ({ lon, lat, dist_m })) }
}

describe('resolveOriginCandidates', () => {
  it('nearest-trace → renvoie les candidats étalés (tranches), triés par distance', async () => {
    const { db, execute } = makeDb([
      // une ligne par tranche ntile (ordre DB arbitraire) → la fonction re-trie par distance
      candidateRows([2.42, 48.42, 9000], [2.41, 48.41, 3000]),
    ])

    const result = await resolveOriginCandidates(db, { type: 'nearest-trace' }, ADVENTURE, OPTS)

    expect(result).toEqual([
      [2.41, 48.41], // le plus proche d'abord
      [2.42, 48.42],
    ])
    expect(execute).toHaveBeenCalledTimes(1) // une seule requête (pas de repli)
  })

  it('nearest-trace → garde-fou : borne le post-traitement à maxCandidates', async () => {
    // En pratique le `ntile` SQL renvoie déjà ≤ maxCandidates lignes ; ce test vérifie le
    // filet de sécurité côté JS si la DB en renvoyait davantage.
    const { db } = makeDb([
      candidateRows([2.4, 48.4, 5000], [2.5, 48.5, 1000], [2.6, 48.6, 8000], [2.7, 48.7, 2000]),
    ])

    const result = await resolveOriginCandidates(db, { type: 'nearest-trace' }, ADVENTURE, {
      radiusM: 10_000,
      maxCandidates: 2,
    })

    expect(result).toEqual([
      [2.5, 48.5], // 1000 m
      [2.7, 48.7], // 2000 m
    ])
  })

  it('nearest-trace → dédoublonne les candidats trop proches (< 250 m)', async () => {
    // 2.400 et 2.401 à lat 48.4 ≈ 73 m d'écart → doublon ; 2.5/48.5 est distinct.
    const { db } = makeDb([
      candidateRows([2.4, 48.4, 1000], [2.401, 48.4, 1100], [2.5, 48.5, 3000]),
    ])

    const result = await resolveOriginCandidates(db, { type: 'nearest-trace' }, ADVENTURE, OPTS)

    expect(result).toEqual([
      [2.4, 48.4], // le plus proche du cluster
      [2.5, 48.5], // entrée distincte conservée
    ])
  })

  it('nearest-trace sans trace dans le rayon → repli sur ST_ClosestPoint (point global)', async () => {
    const { db, execute } = makeDb([
      { rows: [] }, // closestPointsOnTrace : aucun candidat
      pointRow(2.4987, 48.5012), // repli closestPointOnTrace
    ])

    const result = await resolveOriginCandidates(db, { type: 'nearest-trace' }, ADVENTURE, OPTS)

    expect(result).toEqual([[2.4987, 48.5012]])
    expect(execute).toHaveBeenCalledTimes(2) // candidats (vide) + repli
  })

  it('stage → un seul candidat (interpolation à start_km)', async () => {
    const { db, execute } = makeDb([{ rows: [{ start_km: 12.5 }] }, pointRow(2.1301, 48.8014)])

    const result = await resolveOriginCandidates(db, { type: 'stage', stageId: 'stage-7' }, ADVENTURE, OPTS)

    expect(result).toEqual([[2.1301, 48.8014]])
    expect(execute).toHaveBeenCalledTimes(2)
  })
})
