import { Test } from '@nestjs/testing'

// Keep the 429 retry path instant (production default: 20s wait between attempts).
// Must be set BEFORE the provider module is imported: the delay is read at field init.
process.env['OVERPASS_RETRY_DELAY_MS'] = '0'

import { OverpassProvider, SLEEPABLE_SHELTER_TYPES } from './overpass.provider.js'

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

  it('restricts amenity=shelter to sleepable shelter_type values', async () => {
    // `amenity=shelter` alone is dominated by bus stops: 241 of 294 elements on a real bbox
    // were shelter_type=public_transport (mostly unnamed) → "Refuge / Abri (189)" was noise.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ elements: [] }),
    })

    await provider.queryPois(bbox, ['shelter'])

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const body = decodeURIComponent((options.body as string).replace('data=', ''))

    // ANDed predicates render as ["a"="b"]["c"~"d"]
    for (const type of SLEEPABLE_SHELTER_TYPES) {
      expect(body).toContain(type)
    }
    expect(body).toContain('node["amenity"="shelter"]["shelter_type"~"^(')
    // Mountain huts do not depend on shelter_type
    expect(body).toContain('node["tourism"="alpine_hut"]')
    expect(body).toContain('node["tourism"="wilderness_hut"]')
    // …and never a bare amenity=shelter selector, which would let bus stops back in
    expect(body).not.toMatch(/node\["amenity"="shelter"\]\(/)
    expect(body).not.toMatch(/way\["amenity"="shelter"\]\(/)
    expect(body).not.toContain('public_transport')
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

  it('sends a meaningful User-Agent (mandatory: Node fetch sends none → 406/429)', async () => {
    // Regression 2026-03-29 → 2026-08-19: without this header overpass-api.de answers
    // 406 Not Acceptable and kumi.systems answers 429 "include a meaningful User-Agent".
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ elements: [] }),
    })

    await provider.queryPois(bbox, ['hotel'])

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit]
    const headers = options.headers as Record<string, string>
    expect(headers['User-Agent']).toMatch(/Ride'n'Rest/)
    expect(headers['User-Agent']).toMatch(/ridenrest\.app/)
  })

  it('switches to next instance on 406 Not Acceptable instead of giving up', async () => {
    // 406 used to propagate out of the loop → the healthy instances were never tried and
    // Overpass was globally dead for 5 months.
    const successElements = [{ type: 'node', id: 7, lat: 43.1, lon: 1.1, tags: {} }]
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 406, statusText: 'Not Acceptable' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ elements: successElements }) })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(successElements)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('switches to next instance on a non-retryable status (500) instead of throwing', async () => {
    const successElements = [{ type: 'node', id: 8, lat: 43.1, lon: 1.1, tags: {} }]
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Internal Server Error' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ elements: successElements }) })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(successElements)
  })

  it('switches to next instance when fetch rejects (network error / timeout)', async () => {
    const successElements = [{ type: 'node', id: 9, lat: 43.1, lon: 1.1, tags: {} }]
    mockFetch
      .mockRejectedValueOnce(new Error('The operation was aborted due to timeout'))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ elements: successElements }) })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(successElements)
  })

  it('switches to next instance when the body is unparseable', async () => {
    const successElements = [{ type: 'node', id: 10, lat: 43.1, lon: 1.1, tags: {} }]
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new Error('Unexpected token <')) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ elements: successElements }) })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(successElements)
  })

  it('retries the SAME instance on 429 then rotates once retries are exhausted', async () => {
    // OVERPASS_RETRY_DELAY_MS=0 (top of file) keeps this test instant
    const successElements = [{ type: 'node', id: 11, lat: 43.1, lon: 1.1, tags: {} }]
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ elements: successElements }) })

    const result = await provider.queryPois(bbox, ['hotel'])

    expect(result).toEqual(successElements)
    // 3 attempts on instance #1 (initial + 2 retries), then instance #2 succeeds
    expect(mockFetch).toHaveBeenCalledTimes(4)
    const urls = (mockFetch.mock.calls as [string, RequestInit][]).map(([url]) => url)
    expect(urls.slice(0, 3)).toEqual(Array(3).fill('https://overpass-api.de/api/interpreter'))
    expect(urls[3]).toBe('https://overpass.kumi.systems/api/interpreter')
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
