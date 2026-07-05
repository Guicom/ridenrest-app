'use client'

import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'

const OPTIONS = [
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
  { value: 'system', label: 'Système', icon: Monitor },
] as const

/**
 * Bascule de thème light / dark / système (story MOB-1.2b AC2).
 * `theme` n'est connu qu'après montage (next-themes lit localStorage) —
 * d'où le guard `mounted` pour éviter un mismatch d'hydratation.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  // Roving tabindex : un seul tab-stop dans le radiogroup (l'option active, ou
  // la première par défaut), navigation entre options aux flèches (contrat ARIA).
  const activeIndex = OPTIONS.findIndex((o) => o.value === theme)
  const tabbableIndex = mounted && activeIndex >= 0 ? activeIndex : 0

  function handleKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      next = (index + 1) % OPTIONS.length
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      next = (index - 1 + OPTIONS.length) % OPTIONS.length
    }
    if (next === null) return
    e.preventDefault()
    setTheme(OPTIONS[next].value)
    btnRefs.current[next]?.focus()
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1">
        <p className="font-medium">Thème</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          « Système » suit automatiquement la préférence de votre appareil.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Thème"
        className="flex shrink-0 rounded-lg border border-border bg-surface p-0.5"
      >
        {OPTIONS.map(({ value, label, icon: Icon }, index) => {
          const active = mounted && theme === value
          return (
            <button
              key={value}
              ref={(el) => {
                btnRefs.current[index] = el
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={index === tabbableIndex ? 0 : -1}
              onClick={() => setTheme(value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={[
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'bg-surface-raised text-text-primary font-medium'
                  : 'text-muted-foreground hover:text-text-primary',
              ].join(' ')}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
