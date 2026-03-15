jest.mock('node:fs/promises')
jest.mock('@ridenrest/gpx')
jest.mock('@ridenrest/shared', () => ({
  MAX_GPX_POINTS: 2000,
  RDP_EPSILON: 0.0001,
}))

import * as fsMock from 'node:fs/promises'
import * as gpxMock from '@ridenrest/gpx'
import { GpxParseProcessor } from './gpx-parse.processor.js'

const mockSegmentsRepo = {
  findAdventureIdBySegmentId: jest.fn(),
  setProcessingStatus: jest.fn(),
  updateAfterParse: jest.fn(),
  updateParseError: jest.fn(),
}

const mockSegmentsService = {
  recomputeCumulativeDistances: jest.fn(),
}

const makeJob = (data: Record<string, unknown> = {}): any => ({
  data: { segmentId: 'seg-1', storageUrl: '/data/gpx/seg-1.gpx', ...data },
})

const makeRawPoints = (withEle = true) => [
  { lat: 43.0, lng: -3.0, ...(withEle ? { elevM: 100 } : {}) },
  { lat: 43.1, lng: -3.1, ...(withEle ? { elevM: 200 } : {}) },
]

const makeKmWaypoints = (withEle = true) => [
  { km: 0, lat: 43.0, lng: -3.0, ...(withEle ? { elevM: 100 } : {}) },
  { km: 12.5, lat: 43.1, lng: -3.1, ...(withEle ? { elevM: 200 } : {}) },
]

describe('GpxParseProcessor', () => {
  let processor: GpxParseProcessor

  beforeEach(() => {
    jest.clearAllMocks()
    processor = new GpxParseProcessor(
      mockSegmentsRepo as any,
      mockSegmentsService as any,
    )
    // Default happy-path mocks
    mockSegmentsRepo.findAdventureIdBySegmentId.mockResolvedValue('adv-1')
    mockSegmentsRepo.setProcessingStatus.mockResolvedValue(undefined)
    mockSegmentsRepo.updateAfterParse.mockResolvedValue(undefined)
    mockSegmentsRepo.updateParseError.mockResolvedValue(undefined)
    mockSegmentsService.recomputeCumulativeDistances.mockResolvedValue(undefined)
    jest.mocked(fsMock.readFile).mockResolvedValue(Buffer.from('<gpx>valid</gpx>') as any)
    jest.mocked(gpxMock.computeElevationGain).mockReturnValue(100)
    jest.mocked(gpxMock.computeBoundingBox).mockReturnValue({
      minLat: 43.0,
      maxLat: 43.1,
      minLng: -3.1,
      maxLng: -3.0,
    })
    jest.mocked(gpxMock.rdpSimplify).mockImplementation((pts) => pts)
  })

  describe('valid GPX with elevation data', () => {
    beforeEach(() => {
      jest.mocked(gpxMock.parseGpx).mockReturnValue(makeRawPoints(true))
      jest.mocked(gpxMock.computeCumulativeDistances).mockReturnValue(makeKmWaypoints(true))
    })

    it('sets processing status, updates segment as done, and recomputes distances', async () => {
      await processor.process(makeJob())

      expect(mockSegmentsRepo.setProcessingStatus).toHaveBeenCalledWith('seg-1')
      expect(mockSegmentsRepo.updateAfterParse).toHaveBeenCalledWith(
        'seg-1',
        expect.objectContaining({
          distanceKm: 12.5,
          parseStatus: 'done',
          elevationGainM: 100,
        }),
      )
      expect(mockSegmentsService.recomputeCumulativeDistances).toHaveBeenCalledWith('adv-1')
      expect(mockSegmentsRepo.updateParseError).not.toHaveBeenCalled()
    })

    it('stores waypoints with ele field when elevation data is present (AC #5)', async () => {
      await processor.process(makeJob())

      const [, data] = mockSegmentsRepo.updateAfterParse.mock.calls[0]
      expect(data.waypoints[0]).toEqual({ dist_km: 0, lat: 43.0, lng: -3.0, ele: 100 })
      expect(data.waypoints[1]).toEqual({ dist_km: 12.5, lat: 43.1, lng: -3.1, ele: 200 })
    })

    it('builds WKT LINESTRING with lng lat order for PostGIS', async () => {
      await processor.process(makeJob())

      const [, data] = mockSegmentsRepo.updateAfterParse.mock.calls[0]
      expect(data.geomWkt).toBe('LINESTRING(-3 43, -3.1 43.1)')
    })
  })

  describe('valid GPX without elevation data (AC #6)', () => {
    beforeEach(() => {
      jest.mocked(gpxMock.parseGpx).mockReturnValue(makeRawPoints(false))
      jest.mocked(gpxMock.computeCumulativeDistances).mockReturnValue(makeKmWaypoints(false))
      jest.mocked(gpxMock.computeElevationGain).mockReturnValue(0)
    })

    it('stores waypoints without ele field', async () => {
      await processor.process(makeJob())

      const [, data] = mockSegmentsRepo.updateAfterParse.mock.calls[0]
      expect(data.waypoints[0]).toEqual({ dist_km: 0, lat: 43.0, lng: -3.0 })
      expect('ele' in data.waypoints[0]).toBe(false)
    })

    it('sets elevationGainM to null when no elevation gain', async () => {
      await processor.process(makeJob())

      const [, data] = mockSegmentsRepo.updateAfterParse.mock.calls[0]
      expect(data.elevationGainM).toBeNull()
    })
  })

  describe('malformed GPX (no track points) — AC #4', () => {
    beforeEach(() => {
      jest.mocked(gpxMock.parseGpx).mockReturnValue([])
    })

    it('calls updateParseError and re-throws to allow BullMQ retry', async () => {
      await expect(processor.process(makeJob())).rejects.toThrow('GPX file contains no track points')

      expect(mockSegmentsRepo.updateParseError).toHaveBeenCalledWith('seg-1')
      expect(mockSegmentsRepo.updateAfterParse).not.toHaveBeenCalled()
      expect(mockSegmentsService.recomputeCumulativeDistances).not.toHaveBeenCalled()
    })
  })

  describe('segment deleted before job ran', () => {
    beforeEach(() => {
      mockSegmentsRepo.findAdventureIdBySegmentId.mockResolvedValue(null)
    })

    it('returns early without error', async () => {
      await expect(processor.process(makeJob())).resolves.toBeUndefined()

      expect(mockSegmentsRepo.setProcessingStatus).not.toHaveBeenCalled()
      expect(mockSegmentsRepo.updateAfterParse).not.toHaveBeenCalled()
      expect(mockSegmentsRepo.updateParseError).not.toHaveBeenCalled()
    })
  })

  describe('RDP simplification', () => {
    it('applies rdpSimplify when rawPoints exceed MAX_GPX_POINTS', async () => {
      const manyPoints = Array.from({ length: 2001 }, (_, i) => ({ lat: i * 0.001, lng: -3.0 }))
      const simplifiedPoints = [{ lat: 0, lng: -3.0 }, { lat: 2.0, lng: -3.0 }]
      jest.mocked(gpxMock.parseGpx).mockReturnValue(manyPoints)
      jest.mocked(gpxMock.computeCumulativeDistances).mockReturnValue([
        { km: 0, lat: 0, lng: -3.0 },
        { km: 222.0, lat: 2.0, lng: -3.0 },
      ])
      jest.mocked(gpxMock.rdpSimplify).mockReturnValue(simplifiedPoints)

      await processor.process(makeJob())

      expect(gpxMock.rdpSimplify).toHaveBeenCalledWith(manyPoints, 0.0001)
      const [, data] = mockSegmentsRepo.updateAfterParse.mock.calls[0]
      expect(data.geomWkt).toBe('LINESTRING(-3 0, -3 2)')
    })

    it('skips rdpSimplify when rawPoints are within MAX_GPX_POINTS', async () => {
      jest.mocked(gpxMock.parseGpx).mockReturnValue(makeRawPoints())
      jest.mocked(gpxMock.computeCumulativeDistances).mockReturnValue(makeKmWaypoints())

      await processor.process(makeJob())

      expect(gpxMock.rdpSimplify).not.toHaveBeenCalled()
    })
  })
})
