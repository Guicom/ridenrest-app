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
      json: async () => ({ elements: [] }),
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
      json: async () => ({ elements: [] }),
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
      json: async () => ({ elements: mockElements }),
    })

    const result = await provider.queryPois(bbox, ['hotel'])
    expect(result).toEqual(mockElements)
  })

  it('throws when Overpass returns non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: 'Too Many Requests',
    })

    await expect(provider.queryPois(bbox, ['hotel'])).rejects.toThrow('Overpass API error: 429')
  })
})
