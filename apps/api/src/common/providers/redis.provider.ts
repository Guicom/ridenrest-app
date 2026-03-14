import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class RedisProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisProvider.name)
  private client!: Redis

  async onModuleInit(): Promise<void> {
    this.client = new Redis(process.env['REDIS_URL']!, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    })

    const pong = await this.client.ping()
    this.logger.log(`Redis connected - ${pong}`)
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit()
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('RedisProvider not initialized — ensure onModuleInit has completed before calling getClient()')
    }
    return this.client
  }
}
