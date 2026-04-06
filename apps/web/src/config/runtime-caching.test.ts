import { describe, it, expect } from 'vitest'

/**
 * Test the runtimeCaching configuration for story 12.2.
 * Since next.config.ts exports a wrapped function (not plain config),
 * we verify the expected cache rules by reading the config file content.
 */
describe('runtimeCaching configuration (story 12.2)', () => {
  // Read the raw config to verify expected patterns
  const configPath = `${process.cwd()}/next.config.ts`

  it('includes map-tiles-v1 cache with StaleWhileRevalidate', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('map-tiles-v1')
    expect(content).toContain('StaleWhileRevalidate')
    expect(content).toContain('openfreemap')
  })

  it('includes map-styles-v1 cache', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('map-styles-v1')
    expect(content).toContain('openfreemap\\.org\\/styles')
  })

  it('includes adventure-map-data-v1 cache with NetworkFirst', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('adventure-map-data-v1')
    expect(content).toContain('NetworkFirst')
  })

  it('includes poi-data-v1 cache', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('poi-data-v1')
  })

  it('includes stage-data-v1 cache', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('stage-data-v1')
  })

  it('includes weather-data-v1 cache with 1h TTL', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('weather-data-v1')
    // 1h = 60 * 60 = 3600
    expect(content).toContain('60 * 60')
  })

  it('keeps Plausible paths as NetworkOnly', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('NetworkOnly')
    expect(content).toContain('script.*\\.js')
    expect(content).toContain('\\/api\\/event')
  })

  it('includes offline fallback document', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(configPath, 'utf-8')
    expect(content).toContain('/offline.html')
  })
})
