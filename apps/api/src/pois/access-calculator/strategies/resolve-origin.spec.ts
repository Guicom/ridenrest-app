import { NotFoundException } from '@nestjs/common'
import { resolveOrigin } from './resolve-origin.js'
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
