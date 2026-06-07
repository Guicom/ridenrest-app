import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const setTheme = vi.fn()
let mockTheme: string | undefined = 'system'

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: mockTheme, setTheme }),
}))

const { ThemeToggle } = await import('./theme-toggle')

describe('ThemeToggle (MOB-1.2b AC2)', () => {
  beforeEach(() => {
    setTheme.mockClear()
    mockTheme = 'system'
  })

  afterEach(() => {
    cleanup()
  })

  it('propose les trois choix : clair, sombre, système', () => {
    render(<ThemeToggle />)
    expect(screen.getByRole('radio', { name: /clair/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /sombre/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /système/i })).toBeInTheDocument()
  })

  it('appelle setTheme("dark") au clic sur Sombre', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('radio', { name: /sombre/i }))
    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('appelle setTheme("light") au clic sur Clair', () => {
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('radio', { name: /clair/i }))
    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('appelle setTheme("system") au clic sur Système', () => {
    mockTheme = 'dark'
    render(<ThemeToggle />)
    fireEvent.click(screen.getByRole('radio', { name: /système/i }))
    expect(setTheme).toHaveBeenCalledWith('system')
  })

  it('marque le thème actif (aria-checked) après montage', () => {
    mockTheme = 'dark'
    render(<ThemeToggle />)
    expect(screen.getByRole('radio', { name: /sombre/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: /clair/i })).toHaveAttribute('aria-checked', 'false')
  })
})
