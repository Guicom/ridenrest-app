import { AccessWorkerProcessor } from './access-worker.processor.js'
import type { AccessCalculatorService } from '../access-calculator/access-calculator.service.js'
import type { AccessWorkerRepository } from './access-worker.repository.js'
import type { AccessResult } from '../access-calculator/types/access-result.types.js'
import type { AccessJobPayload, AccessFailurePayload } from './types/access-job-payload.js'
import type { Job, Queue } from 'bullmq'

const mockCalculator: jest.Mocked<Pick<AccessCalculatorService, 'compute'>> = {
  compute: jest.fn(),
}

const mockRepo: jest.Mocked<Pick<AccessWorkerRepository, 'findEagerPois' | 'markAccessFailed'>> = {
  findEagerPois: jest.fn(),
  markAccessFailed: jest.fn().mockResolvedValue(undefined),
}

const mockDlq: jest.Mocked<Pick<Queue, 'add'>> = {
  add: jest.fn().mockResolvedValue(undefined),
}

const processor = new AccessWorkerProcessor(
  mockCalculator as unknown as AccessCalculatorService,
  mockRepo as unknown as AccessWorkerRepository,
  mockDlq as unknown as Queue<AccessFailurePayload>,
)

const OK_RESULT: AccessResult = {
  status: 'ok',
  distanceM: 1200,
  elevationGainM: 30,
  elevationLossM: 10,
  geometry: { type: 'LineString', coordinates: [[2, 48], [2.1, 48.1]] },
  engineVersion: 'brouter-1.7.9+profiles-v2',
  computedAt: '2026-05-30T22:00:00.000Z',
  source: 'computed-fresh',
}

function makeJob(
  data: Partial<AccessJobPayload> = {},
  overrides: { attempts?: number; attemptsMade?: number; id?: string } = {},
): Job<AccessJobPayload> {
  return {
    id: overrides.id ?? 'job-1',
    data: {
      poiId: 'poi-1',
      adventureId: 'adv-1',
      routingProfile: 'gravel',
      engineVersion: 'brouter-1.7.9+profiles-v2',
      ...data,
    },
    opts: { attempts: overrides.attempts ?? 3 },
    attemptsMade: overrides.attemptsMade ?? 0,
  } as Job<AccessJobPayload>
}

beforeEach(() => {
  jest.clearAllMocks()
  mockRepo.markAccessFailed.mockResolvedValue(undefined)
  mockDlq.add.mockResolvedValue(undefined as never)
})

describe('AccessWorkerProcessor.process', () => {
  it('calls compute with nearest-trace origin and the job poiId (no profileOverride)', async () => {
    mockCalculator.compute.mockResolvedValue(OK_RESULT)

    await processor.process(makeJob({ poiId: 'poi-42' }))

    expect(mockCalculator.compute).toHaveBeenCalledWith({
      poiId: 'poi-42',
      origin: { type: 'nearest-trace' },
    })
    // No profileOverride is passed — profile is derived from the adventure in compute()
    expect(mockCalculator.compute).toHaveBeenCalledTimes(1)
    expect(mockCalculator.compute.mock.calls[0]?.[0]).not.toHaveProperty('profileOverride')
  })

  it('completes successfully on an ok result (persistence handled by AccessCalculator)', async () => {
    mockCalculator.compute.mockResolvedValue(OK_RESULT)

    await expect(processor.process(makeJob())).resolves.toBeUndefined()
  })

  it('does NOT throw on a fallback result (BRouter down → POI stays eligible, no access_failed)', async () => {
    mockCalculator.compute.mockResolvedValue({
      status: 'fallback',
      fallbackReason: 'routing_failed',
      fallbackDistanceM: 800,
      source: 'computed-fresh',
    })

    await expect(processor.process(makeJob())).resolves.toBeUndefined()
    expect(mockRepo.markAccessFailed).not.toHaveBeenCalled()
  })

  it('propagates a thrown error so BullMQ can retry (degenerate POI, DB error)', async () => {
    mockCalculator.compute.mockRejectedValue(new Error('POI not found'))

    await expect(processor.process(makeJob())).rejects.toThrow('POI not found')
  })

  it('throws on an error-status result so BullMQ retries (no silent success)', async () => {
    // Branche défensive (contrat : `error` jamais retourné aujourd'hui) — si elle l'était,
    // on doit propager pour déclencher retry → access_failed, jamais marquer le job en succès.
    mockCalculator.compute.mockResolvedValue({
      status: 'error',
      message: 'unexpected',
    } as unknown as AccessResult)

    await expect(processor.process(makeJob({ poiId: 'poi-err' }))).rejects.toThrow(/poi-err/)
    expect(mockRepo.markAccessFailed).not.toHaveBeenCalled()
  })
})

describe('AccessWorkerProcessor.onFailed', () => {
  it('does nothing on a non-final attempt (will retry)', async () => {
    await processor.onFailed(makeJob({}, { attempts: 3, attemptsMade: 1 }), new Error('transient'))

    expect(mockRepo.markAccessFailed).not.toHaveBeenCalled()
    expect(mockDlq.add).not.toHaveBeenCalled()
  })

  it('marks access_failed and routes to the DLQ on the final attempt', async () => {
    const job = makeJob({ poiId: 'poi-99' }, { attempts: 3, attemptsMade: 3 })

    await processor.onFailed(job, new Error('boom'))

    expect(mockRepo.markAccessFailed).toHaveBeenCalledWith('poi-99')
    expect(mockDlq.add).toHaveBeenCalledTimes(1)
    const [jobName, dlqPayload, opts] = mockDlq.add.mock.calls[0] as [
      string,
      { payload: AccessJobPayload; error: string; failedAt: string },
      { jobId: string },
    ]
    expect(jobName).toBe('failed-access')
    expect(dlqPayload.payload.poiId).toBe('poi-99')
    expect(dlqPayload.error).toBe('boom')
    expect(typeof dlqPayload.failedAt).toBe('string')
    // jobId DLQ déterministe → dédup si l'event 'failed' re-fire.
    expect(opts.jobId).toBe(`poi-99:${OK_RESULT.engineVersion}:failed`)
  })

  it('treats a single-attempt job (attempts undefined → 1) as final on first failure', async () => {
    const job = { id: 'j', data: makeJob().data, opts: {}, attemptsMade: 1 } as Job<AccessJobPayload>

    await processor.onFailed(job, new Error('boom'))

    expect(mockRepo.markAccessFailed).toHaveBeenCalledWith('poi-1')
  })

  it('still records to the DLQ when markAccessFailed throws (independent side effects, no crash)', async () => {
    mockRepo.markAccessFailed.mockRejectedValue(new Error('DB down'))
    const job = makeJob({}, { attempts: 3, attemptsMade: 3 })

    await expect(processor.onFailed(job, new Error('boom'))).resolves.toBeUndefined()
    // La DLQ est déposée d'abord et indépendamment : un échec du mark DB ne doit pas la perdre.
    expect(mockDlq.add).toHaveBeenCalledTimes(1)
  })

  it('still marks access_failed when the DLQ deposit throws (independent side effects, no crash)', async () => {
    mockDlq.add.mockRejectedValue(new Error('Redis down') as never)
    const job = makeJob({ poiId: 'poi-77' }, { attempts: 3, attemptsMade: 3 })

    await expect(processor.onFailed(job, new Error('boom'))).resolves.toBeUndefined()
    // Le marquage DB ne doit pas être empêché par un échec de la DLQ.
    expect(mockRepo.markAccessFailed).toHaveBeenCalledWith('poi-77')
  })
})
