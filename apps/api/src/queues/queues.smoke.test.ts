// Integration test — requires real Upstash Redis (use .env values)
// Run with: pnpm --filter '@ridenrest/api' test queues.smoke

import { Queue } from 'bullmq'
import { bullmqConfig } from '../config/bullmq.config.js'

describe('BullMQ queues (smoke)', () => {
  let gpxQueue: Queue

  beforeAll(() => {
    gpxQueue = new Queue('gpx-processing', { connection: bullmqConfig.connection })
  })

  afterAll(async () => {
    await gpxQueue.close()
  })

  it('enqueues a parse-segment job', async () => {
    const job = await gpxQueue.add('parse-segment', {
      segmentId: 'test-segment-id',
      storageUrl: '/data/gpx/test-segment-id.gpx',
    })
    expect(job.id).toBeDefined()
    // Cleanup
    await job.remove()
  })
})
