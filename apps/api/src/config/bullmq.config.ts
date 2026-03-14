import type { QueueOptions } from 'bullmq'

export const bullmqConfig: QueueOptions = {
  connection: {
    url: process.env['REDIS_URL']!, // rediss://... (TLS)
    // Upstash-specific settings:
    maxRetriesPerRequest: null, // Required for BullMQ with Upstash
    enableReadyCheck: false,    // Required for Upstash
    lazyConnect: false,
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: { count: 100 }, // Keep last 100 completed jobs
    removeOnFail: { count: 50 },      // Keep last 50 failed jobs
  },
}
