import { useEffect, useState } from 'react'
import { Animated, Easing, type ViewProps } from 'react-native'

import { cn } from '@/lib/cn'

/**
 * Placeholder de chargement — surface `muted` + pulsation d'opacité.
 *
 * ⚠️ `animate-pulse` (keyframe Tailwind web) N'ANIME PAS sur natif : la pulsation
 * est pilotée par l'API `Animated` de react-native (opacité 1 → 0.5 → 1 en boucle,
 * équivalent du `animate-pulse` web). On utilise `Animated` (cœur RN) plutôt que
 * Reanimated : ce composant est rendu dans Storybook (cible react-native-web /
 * vite) où le graphe de modules Reanimated casse le build — `Animated` est déjà
 * polyfillé par react-native-web. Élément décoratif → masqué des lecteurs d'écran.
 * Alignement web (`components/ui/skeleton.tsx`).
 */
export function Skeleton({
  className,
  style,
  ...props
}: ViewProps & { className?: string }) {
  // Instance `Animated.Value` créée une seule fois via l'initialiseur paresseux
  // de `useState` (stable entre les rendus, sans lire de ref pendant le rendu —
  // règle `react-hooks/refs`).
  const [opacity] = useState(() => new Animated.Value(1))

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [opacity])

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn('rounded-md bg-muted', className)}
      style={[{ opacity }, style]}
      {...props}
    />
  )
}
