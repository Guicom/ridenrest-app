/**
 * Wordmark « Powered by Strava » — variante noire en light, blanche en dark
 * (story MOB-1.2b AC3). La marque orange #FC5200 est un asset tiers : seuls
 * les deux assets officiels sont alternés via la classe `dark`, jamais modifiés.
 * Bascule CSS pure (pas de useTheme) : zéro flash, zéro mismatch d'hydratation.
 *
 * Le nom accessible est porté par le `<span role="img">` (constant dans les deux
 * thèmes), car en dark la variante noire — porteuse de l'`alt` — est `display:none`
 * et sort de l'arbre d'accessibilité. Les deux `<img>` restent décoratifs.
 */
export function PoweredByStrava({ className = 'h-4' }: { className?: string }) {
  return (
    <span role="img" aria-label="Powered by Strava" className="inline-flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/powered-by-strava.svg"
        alt="Powered by Strava"
        className={`${className} dark:hidden`}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/powered-by-strava-white.svg"
        alt=""
        aria-hidden="true"
        className={`${className} hidden dark:inline`}
      />
    </span>
  )
}
