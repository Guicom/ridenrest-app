import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import type { AccessOrigin, AccessResponse } from '@ridenrest/shared'
import type { UseAccessResult } from './useAccess'
import { AccessMetrics } from './AccessMetrics'

const mockUseAccess = vi.fn<(...args: unknown[]) => UseAccessResult>()
vi.mock('./useAccess', () => ({
  useAccess: (...args: unknown[]) => mockUseAccess(...args),
}))

const ORIGIN: AccessOrigin = { type: 'nearest-trace' }

type OkResponse = Extract<AccessResponse, { status: 'ok' }>
const geom = { type: 'LineString' as const, coordinates: [[2.35, 48.85], [2.36, 48.86]] }
const okResponse: OkResponse = {
  status: 'ok',
  distanceM: 4200,
  elevationGainM: 120,
  elevationLossM: 80,
  geometry: geom,
  // variants[0] = champs top-level (meilleur auto). C'est la variante affichée par défaut.
  variants: [
    { entryPoint: [2.35, 48.85], distanceM: 4200, elevationGainM: 120, elevationLossM: 80, etaS: 1000, usesMainRoad: false, mainRoadDistanceM: 0, geometry: geom },
  ],
  engineVersion: 'brouter-1.7.5',
  computedAt: '2026-05-29T12:00:00.000Z',
  source: 'computed-fresh',
}

/** Réponse ok avec N variantes (pour tester le sélecteur). */
function okWithVariants(...dists: number[]): OkResponse {
  return {
    ...okResponse,
    distanceM: dists[0],
    variants: dists.map((d, i) => ({
      entryPoint: [2.35 + i * 0.01, 48.85],
      distanceM: d,
      elevationGainM: 120,
      elevationLossM: 80,
      etaS: 1000 + i * 100,
      usesMainRoad: false,
      mainRoadDistanceM: 0,
      geometry: geom,
    })),
  }
}

function setAccess(partial: Partial<UseAccessResult>): void {
  mockUseAccess.mockReturnValue({ data: undefined, isLoading: false, error: null, ...partial })
}

beforeEach(() => {
  mockUseAccess.mockReset()
})

afterEach(cleanup)

describe('AccessMetrics', () => {
  it('renders the skeleton while loading', () => {
    setAccess({ isLoading: true })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" />)
    expect(screen.getByTestId('access-metrics-skeleton')).toBeInTheDocument()
  })

  it('renders full variant with title, distance (km, French comma), D+ and D-', () => {
    setAccess({ data: okResponse })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="full" />)

    expect(screen.getByText("Itinéraire vers l'hôtel")).toBeInTheDocument()
    expect(screen.getByText('4,2 km')).toBeInTheDocument()
    expect(screen.getByText('120 m D+')).toBeInTheDocument()
    expect(screen.getByText('80 m D-')).toBeInTheDocument()
  })

  it('renders compact variant with distance + D+ / D- (no title)', () => {
    setAccess({ data: okResponse })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="compact" />)

    const compact = screen.getByTestId('access-metrics-compact')
    expect(compact).toHaveTextContent('4,2 km')
    expect(compact).toHaveTextContent('120 m') // D+ (icône) sur l'approche d'accès
    expect(compact).toHaveTextContent('80 m') // D-
    expect(screen.queryByText("Itinéraire vers l'hôtel")).not.toBeInTheDocument()
  })

  it('formats sub-kilometer distance in meters', () => {
    setAccess({ data: okWithVariants(740) })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="compact" />)
    expect(screen.getByTestId('access-metrics-compact')).toHaveTextContent('740 m')
  })

  it('renders stats variant with distance, D+, D- and estimated time', () => {
    setAccess({ data: okResponse })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="stats" speedKmh={15} />)

    const stats = screen.getByTestId('access-metrics-stats')
    expect(stats).toHaveTextContent('4,2 km')
    expect(stats).toHaveTextContent('120 m D+')
    expect(stats).toHaveTextContent('80 m D-')
    // 4,2 km à 15 km/h ≈ 17 min
    expect(stats).toHaveTextContent('~17 min')
  })

  it('no variant selector with a single variant', () => {
    setAccess({ data: okResponse })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="stats" speedKmh={15} onSelectVariant={vi.fn()} />)
    expect(screen.queryByTestId('access-variant-selector')).not.toBeInTheDocument()
  })

  it('renders the variant selector with multiple variants (one option each)', () => {
    setAccess({ data: okWithVariants(4200, 9000, 6000) })
    render(
      <AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="stats" speedKmh={15} onSelectVariant={vi.fn()} />,
    )
    const selector = screen.getByTestId('access-variant-selector')
    expect(selector.querySelectorAll('[role="radio"]')).toHaveLength(3)
  })

  it('shows the SELECTED variant metrics (not always variants[0])', () => {
    setAccess({ data: okWithVariants(4200, 9000) })
    render(
      <AccessMetrics
        poiId="p1"
        origin={ORIGIN}
        category="hotel"
        variant="stats"
        speedKmh={15}
        selectedVariantIndex={1}
        onSelectVariant={vi.fn()}
      />,
    )
    // variant[1] = 9000 m → 9,0 km affiché dans la rangée stats
    expect(screen.getByTestId('access-metrics-stats')).toHaveTextContent('9,0 km')
  })

  it('clicking a variant option calls onSelectVariant with its index', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const onSelect = vi.fn()
    setAccess({ data: okWithVariants(4200, 9000) })
    render(
      <AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="stats" speedKmh={15} onSelectVariant={onSelect} />,
    )
    const options = screen.getByTestId('access-variant-selector').querySelectorAll('[role="radio"]')
    await userEvent.click(options[1])
    expect(onSelect).toHaveBeenCalledWith(1)
  })

  it('flags the variant that uses a national road (danger indicator)', () => {
    const base = okResponse.variants[0]
    setAccess({
      data: {
        ...okResponse,
        variants: [
          { ...base, usesMainRoad: false },
          { ...base, distanceM: 9000, usesMainRoad: true, mainRoadDistanceM: 3000 },
        ],
      },
    })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="stats" speedKmh={15} onSelectVariant={vi.fn()} />)
    const options = screen.getByTestId('access-variant-selector').querySelectorAll('[role="radio"]')
    expect(options[1].getAttribute('aria-label')).toContain('nationale')
    expect(options[0].getAttribute('aria-label')).not.toContain('nationale')
  })

  it('hides the selector when selection is not wired (no onSelectVariant)', () => {
    setAccess({ data: okWithVariants(4200, 9000) })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="stats" speedKmh={15} />)
    expect(screen.queryByTestId('access-variant-selector')).not.toBeInTheDocument()
  })

  it('renders the fallback when status is fallback', () => {
    setAccess({
      data: { status: 'fallback', fallbackReason: 'routing_failed', fallbackDistanceM: 3500, source: 'computed-fresh' },
    })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" />)

    expect(screen.getByTestId('access-fallback')).toBeInTheDocument()
    expect(screen.getByText('3,5 km')).toBeInTheDocument()
    expect(screen.getByText('≈ approximatif')).toBeInTheDocument()
  })

  it('renders a discreet error message when status is error', () => {
    setAccess({ data: { status: 'error', message: 'Boom' } })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" />)
    expect(screen.getByTestId('access-error')).toHaveTextContent('Boom')
  })

  it('renders a discreet error message on network error', () => {
    setAccess({ error: new Error('network') })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" />)
    expect(screen.getByTestId('access-error')).toHaveTextContent("Itinéraire d'accès indisponible")
  })

  it('keeps showing valid cached data when a background refetch errors', () => {
    // TanStack conserve `data` quand un refetch d'arrière-plan échoue : on ne doit
    // pas masquer une distance valide au profit du message d'erreur.
    setAccess({ data: okResponse, error: new Error('background refetch failed') })
    render(<AccessMetrics poiId="p1" origin={ORIGIN} category="hotel" variant="full" />)

    expect(screen.getByText('4,2 km')).toBeInTheDocument()
    expect(screen.queryByTestId('access-error')).not.toBeInTheDocument()
  })
})
