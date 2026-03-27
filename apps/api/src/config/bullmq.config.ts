import type { QueueOptions } from 'bullmq'

const redisUrl = process.env['REDIS_URL'] ?? ''

export const bullmqConfig: QueueOptions = {
  connection: {
    url: redisUrl,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
}
