jest.mock('node:fs/promises')
jest.mock('@ridenrest/gpx')
jest.mock('@ridenrest/shared', () => ({
  MAX_GPX_POINTS: 2000,
  RDP_EPSILON: 0.0001,
}))

import * as fsMock from 'node:fs/promises'
import * as gpxMock from '@ridenrest/gpx'
import type { Job } from 'bullmq'
import { GpxParseProcessor } from './gpx-parse.processor.js'
import type { SegmentsRepository } from '../segments.repository.js'
import type { SegmentsService } from '../segments.service.js'

interface ParseSegmentJobData {
  segmentId: string
  storageUrl: string
}

const mockSegmentsRepo = {
  findAdventureIdBySegmentId: jest.fn(),
  setProcessingStatus: jest.fn(),
  updateAfterParse: jest.fn(),
  updateParseError: jest.fn(),
}

const mockSegmentsService = {
  recomputeCumulativeDistances: jest.fn(),
}

const makeJob = (data: Partial<ParseSegmentJobData> = {}): Job<ParseSegmentJobData> =>
  ({
    id: 'job-abc-123',
    data: { segmentId: 'seg-1', storageUrl: '/data/gpx/seg-1.gpx', ...data },
  }) as unknown as Job<ParseSegmentJobData>

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
  let logSpy: jest.SpyInstance
  let errorSpy: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    processor = new GpxParseProcessor(
      mockSegmentsRepo as unknown as SegmentsRepository,
      mockSegmentsService as unknown as SegmentsService,
    )
    // Spy on the logger instance created inside the processor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    logSpy = jest.spyOn((processor as any).logger, 'log').mockImplementation(() => undefined)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    errorSpy = jest.spyOn((processor as any).logger, 'error').mockImplementation(() => undefined)
    mockSegmentsRepo.findAdventureIdBySegmentId.mockResolvedValue('adv-1')
    mockSegmentsRepo.setProcessingStatus.mockResolvedValue(undefined)
    mockSegmentsRepo.updateAfterParse.mockResolvedValue(undefined)
    mockSegmentsRepo.updateParseError.mockResolvedValue(undefined)
    mockSegmentsService.recomputeCumulativeDistances.mockResolvedValue(undefined)
    ;(fsMock.readFile as jest.Mock).mockResolvedValue(Buffer.from('<gpx>valid</gpx>'))
    ;(gpxMock.computeElevationGain as jest.Mock).mockReturnValue(100)
    ;(gpxMock.computeBoundingBox as jest.Mock).mockReturnValue({
      minLat: 43.0,
      maxLat: 43.1,
      minLng: -3.1,
      maxLng: -3.0,
    })
    ;(gpxMock.rdpSimplify as jest.Mock).mockImplementation((pts: unknown) => pts)
  })

  describe('valid GPX with elevation data', () => {
    beforeEach(() => {
      ;(gpxMock.parseGpx as jest.Mock).mockReturnValue(makeRawPoints(true))
      ;(gpxMock.computeCumulativeDistances as jest.Mock).mockReturnValue(makeKmWaypoints(true))
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

      expect(mockSegmentsRepo.updateAfterParse).toHaveBeenCalledWith(
        'seg-1',
        expect.objectContaining({
          waypoints: [
            { dist_km: 0, lat: 43.0, lng: -3.0, ele: 100 },
            { dist_km: 12.5, lat: 43.1, lng: -3.1, ele: 200 },
          ],
        }),
      )
    })

    it('builds WKT LINESTRING with lng lat order for PostGIS', async () => {
      await processor.process(makeJob())

      expect(mockSegmentsRepo.updateAfterParse).toHaveBeenCalledWith(
        'seg-1',
        expect.objectContaining({
          geomWkt: 'LINESTRING(-3 43, -3.1 43.1)',
        }),
      )
    })
  })

  describe('valid GPX without elevation data (AC #6)', () => {
    beforeEach(() => {
      ;(gpxMock.parseGpx as jest.Mock).mockReturnValue(makeRawPoints(false))
      ;(gpxMock.computeCumulativeDistances as jest.Mock).mockReturnValue(makeKmWaypoints(false))
      ;(gpxMock.computeElevationGain as jest.Mock).mockReturnValue(0)
    })

    it('stores waypoints without ele field', async () => {
      await processor.process(makeJob())

      expect(mockSegmentsRepo.updateAfterParse).toHaveBeenCalledWith(
        'seg-1',
        expect.objectContaining({
          waypoints: [
            { dist_km: 0, lat: 43.0, lng: -3.0 },
            { dist_km: 12.5, lat: 43.1, lng: -3.1 },
          ],
        }),
      )
    })

    it('sets elevationGainM to null when no elevation gain', async () => {
      await processor.process(makeJob())

      expect(mockSegmentsRepo.updateAfterParse).toHaveBeenCalledWith(
        'seg-1',
        expect.objectContaining({ elevationGainM: null }),
      )
    })
  })

  describe('malformed GPX (no track points) — AC #4', () => {
    beforeEach(() => {
      ;(gpxMock.parseGpx as jest.Mock).mockReturnValue([])
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

    it('logs a warn when segment is deleted before processing', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const warnSpy = jest.spyOn((processor as any).logger, 'warn').mockImplementation(() => undefined)

      await processor.process(makeJob())

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: 'seg-1', jobId: 'job-abc-123' }),
        'GPX parse job skipped — segment deleted before processing',
      )
    })
  })

  describe('logger calls (AC #4)', () => {
    beforeEach(() => {
      ;(gpxMock.parseGpx as jest.Mock).mockReturnValue(makeRawPoints(true))
      ;(gpxMock.computeCumulativeDistances as jest.Mock).mockReturnValue(makeKmWaypoints(true))
    })

    it('calls logger.log on job start', async () => {
      await processor.process(makeJob())

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: 'seg-1', jobId: 'job-abc-123' }),
        'GPX parse job started',
      )
    })

    it('calls logger.log on job complete with durationMs', async () => {
      await processor.process(makeJob())

      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: 'seg-1', durationMs: expect.any(Number) }),
        'GPX parse job completed',
      )
    })

    it('calls logger.error on job failure', async () => {
      ;(gpxMock.parseGpx as jest.Mock).mockReturnValue([]) // triggers error

      await expect(processor.process(makeJob())).rejects.toThrow()

      expect(errorSpy).toHaveBeenCalledWith(
        expect.objectContaining({ segmentId: 'seg-1' }),
        'GPX parse job failed',
      )
    })
  })

  describe('RDP simplification', () => {
    it('applies rdpSimplify when rawPoints exceed MAX_GPX_POINTS', async () => {
      const manyPoints = Array.from({ length: 2001 }, (_, i) => ({ lat: i * 0.001, lng: -3.0 }))
      const simplifiedPoints = [
        { lat: 0, lng: -3.0 },
        { lat: 2.0, lng: -3.0 },
      ]
      ;(gpxMock.parseGpx as jest.Mock).mockReturnValue(manyPoints)
      ;(gpxMock.computeCumulativeDistances as jest.Mock).mockReturnValue([
        { km: 0, lat: 0, lng: -3.0 },
        { km: 222.0, lat: 2.0, lng: -3.0 },
      ])
      ;(gpxMock.rdpSimplify as jest.Mock).mockReturnValue(simplifiedPoints)

      await processor.process(makeJob())

      expect(gpxMock.rdpSimplify).toHaveBeenCalledWith(manyPoints, 0.0001)
      expect(mockSegmentsRepo.updateAfterParse).toHaveBeenCalledWith(
        'seg-1',
        expect.objectContaining({ geomWkt: 'LINESTRING(-3 0, -3 2)' }),
      )
    })

    it('skips rdpSimplify when rawPoints are within MAX_GPX_POINTS', async () => {
      ;(gpxMock.parseGpx as jest.Mock).mockReturnValue(makeRawPoints())
      ;(gpxMock.computeCumulativeDistances as jest.Mock).mockReturnValue(makeKmWaypoints())

      await processor.process(makeJob())

      expect(gpxMock.rdpSimplify).not.toHaveBeenCalled()
    })
  })
})
