import { DensityAnalyzeProcessor } from './density-analyze.processor.js'
import type { DensityRepository } from '../density.repository.js'
import type { OverpassProvider } from '../../pois/providers/overpass.provider.js'
import type { GooglePlacesProvider } from '../../pois/providers/google-places.provider.js'
import type { RedisProvider } from '../../common/providers/redis.provider.js'
import type { Job } from 'bullmq'

const mockRepo: jest.Mocked<Pick<DensityRepository, 'setDensityStatus' | 'setDensityProgress' | 'findSegmentsForAnalysis' | 'insertGaps' | 'setDensityAnalyzedAt'>> = {
  setDensityStatus: jest.fn().mockResolvedValue(undefined),
  setDensityProgress: jest.fn().mockResolvedValue(undefined),
  findSegmentsForAnalysis: jest.fn(),
  insertGaps: jest.fn().mockResolvedValue(undefined),
  setDensityAnalyzedAt: jest.fn().mockResolvedValue(undefined),
}

const mockOverpass: jest.Mocked<Pick<OverpassProvider, 'queryPois'>> = {
  queryPois: jest.fn(),
}

const mockGooglePlaces: jest.Mocked<Pick<GooglePlacesProvider, 'searchLayerPlaceIds'>> = {
  searchLayerPlaceIds: jest.fn().mockResolvedValue([]),
}

const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn().mockResolvedValue('OK'),
}

const mockRedisProvider: jest.Mocked<Pick<RedisProvider, 'getClient'>> = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
}

const processor = new DensityAnalyzeProcessor(
  mockRepo as unknown as DensityRepository,
  mockOverpass as unknown as OverpassProvider,
  mockGooglePlaces as unknown as GooglePlacesProvider,
  mockRedisProvider as unknown as RedisProvider,
)

const DEFAULT_CATEGORIES = ['hotel', 'hostel', 'camp_site', 'shelter', 'guesthouse']

function makeJob(data: { adventureId: string; segmentIds: string[]; categories?: string[] }): Job<{ adventureId: string; segmentIds: string[]; categories: string[] }> {
  return { data: { categories: DEFAULT_CATEGORIES, ...data } } as Job<{ adventureId: string; segmentIds: string[]; categories: string[] }>
}

const WAYPOINTS_50KM = Array.from({ length: 6 }, (_, i) => ({
  dist_km: i * 10,
  lat: 43 + i * 0.1,
  lng: -2 + i * 0.1,
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockRepo.setDensityStatus.mockResolvedValue(undefined)
  mockRepo.setDensityProgress.mockResolvedValue(undefined)
  mockRepo.insertGaps.mockResolvedValue(undefined)
  mockRedisClient.get.mockResolvedValue(null) // Cache miss by default
  mockRedisClient.set.mockResolvedValue('OK')
  mockGooglePlaces.searchLayerPlaceIds.mockResolvedValue([]) // No Google results by default
})

describe('DensityAnalyzeProcessor.process', () => {
  it('happy path: sets processing, inserts critical gap for 0-accommodation troncon, sets success', async () => {
    // Use 2-waypoint segment = single 10km tronçon to avoid delay accumulation in tests
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockResolvedValue([]) // 0 accommodations → critical gap

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    expect(mockRepo.setDensityStatus).toHaveBeenCalledWith('adv-1', 'processing')
    expect(mockRepo.setDensityStatus).toHaveBeenCalledWith('adv-1', 'success')
    expect(mockRepo.insertGaps).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ segmentId: 'seg-1', severity: 'critical' }),
      ]),
    )
    expect(mockRepo.setDensityAnalyzedAt).toHaveBeenCalledWith('adv-1', expect.any(Date))
  })

  it('setDensityAnalyzedAt is called AFTER setDensityStatus("success")', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockResolvedValue([])

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    const successCallOrder = mockRepo.setDensityStatus.mock.invocationCallOrder.at(-1)!
    const analyzedAtCallOrder = mockRepo.setDensityAnalyzedAt.mock.invocationCallOrder[0]
    expect(analyzedAtCallOrder).toBeGreaterThan(successCallOrder)
  })

  it('setDensityAnalyzedAt is NOT called when analysis fails', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockRejectedValue(new Error('Overpass unavailable'))
    mockRedisClient.get.mockResolvedValue(null)
    // Google also fails to ensure error path
    mockGooglePlaces.searchLayerPlaceIds.mockRejectedValue(new Error('Google unavailable'))

    // Promise.allSettled means both failing → count=0 → critical gap → success (not error)
    // To trigger the catch block we need insertGaps to throw
    mockRepo.insertGaps.mockRejectedValue(new Error('DB error'))

    await expect(processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))).rejects.toThrow('DB error')

    expect(mockRepo.setDensityStatus).toHaveBeenCalledWith('adv-1', 'error')
    expect(mockRepo.setDensityAnalyzedAt).not.toHaveBeenCalled()
  })

  it('inserts medium gap when 1 accommodation found', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) }, // single 10km tronçon
    ])
    mockOverpass.queryPois.mockResolvedValue([{ type: 'node', id: 1, lat: 43, lon: -2, tags: {} } as never])

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    expect(mockRepo.insertGaps).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'medium' }),
      ]),
    )
  })

  it('inserts no gap when 2+ accommodations found (green zone)', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockResolvedValue([
      { type: 'node', id: 1, lat: 43, lon: -2, tags: {} } as never,
      { type: 'node', id: 2, lat: 43.1, lon: -1.9, tags: {} } as never,
    ])

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    expect(mockRepo.insertGaps).toHaveBeenCalledWith([])
  })

  it('uses Redis cache — skips Overpass if cached', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockRedisClient.get.mockResolvedValue('3') // Cached count of 3

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    expect(mockOverpass.queryPois).not.toHaveBeenCalled()
    expect(mockRepo.insertGaps).toHaveBeenCalledWith([]) // 3 ≥ 2 → green zone
  })

  it('cache MISS: stores count in Redis permanently — redis.set called with exactly 2 args (no EX)', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockResolvedValue([
      { type: 'node', id: 1, lat: 43, lon: -2, tags: {} } as never,
    ]) // count = 1

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    expect(mockRedisClient.set).toHaveBeenCalledTimes(1)
    // Permanent cache: redis.set(key, value) — NO EX argument
    const setArgs = mockRedisClient.set.mock.calls[0] as unknown[]
    expect(setArgs).toHaveLength(2)
    expect(typeof setArgs[0]).toBe('string') // cacheKey
    expect(setArgs[1]).toBe('1')             // count as string
  })

  it('falls back to Google count when Overpass fails', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockRejectedValue(new Error('Overpass unavailable'))
    mockGooglePlaces.searchLayerPlaceIds.mockResolvedValue(['place-1', 'place-2', 'place-3'])

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    // Google found 3 → green zone, no gaps
    expect(mockRepo.insertGaps).toHaveBeenCalledWith([])
    expect(mockRepo.setDensityStatus).toHaveBeenCalledWith('adv-1', 'success')
    // Permanent cache: redis.set called with 2 args (no EX) even when count comes from Google
    expect(mockRedisClient.set).toHaveBeenCalledTimes(1)
    const setArgs = mockRedisClient.set.mock.calls[0] as unknown[]
    expect(setArgs).toHaveLength(2)
    expect(setArgs[1]).toBe('3') // Google count cached permanently
  })

  it('inserts critical gap and sets success when both sources fail (Promise.allSettled)', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockRejectedValue(new Error('Overpass unavailable'))
    mockGooglePlaces.searchLayerPlaceIds.mockRejectedValue(new Error('Google unavailable'))

    // Both fail → Promise.allSettled → count=0 → critical gap inserted, job succeeds
    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    expect(mockRepo.insertGaps).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ severity: 'critical' })]),
    )
    expect(mockRepo.setDensityStatus).toHaveBeenCalledWith('adv-1', 'success')
  })

  it('passes job categories to Overpass (not hardcoded)', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: WAYPOINTS_50KM.slice(0, 2) },
    ])
    mockOverpass.queryPois.mockResolvedValue([])

    const customCategories = ['hotel', 'hostel']
    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'], categories: customCategories }))

    expect(mockOverpass.queryPois).toHaveBeenCalledWith(expect.anything(), customCategories)
  })

  it('skips segments with no waypoints gracefully', async () => {
    mockRepo.findSegmentsForAnalysis.mockResolvedValue([
      { id: 'seg-1', waypoints: null },
    ])

    await processor.process(makeJob({ adventureId: 'adv-1', segmentIds: ['seg-1'] }))

    expect(mockOverpass.queryPois).not.toHaveBeenCalled()
    expect(mockRepo.setDensityStatus).toHaveBeenCalledWith('adv-1', 'success')
    expect(mockRepo.insertGaps).toHaveBeenCalledWith([])
  })
})
