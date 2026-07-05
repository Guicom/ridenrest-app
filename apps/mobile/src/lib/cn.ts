import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Fusionne des classes Tailwind conditionnelles en résolvant les conflits
 * (dernière classe gagnante). Alignement avec `apps/web` (`lib/utils.ts`).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
