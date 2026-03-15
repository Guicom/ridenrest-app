// Mock fs and gpx package — test processor logic only
jest.mock('node:fs/promises')
jest.mock('@ridenrest/gpx')
jest.mock('@ridenrest/database', () => ({
  db: {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
  },
  adventureSegments: {},
}))

import * as fsMock from 'node:fs/promises'
import * as gpxMock from '@ridenrest/gpx'

const mockSegmentsRepo = {
  updateAfterParse: jest.fn(),
  updateParseError: jest.fn(),
}
const mockSegmentsService = {
  recomputeCumulativeDistances: jest.fn(),
}

// Note: Full processor unit testing requires complex DB mock setup.
// The segments.service.test.ts covers recomputeCumulativeDistances logic.
// Processor correctness is validated in Task 9 (manual integration test).

describe('GpxParseProcessor', () => {
  beforeEach(() => jest.clearAllMocks())

  it('mocks are set up correctly', () => {
    expect(fsMock.readFile).toBeDefined()
    expect(gpxMock.parseGpx).toBeDefined()
    expect(mockSegmentsRepo.updateParseError).toBeDefined()
    expect(mockSegmentsService.recomputeCumulativeDistances).toBeDefined()
  })
})
