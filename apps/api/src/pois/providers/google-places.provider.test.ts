import { Test } from '@nestjs/testing'
import { LAYER_CATEGORIES } from '@ridenrest/shared'
import { GooglePlacesProvider, mapGoogleTypesToCategory, LAYER_GOOGLE_TYPES, CATEGORY_GOOGLE_TYPES, TYPE_TEXT_QUERY, googleTypesForCategories } from './google-places.provider.js'
import { GoogleBillingCounter } from './google-billing-counter.js'

const mockBbox = { minLat: 43.0, maxLat: 43.5, minLng: 1.0, maxLng: 1.5 }

describe('GooglePlacesProvider', () => {
  let provider: GooglePlacesProvider

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [GooglePlacesProvider, GoogleBillingCounter],
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
      }).compile()
      const providerNoKey = moduleWithoutKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      const result = await providerNoKey.searchPlaceIds(mockBbox, 'lodging', 'lodging')
      expect(result).toEqual([])
    })

    it('calls correct URL with the free IDs-Only field mask', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
            // IDs Only + nextPageToken : le token seul ne change pas de SKU (il fait
            // partie du palier Essentials IDs Only), donc l'appel reste gratuit.
            'X-Goog-FieldMask': 'places.id,nextPageToken',
          }),
        }),
      )
    })

    it('parses response and returns place_id array', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      // accommodations layer queries 16 types — mock only 2 responses for dedup test
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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

  describe('searchPlacesByType (SKU Pro — chemin d’affichage)', () => {
    const withKey = async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const mod = await Test.createTestingModule({ providers: [GooglePlacesProvider, GoogleBillingCounter] }).compile()
      return mod.get<GooglePlacesProvider>(GooglePlacesProvider)
    }
    const page = (places: unknown[], nextPageToken?: string) => ({
      ok: true,
      json: () => Promise.resolve({ places, ...(nextPageToken ? { nextPageToken } : {}) }),
    } as Response)
    const place = (id: string, over: Record<string, unknown> = {}) => ({
      id, displayName: { text: `Lieu ${id}` },
      location: { latitude: 43.2, longitude: 1.2 }, types: ['lodging'], ...over,
    })

    it('demande identité, position et types — le masque qui rend Place Details inutile', async () => {
      const provider = await withKey()
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(page([]))

      await provider.searchPlacesByType(mockBbox, ['bicycle_store'])

      const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
      expect(headers['X-Goog-FieldMask']).toBe(
        'places.id,places.displayName,places.location,places.types,nextPageToken',
      )
    })

    it('émet un appel facturé PAR TYPE — c’est ce qui rend le filtrage par catégorie rentable', async () => {
      const provider = await withKey()
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(page([]))

      await provider.searchPlacesByType(mockBbox, ['campground', 'rv_park', 'hostel'])

      expect(mockFetch).toHaveBeenCalledTimes(3)
    })

    it('suit le nextPageToken jusqu’au plafond Google de 3 pages', async () => {
      const provider = await withKey()
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(page([place('a1')], 'tok-1'))
        .mockResolvedValueOnce(page([place('a2')], 'tok-2'))
        .mockResolvedValueOnce(page([place('a3')], 'tok-3'))  // token présent mais plafond atteint
        .mockResolvedValue(page([place('a4')]))

      const [outcome] = await provider.searchPlacesByType(mockBbox, ['bicycle_store'])

      expect(outcome.places.map((p) => p.placeId)).toEqual(['a1', 'a2', 'a3'])
    })

    it('renvoie le pageToken dans le corps de la requête suivante', async () => {
      const provider = await withKey()
      const mockFetch = jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(page([place('a1')], 'tok-1'))
        .mockResolvedValue(page([]))

      await provider.searchPlacesByType(mockBbox, ['bicycle_store'])

      const secondBody = JSON.parse((mockFetch.mock.calls[1][1] as RequestInit).body as string) as { pageToken?: string }
      expect(secondBody.pageToken).toBe('tok-1')
    })

    it('utilise une requête textuelle propre au type, pas une requête de calque', async () => {
      // `includedType` ne filtre pas : Google score par pertinence textuelle. Avec le
      // `textQuery` unique « accommodation », campground et motel renvoyaient 0 résultat.
      const provider = await withKey()
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(page([]))

      await provider.searchPlacesByType(mockBbox, ['campground', 'motel', 'hostel'])

      const sent = mockFetch.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string) as { includedType: string; textQuery: string })
      expect(sent.find((b) => b.includedType === 'campground')?.textQuery).toBe('camping')
      expect(sent.find((b) => b.includedType === 'motel')?.textQuery).toBe('motel')
      expect(sent.find((b) => b.includedType === 'hostel')?.textQuery).toBe('auberge de jeunesse')
    })

    it('écarte un lieu sans coordonnées — impossible à placer sur la carte', async () => {
      const provider = await withKey()
      jest.spyOn(global, 'fetch').mockResolvedValue(
        page([place('ok'), { id: 'sans-position', displayName: { text: 'X' }, types: [] }]),
      )

      const [outcome] = await provider.searchPlacesByType(mockBbox, ['bicycle_store'])

      expect(outcome.places.map((p) => p.placeId)).toEqual(['ok'])
    })

    it('rapporte l’issue de CHAQUE type — un échec isolé n’emporte pas les autres', async () => {
      // Le service pose un marqueur de couverture par type : un type en échec doit rester
      // non marqué pour être réessayé, au lieu de verrouiller la zone 7 jours.
      const provider = await withKey()
      jest.spyOn(global, 'fetch')
        .mockResolvedValueOnce(page([place('trouve')]))
        .mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' } as Response)

      const outcomes = await provider.searchPlacesByType(mockBbox, ['campground', 'rv_park'])

      expect(outcomes.map((o) => [o.type, o.ok])).toEqual([['campground', true], ['rv_park', false]])
      expect(outcomes[0].places).toHaveLength(1)
    })

    it('ne dédoublonne PAS entre types — le service le fait à travers tout le lot', async () => {
      // `lodging` et `hotel` rapportent largement les mêmes établissements ; le dédoublonnage
      // par place_id vit dans le service, qui voit tous les types à la fois.
      const provider = await withKey()
      jest.spyOn(global, 'fetch').mockResolvedValue(page([place('partage')]))

      const outcomes = await provider.searchPlacesByType(mockBbox, ['lodging', 'hotel'])

      expect(outcomes.flatMap((o) => o.places.map((p) => p.placeId))).toEqual(['partage', 'partage'])
    })

    it('ne fait aucun appel quand aucune catégorie demandée n’a de type Google', async () => {
      const provider = await withKey()
      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue(page([]))

      const outcomes = await provider.searchPlacesByType(mockBbox, [])

      expect(outcomes).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('CATEGORY_GOOGLE_TYPES ↔ LAYER_GOOGLE_TYPES', () => {
    it('les types d’un calque sont exactement l’union de ses catégories', () => {
      // Deux tables ont coexisté et divergé en silence : l'ancienne `GOOGLE_PLACE_TYPES`
      // (jamais utilisée) contenait `food` et `supermarket`, absents de `LAYER_GOOGLE_TYPES`.
      // `LAYER_GOOGLE_TYPES` est désormais dérivée — ce test verrouille la dérivation.
      for (const [layer, categories] of Object.entries(LAYER_CATEGORIES)) {
        const union = [...new Set(categories.flatMap((c) => CATEGORY_GOOGLE_TYPES[c]))]
        expect(new Set(LAYER_GOOGLE_TYPES[layer])).toEqual(new Set(union))
      }
    })

    it('chaque type Google a une requête textuelle dédiée', () => {
      // Sans entrée dans TYPE_TEXT_QUERY, le type retombe sur la requête générique du calque —
      // ce qui renvoyait 0 camping et 0 motel avant la story 17.15.
      const allTypes = [...new Set(Object.values(CATEGORY_GOOGLE_TYPES).flat())]
      expect(allTypes.filter((t) => !TYPE_TEXT_QUERY[t])).toEqual([])
    })

    it('googleTypesForCategories dédoublonne l’union et ignore les catégories sans type', () => {
      expect(googleTypesForCategories(['bike_shop', 'bike_repair'])).toEqual(['bicycle_store'])
      expect(googleTypesForCategories(['shelter'])).toEqual([])
      expect(googleTypesForCategories(['hotel'])).toHaveLength(6)
    })
  })

  describe('garde-fou de coût : le chemin densité reste gratuit', () => {
    it('searchLayerPlaceIds n’envoie JAMAIS de champ facturé et ne pagine pas', async () => {
      // L'analyse de densité découpe l'aventure en tronçons de 10 km et appelle une fois par
      // tronçon et par type : 837 km = 84 tronçons × 16 types = 1 344 requêtes pour UNE analyse.
      // En SKU Pro ce serait ~43 $ et 27 % du quota gratuit mensuel — pour une donnée dont le
      // processeur ne lit que « 0, 1, ou ≥ 2 ».
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const mod = await Test.createTestingModule({ providers: [GooglePlacesProvider, GoogleBillingCounter] }).compile()
      const provider = mod.get<GooglePlacesProvider>(GooglePlacesProvider)

      const mockFetch = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ places: [{ id: 'a1' }], nextPageToken: 'tok-1' }),
      } as Response)

      await provider.searchLayerPlaceIds(mockBbox, 'bike')

      const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<string, string>
      expect(headers['X-Goog-FieldMask']).toBe('places.id,nextPageToken')
      expect(headers['X-Goog-FieldMask']).not.toContain('location')
      expect(headers['X-Goog-FieldMask']).not.toContain('displayName')
      expect(headers['X-Goog-FieldMask']).not.toContain('types')
      // un seul type dans le calque `bike`, et malgré le nextPageToken : une seule requête
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('findPlaceId', () => {
    it('returns null when API_KEY not set', async () => {
      delete process.env['GOOGLE_PLACES_API_KEY']
      const moduleNoKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
      }).compile()
      const providerNoKey = moduleNoKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      const result = await providerNoKey.findPlaceId('Hotel Test', 43.1, 1.1)
      expect(result).toBeNull()
    })

    it('calls Text Search with X-Goog-FieldMask: places.id and correct locationBias', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
        locationRestriction: { circle: { center: { latitude: number; longitude: number }; radius: number } }
        maxResultCount: number
      }
      expect(body.textQuery).toBe('Hotel Test')
      expect(body.locationRestriction.circle.center.latitude).toBe(43.1)
      expect(body.locationRestriction.circle.center.longitude).toBe(1.1)
      expect(body.locationRestriction.circle.radius).toBe(2000.0)
      expect(body.maxResultCount).toBe(1)
    })

    it('returns place_id from first result', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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

  describe('LAYER_GOOGLE_TYPES', () => {
    it('accommodations layer contains 16 types', () => {
      expect(LAYER_GOOGLE_TYPES['accommodations']).toHaveLength(16)
    })

    it('accommodations layer includes all expected types', () => {
      const types = LAYER_GOOGLE_TYPES['accommodations']
      const expected = [
        'lodging', 'hotel', 'motel', 'inn', 'extended_stay_hotel', 'resort_hotel',
        'campground', 'camping_cabin', 'rv_park', 'mobile_home_park',
        'bed_and_breakfast', 'guest_house', 'private_guest_room', 'cottage', 'farmstay',
        'hostel',
      ]
      for (const t of expected) {
        expect(types).toContain(t)
      }
    })
  })

  describe('mapGoogleTypesToCategory', () => {
    // Hotel types
    it.each(['hotel', 'motel', 'inn', 'extended_stay_hotel', 'resort_hotel', 'lodging'])(
      'maps %s → hotel',
      (type) => {
        expect(mapGoogleTypesToCategory([type], 'accommodations')).toBe('hotel')
      },
    )

    // Camp site types
    it.each(['campground', 'camping_cabin', 'rv_park', 'mobile_home_park'])(
      'maps %s → camp_site',
      (type) => {
        expect(mapGoogleTypesToCategory([type], 'accommodations')).toBe('camp_site')
      },
    )

    // Guesthouse types
    it.each(['guest_house', 'bed_and_breakfast', 'private_guest_room', 'farmstay', 'cottage'])(
      'maps %s → guesthouse',
      (type) => {
        expect(mapGoogleTypesToCategory([type], 'accommodations')).toBe('guesthouse')
      },
    )

    // Hostel
    it('maps hostel → hostel', () => {
      expect(mapGoogleTypesToCategory(['hostel'], 'accommodations')).toBe('hostel')
    })

    // Fallback for unknown types
    it('falls back to hotel for unknown accommodation types', () => {
      expect(mapGoogleTypesToCategory(['unknown_type'], 'accommodations')).toBe('hotel')
    })

    // Non-accommodation layers
    it('maps restaurant layer → restaurant', () => {
      expect(mapGoogleTypesToCategory(['restaurant'], 'restaurants')).toBe('restaurant')
    })

    it('maps bike layer → bike_shop', () => {
      expect(mapGoogleTypesToCategory(['bicycle_store'], 'bike')).toBe('bike_shop')
    })

    it('maps grocery_or_supermarket → supermarket', () => {
      expect(mapGoogleTypesToCategory(['grocery_or_supermarket'], 'supplies')).toBe('supermarket')
    })

    it('maps convenience_store → convenience', () => {
      expect(mapGoogleTypesToCategory(['convenience_store'], 'supplies')).toBe('convenience')
    })
  })

  describe('getPlaceDetails', () => {
    it('throws when API_KEY not set', async () => {
      delete process.env['GOOGLE_PLACES_API_KEY']
      const moduleNoKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
      }).compile()
      const providerNoKey = moduleNoKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      await expect(providerNoKey.getPlaceDetails('ChIJABC123'))
        .rejects.toThrow('GOOGLE_PLACES_API_KEY not configured')
    })

    it('calls correct URL with Essentials FieldMask (no photos)', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
        'https://places.googleapis.com/v1/places/ChIJABC123?languageCode=fr',
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'ChIJABC123',
          displayName: { text: 'Hotel Test' },
          formattedAddress: '1 Rue Test, Paris',
          addressComponents: [
            { longText: '1', types: ['street_number'] },
            { longText: 'Rue Test', types: ['route'] },
            { longText: 'Paris', types: ['locality', 'political'] },
            { longText: '75001', types: ['postal_code'] },
            { longText: 'Île-de-France', types: ['administrative_area_level_1', 'political'] },
            { longText: 'France', types: ['country', 'political'] },
          ],
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
        locality: 'Paris',
        postalCode: '75001',
        adminArea: 'Île-de-France',
        country: 'France',
        lat: 48.8566,
        lng: 2.3522,
        rating: 4.2,
        isOpenNow: true,
        weekdayDescriptions: [],
        periods: [],
        phone: '+33 1 23 45 67 89',
        website: 'https://hotel-test.fr',
        types: ['lodging'],
      })
    })

    it('handles null/missing optional fields gracefully', async () => {
      process.env['GOOGLE_PLACES_API_KEY'] = 'test-api-key'
      const moduleWithKey = await Test.createTestingModule({
        providers: [GooglePlacesProvider, GoogleBillingCounter],
      }).compile()
      const providerWithKey = moduleWithKey.get<GooglePlacesProvider>(GooglePlacesProvider)

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: 'ChIJABC123', types: [] }),
      } as Response)

      const result = await providerWithKey.getPlaceDetails('ChIJABC123')

      expect(result.displayName).toBeNull()
      expect(result.formattedAddress).toBeNull()
      expect(result.postalCode).toBeNull()
      expect(result.adminArea).toBeNull()
      expect(result.country).toBeNull()
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
        providers: [GooglePlacesProvider, GoogleBillingCounter],
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
