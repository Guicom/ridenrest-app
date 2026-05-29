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

const ADVENTURE = { adventureId: 'adv-1' }

describe('resolveOrigin', () => {
  it('gps → renvoie [lng, lat] tel quel sans toucher la DB', async () => {
    const { db, execute } = makeDb([])

    const result = await resolveOrigin(db, { type: 'gps', lat: 48.8566, lng: 2.3522 }, ADVENTURE)

    expect(result).toEqual([2.3522, 48.8566])
    expect(execute).not.toHaveBeenCalled()
  })

  it('stage → lit start_km puis interpole le point projeté sur la trace', async () => {
    const { db, execute } = makeDb([
      { rows: [{ start_km: 12.5 }] },
      pointRow(2.1301, 48.8014),
    ])

    const result = await resolveOrigin(db, { type: 'stage', stageId: 'stage-7' }, ADVENTURE)

    expect(result).toEqual([2.1301, 48.8014])
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('adventure-start → interpole au km 0 (fraction 0)', async () => {
    const { db, execute } = makeDb([pointRow(2.0, 48.9)])

    const result = await resolveOrigin(db, { type: 'adventure-start' }, ADVENTURE)

    expect(result).toEqual([2.0, 48.9])
    expect(execute).toHaveBeenCalledTimes(1)
  })

  it('stage inexistant → NotFoundException', async () => {
    const { db } = makeDb([{ rows: [] }])

    await expect(resolveOrigin(db, { type: 'stage', stageId: 'ghost' }, ADVENTURE)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })

  it('aventure sans trace utilisable → NotFoundException', async () => {
    const { db } = makeDb([{ rows: [{ point: null }] }])

    await expect(resolveOrigin(db, { type: 'adventure-start' }, ADVENTURE)).rejects.toBeInstanceOf(
      NotFoundException,
    )
  })
})
