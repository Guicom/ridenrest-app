/**
 * Test de PARITÉ — garde-fou « zéro dérive » (UX-DR-MOB-001).
 *
 * Vérifie que chaque valeur de `palette.json` est l'extraction EXACTE de la
 * source canonique web `apps/web/src/app/globals.css` (`:root` light + `.dark`
 * Charbon, avec résolution des `var()` et cascade), de `poi-colors.ts`
 * (`@ridenrest/shared`), et que l'échelle de radius respecte la formule
 * `--radius × multiplicateur` du bloc `@theme`. Si le web bouge, ce test casse.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import palette from './palette.json'
import {
  POI_CATEGORY_COLORS,
  POI_CLUSTER_COLOR,
  POI_LAYER_COLORS,
} from '@ridenrest/shared'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../../..')
// Strip des commentaires CSS : certains contiennent des accolades (ex. un
// extrait `.shadow-sm{…}`) qui casseraient l'extraction de blocs à plat.
const globalsCss = readFileSync(
  resolve(repoRoot, 'apps/web/src/app/globals.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '')

/** Extrait le 1er bloc `selector { ... }` (déclarations à plat, sans imbrication). */
function extractBlock(css: string, selector: string): string {
  const re = new RegExp(`${selector}\\s*\\{([^}]*)\\}`)
  const m = css.match(re)
  if (!m) throw new Error(`Bloc introuvable: ${selector}`)
  return m[1]
}

/** Parse les déclarations `--name: value;` d'un bloc en map. */
function parseVars(block: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /--([\w-]+)\s*:\s*([^;]+);/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    out[m[1]] = m[2].trim()
  }
  return out
}

/**
 * Résout récursivement les `var(--x)` ET `var(--x, fallback)` contre la map.
 * S'arrête dès qu'aucune substitution n'avance (référence inconnue sans fallback)
 * pour ne pas masquer une dérive : un `var()` résiduel est asserté ailleurs.
 */
function resolveVars(value: string, vars: Record<string, string>): string {
  let out = value
  let guard = 0
  while (out.includes('var(') && guard++ < 20) {
    const next = out.replace(
      /var\(\s*--([\w-]+)\s*(?:,\s*([^)]+))?\)/g,
      (_all, name, fallback) =>
        vars[name] ?? (fallback != null ? String(fallback).trim() : _all),
    )
    if (next === out) break
    out = next
  }
  return out.trim()
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')

const rootVars = parseVars(extractBlock(globalsCss, ':root'))
// Déclarations PROPRES au bloc `.dark` (sans héritage) — utilisé pour les tokens
// qui DOIVENT exister en dark (ex. shadows Charbon), afin qu'une valeur définie
// seulement dans `:root` ne satisfasse pas l'assertion par cascade.
const darkBlockVars = parseVars(extractBlock(globalsCss, '\\.dark'))
// Cascade CSS : en dark, les tokens couleur non redéfinis héritent de :root.
const darkVars = { ...rootVars, ...darkBlockVars }

describe('design-tokens — parité couleurs vs globals.css', () => {
  it('light : chaque token == valeur :root canonique', () => {
    for (const [token, value] of Object.entries(palette.colors.light)) {
      expect(rootVars[token], `--${token} absent de :root`).toBeDefined()
      const canonical = resolveVars(rootVars[token], rootVars)
      // Garde-fou : un `var()` résiduel signifierait une référence non résolue
      // comparée littéralement → fausse parité. On l'interdit explicitement.
      expect(canonical.includes('var('), `light --${token} : var() non résolu (${canonical})`).toBe(false)
      expect(norm(value), `light --${token}`).toBe(norm(canonical))
    }
  })

  it('dark : chaque token == valeur .dark canonique (var() + cascade résolus)', () => {
    for (const [token, value] of Object.entries(palette.colors.dark)) {
      expect(darkVars[token], `--${token} absent de .dark/:root`).toBeDefined()
      const canonical = resolveVars(darkVars[token], darkVars)
      expect(canonical.includes('var('), `dark --${token} : var() non résolu (${canonical})`).toBe(false)
      expect(norm(value), `dark --${token}`).toBe(norm(canonical))
    }
  })

  it('complétude : light et dark exposent exactement le même set de tokens', () => {
    const lightKeys = Object.keys(palette.colors.light).sort()
    const darkKeys = Object.keys(palette.colors.dark).sort()
    // Empêche qu'un token dark soit silencieusement absent (ou inversement) —
    // un set incomplet ne doit pas passer « à vide » la parité.
    expect(darkKeys, 'set de tokens dark ≠ light').toEqual(lightKeys)
  })
})

describe('design-tokens — parité radius vs @theme', () => {
  // Multiplicateurs lus dans le bloc @theme inline de globals.css.
  const MULTIPLIERS: Record<string, number> = {
    sm: 0.6, md: 0.8, lg: 1, xl: 1.4, '2xl': 1.8, '3xl': 2.2, '4xl': 2.6,
  }

  it('--radius de base == 0.625rem', () => {
    expect(rootVars['radius']).toBe('0.625rem')
    expect(palette.radius.DEFAULT).toBe('0.625rem')
    expect(palette.radius.lg).toBe('0.625rem')
  })

  it('échelle dérivée == 0.625rem × multiplicateur', () => {
    const base = 0.625
    for (const [key, mult] of Object.entries(MULTIPLIERS)) {
      const expected = `${+(base * mult).toFixed(4)}rem`
      const got = (palette.radius as Record<string, string>)[key]
      expect(got, `radius ${key}`).toBe(expected)
    }
  })
})

describe('design-tokens — parité shadows vs .dark', () => {
  const MAP: Record<string, string> = {
    sm: 'shadow-sm', DEFAULT: 'shadow', md: 'shadow-md',
    lg: 'shadow-lg', xl: 'shadow-xl', '2xl': 'shadow-2xl',
  }
  it('chaque ombre == valeur canonique .dark (bloc .dark seul, pas de cascade :root)', () => {
    for (const [key, cssName] of Object.entries(MAP)) {
      // Lecture STRICTE du bloc `.dark` : un `--shadow-*` qui n'existerait que
      // dans `:root` ne doit PAS satisfaire l'assertion par héritage.
      const canonical = darkBlockVars[cssName]
      expect(canonical, `--${cssName} absent du bloc .dark`).toBeDefined()
      const got = (palette.shadow as Record<string, string>)[key]
      expect(norm(got), `shadow ${key}`).toBe(norm(canonical))
    }
  })
})

describe('design-tokens — POI = ré-export @ridenrest/shared (jamais dupliqué)', () => {
  it('ré-exporte les couleurs POI sans les redéfinir', async () => {
    const dt = await import('./tokens')
    expect(dt.POI_CATEGORY_COLORS).toBe(POI_CATEGORY_COLORS)
    expect(dt.POI_CLUSTER_COLOR).toBe(POI_CLUSTER_COLOR)
    expect(dt.POI_LAYER_COLORS).toBe(POI_LAYER_COLORS)
  })

  it('le cluster POI partage le vert brand primary', () => {
    expect(POI_CLUSTER_COLOR.toLowerCase()).toBe(palette.colors.light.primary.toLowerCase())
  })
})
