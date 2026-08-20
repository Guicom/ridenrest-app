import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLivePoisSearch } from './use-live-poi-search'

// Mock live store state
let mockStoreState = {
  isLiveModeActive: true,
  currentKmOnRoute: null as number | null,
  targetAheadKm: 30,
  searchRadiusKm: 3,
}

vi.mock('@/stores/live.store', () => ({
  useLiveStore: (selector: (s: typeof mockStoreState) => unknown) => selector(mockStoreState),
}))

// Mock getLivePois
const mockGetLivePois = vi.fn().mockResolvedValue([])
vi.mock('@/lib/api-client', () => ({
  getLivePois: (...args: unknown[]) => mockGetLivePois(...args),
}))

// Mock useQuery
const mockUseQuery = vi.fn().mockReturnValue({ data: [], isPending: false, isError: false })
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
}))

// Mock useProfile
// `ready: true` = profil déjà résolu (le cas nominal). Le cas `ready: false` est couvert
// par un test dédié : la recherche ne doit PAS partir tant que le flag Overpass est inconnu.
const mockProfile = { overpassEnabled: false, ready: true }
vi.mock('./use-profile', () => ({
  useProfile: () => ({ data: { overpassEnabled: mockProfile.overpassEnabled } }),
  useOverpassEnabled: () => mockProfile,
}))

describe('useLivePoisSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockStoreState = {
      isLiveModeActive: true,
      currentKmOnRoute: null,
      targetAheadKm: 30,
      searchRadiusKm: 3,
    }
    mockUseQuery.mockReturnValue({ data: [], isFetching: false, isError: false })
  })

  it('returns null targetKm when currentKmOnRoute is null', () => {
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.targetKm).toBeNull()
  })

  it('computes targetKm = currentKmOnRoute + targetAheadKm', () => {
    mockStoreState.currentKmOnRoute = 10
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    // targetKm = Math.round((10 + 30) * 10) / 10 = 40
    expect(result.current.targetKm).toBe(40)
  })

  /**
   * Depuis la story 17.14 le hook émet DEUX useQuery (source primaire google + flux overpass).
   * `mockReturnValue` répondrait la même chose aux deux et fausserait la fusion : ce helper
   * distingue les deux appels par leur clé.
   */
  const mockQueriesBySource = (google: unknown, overpass: unknown = { data: undefined, isFetching: false, isError: false }) => {
    mockUseQuery.mockImplementation((opts: { queryKey: [string, string, { source?: string }] }) =>
      opts.queryKey[2]?.source === 'overpass' ? overpass : google,
    )
  }

  it('passes correct queryKey with rounded targetKm', () => {
    mockStoreState.currentKmOnRoute = 10.15
    const { rerender } = renderHook(() => useLivePoisSearch('seg-1'))
    // Re-render to let useEffect set activeTriggerKm
    rerender()

    // La clé porte désormais la source : on vérifie celle de la source primaire (google)
    const googleCall = mockUseQuery.mock.calls
      .map((c: [{ queryKey: [string, string, { source?: string }] }]) => c[0])
      .filter((o: { queryKey: [string, string, { source?: string }] }) => o.queryKey[2]?.source === 'google')
      .at(-1)
    // targetKm = Math.round((10.15 + 30) * 10) / 10 = 40.2
    expect(googleCall.queryKey).toEqual([
      'pois', 'live', { segmentId: 'seg-1', targetKm: 40.2, radiusKm: 3, overpassEnabled: false, source: 'google' },
    ])
  })

  it('disables query when segmentId is undefined', () => {
    mockStoreState.currentKmOnRoute = 10
    renderHook(() => useLivePoisSearch(undefined))

    const queryConfig = mockUseQuery.mock.calls[0][0]
    expect(queryConfig.enabled).toBe(false)
  })

  it('disables query when live mode is inactive', () => {
    mockStoreState.isLiveModeActive = false
    mockStoreState.currentKmOnRoute = 10
    renderHook(() => useLivePoisSearch('seg-1'))

    const queryConfig = mockUseQuery.mock.calls[0][0]
    expect(queryConfig.enabled).toBe(false)
  })

  it('query is always disabled (manual-only via refetch)', () => {
    mockStoreState.currentKmOnRoute = 10
    renderHook(() => useLivePoisSearch('seg-1'))

    const queryConfig = mockUseQuery.mock.calls[0][0]
    expect(queryConfig.enabled).toBe(false)
  })

  it('exposes isError from useQuery', () => {
    mockUseQuery.mockReturnValue({ data: [], isPending: false, isError: true })
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.isError).toBe(true)
  })

  it('returns isError = false by default', () => {
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.isError).toBe(false)
  })

  it('hasFetched is false when data is undefined (never fetched)', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isFetching: false, isError: false })
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.hasFetched).toBe(false)
    expect(result.current.pois).toEqual([])
  })

  it('hasFetched is true when data is [] (fetched, zero results)', () => {
    mockUseQuery.mockReturnValue({ data: [], isFetching: false, isError: false })
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.hasFetched).toBe(true)
    expect(result.current.pois).toEqual([])
  })

  it('hasFetched is true when data has results', () => {
    const poi = { id: 'p1', name: 'Hotel A' }
    mockQueriesBySource({ data: [poi], isFetching: false, isError: false })
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.hasFetched).toBe(true)
    expect(result.current.pois).toEqual([poi])
  })

  it('fusionne les POI des deux sources', () => {
    const g = { id: 'g1', name: 'Google Hotel' }
    const o = { id: 'o1', name: 'OSM Hotel' }
    mockQueriesBySource(
      { data: [g], isFetching: false, isError: false },
      { data: [o], isFetching: false, isError: false },
    )
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.pois).toEqual([g, o])
  })

  it('isFetching ne suit que la source primaire ; Overpass est exposé à part', () => {
    // Sur un vélo, attendre 30 s devant un écran figé n'est pas une option : les POI Google
    // s'affichent, Overpass complète quand il peut (story 17.14).
    mockQueriesBySource(
      { data: [], isFetching: false, isError: false },
      { data: undefined, isFetching: true, isError: false },
    )
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.isFetching).toBe(false)
    expect(result.current.overpassPending).toBe(true)
  })

  it('un échec Overpass ne met pas la recherche live en erreur', () => {
    mockQueriesBySource(
      { data: [], isFetching: false, isError: false },
      { data: undefined, isFetching: false, isError: true },
    )
    const { result } = renderHook(() => useLivePoisSearch('seg-1'))
    expect(result.current.isError).toBe(false)
    expect(result.current.overpassError).toBe(true)
  })
})
