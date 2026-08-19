import { mapWithConcurrency } from './map-with-concurrency.js'

describe('mapWithConcurrency', () => {
  it('returns [] for an empty input without calling fn', async () => {
    const fn = jest.fn()
    await expect(mapWithConcurrency([], 4, fn)).resolves.toEqual([])
    expect(fn).not.toHaveBeenCalled()
  })

  it('preserves input order regardless of completion order', async () => {
    const delays = [30, 5, 20, 1, 10]
    const result = await mapWithConcurrency(delays, 3, async (ms, i) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
      return i
    })
    expect(result).toEqual([0, 1, 2, 3, 4])
  })

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0
    let peak = 0
    const items = Array.from({ length: 20 }, (_, i) => i)

    await mapWithConcurrency(items, 6, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 2))
      inFlight--
      return null
    })

    expect(peak).toBeLessThanOrEqual(6)
    expect(peak).toBeGreaterThan(1)  // genuinely concurrent, not sequential
  })

  it('processes every item exactly once', async () => {
    const items = Array.from({ length: 50 }, (_, i) => i)
    const seen: number[] = []

    await mapWithConcurrency(items, 7, (item) => {
      seen.push(item)
      return Promise.resolve(item)
    })

    expect(seen).toHaveLength(50)
    expect(new Set(seen).size).toBe(50)
  })

  it('clamps the limit to at least 1 (sequential fallback)', async () => {
    let peak = 0
    let inFlight = 0
    await mapWithConcurrency([1, 2, 3], 0, async () => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
      return null
    })
    expect(peak).toBe(1)
  })

  it('rejects when a task rejects (per-item tolerance is the caller job)', async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, (n) => {
        if (n === 2) return Promise.reject(new Error('boom'))
        return Promise.resolve(n)
      }),
    ).rejects.toThrow('boom')
  })
})
