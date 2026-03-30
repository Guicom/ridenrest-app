import { Test } from '@nestjs/testing'
import { OverpassProvider } from './overpass.provider.js'

// Mock global fetch
const mockFetch = jest.fn()
global.fetch = mockFetch

describe('OverpassProvider', () => {
  let provider: OverpassProvider

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [OverpassProvider],
    }).compile()

    provider = module.get<OverpassProvider>(OverpassProvider)
    mockFetch.mockClear()
  })

  const bbox = { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 }

  it('returns empty array when no categories match', async () => {
    const result = await provider.queryPois(bbox, [])
    expect(result).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('builds correct bbox format in query (minLat,minLng,maxLat,maxLng)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ elements: [] }),
    })

    await provider.queryPois(bbox, ['hotel'])

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://overpass-api.de/api/interpreter')
    expect(options.method).toBe('POST')

    const body = decodeURIComponent((options.body as string).replace('data=', ''))
    expect(body).toContain('43,1,43.5,1.5')
    expect(body).toContain('"amenity"="hotel"')
  })

  it('includes both node and way queries for each category', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ elements: [] }),
    })

    await provider.queryPois(bbox, ['restaurant'])

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = decodeURIComponent((options.body as string).replace('data=', ''))
    expect(body).toContain('node["amenity"="restaurant"]')
    expect(body).toContain('way["amenity"="restaurant"]')
  })

  it('returns elements from Overpass response', async () => {
    const mockElements = [
      { type: 'node', id: 123, lat: 43.1, lon: 1.1, tags: { name: 'Hôtel du Lac', amenity: 'hotel' } },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ elements: mockElements }),
    })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(mockElements)
  })

  it('throws when Overpass returns non-retryable error status (500)', async () => {
    // 500 is not 403/429/503/504 → throws immediately, not retried
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    })

    await expect(provider.queryPois(bbox, ['hotel'])).rejects.toThrow('Overpass API error: 500')
  })

  it('switches to next instance on 403 Forbidden (instance blocked)', async () => {
    // First two instances return 403 → try third, which succeeds
    const successElements = [{ type: 'node', id: 1, lat: 43.1, lon: 1.1, tags: {} }]
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' })
      .mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ elements: successElements }) })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(successElements)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('switches to next instance on 504 Gateway Timeout', async () => {
    const successElements = [{ type: 'node', id: 2, lat: 43.2, lon: 1.2, tags: {} }]
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 504, statusText: 'Gateway Timeout' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ elements: successElements }) })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(successElements)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws when all instances return 403', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' })

    await expect(provider.queryPois(bbox, ['hotel'])).rejects.toThrow('All Overpass instances unavailable')
  })
})
