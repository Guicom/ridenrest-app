'use client'

interface Alternative {
  label: string
  count: number
}

interface NoResultsSubTypeBannerProps {
  activeTypeLabels: string[]
  alternatives: Alternative[]
  onResetFilters: () => void
  className?: string
}

export function NoResultsSubTypeBanner({ activeTypeLabels, alternatives, onResetFilters, className = '' }: NoResultsSubTypeBannerProps) {
  const activeText = activeTypeLabels.join(', ')
  const withCounts = alternatives.filter((a) => a.count > 0)
  const altText = withCounts.length > 0
    ? withCounts.map((a) => `${a.count} ${a.label}`).join(', ')
    : alternatives.map((a) => a.label).join(', ')
  const suffix = withCounts.length > 0 ? 'disponible(s)' : 'peut-être disponible(s)'

  return (
    <button
      onClick={onResetFilters}
      className={`cursor-pointer rounded-lg bg-blue-500/90 px-4 py-2 text-center text-sm font-medium text-white backdrop-blur-sm hover:bg-blue-600/90 ${className}`}
    >
      <div>Aucun {activeText} dans cette zone — {altText} {suffix}</div>
      <div className="text-xs text-white/80">(cliquer pour afficher)</div>
    </button>
  )
}
