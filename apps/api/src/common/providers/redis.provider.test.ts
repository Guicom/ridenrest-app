import { TestingModule, Test } from '@nestjs/testing'
import { RedisProvider } from './redis.provider.js'

const mockPing = jest.fn().mockResolvedValue('PONG')
const mockQuit = jest.fn().mockResolvedValue('OK')

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    ping: mockPing,
    quit: mockQuit,
  }))
})

describe('RedisProvider', () => {
  let provider: RedisProvider
  let moduleRef: TestingModule

  beforeEach(async () => {
    process.env['REDIS_URL'] = 'rediss://:test@localhost:6379'
    moduleRef = await Test.createTestingModule({
      providers: [RedisProvider],
    }).compile()

    // module.init() triggers NestJS lifecycle hooks (OnModuleInit) as in production
    await moduleRef.init()
    provider = moduleRef.get<RedisProvider>(RedisProvider)
  })

  afterEach(async () => {
    await moduleRef.close()
    jest.clearAllMocks()
  })

  it('should connect and ping Redis on init', () => {
    expect(mockPing).toHaveBeenCalled()
  })

  it('should return the Redis client', () => {
    const client = provider.getClient()
    expect(client).toBeDefined()
  })

  it('should quit on destroy', async () => {
    await provider.onModuleDestroy()
    expect(mockQuit).toHaveBeenCalled()
  })
})
