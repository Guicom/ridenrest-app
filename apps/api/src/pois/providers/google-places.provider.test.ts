import { Test } from '@nestjs/testing'
import { GooglePlacesProvider } from './google-places.provider.js'

const mockBbox = { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 }

describe('GooglePlacesProvider', () => {
  let provider: GooglePlacesProvider

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GooglePlacesProvider],
    }).compile()

    provider = module.get<GooglePlacesProvider>(GooglePlacesProvider)
  })

  afterEach(() => {
    jest.restoreAllMocks()
    delete process.env['GOOGLE_PLACES_API_KEY']
  })

  describe('searchPlaceIds', () => {
    it('returns empty array and logs warning when API_KEY not set', async () => {
      delete process.env['GOOGLE_PLACES_API_KEY']
      // Re-instantiate without API key
      const moduleWithoutKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerNoKey = moduleWithoutKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      const result = await providerNoKey.searchPlaceIds(mockBbox, 'lodging', 'lodging')
      expect(result).toEqual([])
    })

    it('calls correct URL with X-Goog-FieldMask: places.id header', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ places: [{ id: 'ChIJN1t' }] }),
      } as Response)

      await providerWithKey.searchPlaceIds(mockBbox, 'lodging', 'lodging')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places:searchText',
        expect.objectContaining({
          method: 'POST',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({
            'X-Goog-FieldMask': 'places.id',
          }),
        }),
      )
    })

    it('parses response and returns place_id array', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ places: [{ id: 'ChIJN1t' }, { id: 'ChIJP2t' }] }),
      } as Response)

      const result = await providerWithKey.searchPlaceIds(mockBbox, 'lodging', 'lodging')
      expect(result).toEqual(['ChIJN1t', 'ChIJP2t'])
    })

    it('throws on non-200 response', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      } as Response)

      await expect(providerWithKey.searchPlaceIds(mockBbox, 'lodging', 'lodging'))
        .rejects.toThrow('Google Places API error: 403 Forbidden')
    })
  })

  describe('searchLayerPlaceIds', () => {
    it('deduplicates place_ids across multiple types', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      // accommodations layer queries ['lodging', 'campground']
      // Both return overlapping IDs
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ places: [{ id: 'ChIJN1t' }, { id: 'ChIJP2t' }] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ places: [{ id: 'ChIJP2t' }, { id: 'ChIJQ3t' }] }),
        } as Response)

      const result = await providerWithKey.searchLayerPlaceIds(mockBbox, 'accommodations')
      expect(result).toHaveLength(3)
      expect(new Set(result).size).toBe(3)  // All unique
      expect(result).toContain('ChIJN1t')
      expect(result).toContain('ChIJP2t')
      expect(result).toContain('ChIJQ3t')
    })

    it('returns successful type results when one type fails (partial failure)', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      // First type (lodging) succeeds, second (campground) fails
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ places: [{ id: 'ChIJN1t' }] }),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        } as Response)

      const result = await providerWithKey.searchLayerPlaceIds(mockBbox, 'accommodations')
      // Should return only the successful type's results
      expect(result).toEqual(['ChIJN1t'])
    })

    it('returns empty array for unknown layer', async () => {
      const result = await provider.searchLayerPlaceIds(mockBbox, 'unknown-layer')
      expect(result).toEqual([])
    })
  })
})
