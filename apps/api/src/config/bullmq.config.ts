import type { QueueOptions } from 'bullmq'

const redisUrl = process.env['REDIS_URL'] ?? ''
// Upstash uses rediss:// (TLS). Local Redis uses redis:// — Upstash-specific options
// (maxRetriesPerRequest: null, enableReadyCheck: false) must only be set for Upstash.
const isUpstash = redisUrl.startsWith('rediss://')

export const bullmqConfig: QueueOptions = {
  connection: {
    url: redisUrl,
    ...(isUpstash && {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    }),
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
