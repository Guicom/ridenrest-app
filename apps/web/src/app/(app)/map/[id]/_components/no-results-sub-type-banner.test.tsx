import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { NoResultsSubTypeBanner } from './no-results-sub-type-banner'

afterEach(cleanup)

describe('NoResultsSubTypeBanner', () => {
  it('renders the active type labels and alternative counts', () => {
    render(
      <NoResultsSubTypeBanner
        activeTypeLabels={['hôtel']}
        alternatives={[
          { label: 'camping', count: 8 },
          { label: 'refuge / abri', count: 2 },
        ]}
        onResetFilters={vi.fn()}
      />,
    )

    expect(screen.getByText(/Aucun hôtel dans cette zone/)).toBeInTheDocument()
    expect(screen.getByText(/8 camping, 2 refuge \/ abri disponible/)).toBeInTheDocument()
    expect(screen.getByText('(cliquer pour afficher)')).toBeInTheDocument()
  })

  it('filters out alternatives with count 0', () => {
    render(
      <NoResultsSubTypeBanner
        activeTypeLabels={['hôtel']}
        alternatives={[
          { label: 'camping', count: 8 },
          { label: 'refuge / abri', count: 0 },
          { label: 'auberge de jeunesse', count: 3 },
        ]}
        onResetFilters={vi.fn()}
      />,
    )

    expect(screen.getByText(/8 camping, 3 auberge de jeunesse disponible/)).toBeInTheDocument()
  })

  it('shows simplified message when all alternatives have count 0 (live mode)', () => {
    render(
      <NoResultsSubTypeBanner
        activeTypeLabels={['hôtel']}
        alternatives={[
          { label: 'camping', count: 0 },
          { label: 'refuge / abri', count: 0 },
        ]}
        onResetFilters={vi.fn()}
      />,
    )

    expect(screen.getByText(/camping, refuge \/ abri peut-être disponible/)).toBeInTheDocument()
  })

  it('shows multiple active type labels', () => {
    render(
      <NoResultsSubTypeBanner
        activeTypeLabels={['hôtel', 'auberge de jeunesse']}
        alternatives={[{ label: 'camping', count: 5 }]}
        onResetFilters={vi.fn()}
      />,
    )

    expect(screen.getByText(/Aucun hôtel, auberge de jeunesse dans cette zone/)).toBeInTheDocument()
  })

  it('calls onResetFilters when clicked', () => {
    const onResetFilters = vi.fn()
    render(
      <NoResultsSubTypeBanner
        activeTypeLabels={['hôtel']}
        alternatives={[{ label: 'camping', count: 3 }]}
        onResetFilters={onResetFilters}
      />,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(onResetFilters).toHaveBeenCalledTimes(1)
  })

  it('applies custom className for positioning', () => {
    render(
      <NoResultsSubTypeBanner
        activeTypeLabels={['hôtel']}
        alternatives={[{ label: 'camping', count: 3 }]}
        onResetFilters={vi.fn()}
        className="absolute top-10"
      />,
    )

    const button = screen.getByRole('button')
    expect(button.className).toContain('absolute top-10')
  })
})
