import { Text, View } from 'react-native'

import { cn } from '@/lib/cn'

/**
 * Bandeau d'erreur inline (MOB-2.2) — équivalent RN de `<ErrorMessage>` web.
 * Affiche les erreurs serveur/réseau d'un formulaire d'auth **dans la page**
 * (jamais `Alert.alert` — cf. architecture-mobile §Loading states & errors).
 * `role="alert"` pour l'annonce lecteur d'écran (a11y — AC4).
 */
export interface ErrorBannerProps {
  message: string
  className?: string
}

export function ErrorBanner({ message, className }: ErrorBannerProps) {
  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'rounded-lg border border-destructive bg-destructive/10 px-3 py-2',
        className,
      )}
    >
      <Text className="text-sm font-montserrat text-destructive">{message}</Text>
    </View>
  )
}
