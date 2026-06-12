import { forwardRef } from 'react'
import { TextInput, type TextInputProps } from 'react-native'

import { cn } from '@/lib/cn'

/**
 * Input primitif (MOB-2.2) — `TextInput` stylé NativeWind/design-tokens, aligné
 * sur `apps/web` (`components/ui/input.tsx`). Hauteur 44px (`h-11`) = cible
 * tactile HIG/WCAG. `forwardRef` pour que React Hook Form / le focus programmatique
 * (`focus()` du champ suivant) fonctionne.
 *
 * `hasError` bascule la bordure en `destructive` (état d'erreur de validation).
 * Couleur du placeholder via la classe NativeWind `placeholder:` (mappée sur
 * `placeholderTextColor`) — pas de hex en dur.
 */
export interface InputProps extends TextInputProps {
  className?: string
  hasError?: boolean
}

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { className, hasError, ...props },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      className={cn(
        'h-11 rounded-lg border border-input bg-background px-3 text-base font-montserrat text-foreground placeholder:text-text-muted',
        hasError && 'border-destructive',
        className,
      )}
      {...props}
    />
  )
})
