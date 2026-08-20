import { Injectable, Logger } from '@nestjs/common'
import { LAYER_CATEGORIES, CATEGORY_TO_LAYER } from '@ridenrest/shared'
import type { GooglePlaceDetails, PoiCategory, MapLayer } from '@ridenrest/shared'

/**
 * **Source de vérité** : les types Google interrogés pour une `PoiCategory`.
 *
 * Le coût d'une recherche est proportionnel au NOMBRE DE TYPES interrogés, pas au nombre de
 * POI rapportés : `searchPlacesByType` émet un Text Search Pro **par type**, facturé qu'il
 * ramène 20 lieux ou zéro (32 $/1000, 5 000 gratuits/mois). Interroger les 16 types
 * d'`accommodations` quand l'utilisateur n'a coché que « hôtel » coûtait donc 0,51 $ par bbox
 * froide au lieu de 0,19 $ — pour des résultats que la lecture filtrait ensuite.
 *
 * D'où le découpage par catégorie : on n'interroge que les types des catégories demandées.
 *
 * `shelter` n'a **aucun** type Google — les refuges et abris de montagne viennent d'OSM
 * (`tourism=alpine_hut|wilderness_hut`, cf. règle 6 du contexte projet). L'ancienne valeur
 * `['lodging']` était doublement inutile : `lodging` appartient déjà à `hotel`, et
 * `mapGoogleTypesToCategory` classe ses résultats en `hotel`, donc jamais en `shelter`.
 */
export const CATEGORY_GOOGLE_TYPES: Record<PoiCategory, string[]> = {
  hotel:        ['lodging', 'hotel', 'motel', 'inn', 'extended_stay_hotel', 'resort_hotel'],
  hostel:       ['hostel'],
  guesthouse:   ['bed_and_breakfast', 'guest_house', 'private_guest_room', 'cottage', 'farmstay'],
  camp_site:    ['campground', 'camping_cabin', 'rv_park', 'mobile_home_park'],
  shelter:      [],
  restaurant:   ['restaurant'],
  supermarket:  ['grocery_or_supermarket'],
  convenience:  ['convenience_store'],
  bike_shop:    ['bicycle_store'],
  bike_repair:  ['bicycle_store'],
}

/**
 * Types dédoublonnés par calque — **dérivé** de `CATEGORY_GOOGLE_TYPES`, jamais saisi à la main.
 *
 * Les deux tables ont coexisté et divergé silencieusement (l'ancienne `GOOGLE_PLACE_TYPES`,
 * jamais utilisée, contenait `food` et `supermarket` absents d'ici). Un test verrouille
 * désormais l'égalité des deux vues.
 *
 * Seul consommateur restant : `searchLayerPlaceIds` (analyse de densité, masque IDs Only).
 */
export const LAYER_GOOGLE_TYPES: Record<string, string[]> = Object.fromEntries(
  Object.entries(LAYER_CATEGORIES).map(([layer, categories]) => [
    layer,
    [...new Set(categories.flatMap((c) => CATEGORY_GOOGLE_TYPES[c]))],
  ]),
)

/** Repli de calque pour `resolveTextQuery` — un type appartient à une seule catégorie. */
export const TYPE_TO_LAYER: Record<string, MapLayer> = Object.fromEntries(
  (Object.entries(CATEGORY_GOOGLE_TYPES) as [PoiCategory, string[]][]).flatMap(
    ([category, types]) => types.map((t) => [t, CATEGORY_TO_LAYER[category]] as const),
  ),
)

/**
 * Union dédoublonnée des types Google à interroger pour un ensemble de catégories.
 *
 * Retourne `[]` si aucune catégorie demandée n'a de type Google (ex. `shelter` seul) — dans ce
 * cas le prefetch Google est intégralement sauté, zéro appel facturé.
 */
export function googleTypesForCategories(categories: string[]): string[] {
  const types = new Set<string>()
  for (const category of categories) {
    for (const t of CATEGORY_GOOGLE_TYPES[category as PoiCategory] ?? []) types.add(t)
  }
  return [...types]
}

/**
 * Requête textuelle par type Google.
 *
 * Le `includedType` ne « filtre » PAS : Google score d'abord par pertinence textuelle, donc un
 * `textQuery` qui ne colle pas au type écrase le résultat. Mesuré le 2026-08-20 sur une bbox
 * Alsace/Vosges, avec l'ancien `textQuery` unique par calque (`"accommodation"`) :
 *
 *   campground → 0 résultat   ("camping" → 10)
 *   motel      → 0 résultat   ("motel"   → 3)
 *   hostel     → 1 résultat   ("auberge de jeunesse" → 2)
 *
 * Zéro camping et zéro motel sur 50 km, pour une app de bikepacking. Attention, l'inverse est
 * vrai aussi : trop spécifique tue le résultat (`"camping caravaneige"` → 0). Il faut une
 * requête COURTE et NATURELLE, proche de ce qu'un humain taperait.
 */
export const TYPE_TEXT_QUERY: Record<string, string> = {
  lodging:             'hebergement',
  hotel:               'hotel',
  motel:               'motel',
  inn:                 'auberge',
  extended_stay_hotel: 'residence hoteliere',
  resort_hotel:        'resort',
  campground:          'camping',
  camping_cabin:       'camping chalet',
  rv_park:             'camping car aire',
  mobile_home_park:    'camping mobil home',
  bed_and_breakfast:   'chambre hotes',
  guest_house:         'chambre hotes',
  private_guest_room:  'chambre chez particulier',
  cottage:             'gite',
  farmstay:            'ferme auberge',
  hostel:              'auberge de jeunesse',
  restaurant:          'restaurant',
  grocery_or_supermarket: 'supermarche',
  supermarket:         'supermarche',
  convenience_store:   'epicerie superette',
  bicycle_store:       'velo magasin reparation',
}

/** Repli quand un type n'a pas de requête dédiée ci-dessus. */
const LAYER_TEXT_QUERY_FALLBACK: Record<string, string> = {
  accommodations: 'hebergement',
  restaurants:    'restaurant',
  supplies:       'supermarche',
  bike:           'velo magasin',
}

/**
 * Masque « IDs Only » — SKU **Text Search Essentials (IDs Only)** : gratuit et ILLIMITÉ.
 *
 * Réservé aux usages qui n'ont besoin que de COMPTER. Ne jamais y ajouter `places.location`,
 * `places.displayName` ni `places.types` : ces champs font basculer l'appel en Text Search Pro
 * (32 $/1000, 5 000 gratuits/mois), et Google facture au SKU le plus élevé du masque.
 */
const MASK_IDS_ONLY = 'places.id,nextPageToken'

/**
 * Masque « Pro » — SKU **Text Search Pro**. Contient exactement ce qu'il faut pour POSER UN PIN
 * (identité, position, types), donc rend le Place Details du prefetch entièrement inutile.
 *
 * Économie mesurée sur une bbox froide : 10 appels Pro (0,32 $) pour 114 POI, contre 32 Place
 * Details Essentials (0,16 $) pour 32 POI — soit 0,0028 $/POI contre 0,0050 $, et ~500 bboxes
 * froides dans le quota gratuit mensuel contre ~312. Un appel Pro amortit jusqu'à 20 POI ;
 * un Place Details n'en amortit qu'un.
 */
const MASK_PRO = 'places.id,places.displayName,places.location,places.types,nextPageToken'

/** Plafond Google : 20 résultats par page, 60 au total via `pageToken`. */
const MAX_TEXT_SEARCH_PAGES = 3

/** Ce que le prefetch POI a besoin de connaître d'un lieu — rien de plus. */
export interface GooglePlaceSummary {
  placeId: string
  name: string
  lat: number
  lng: number
  types: string[]
}

/** Issue d'un Text Search pour UN type — `ok: false` laisse le type non marqué, donc réessayable. */
export interface TypeSearchOutcome {
  type: string
  places: GooglePlaceSummary[]
  ok: boolean
}

interface GoogleTextSearchRequest {
  textQuery: string
  includedType?: string
  locationRestriction: {
    rectangle: {
      low:  { latitude: number; longitude: number }
      high: { latitude: number; longitude: number }
    }
  }
  maxResultCount: number
  languageCode: string
  pageToken?: string
}

interface GoogleTextSearchResponse {
  places?: Array<{
    id: string
    name?: string
    displayName?: { text?: string }
    location?: { latitude?: number; longitude?: number }
    types?: string[]
  }>
  /** Présent tant que Google a d'autres résultats. Ignoré pendant 5 mois → moitié du stock perdue. */
  nextPageToken?: string
}

// Map Google place types → our PoiCategory
export function mapGoogleTypesToCategory(types: string[], layer: string): string {
  if (layer === 'restaurants') return 'restaurant'
  if (layer === 'bike') return 'bike_shop'
  if (layer === 'supplies') {
    if (types.some((t) => ['grocery_or_supermarket', 'supermarket'].includes(t))) return 'supermarket'
    return 'convenience'
  }
  // accommodations layer
  if (types.some((t) => ['campground', 'camping_cabin', 'rv_park', 'mobile_home_park'].includes(t))) return 'camp_site'
  if (types.some((t) => ['hostel'].includes(t))) return 'hostel'
  if (types.some((t) => ['guest_house', 'bed_and_breakfast', 'private_guest_room', 'farmstay', 'cottage'].includes(t))) return 'guesthouse'
  if (types.some((t) => ['hotel', 'motel', 'inn', 'extended_stay_hotel', 'resort_hotel', 'lodging'].includes(t))) return 'hotel'
  return 'hotel'
}

@Injectable()
export class GooglePlacesProvider {
  private readonly logger = new Logger(GooglePlacesProvider.name)
  private readonly BASE_URL = 'https://places.googleapis.com/v1/places:searchText'
  private readonly API_KEY = process.env['GOOGLE_PLACES_API_KEY']

  isConfigured(): boolean {
    return !!this.API_KEY
  }

  /**
   * Socle d'identité d'un lieu. Ces champs seuls relèveraient du SKU Place Details Essentials,
   * mais on ne les demande plus jamais isolément : le prefetch les obtient via Text Search Pro
   * (cf. `searchPlacesByType`). Conservés comme base de composition de `PRO_FIELDS`.
   */
  private static readonly ESSENTIALS_FIELDS = ['id', 'displayName', 'location', 'types']

  /**
   * Champs de la fiche POI : note, horaires, téléphone, site, adresse. Google facture au SKU le
   * plus élevé des champs demandés, donc dès qu'un seul de ceux-ci est présent, tout l'appel
   * bascule en Place Details Pro (~17 $/1000 au-delà du quota gratuit).
   */
  private static readonly PRO_FIELDS = [
    ...GooglePlacesProvider.ESSENTIALS_FIELDS,
    'formattedAddress',
    'addressComponents',
    'rating',
    'regularOpeningHours.openNow',
    'regularOpeningHours.weekdayDescriptions',
    'regularOpeningHours.periods',
    'internationalPhoneNumber',
    'websiteUri',
  ]

  /**
   * Fiche POI uniquement — SKU **Place Details Pro** (17 $/1000, 5 000 gratuits/mois).
   *
   * Le prefetch carte n'appelle plus cette méthode du tout : `searchPlacesByType` rapporte déjà
   * identité, position et types en un seul appel Text Search Pro pour 20 POI. Un palier
   * `essentials` avait été introduit le 2026-08-19 pour le prefetch ; il est devenu inutile le
   * 2026-08-20 et a été retiré plutôt que laissé en place sans appelant.
   */
  async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
    if (!this.API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured')

    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=fr`
    const fieldMask = GooglePlacesProvider.PRO_FIELDS.join(',')

    const response = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': this.API_KEY,
        'X-Goog-FieldMask': fieldMask,
      },
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) {
      throw new Error(`Place Details error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json() as {
      displayName?: { text?: string }
      formattedAddress?: string
      addressComponents?: Array<{ longText?: string; types?: string[] }>
      location?: { latitude?: number; longitude?: number }
      rating?: number
      regularOpeningHours?: {
        openNow?: boolean
        weekdayDescriptions?: string[]
        periods?: Array<{
          open:  { day: number; hour: number; minute: number }
          close: { day: number; hour: number; minute: number }
        }>
      }
      internationalPhoneNumber?: string
      websiteUri?: string
      types?: string[]
    }

    // Extract locality (city/town/village) from addressComponents
    const locality = data.addressComponents?.find(
      (c) => c.types?.includes('locality'),
    )?.longText ?? null

    // Extract postal code from addressComponents
    const postalCode = data.addressComponents?.find(
      (c) => c.types?.includes('postal_code'),
    )?.longText ?? null

    // Extract region/province from addressComponents
    const adminArea = data.addressComponents?.find(
      (c) => c.types?.includes('administrative_area_level_1'),
    )?.longText ?? null

    // Extract country from addressComponents
    const country = data.addressComponents?.find(
      (c) => c.types?.includes('country'),
    )?.longText ?? null

    return {
      placeId,
      displayName: data.displayName?.text ?? null,
      formattedAddress: data.formattedAddress ?? null,
      locality,
      postalCode,
      adminArea,
      country,
      lat: data.location?.latitude ?? null,
      lng: data.location?.longitude ?? null,
      rating: data.rating ?? null,
      isOpenNow: data.regularOpeningHours?.openNow ?? null,
      weekdayDescriptions: data.regularOpeningHours?.weekdayDescriptions ?? [],
      periods: data.regularOpeningHours?.periods ?? [],
      phone: data.internationalPhoneNumber ?? null,
      website: data.websiteUri ?? null,
      types: data.types ?? [],
    }
  }

  /** Text Search (IDs Only) to find Google place_id for a known POI by name + location. */
  async findPlaceId(
    name: string,
    lat: number,
    lng: number,
  ): Promise<string | null> {
    if (!this.API_KEY) return null

    const body = {
      textQuery: name,
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: 2000.0,  // 2km strict — prevents matches 20km+ away while handling OSM coordinate drift
        },
      },
      maxResultCount: 1,
      languageCode: 'fr',
    }

    const response = await fetch(this.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': this.API_KEY,
        'X-Goog-FieldMask': 'places.id',  // IDs Only — unlimited, $0
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })

    if (!response.ok) return null

    const result = await response.json() as { places?: Array<{ id: string }> }
    return result.places?.[0]?.id ?? null
  }

  /**
   * Primitive Text Search : une requête, un type, un masque de champs, avec pagination
   * optionnelle. Toute la facturation Google se décide ici, via `mask`.
   */
  private async textSearch(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    googleType: string,
    textQuery: string,
    mask: string,
    paginate: boolean,
  ): Promise<NonNullable<GoogleTextSearchResponse['places']>> {
    if (!this.API_KEY) {
      this.logger.warn('GOOGLE_PLACES_API_KEY not set — skipping Google Places search')
      return []
    }

    const collected: NonNullable<GoogleTextSearchResponse['places']> = []
    let pageToken: string | undefined
    let page = 0

    do {
      const body: GoogleTextSearchRequest = {
        textQuery,
        includedType: googleType,
        locationRestriction: {
          rectangle: {
            low:  { latitude: bbox.minLat, longitude: bbox.minLng },
            high: { latitude: bbox.maxLat, longitude: bbox.maxLng },
          },
        },
        // Plafonné à 20 par Google quoi qu'on demande (vérifié : 50 → 20 résultats).
        maxResultCount: 20,
        languageCode: 'fr',
        ...(pageToken ? { pageToken } : {}),
      }

      const response = await fetch(this.BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.API_KEY,
          'X-Goog-FieldMask': mask,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      })

      if (!response.ok) {
        throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
      }

      const result = (await response.json()) as GoogleTextSearchResponse
      collected.push(...(result.places ?? []))
      pageToken = paginate ? result.nextPageToken : undefined
      page += 1
    } while (pageToken && page < MAX_TEXT_SEARCH_PAGES)

    return collected
  }

  private resolveTextQuery(googleType: string): string {
    const layer = TYPE_TO_LAYER[googleType]
    return TYPE_TEXT_QUERY[googleType] ?? (layer && LAYER_TEXT_QUERY_FALLBACK[layer]) ?? googleType
  }

  /**
   * Fetch Google place_ids for a given bounding box and Google place type.
   * Masque IDs Only → SKU gratuit et illimité. Une seule page.
   */
  async searchPlaceIds(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    googleType: string,
    textQuery: string,
  ): Promise<string[]> {
    const places = await this.textSearch(bbox, googleType, textQuery, MASK_IDS_ONLY, false)
    return places.map((p) => p.id).filter(Boolean)
  }

  /**
   * COMPTAGE seul — masque IDs Only, une page, **gratuit**.
   *
   * ⚠️ Ne JAMAIS faire basculer cette méthode sur le masque Pro. Son consommateur est l'analyse
   * de densité (`density-analyze.processor.ts`), qui découpe l'aventure en tronçons de 10 km et
   * appelle une fois par tronçon et par type : une aventure de 837 km = 84 tronçons × 16 types =
   * **1 344 requêtes pour une seule analyse**. En SKU Pro ce serait ~43 $ et 27 % du quota
   * gratuit mensuel, pour une donnée dont le processeur ne lit que « 0, 1, ou ≥ 2 ».
   *
   * La pagination lui est inutile pour la même raison (seuils de gap à 0 et 1).
   */
  async searchLayerPlaceIds(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    layer: string,
  ): Promise<string[]> {
    const googleTypes = LAYER_GOOGLE_TYPES[layer] ?? []
    if (googleTypes.length === 0) return []
    if (!this.API_KEY) return []

    const results = await Promise.allSettled(
      googleTypes.map((type) =>
        this.searchPlaceIds(bbox, type, this.resolveTextQuery(type)),
      ),
    )

    const allIds = new Set<string>()
    for (const result of results) {
      if (result.status === 'fulfilled') result.value.forEach((id) => allIds.add(id))
      else this.logger.warn(`Google Places type search failed: ${result.reason}`)
    }
    return [...allIds]
  }

  /**
   * AFFICHAGE — masque Pro (identité + position + types) et pagination complète.
   *
   * Remplace l'ancien enchaînement « IDs Only puis un Place Details par place_id » : les quatre
   * champs nécessaires à un pin arrivent déjà ici, 20 POI par appel facturé.
   *
   * **Un appel facturé par type**, qu'il ramène 20 lieux ou zéro — d'où l'intérêt de ne passer
   * que les types des catégories réellement demandées (`googleTypesForCategories`).
   *
   * Retourne l'issue de CHAQUE type plutôt qu'une liste fusionnée : l'appelant pose un marqueur
   * de couverture par type, et un type en échec doit rester non marqué pour être réessayé. Une
   * fusion masquerait un échec partiel — 15 types morts sur 16 verrouillaient auparavant tout le
   * calque pour 7 jours, avec le symptôme « 0 résultat » figé sur une zone qui en contient.
   *
   * Un lieu sans coordonnées est écarté — on ne peut pas le placer sur la carte.
   */
  async searchPlacesByType(
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    googleTypes: string[],
  ): Promise<TypeSearchOutcome[]> {
    if (googleTypes.length === 0) return []
    if (!this.API_KEY) return []

    const settled = await Promise.allSettled(
      googleTypes.map((type) =>
        this.textSearch(bbox, type, this.resolveTextQuery(type), MASK_PRO, true),
      ),
    )

    return settled.map((result, i) => {
      const type = googleTypes[i]
      if (result.status === 'rejected') {
        this.logger.warn(`Google Places search failed for type=${type}: ${result.reason}`)
        return { type, places: [], ok: false }
      }
      const places: GooglePlaceSummary[] = []
      for (const p of result.value) {
        const lat = p.location?.latitude
        const lng = p.location?.longitude
        if (!p.id || typeof lat !== 'number' || typeof lng !== 'number') continue
        places.push({
          placeId: p.id,
          name: p.displayName?.text ?? 'Unknown',
          lat,
          lng,
          types: p.types ?? [],
        })
      }
      return { type, places, ok: true }
    })
  }
}
