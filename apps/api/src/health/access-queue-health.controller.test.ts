import type { Queue } from 'bullmq'
import { AccessQueueHealthController } from './access-queue-health.controller.js'

type QueueMock = Pick<
  Queue,
  'getWaitingCount' | 'getDelayedCount' | 'getWaiting' | 'getDelayed' | 'getFailed'
>

function makeQueue(overrides: Partial<Record<keyof QueueMock, jest.Mock>> = {}): QueueMock {
  return {
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    getWaiting: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as QueueMock
}

describe('AccessQueueHealthController', () => {
  const NOW = 1_700_000_000_000

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('depth = waiting + delayed', async () => {
    const queue = makeQueue({
      getWaitingCount: jest.fn().mockResolvedValue(7),
      getDelayedCount: jest.fn().mockResolvedValue(3),
    })
    const controller = new AccessQueueHealthController(queue as unknown as Queue)

    const res = await controller.getAccessQueueHealth()

    expect(res.depth).toBe(10)
  })

  it('oldestPendingAgeS = 0 quand la queue est vide', async () => {
    const controller = new AccessQueueHealthController(makeQueue() as unknown as Queue)
    const res = await controller.getAccessQueueHealth()
    expect(res.oldestPendingAgeS).toBe(0)
  })

  it('oldestPendingAgeS calculé depuis le timestamp du plus ancien job en attente', async () => {
    const queue = makeQueue({
      getWaiting: jest.fn().mockResolvedValue([{ timestamp: NOW - 90_000 }]), // 90s
    })
    const controller = new AccessQueueHealthController(queue as unknown as Queue)

    const res = await controller.getAccessQueueHealth()

    expect(queue.getWaiting).toHaveBeenCalledWith(0, 0)
    expect(res.oldestPendingAgeS).toBe(90)
  })

  it('oldestPendingAgeS prend en compte un backlog uniquement delayed (jobs en backoff)', async () => {
    const queue = makeQueue({
      getWaiting: jest.fn().mockResolvedValue([]),
      getDelayed: jest.fn().mockResolvedValue([{ timestamp: NOW - 120_000 }]), // 120s
    })
    const controller = new AccessQueueHealthController(queue as unknown as Queue)

    const res = await controller.getAccessQueueHealth()

    expect(queue.getDelayed).toHaveBeenCalledWith(0, 0)
    expect(res.oldestPendingAgeS).toBe(120)
  })

  it('oldestPendingAgeS = âge du plus ancien entre waiting et delayed', async () => {
    const queue = makeQueue({
      getWaiting: jest.fn().mockResolvedValue([{ timestamp: NOW - 30_000 }]), // 30s
      getDelayed: jest.fn().mockResolvedValue([{ timestamp: NOW - 200_000 }]), // 200s → plus ancien
    })
    const controller = new AccessQueueHealthController(queue as unknown as Queue)

    const res = await controller.getAccessQueueHealth()

    expect(res.oldestPendingAgeS).toBe(200)
  })

  it('failed24h ne compte que les échecs des dernières 24h', async () => {
    const within = NOW - 1 * 60 * 60 * 1000 // 1h
    const old = NOW - 30 * 60 * 60 * 1000 // 30h → exclu
    const queue = makeQueue({
      getFailed: jest.fn().mockResolvedValue([
        { finishedOn: within },
        { finishedOn: within },
        { finishedOn: old },
      ]),
    })
    const controller = new AccessQueueHealthController(queue as unknown as Queue)

    const res = await controller.getAccessQueueHealth()

    expect(res.failed24h).toBe(2)
  })

  it('failed24h retombe sur timestamp si finishedOn absent', async () => {
    const queue = makeQueue({
      getFailed: jest.fn().mockResolvedValue([{ timestamp: NOW - 1000 }]),
    })
    const controller = new AccessQueueHealthController(queue as unknown as Queue)

    const res = await controller.getAccessQueueHealth()

    expect(res.failed24h).toBe(1)
  })
})
