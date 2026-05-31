import { AccessWorkerService } from './access-worker.service.js'
import type { AccessWorkerRepository, EagerPoiRow } from './access-worker.repository.js'
import type { AccessJobPayload } from './types/access-job-payload.js'
import type accessConfig from '../../config/access.config.js'
import type { ConfigType } from '@nestjs/config'
import type { Queue } from 'bullmq'

const ENGINE_VERSION = 'brouter-1.7.9+profiles-v2'
const THRESHOLD_M = 1500

const mockRepo: jest.Mocked<
  Pick<AccessWorkerRepository, 'findEagerPois' | 'markAccessFailed' | 'resetAccessForAdventure'>
> = {
  findEagerPois: jest.fn(),
  markAccessFailed: jest.fn().mockResolvedValue(undefined),
  resetAccessForAdventure: jest.fn().mockResolvedValue(undefined),
}

const mockQueue: jest.Mocked<Pick<Queue, 'add'>> = {
  add: jest.fn().mockResolvedValue(undefined),
}

const mockConfig = {
  eagerThresholdM: THRESHOLD_M,
  engineVersion: ENGINE_VERSION,
} as unknown as ConfigType<typeof accessConfig>

const service = new AccessWorkerService(
  mockRepo as unknown as AccessWorkerRepository,
  mockQueue as unknown as Queue<AccessJobPayload>,
  mockConfig,
)

beforeEach(() => {
  jest.clearAllMocks()
  mockRepo.markAccessFailed.mockResolvedValue(undefined)
  mockRepo.resetAccessForAdventure.mockResolvedValue(undefined)
  mockQueue.add.mockResolvedValue(undefined as never)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('AccessWorkerService.handleCorridorReady', () => {
  it('looks up eligible POIs with the configured eager threshold', async () => {
    mockRepo.findEagerPois.mockResolvedValue([])

    await service.handleCorridorReady({ adventureId: 'adv-1' })

    expect(mockRepo.findEagerPois).toHaveBeenCalledWith('adv-1', THRESHOLD_M)
  })

  it('enqueues one compute-access job per eligible POI with the right payload', async () => {
    const pois: EagerPoiRow[] = [
      { id: 'poi-1', routingProfile: 'gravel' },
      { id: 'poi-2', routingProfile: 'road' },
    ]
    mockRepo.findEagerPois.mockResolvedValue(pois)

    await service.handleCorridorReady({ adventureId: 'adv-1' })

    expect(mockQueue.add).toHaveBeenCalledTimes(2)
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      1,
      'compute-access',
      { poiId: 'poi-1', adventureId: 'adv-1', routingProfile: 'gravel', engineVersion: ENGINE_VERSION },
      { jobId: `poi-1:${ENGINE_VERSION}:null` },
    )
    expect(mockQueue.add).toHaveBeenNthCalledWith(
      2,
      'compute-access',
      { poiId: 'poi-2', adventureId: 'adv-1', routingProfile: 'road', engineVersion: ENGINE_VERSION },
      { jobId: `poi-2:${ENGINE_VERSION}:null` },
    )
  })

  it('enqueues nothing when no POI is eligible (silent no-op)', async () => {
    mockRepo.findEagerPois.mockResolvedValue([])

    await service.handleCorridorReady({ adventureId: 'adv-empty' })

    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('uses idempotent jobIds — re-emitting the same event produces identical jobIds', async () => {
    mockRepo.findEagerPois.mockResolvedValue([{ id: 'poi-1', routingProfile: 'gravel' }])

    await service.handleCorridorReady({ adventureId: 'adv-1' })
    await service.handleCorridorReady({ adventureId: 'adv-1' })

    const firstJobId = (mockQueue.add.mock.calls[0]?.[2] as { jobId: string }).jobId
    const secondJobId = (mockQueue.add.mock.calls[1]?.[2] as { jobId: string }).jobId
    expect(firstJobId).toBe(secondJobId)
    expect(firstJobId).toBe(`poi-1:${ENGINE_VERSION}:null`)
  })

  it('jobId encodes the null stageId (nearest-trace pivot — no stage in pre-compute)', async () => {
    mockRepo.findEagerPois.mockResolvedValue([{ id: 'poi-x', routingProfile: 'bikepacking' }])

    await service.handleCorridorReady({ adventureId: 'adv-1' })

    const jobId = (mockQueue.add.mock.calls[0]?.[2] as { jobId: string }).jobId
    expect(jobId.endsWith(':null')).toBe(true)
  })
})

describe('AccessWorkerService.handleTraceUpdated (Story 4.2 — AC #1)', () => {
  it('resets the WHOLE adventure (merged-trace scope) then re-enqueues its eligible POIs', async () => {
    mockRepo.findEagerPois.mockResolvedValue([
      { id: 'poi-1', routingProfile: 'gravel' },
      { id: 'poi-2', routingProfile: 'road' },
    ])

    await service.handleTraceUpdated({ adventureId: 'adv-1', segmentId: 'seg-1', changeType: 'segment-added' })

    // reset + lookup are scoped to the adventure (not the segment): nearest-trace uses the merged trace
    expect(mockRepo.resetAccessForAdventure).toHaveBeenCalledWith('adv-1')
    expect(mockRepo.findEagerPois).toHaveBeenCalledWith('adv-1', THRESHOLD_M)
    // one recompute job per eligible POI, carrying adventureId + engineVersion + reset jobId
    expect(mockQueue.add).toHaveBeenCalledTimes(2)
    const firstCall = mockQueue.add.mock.calls[0]
    expect(firstCall?.[0]).toBe('compute-access')
    expect(firstCall?.[1]).toEqual({
      poiId: 'poi-1',
      adventureId: 'adv-1',
      routingProfile: 'gravel',
      engineVersion: ENGINE_VERSION,
    })
    expect((firstCall?.[2] as { jobId: string }).jobId).toMatch(
      new RegExp(`^poi-1:${escapeRe(ENGINE_VERSION)}:reset:\\d+$`),
    )
  })

  it('works for segment-removed too (same adventure-wide reset)', async () => {
    mockRepo.findEagerPois.mockResolvedValue([])

    await service.handleTraceUpdated({ adventureId: 'adv-1', segmentId: 'seg-9', changeType: 'segment-removed' })

    expect(mockRepo.resetAccessForAdventure).toHaveBeenCalledWith('adv-1')
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('resets BEFORE looking up eligible POIs (so reset rows become eligible again)', async () => {
    mockRepo.findEagerPois.mockResolvedValue([])

    await service.handleTraceUpdated({ adventureId: 'adv-1', segmentId: 'seg-1', changeType: 'segment-added' })

    const resetOrder = mockRepo.resetAccessForAdventure.mock.invocationCallOrder[0]
    const lookupOrder = mockRepo.findEagerPois.mock.invocationCallOrder[0]
    expect(resetOrder).toBeLessThan(lookupOrder)
  })

  it('re-enqueue jobId differs from the eager-precompute null-suffixed jobId (forces recompute)', async () => {
    mockRepo.findEagerPois.mockResolvedValue([{ id: 'poi-1', routingProfile: 'gravel' }])

    await service.handleTraceUpdated({ adventureId: 'adv-1', segmentId: 'seg-1', changeType: 'segment-added' })

    const jobId = (mockQueue.add.mock.calls[0]?.[2] as { jobId: string }).jobId
    expect(jobId.endsWith(':null')).toBe(false)
    expect(jobId).toMatch(/:reset:\d+$/)
  })

  it('is best-effort: one failing enqueue does not stop the others', async () => {
    mockRepo.findEagerPois.mockResolvedValue([
      { id: 'poi-1', routingProfile: 'gravel' },
      { id: 'poi-2', routingProfile: 'road' },
    ])
    mockQueue.add
      .mockRejectedValueOnce(new Error('redis hiccup') as never)
      .mockResolvedValueOnce(undefined as never)

    await expect(
      service.handleTraceUpdated({ adventureId: 'adv-1', segmentId: 'seg-1', changeType: 'segment-added' }),
    ).resolves.toBeUndefined()

    expect(mockQueue.add).toHaveBeenCalledTimes(2)
  })
})

describe('AccessWorkerService.handleProfileChanged (Story 4.2 — AC #2)', () => {
  it('resets the whole adventure then re-enqueues all eligible POIs with the new profile', async () => {
    mockRepo.findEagerPois.mockResolvedValue([
      { id: 'poi-1', routingProfile: 'bikepacking' },
      { id: 'poi-2', routingProfile: 'bikepacking' },
    ])

    await service.handleProfileChanged({
      adventureId: 'adv-1',
      newProfile: 'bikepacking',
      previousProfile: 'gravel',
    })

    expect(mockRepo.resetAccessForAdventure).toHaveBeenCalledWith('adv-1')
    expect(mockRepo.findEagerPois).toHaveBeenCalledWith('adv-1', THRESHOLD_M)
    expect(mockQueue.add).toHaveBeenCalledTimes(2)
    const firstCall = mockQueue.add.mock.calls[0]
    expect(firstCall?.[1]).toEqual({
      poiId: 'poi-1',
      adventureId: 'adv-1',
      routingProfile: 'bikepacking',
      engineVersion: ENGINE_VERSION,
    })
    expect((firstCall?.[2] as { jobId: string }).jobId).toMatch(/:reset:\d+$/)
  })

  it('is idempotent: skips reset + enqueue when newProfile === previousProfile', async () => {
    await service.handleProfileChanged({
      adventureId: 'adv-1',
      newProfile: 'gravel',
      previousProfile: 'gravel',
    })

    expect(mockRepo.resetAccessForAdventure).not.toHaveBeenCalled()
    expect(mockRepo.findEagerPois).not.toHaveBeenCalled()
    expect(mockQueue.add).not.toHaveBeenCalled()
  })

  it('resets nothing to enqueue when the adventure has no eligible POI', async () => {
    mockRepo.findEagerPois.mockResolvedValue([])

    await service.handleProfileChanged({
      adventureId: 'adv-empty',
      newProfile: 'road',
      previousProfile: 'gravel',
    })

    expect(mockRepo.resetAccessForAdventure).toHaveBeenCalledWith('adv-empty')
    expect(mockQueue.add).not.toHaveBeenCalled()
  })
})

/** Escape a string for safe interpolation inside a RegExp (engineVersion contains '+' and '.'). */
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
