// Mock @ridenrest/database — var (pas const) pour survivre au hoisting de jest.mock.
// eslint-disable-next-line no-var
var mockDb: { execute: jest.Mock }
jest.mock('@ridenrest/database', () => {
  mockDb = { execute: jest.fn() }
  return { db: mockDb }
})

import { checkPoiOwnership } from './ownership-check.js'

const POI_ID = '123e4567-e89b-12d3-a456-426614174000'
const USER_ID = '00000000-0000-0000-0000-000000000001'

describe('checkPoiOwnership', () => {
  beforeEach(() => {
    mockDb.execute.mockReset()
  })

  it('returns true when the POI belongs to the user (one row)', async () => {
    mockDb.execute.mockResolvedValue({ rows: [{ '?column?': 1 }] })
    await expect(checkPoiOwnership(POI_ID, USER_ID)).resolves.toBe(true)
    expect(mockDb.execute).toHaveBeenCalledTimes(1)
  })

  it('returns false when the POI belongs to another user (no rows)', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] })
    await expect(checkPoiOwnership(POI_ID, USER_ID)).resolves.toBe(false)
  })

  it('returns false when the POI does not exist (no rows)', async () => {
    mockDb.execute.mockResolvedValue({ rows: [] })
    await expect(checkPoiOwnership('missing-poi', USER_ID)).resolves.toBe(false)
  })
})
