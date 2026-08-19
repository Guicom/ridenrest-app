import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { ExtendedSearchStatus } from './extended-search-status'

afterEach(() => {
  // Vitest sans `globals: true` → l'auto-cleanup de RTL n'est pas enregistré : sans ça les
  // rendus s'empilent et `getByRole('status')` trouve plusieurs éléments.
  cleanup()
  vi.useRealTimers()
})

describe('ExtendedSearchStatus', () => {
  it('n’affiche rien quand la recherche étendue n’est ni en cours ni en erreur', () => {
    const { container } = render(<ExtendedSearchStatus pending={false} error={false} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('annonce la recherche en cours, sans bloquer l’interaction', () => {
    render(<ExtendedSearchStatus pending error={false} />)

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Recherche étendue en cours')
    // non bloquant : l'utilisateur continue de naviguer sur la carte pendant les 1 à 31 s
    // mesurées sur les instances publiques Overpass
    expect(status.className).toContain('pointer-events-none')
  })

  it('passe au message « plus longue que prévu » au-delà du seuil', () => {
    vi.useFakeTimers()
    render(<ExtendedSearchStatus pending error={false} />)

    expect(screen.getByRole('status')).toHaveTextContent('Recherche étendue en cours')

    act(() => { vi.advanceTimersByTime(5000) })

    expect(screen.getByRole('status')).toHaveTextContent('plus longue que prévu')
  })

  it('affiche « résultats partiels » en cas d’échec', () => {
    render(<ExtendedSearchStatus pending={false} error />)

    expect(screen.getByRole('status')).toHaveTextContent('Recherche étendue indisponible — résultats partiels')
  })

  it('donne la priorité à l’erreur si les deux sont vrais', () => {
    render(<ExtendedSearchStatus pending error />)

    expect(screen.getByRole('status')).toHaveTextContent('indisponible')
  })

  it('remet le compteur de lenteur à zéro entre deux recherches', () => {
    vi.useFakeTimers()
    const { rerender } = render(<ExtendedSearchStatus pending error={false} />)
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByRole('status')).toHaveTextContent('plus longue que prévu')

    // recherche terminée, puis nouvelle recherche : on repart sur le message normal
    rerender(<ExtendedSearchStatus pending={false} error={false} />)
    rerender(<ExtendedSearchStatus pending error={false} />)

    expect(screen.getByRole('status')).toHaveTextContent('Recherche étendue en cours')
  })
})
