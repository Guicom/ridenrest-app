import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

/**
 * MOB-1.2b — AC1 : la palette dark « Charbon » de globals.css doit reprendre
 * EXACTEMENT les valeurs du handoff Claude Design (high-fidelity, zéro invention),
 * et le :root light doit rester strictement inchangé.
 */

const globalsCss = readFileSync(resolve(__dirname, './globals.css'), 'utf-8')
const handoffCss = readFileSync(
  resolve(__dirname, '../../../../docs/design/dark-mode-charbon/charbon-dark-tokens.css'),
  'utf-8',
)

/** Extrait les déclarations `--token: valeur` d'un bloc CSS (commentaires exclus). */
function extractTokens(block: string): Map<string, string> {
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, '')
  const tokens = new Map<string, string>()
  for (const match of withoutComments.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].replace(/\s+/g, ' ').trim())
  }
  return tokens
}

/** Extrait le premier bloc `selector { ... }` (pas de blocs imbriqués attendus). */
function extractBlock(css: string, selector: string): string {
  const pattern = new RegExp(
    `${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)\\n\\}`,
  )
  const match = css.match(pattern)
  if (!match) throw new Error(`Bloc ${selector} introuvable`)
  return match[1]
}

const handoffDark = extractTokens(extractBlock(handoffCss, '.dark'))
const globalsDark = extractTokens(extractBlock(globalsCss, '.dark'))
const globalsRoot = extractTokens(extractBlock(globalsCss, ':root'))

describe('globals.css — dark mode « Charbon » (MOB-1.2b AC1)', () => {
  it('reprend exactement chaque token du handoff (sauf --accent-yellow, mode-independent)', () => {
    expect(handoffDark.size).toBeGreaterThan(0)
    for (const [token, value] of handoffDark) {
      if (token === '--accent-yellow') continue // volontairement non redéfini (cf. README handoff)
      expect(globalsDark.get(token), `token ${token}`).toBe(value)
    }
  })

  it('ne redéfinit pas --accent-yellow en dark (mode-independent)', () => {
    expect(globalsDark.has('--accent-yellow')).toBe(false)
  })

  it('ne redéfinit pas les tokens mode-independent (radius, fonts, marketing-primary)', () => {
    for (const token of ['--radius', '--font-sans', '--marketing-primary']) {
      expect(globalsDark.has(token), `token ${token}`).toBe(false)
    }
  })

  it('intègre les --shadow-* base noire du handoff', () => {
    for (const token of ['--shadow-sm', '--shadow', '--shadow-md', '--shadow-lg', '--shadow-xl', '--shadow-2xl']) {
      expect(globalsDark.get(token), `token ${token}`).toBe(handoffDark.get(token))
    }
  })

  it('aliasse les tokens shadcn vers la palette Charbon (aucune valeur inventée)', () => {
    expect(globalsDark.get('--card')).toBe('var(--surface)')
    expect(globalsDark.get('--popover')).toBe('var(--background)')
    expect(globalsDark.get('--muted')).toBe('var(--background-page)')
    expect(globalsDark.get('--muted-foreground')).toBe('var(--text-muted)')
    expect(globalsDark.get('--secondary')).toBe('var(--surface-raised)')
    expect(globalsDark.get('--accent')).toBe('var(--primary-light)')
    expect(globalsDark.get('--accent-foreground')).toBe('var(--primary)')
    expect(globalsDark.get('--sidebar')).toBe('var(--surface)')
    expect(globalsDark.get('--sidebar-border')).toBe('var(--border)')
  })

  it('conserve le :root light strictement inchangé (zéro régression light)', () => {
    expect(globalsRoot.get('--primary')).toBe('#2D6A4A')
    expect(globalsRoot.get('--primary-hover')).toBe('#245740')
    expect(globalsRoot.get('--primary-light')).toBe('#EBF5EE')
    expect(globalsRoot.get('--primary-foreground')).toBe('#FFFFFF')
    expect(globalsRoot.get('--background')).toBe('#FFFFFF')
    expect(globalsRoot.get('--background-page')).toBe('#F5F7F5')
    expect(globalsRoot.get('--background-intro')).toBe('#b4c9b1')
    expect(globalsRoot.get('--surface')).toBe('#F8FAF9')
    expect(globalsRoot.get('--surface-raised')).toBe('#EFF5F1')
    expect(globalsRoot.get('--text-primary')).toBe('#1A2D22')
    expect(globalsRoot.get('--text-secondary')).toBe('#4D6E5A')
    expect(globalsRoot.get('--text-muted')).toBe('#8EA899')
    expect(globalsRoot.get('--border')).toBe('#D4E0DA')
    expect(globalsRoot.get('--density-high')).toBe('#16a34a')
    expect(globalsRoot.get('--density-medium')).toBe('#d97706')
    expect(globalsRoot.get('--density-low')).toBe('#dc2626')
    expect(globalsRoot.get('--destructive')).toBe('#dc2626')
    expect(globalsRoot.get('--accent-yellow')).toBe('#F4C542')
  })

  it('vert marque ≠ vert densité, en light comme en dark', () => {
    expect(globalsRoot.get('--primary')).not.toBe(globalsRoot.get('--density-high'))
    expect(globalsDark.get('--primary')).not.toBe(globalsDark.get('--density-high'))
    expect(globalsDark.get('--primary')).toBe('#74C69D')
    expect(globalsDark.get('--density-high')).toBe('#4ADE80')
  })

  it("conserve une seule approche de bascule (classe .dark, pas de @media prefers-color-scheme)", () => {
    const withoutComments = globalsCss.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments).not.toContain('prefers-color-scheme')
    expect(withoutComments.match(/@custom-variant dark/g)).toHaveLength(1)
  })
})
