import { forwardRef } from 'react'
import { Text, View, type TextInput } from 'react-native'

import { cn } from '@/lib/cn'
import { Input, type InputProps } from './input'

/**
 * Champ de formulaire (MOB-2.2) : label + `Input` + message d'erreur inline.
 * Pensé pour React Hook Form via `<Controller>` (composant contrôlé : `value` /
 * `onChangeText` / `onBlur`).
 *
 * - `label` sert aussi d'`accessibilityLabel` au champ (a11y — AC4).
 * - `error` est le message **déjà résolu en i18n** par l'écran appelant (le schéma
 *   Zod ne porte que des clés) ; affiché sous le champ avec `role="alert"`.
 */
export interface TextFieldProps extends InputProps {
  label: string
  /** Message d'erreur déjà traduit (`t(...)`), ou `undefined` si le champ est valide. */
  error?: string
  containerClassName?: string
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, containerClassName, ...inputProps },
  ref,
) {
  return (
    <View className={cn('gap-1.5', containerClassName)}>
      <Text className="text-sm font-montserrat-medium text-text-primary">{label}</Text>
      <Input
        ref={ref}
        hasError={Boolean(error)}
        accessibilityLabel={label}
        {...inputProps}
      />
      {error ? (
        <Text
          accessibilityRole="alert"
          className="text-xs font-montserrat text-destructive"
        >
          {error}
        </Text>
      ) : null}
    </View>
  )
})
