import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Test } from '@nestjs/testing'
import { GoogleBillingCounter, resolveTextSearchSku, isBillableSku } from './google-billing-counter.js'
import { GooglePlacesProvider } from './google-places.provider.js'

describe('resolveTextSearchSku', () => {
  it('classe le masque IDs Only comme gratuit', () => {
    expect(resolveTextSearchSku('places.id,nextPageToken')).toBe('text_search_ids_only')
    expect(resolveTextSearchSku('places.id')).toBe('text_search_ids_only')
  })

  it('classe en Pro dès qu’un champ dépasse places.id', () => {
    // Google facture au SKU le PLUS ÉLEVÉ des champs demandés : un seul champ suffit à basculer.
    expect(resolveTextSearchSku('places.id,places.location,nextPageToken')).toBe('text_search_pro')
    expect(resolveTextSearchSku('places.id,places.displayName')).toBe('text_search_pro')
    expect(resolveTextSearchSku('places.id,places.types')).toBe('text_search_pro')
  })

  it('seul IDs Only est gratuit', () => {
    expect(isBillableSku('text_search_ids_only')).toBe(false)
    expect(isBillableSku('text_search_pro')).toBe(true)
    expect(isBillableSku('place_details_pro')).toBe(true)
  })
})

describe('GoogleBillingCounter', () => {
  it('sépare les appels gratuits des facturés et sait produire un delta', () => {
    const counter = new GoogleBillingCounter()
    counter.record('text_search_ids_only')
    const mark = counter.snapshot()

    counter.record('text_search_ids_only')
    counter.record('text_search_pro')
    counter.record('place_details_pro')

    expect(counter.snapshot()).toEqual({ free: 2, billable: 2 })
    expect(counter.since(mark)).toEqual({ free: 1, billable: 2 })
    expect(counter.breakdown()).toEqual({
      text_search_ids_only: 2,
      text_search_pro: 1,
      place_details_pro: 1,
    })
  })
})

/**
 * VERROU DU MASQUE — c'est ce test qui garde la gratuité du chemin de comptage.
 *
 * Le prefetch carte a demandé un masque Place Details Pro pendant cinq mois pour des champs
 * jamais lus. Un commentaire n'a pas suffi ; une assertion sur l'en-tête réellement envoyé, si.
 */
describe('countPlaceIdsForTypes — verrou du masque', () => {
  let provider: GooglePlacesProvider
  let counter: GoogleBillingCounter
  const originalKey = process.env['GOOGLE_PLACES_API_KEY']

  beforeEach(async () => {
    process.env['GOOGLE_PLACES_API_KEY'] = 'test-key'
    const moduleRef = await Test.createTestingModule({
      providers: [GooglePlacesProvider, GoogleBillingCounter],
    }).compile()
    provider = moduleRef.get(GooglePlacesProvider)
    counter = moduleRef.get(GoogleBillingCounter)

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ places: [{ id: 'a' }, { id: 'b' }], nextPageToken: 'should-be-ignored' }),
    }) as unknown as typeof fetch
  })

  afterEach(() => {
    if (originalKey === undefined) delete process.env['GOOGLE_PLACES_API_KEY']
    else process.env['GOOGLE_PLACES_API_KEY'] = originalKey
    jest.restoreAllMocks()
  })

  const bbox = { minLat: 45, maxLat: 46, minLng: 6, maxLng: 7 }

  interface FetchInit {
    headers: Record<string, string>
    body: string
  }

  function sentRequests(): Array<{ mask: string; body: Record<string, unknown> }> {
    const calls = (global.fetch as jest.Mock).mock.calls as Array<[string, FetchInit]>
    return calls.map(([, init]) => ({
      mask: init.headers['X-Goog-FieldMask'],
      body: JSON.parse(init.body) as Record<string, unknown>,
    }))
  }

  it('envoie EXACTEMENT le masque IDs Only', async () => {
    await provider.countPlaceIdsForTypes(bbox, ['lodging', 'hotel'])
    const requests = sentRequests()
    expect(requests).toHaveLength(2)
    requests.forEach((r) => expect(r.mask).toBe('places.id,nextPageToken'))
  })

  it('ne demande NI location, NI displayName, NI types — ce sont eux qui font basculer en Pro', async () => {
    await provider.countPlaceIdsForTypes(bbox, ['lodging'])
    const { mask } = sentRequests()[0]
    expect(mask).not.toContain('places.location')
    expect(mask).not.toContain('places.displayName')
    expect(mask).not.toContain('places.types')
    expect(mask).not.toContain('rating')
    expect(mask).not.toContain('regularOpeningHours')
  })

  it('ne pagine pas — le seuil est à 3, une page en ramène jusqu’à 20', async () => {
    await provider.countPlaceIdsForTypes(bbox, ['lodging'])
    expect(sentRequests()).toHaveLength(1)
    expect(sentRequests()[0].body['pageToken']).toBeUndefined()
  })

  it('ne compte AUCUN appel facturable', async () => {
    await provider.countPlaceIdsForTypes(bbox, ['lodging', 'hotel', 'motel'])
    expect(counter.snapshot()).toEqual({ free: 3, billable: 0 })
  })

  it('dédoublonne les place_id entre types', async () => {
    const { ids } = await provider.countPlaceIdsForTypes(bbox, ['lodging', 'hotel'])
    expect([...ids].sort()).toEqual(['a', 'b'])
  })

  it('remonte anySucceeded=false quand tous les types échouent — un échec n’est pas un zéro', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests' }) as unknown as typeof fetch
    const result = await provider.countPlaceIdsForTypes(bbox, ['lodging', 'hotel'])
    expect(result.anySucceeded).toBe(false)
    expect(result.ids.size).toBe(0)
  })

  it('remonte anySucceeded=true dès qu’un seul type répond', async () => {
    let call = 0
    global.fetch = jest.fn().mockImplementation(() => {
      call += 1
      if (call === 1) return Promise.resolve({ ok: false, status: 429, statusText: 'Too Many Requests' })
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ places: [{ id: 'x' }] }) })
    }) as unknown as typeof fetch

    const result = await provider.countPlaceIdsForTypes(bbox, ['lodging', 'hotel'])
    expect(result.anySucceeded).toBe(true)
    expect([...result.ids]).toEqual(['x'])
  })

  it('n’émet aucun appel quand aucun type n’est demandé (shelter seul)', async () => {
    const result = await provider.countPlaceIdsForTypes(bbox, [])
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result).toEqual({ ids: new Set(), anySucceeded: false, requests: 0 })
  })
})

/**
 * VERROU STATIQUE DES DÉPENDANCES.
 *
 * Grossier, assumé — et c'est le seul verrou qui résiste au futur « je réutilise `findPois`,
 * c'est déjà écrit », qui était littéralement la conception envisagée la veille de la story
 * 17.18. `PoisService.findPois` passe par `searchPlacesByType` (masque Pro).
 */
describe('stage-generator.service — verrou statique des dépendances facturables', () => {
  const FORBIDDEN = ['PoisService', 'getPlaceDetails', 'searchPlacesByType', 'MASK_PRO', 'PRO_FIELDS']

  it('n’importe ni n’appelle aucun chemin Google facturable', () => {
    const source = readFileSync(
      join(__dirname, '..', '..', 'stages', 'stage-generator.service.ts'),
      'utf-8',
    )

    const found = FORBIDDEN.filter((symbol) => source.includes(symbol))

    // `toContain` ignore un second argument : on porte donc le diagnostic dans la valeur testée.
    expect({
      found,
      why: 'stage-generator.service.ts doit rester sur le chemin de comptage GRATUIT '
        + '(masque IDs Only). Cf. section « Invariant » de la story 17.18.',
    }).toEqual({
      found: [],
      why: expect.any(String) as unknown as string,
    })
  })
})
