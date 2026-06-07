import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'
import { Pressable, Text, type PressableProps } from 'react-native'

import { cn } from '@/lib/cn'

/**
 * Bouton primitif — variants alignés sur `apps/web` (`components/ui/button.tsx`),
 * stylés via NativeWind/design-tokens. Taille `lg` ≥ 44×44 px (NFR-LP-003 —
 * cible tactile HIG iOS / WCAG, supersède le 48px web).
 */
const buttonVariants = cva(
  'flex-row items-center justify-center gap-2 rounded-lg border border-transparent disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary active:bg-primary-hover',
        outline: 'border-border bg-background active:bg-muted',
        secondary: 'bg-secondary active:opacity-80',
        ghost: 'bg-transparent active:bg-muted',
        destructive: 'bg-destructive active:opacity-80',
        link: 'bg-transparent',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-9 px-3',
        // lg : hauteur ET largeur min ≥ 44 px (cible tactile).
        lg: 'h-11 min-w-[44px] px-5',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

const buttonTextVariants = cva('text-sm font-montserrat-semibold', {
  variants: {
    variant: {
      default: 'text-primary-foreground',
      outline: 'text-foreground',
      secondary: 'text-secondary-foreground',
      ghost: 'text-foreground',
      destructive: 'text-white',
      link: 'text-primary underline',
    },
  },
  defaultVariants: { variant: 'default' },
})

export interface ButtonProps
  extends PressableProps,
    VariantProps<typeof buttonVariants> {
  /** Libellé texte (raccourci ; ignoré si `children` est fourni). */
  label?: string
  className?: string
  textClassName?: string
  children?: ReactNode
}

export function Button({
  variant,
  size,
  label,
  className,
  textClassName,
  children,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {children ?? (
        <Text className={cn(buttonTextVariants({ variant }), textClassName)}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

export { buttonVariants, buttonTextVariants }
