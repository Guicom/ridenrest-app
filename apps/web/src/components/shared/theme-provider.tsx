'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * Wrapper client autour de next-themes (le root layout est un Server Component).
 * Pose/retire la classe `dark` sur <html> et persiste le choix en localStorage.
 * Story MOB-1.2b (AC2).
 */
export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
