/**
 * Unit test du row-mapping + des appels DB d'`AccessWorkerRepository`.
 * Le singleton `db` de `@ridenrest/database` est mocké : on valide la transformation des lignes
 * et le déclenchement de l'UPDATE, pas le SQL lui-même (couvert au niveau intégration/E2E).
 */
import { AccessWorkerRepository } from './access-worker.repository.js'

// Mock @ridenrest/database — var (pas const) pour survivre au hoisting de jest.mock.
// eslint-disable-next-line no-var
var mockDb: { execute: jest.Mock }
jest.mock('@ridenrest/database', () => {
  mockDb = { execute: jest.fn() }
  return { db: mockDb }
})

const repo = new AccessWorkerRepository()

beforeEach(() => {
  mockDb.execute.mockReset()
})

describe('AccessWorkerRepository.findEagerPois', () => {
  it('maps DB rows to { id, routingProfile }', async () => {
    mockDb.execute.mockResolvedValue({
      rows: [
        { id: 'poi-1', routing_profile: 'gravel' },
        { id: 'poi-2', routing_profile: 'road' },
      ],
    })

    const result = await repo.findEagerPois('adv-1', 1500)

    expect(result).toEqual([
      { id: 'poi-1', routingProfile: 'gravel' },
      { id: 'poi-2', routingProfile: 'road' },
    ])
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns an empty array when no POI matches', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] })

    expect(await repo.findEagerPois('adv-empty', 1500)).toEqual([])
  })
})

describe('AccessWorkerRepository.markAccessFailed', () => {
  it('issues the UPDATE for the given POI', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] })

    await repo.markAccessFailed('poi-99')

    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })
})

describe('AccessWorkerRepository.resetAccessForAdventure (Story 4.2)', () => {
  it('issues a single reset UPDATE for the given adventure', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] })

    await repo.resetAccessForAdventure('adv-1')

    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })
})
