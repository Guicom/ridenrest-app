import { StageGeneratorService, candidateOffsets, bboxAround, interpolateAtKm } from './stage-generator.service.js'
import { GoogleBillingCounter } from '../pois/providers/google-billing-counter.js'
import type { StagesRepository } from './stages.repository.js'
import type { StagesService } from './stages.service.js'
import type { AdventuresService } from '../adventures/adventures.service.js'
import type { PoisRepository } from '../pois/pois.repository.js'
import type { GooglePlacesProvider } from '../pois/providers/google-places.provider.js'
import type { RedisProvider } from '../common/providers/redis.provider.js'
import type { GenerateStagesDto } from './dto/generate-stages.dto.js'
import type { MapWaypoint } from '@ridenrest/shared'

// Trace rectiligne de 400 km, un waypoint tous les 5 km, altitude plate par défaut.
function makeWaypoints(totalKm = 400, elePerKm = 0): MapWaypoint[] {
  const wps: MapWaypoint[] = []
  for (let km = 0; km <= totalKm; km += 5) {
    wps.push({ lat: 45 + km * 0.001, lng: 6 + km * 0.001, distKm: km, ele: km * elePerKm })
  }
  return wps
}

const baseDto: GenerateStagesDto = {
  targetKmPerDay: 80,
  accommodationTypes: ['hotel'],
  mode: 'replace',
}

let stagesRepo: jest.Mocked<Pick<StagesRepository, 'deleteAllByAdventureId' | 'findByAdventureId' | 'createMany'>>
let stagesService: jest.Mocked<Pick<StagesService, 'listStages'>>
let adventuresService: jest.Mocked<Pick<AdventuresService, 'getAdventure' | 'getAdventureWaypoints'>>
let poisRepository: jest.Mocked<Pick<PoisRepository, 'countAccommodationsNearPoint'>>
let googleProvider: jest.Mocked<Pick<GooglePlacesProvider, 'countPlaceIdsForTypes'>>
let redisClient: { get: jest.Mock; setex: jest.Mock }
let redisProvider: jest.Mocked<Pick<RedisProvider, 'getClient'>>
let billing: GoogleBillingCounter
let service: StageGeneratorService

/** Fabrique un retour de comptage Google avec `n` place_id distincts. */
function googleHits(n: number): { ids: Set<string>; anySucceeded: boolean; requests: number } {
  return {
    ids: new Set(Array.from({ length: n }, (_, i) => `place-${i}`)),
    anySucceeded: true,
    requests: 6,
  }
}

const GOOGLE_DOWN = { ids: new Set<string>(), anySucceeded: false, requests: 6 }

function createdRows(): Array<Record<string, unknown>> {
  return (stagesRepo.createMany.mock.calls[0]?.[0] ?? []) as Array<Record<string, unknown>>
}

beforeEach(() => {
  jest.clearAllMocks()

  stagesRepo = {
    deleteAllByAdventureId: jest.fn().mockResolvedValue(0),
    findByAdventureId: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue([]),
  }
  stagesService = { listStages: jest.fn().mockResolvedValue([]) }
  adventuresService = {
    getAdventure: jest.fn().mockResolvedValue({ id: 'adv-1', avgSpeedKmh: 15 }),
    getAdventureWaypoints: jest.fn().mockResolvedValue(makeWaypoints()),
  }
  poisRepository = { countAccommodationsNearPoint: jest.fn().mockResolvedValue(0) }
  googleProvider = { countPlaceIdsForTypes: jest.fn().mockResolvedValue(googleHits(5)) }
  redisClient = { get: jest.fn().mockResolvedValue(null), setex: jest.fn().mockResolvedValue('OK') }
  redisProvider = { getClient: jest.fn().mockReturnValue(redisClient) }
  billing = new GoogleBillingCounter()

  service = new StageGeneratorService(
    stagesRepo as unknown as StagesRepository,
    stagesService as unknown as StagesService,
    adventuresService as unknown as AdventuresService,
    poisRepository as unknown as PoisRepository,
    googleProvider as unknown as GooglePlacesProvider,
    billing,
    redisProvider as unknown as RedisProvider,
  )
})

describe('candidateOffsets', () => {
  it('explore la cible, puis recule et avance en alternance jusqu’à ±40', () => {
    expect(candidateOffsets()).toEqual([
      0, -5, 5, -10, 10, -15, 15, -20, 20, -25, 25, -30, 30, -35, 35, -40, 40,
    ])
  })
})

describe('bboxAround', () => {
  it('corrige la longitude par cos(lat) — sinon l’axe est-ouest est sous-tamponné', () => {
    const bbox = bboxAround(48, 7, 3)
    const latSpanKm = (bbox.maxLat - bbox.minLat) * 111
    // À 48°, un degré de longitude ne fait que ~74 km : diviser par 111 donnerait 2,0 km au lieu de 3.
    const lngSpanKm = (bbox.maxLng - bbox.minLng) * 111 * Math.cos((48 * Math.PI) / 180)
    expect(latSpanKm).toBeCloseTo(6, 5)
    expect(lngSpanKm).toBeCloseTo(6, 5)
  })
})

describe('interpolateAtKm', () => {
  it('interpole entre deux waypoints et borne aux extrémités', () => {
    const wps = makeWaypoints(10)
    expect(interpolateAtKm(wps, 2.5).lat).toBeCloseTo(45 + 2.5 * 0.001, 6)
    expect(interpolateAtKm(wps, -5)).toEqual({ lat: 45, lng: 6 })
    expect(interpolateAtKm(wps, 999).lat).toBeCloseTo(45 + 10 * 0.001, 6)
  })
})

describe('StageGeneratorService.generate — cas nominal', () => {
  it('découpe à la cible quand chaque point candidat a assez d’hébergements', async () => {
    const res = await service.generate('adv-1', 'user-1', baseDto)

    const rows = createdRows()
    expect(rows.map((r) => [r['startKm'], r['endKm']])).toEqual([
      [0, 80], [80, 160], [160, 240], [240, 320], [320, 400],
    ])
    expect(res.created).toBe(5)
    expect(res.warnings).toEqual([])
    expect(res.stoppedAtKm).toBeNull()
  })

  it('nomme et colore les étapes par orderIndex', async () => {
    await service.generate('adv-1', 'user-1', baseDto)
    const rows = createdRows()
    expect(rows[0]['name']).toBe('Étape 1')
    expect(rows[4]['name']).toBe('Étape 5')
    expect(rows[0]['color']).toBe('#f97316')
    expect(rows[1]['color']).toBe('#3b82f6')
  })

  it('crée la dernière étape jusqu’à la fin de trace sans exiger d’hébergement', async () => {
    // 400 km, 150/jour → étapes à 150, 300, puis 100 km restants ≤ 150 → fin à 400.
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(googleHits(5))
    const res = await service.generate('adv-1', 'user-1', { ...baseDto, targetKmPerDay: 150 })
    const rows = createdRows()
    expect(rows.map((r) => r['endKm'])).toEqual([150, 300, 400])
    expect(res.warnings.map((w) => w.code)).not.toContain('no_accommodation')
  })

  it('signale une dernière étape pauvre en hébergements sans l’empêcher', async () => {
    googleProvider.countPlaceIdsForTypes
      .mockResolvedValueOnce(googleHits(5))   // km 150
      .mockResolvedValueOnce(googleHits(5))   // km 300
      .mockResolvedValueOnce(googleHits(0))   // km 400 (final, informatif)
    const res = await service.generate('adv-1', 'user-1', { ...baseDto, targetKmPerDay: 150 })
    expect(createdRows()).toHaveLength(3)
    expect(res.warnings.map((w) => w.code)).toContain('sparse_final_stage')
  })
})

describe('StageGeneratorService.generate — recul puis avance', () => {
  it('retient le premier candidat valide dans l’ordre 0, −5, +5, −10 …', async () => {
    // Échec à 80 et 75, succès à 85 → le 3ᵉ candidat.
    googleProvider.countPlaceIdsForTypes
      .mockResolvedValueOnce(googleHits(1))   // 80  → rejet
      .mockResolvedValueOnce(googleHits(2))   // 75  → rejet
      .mockResolvedValueOnce(googleHits(3))   // 85  → retenu
      .mockResolvedValue(googleHits(5))

    await service.generate('adv-1', 'user-1', baseDto)
    expect(createdRows()[0]['endKm']).toBe(85)
  })

  it('rejette un candidat dont le D+ dépasse le maximum, en recul comme en avance', async () => {
    // 20 m de D+ par km : 80 km = 1600 m. Plafond 1100 m → seuls les candidats ≤ 55 km passent.
    adventuresService.getAdventureWaypoints.mockResolvedValue(makeWaypoints(400, 20))
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(googleHits(5))

    await service.generate('adv-1', 'user-1', { ...baseDto, maxElevationGainM: 1100 })

    const first = createdRows()[0]
    expect(first['endKm']).toBe(55) // 0,-5,+5… → premier candidat sous le plafond
    expect(Number(first['elevationGainM'])).toBeLessThanOrEqual(1100)
  })

  it('ignore la contrainte D+ et prévient quand le GPX n’a pas d’altitudes', async () => {
    const flat = makeWaypoints(200).map(({ lat, lng, distKm }) => ({ lat, lng, distKm }))
    adventuresService.getAdventureWaypoints.mockResolvedValue(flat as MapWaypoint[])

    const res = await service.generate('adv-1', 'user-1', { ...baseDto, maxElevationGainM: 10 })

    expect(res.warnings.filter((w) => w.code === 'no_elevation_data')).toHaveLength(1)
    expect(createdRows().length).toBeGreaterThan(0)
  })
})

describe('StageGeneratorService.generate — échecs et distinctions', () => {
  it('17 refus DÉTERMINÉS → no_accommodation avec la tranche explorée, et arrêt net', async () => {
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(googleHits(0))

    const res = await service.generate('adv-1', 'user-1', baseDto)

    expect(createdRows()).toEqual([])
    expect(res.created).toBe(0)
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toEqual({ code: 'no_accommodation', fromKm: 40, toKm: 120 })
    expect(res.stoppedAtKm).toBe(0)
  })

  it('fournisseur muet → provider_unavailable, JAMAIS no_accommodation', async () => {
    // C'est le test qui protège contre la répétition de la panne Overpass : un 429 ne doit pas
    // se lire comme « il n'y a aucun hébergement ici ».
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(GOOGLE_DOWN)

    const res = await service.generate('adv-1', 'user-1', baseDto)

    expect(res.warnings.map((w) => w.code)).toEqual(['provider_unavailable'])
    expect(res.warnings.map((w) => w.code)).not.toContain('no_accommodation')
  })

  it('ne met JAMAIS en cache un comptage indéterminé', async () => {
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(GOOGLE_DOWN)
    await service.generate('adv-1', 'user-1', baseDto)
    expect(redisClient.setex).not.toHaveBeenCalled()
  })

  it('met en cache un zéro déterminé — un vide légitime est une donnée', async () => {
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(googleHits(0))
    await service.generate('adv-1', 'user-1', baseDto)
    expect(redisClient.setex).toHaveBeenCalled()
    const setexArgs = redisClient.setex.mock.calls[0] as unknown[]
    expect(setexArgs[2]).toBe('0')
  })

  it('un candidat indéterminé n’est pas compté comme un refus', async () => {
    // 80 muet, 75 muet, 85 avec 3 hôtels → l'étape se crée à 85 malgré deux indéterminés.
    googleProvider.countPlaceIdsForTypes
      .mockResolvedValueOnce(GOOGLE_DOWN)
      .mockResolvedValueOnce(GOOGLE_DOWN)
      .mockResolvedValueOnce(googleHits(3))
      .mockResolvedValue(googleHits(5))

    const res = await service.generate('adv-1', 'user-1', baseDto)
    expect(createdRows()[0]['endKm']).toBe(85)
    expect(res.warnings.map((w) => w.code)).not.toContain('provider_unavailable')
  })

  it('tronque à MAX_GENERATED_STAGES_PER_CALL avec le warning truncated', async () => {
    adventuresService.getAdventureWaypoints.mockResolvedValue(makeWaypoints(2000))
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(googleHits(5))

    const res = await service.generate('adv-1', 'user-1', baseDto)

    expect(res.created).toBe(14)
    expect(res.warnings.map((w) => w.code)).toContain('truncated')
    expect(res.stoppedAtKm).toBe(1120)
  })
})

describe('StageGeneratorService.generate — comptage', () => {
  it('retient le MAX de Google et de la base, pas la somme', async () => {
    // Les deux ensembles se recoupent : 2 + 2 ne fait pas 4 hébergements distincts.
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(googleHits(2))
    poisRepository.countAccommodationsNearPoint.mockResolvedValue(2)

    const res = await service.generate('adv-1', 'user-1', baseDto)

    expect(res.created).toBe(0)
    expect(res.warnings[0]?.code).toBe('no_accommodation')
  })

  it('accepte sur le seul comptage en base quand Google est en dessous', async () => {
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(googleHits(0))
    poisRepository.countAccommodationsNearPoint.mockResolvedValue(3)

    const res = await service.generate('adv-1', 'user-1', baseDto)
    expect(res.created).toBeGreaterThan(0)
  })

  it('shelter seul → AUCUN appel Google, comptage porté par la base', async () => {
    // `shelter` n'a aucun type Google : les refuges viennent d'OSM.
    poisRepository.countAccommodationsNearPoint.mockResolvedValue(4)

    const res = await service.generate('adv-1', 'user-1', {
      ...baseDto,
      accommodationTypes: ['shelter'],
    })

    expect(googleProvider.countPlaceIdsForTypes).not.toHaveBeenCalled()
    expect(res.created).toBeGreaterThan(0)
    expect(res.warnings.map((w) => w.code)).not.toContain('provider_unavailable')
  })

  it('un HIT Redis n’émet aucun appel provider', async () => {
    redisClient.get.mockResolvedValue('7')
    const res = await service.generate('adv-1', 'user-1', baseDto)

    expect(googleProvider.countPlaceIdsForTypes).not.toHaveBeenCalled()
    expect(res.created).toBe(5)
  })

  it('masque les lignes overpass à la lecture quand l’option est inactive', async () => {
    await service.generate('adv-1', 'user-1', { ...baseDto, overpassEnabled: false })
    expect(poisRepository.countAccommodationsNearPoint).toHaveBeenCalledWith(
      'adv-1', expect.any(Number), expect.any(Number), 3000, ['hotel'], ['overpass'],
    )
  })

  it('laisse passer les lignes overpass quand l’option est active', async () => {
    await service.generate('adv-1', 'user-1', { ...baseDto, overpassEnabled: true })
    expect(poisRepository.countAccommodationsNearPoint).toHaveBeenCalledWith(
      'adv-1', expect.any(Number), expect.any(Number), 3000, ['hotel'], [],
    )
  })

  it('utilise le rayon demandé plutôt qu’une valeur figée', async () => {
    await service.generate('adv-1', 'user-1', { ...baseDto, radiusKm: 8 })
    expect(poisRepository.countAccommodationsNearPoint).toHaveBeenCalledWith(
      'adv-1', expect.any(Number), expect.any(Number), 8000, ['hotel'], ['overpass'],
    )
  })
})

describe('StageGeneratorService.generate — modes', () => {
  it('mode replace supprime les étapes existantes avant de générer', async () => {
    await service.generate('adv-1', 'user-1', { ...baseDto, mode: 'replace' })
    expect(stagesRepo.deleteAllByAdventureId).toHaveBeenCalledWith('adv-1')
  })

  it('mode fill ne supprime rien et repart du endKm de la dernière étape', async () => {
    stagesRepo.deleteAllByAdventureId.mockResolvedValue(0)
    stagesRepo.findByAdventureId.mockResolvedValue([
      { id: 's1', orderIndex: 0, startKm: 0, endKm: 120, endsAt: null },
    ] as never)

    await service.generate('adv-1', 'user-1', { ...baseDto, mode: 'fill' })

    expect(stagesRepo.deleteAllByAdventureId).not.toHaveBeenCalled()
    const rows = createdRows()
    expect(rows[0]['startKm']).toBe(120)
    expect(rows[0]['orderIndex']).toBe(1)
    expect(rows[0]['name']).toBe('Étape 2')
  })
})

describe('StageGeneratorService.generate — dates de départ', () => {
  const PARIS = 'Europe/Paris'

  function hhmm(d: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: PARIS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(d)
  }

  it('chaîne les départs à +1 jour en gardant l’heure', async () => {
    await service.generate('adv-1', 'user-1', {
      ...baseDto,
      firstDepartureAt: '2026-09-05T06:00:00.000Z', // 08:00 Paris
      timeZone: PARIS,
    })

    const departures = createdRows().map((r) => r['departureTime'] as Date)
    expect(departures).toHaveLength(5)
    expect(departures[0].toISOString()).toBe('2026-09-05T06:00:00.000Z')
    departures.forEach((d) => expect(hhmm(d)).toBe('08:00'))
    expect(departures[1].toISOString()).toBe('2026-09-06T06:00:00.000Z')
  })

  it('garde l’heure murale à cheval sur le changement d’heure', async () => {
    // Départ le 22 octobre 2026 : les étapes 4 et 5 tombent après le passage à l'heure d'hiver.
    await service.generate('adv-1', 'user-1', {
      ...baseDto,
      firstDepartureAt: '2026-10-22T06:00:00.000Z',
      timeZone: PARIS,
    })

    const departures = createdRows().map((r) => r['departureTime'] as Date)
    expect(departures).toHaveLength(5) // départs les 22, 23, 24, 25 et 26 octobre
    departures.forEach((d) => expect(hhmm(d)).toBe('08:00'))

    // La preuve que ce n'est pas un `+86 400 000` : EXACTEMENT un saut de 25 h, celui qui
    // franchit la nuit du changement d'heure (24 → 25 octobre). Les autres font 24 h.
    const gaps = departures
      .slice(1)
      .map((d, i) => d.getTime() - departures[i].getTime())
    expect(gaps.filter((g) => g === 25 * 3600 * 1000)).toHaveLength(1)
    expect(gaps.filter((g) => g === 24 * 3600 * 1000)).toHaveLength(gaps.length - 1)
  })

  it('sans firstDepartureAt, aucune étape ne reçoit de departureTime', async () => {
    await service.generate('adv-1', 'user-1', baseDto)
    createdRows().forEach((r) => expect(r['departureTime']).toBeUndefined())
  })

  it('timeZone invalide → repli UTC, sans erreur', async () => {
    await service.generate('adv-1', 'user-1', {
      ...baseDto,
      firstDepartureAt: '2026-10-24T06:00:00.000Z',
      timeZone: 'Mars/Olympus_Mons',
    })

    const departures = createdRows().map((r) => r['departureTime'] as Date)
    // UTC n'a pas de changement d'heure : +24 h pile.
    expect(departures[1].getTime() - departures[0].getTime()).toBe(24 * 3600 * 1000)
  })
})

describe('StageGeneratorService.generate — invariant de facturation', () => {
  it('n’émet AUCUN appel facturable sur le cas nominal', async () => {
    await service.generate('adv-1', 'user-1', baseDto)
    expect(billing.snapshot().billable).toBe(0)
  })

  it('n’émet aucun appel facturable non plus quand tout échoue', async () => {
    googleProvider.countPlaceIdsForTypes.mockResolvedValue(GOOGLE_DOWN)
    await service.generate('adv-1', 'user-1', baseDto)
    expect(billing.snapshot().billable).toBe(0)
  })

  it('lève hors production si un appel facturable a fui dans le chemin', async () => {
    // Simule la régression que la story veut rendre impossible : un chemin Pro dans la génération.
    googleProvider.countPlaceIdsForTypes.mockImplementation(() => {
      billing.record('text_search_pro')
      return Promise.resolve(googleHits(5))
    })

    await expect(service.generate('adv-1', 'user-1', baseDto)).rejects.toThrow(/invariant violé/)
  })

  it('en production, signale sans casser la génération', async () => {
    const prev = process.env['NODE_ENV']
    process.env['NODE_ENV'] = 'production'
    try {
      googleProvider.countPlaceIdsForTypes.mockImplementation(() => {
        billing.record('place_details_pro')
        return Promise.resolve(googleHits(5))
      })

      const res = await service.generate('adv-1', 'user-1', baseDto)
      expect(res.warnings.map((w) => w.code)).toContain('unexpected_billing')
      expect(res.created).toBeGreaterThan(0)
    } finally {
      process.env['NODE_ENV'] = prev
    }
  })
})
