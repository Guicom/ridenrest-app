import { Text, View, type TextProps, type ViewProps } from 'react-native'

import { cn } from '@/lib/cn'

type WithClassName<T> = T & { className?: string }

/** Conteneur carte — surface `card`, bordure `border`, rayon `xl` (tokens partagés). */
export function Card({ className, ...props }: WithClassName<ViewProps>) {
  return (
    <View
      className={cn('rounded-xl border border-border bg-card p-4', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: WithClassName<ViewProps>) {
  return <View className={cn('mb-2 gap-1', className)} {...props} />
}

export function CardTitle({ className, ...props }: WithClassName<TextProps>) {
  return (
    <Text
      className={cn(
        'text-base font-montserrat-semibold text-card-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function CardDescription({ className, ...props }: WithClassName<TextProps>) {
  return (
    <Text
      className={cn('text-sm font-montserrat text-text-muted', className)}
      {...props}
    />
  )
}

export function CardContent({ className, ...props }: WithClassName<ViewProps>) {
  return <View className={cn('gap-2', className)} {...props} />
}
