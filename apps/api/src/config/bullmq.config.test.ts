import type { QueueOptions } from 'bullmq'

describe('bullmqConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  function loadConfig(): { bullmqConfig: QueueOptions } {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./bullmq.config') as { bullmqConfig: QueueOptions }
  }

  it('sets the connection url from REDIS_URL', () => {
    const url = 'redis://localhost:6379'
    process.env = { ...originalEnv, REDIS_URL: url }
    const { bullmqConfig } = loadConfig()
    expect((bullmqConfig.connection as { url: string }).url).toBe(url)
  })

  it('sets defaultJobOptions with 3 attempts and exponential backoff', () => {
    process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' }
    const { bullmqConfig } = loadConfig()
    expect(bullmqConfig.defaultJobOptions).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    })
  })

  it('sets removeOnComplete and removeOnFail limits', () => {
    process.env = { ...originalEnv, REDIS_URL: 'redis://localhost:6379' }
    const { bullmqConfig } = loadConfig()
    expect(bullmqConfig.defaultJobOptions?.removeOnComplete).toEqual({ count: 100 })
    expect(bullmqConfig.defaultJobOptions?.removeOnFail).toEqual({ count: 50 })
  })
})
