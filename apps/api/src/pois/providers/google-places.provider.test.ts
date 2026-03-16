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

  describe('findPlaceId', () => {
    it('returns null when API_KEY not set', async () => {
      delete process.env['GOOGLE_PLACES_API_KEY']
      const moduleNoKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerNoKey = moduleNoKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      const result = await providerNoKey.findPlaceId('Hotel Test', 43.1, 1.1)
      expect(result).toBeNull()
    })

    it('calls Text Search with X-Goog-FieldMask: places.id and correct locationBias', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ places: [{ id: 'ChIJABC123' }] }),
      } as Response)

      await providerWithKey.findPlaceId('Hotel Test', 43.1, 1.1)

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
      const body = JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string) as {
        textQuery: string
        locationBias: { circle: { center: { latitude: number; longitude: number }; radius: number } }
        maxResultCount: number
      }
      expect(body.textQuery).toBe('Hotel Test')
      expect(body.locationBias.circle.center.latitude).toBe(43.1)
      expect(body.locationBias.circle.center.longitude).toBe(1.1)
      expect(body.locationBias.circle.radius).toBe(150.0)
      expect(body.maxResultCount).toBe(1)
    })

    it('returns place_id from first result', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ places: [{ id: 'ChIJABC123' }] }),
      } as Response)

      const result = await providerWithKey.findPlaceId('Hotel Test', 43.1, 1.1)
      expect(result).toBe('ChIJABC123')
    })

    it('returns null when API returns no results', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ places: [] }),
      } as Response)

      const result = await providerWithKey.findPlaceId('Hotel Test', 43.1, 1.1)
      expect(result).toBeNull()
    })

    it('returns null on non-200 response (soft fail)', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
      } as Response)

      const result = await providerWithKey.findPlaceId('Hotel Test', 43.1, 1.1)
      expect(result).toBeNull()
    })
  })

  describe('getPlaceDetails', () => {
    it('throws when API_KEY not set', async () => {
      delete process.env['GOOGLE_PLACES_API_KEY']
      const moduleNoKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerNoKey = moduleNoKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      await expect(providerNoKey.getPlaceDetails('ChIJABC123'))
        .rejects.toThrow('GOOGLE_PLACES_API_KEY not configured')
    })

    it('calls correct URL with Essentials FieldMask (no photos)', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'ChIJABC123',
          displayName: { text: 'Hotel Test' },
          formattedAddress: '1 Rue Test, Paris',
          location: { latitude: 48.8566, longitude: 2.3522 },
          rating: 4.2,
          regularOpeningHours: { openNow: true },
          internationalPhoneNumber: '+33 1 23 45 67 89',
          websiteUri: 'https://hotel-test.fr',
          types: ['lodging'],
        }),
      } as Response)

      await providerWithKey.getPlaceDetails('ChIJABC123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://places.googleapis.com/v1/places/ChIJABC123',
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          headers: expect.objectContaining({
            'X-Goog-Api-Key': 'test-api-key',
          }),
        }),
      )
      const callArgs = mockFetch.mock.calls[0][1] as RequestInit
      const fieldMask = (callArgs.headers as Record<string, string>)['X-Goog-FieldMask']
      expect(fieldMask).toContain('id')
      expect(fieldMask).toContain('displayName')
      expect(fieldMask).toContain('location')
      expect(fieldMask).toContain('rating')
      expect(fieldMask).not.toContain('photos')  // Must NOT include photos — extra cost
    })

    it('maps response correctly to GooglePlaceDetails type', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'ChIJABC123',
          displayName: { text: 'Hotel Test' },
          formattedAddress: '1 Rue Test, Paris',
          location: { latitude: 48.8566, longitude: 2.3522 },
          rating: 4.2,
          regularOpeningHours: { openNow: true },
          internationalPhoneNumber: '+33 1 23 45 67 89',
          websiteUri: 'https://hotel-test.fr',
          types: ['lodging'],
        }),
      } as Response)

      const result = await providerWithKey.getPlaceDetails('ChIJABC123')

      expect(result).toEqual({
        placeId: 'ChIJABC123',
        displayName: 'Hotel Test',
        formattedAddress: '1 Rue Test, Paris',
        lat: 48.8566,
        lng: 2.3522,
        rating: 4.2,
        isOpenNow: true,
        phone: '+33 1 23 45 67 89',
        website: 'https://hotel-test.fr',
        types: ['lodging'],
      })
    })

    it('handles null/missing optional fields gracefully', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'ChIJABC123', types: [] }),
      } as Response)

      const result = await providerWithKey.getPlaceDetails('ChIJABC123')

      expect(result.displayName).toBeNull()
      expect(result.formattedAddress).toBeNull()
      expect(result.lat).toBeNull()
      expect(result.lng).toBeNull()
      expect(result.rating).toBeNull()
      expect(result.isOpenNow).toBeNull()
      expect(result.phone).toBeNull()
      expect(result.website).toBeNull()
    })

    it('throws on non-200 response', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      } as Response)

      await expect(providerWithKey.getPlaceDetails('ChIJABC123'))
        .rejects.toThrow('Place Details error: 404 Not Found')
    })
  })
})
