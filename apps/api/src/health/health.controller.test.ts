import { HealthController } from './health.controller.js'

describe('HealthController', () => {
  let controller: HealthController

  beforeEach(() => {
    controller = new HealthController()
  })

  it('returns status ok', () => {
    const result = controller.check()
    expect(result.status).toBe('ok')
  })

  it('returns a valid ISO timestamp', () => {
    const result = controller.check()
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp)
  })

  it('returns version from env or fallback', () => {
    const result = controller.check()
    expect(typeof result.version).toBe('string')
    expect(result.version.length).toBeGreaterThan(0)
  })
})
