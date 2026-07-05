/**
 * Preset NativeWind/Tailwind (theme extension) — forme (b) des design tokens.
 *
 * Requis tel quel par `apps/mobile/tailwind.config.js` :
 *     presets: [require('@ridenrest/design-tokens/nativewind-preset')]
 *
 * Source unique : `./src/palette.json` (même fichier que `tokens.ts`) → zéro dérive.
 *
 * Theming light/dark : les couleurs sont exposées en utilitaires Tailwind qui
 * pointent vers des variables CSS sous forme de CANAUX RGB
 * (`rgb(var(--color-<token>) / <alpha-value>)`). Cette forme « canal » permet les
 * modificateurs d'opacité Tailwind (`bg-primary/50`, `text-foreground/80`, …),
 * impossibles avec un `var()` portant une couleur pleine. Les valeurs réelles
 * (canaux) sont injectées en base par un plugin (`:root` = light, `.dark` = Charbon).
 * NativeWind (`darkMode: 'class'`) bascule la classe `.dark` via `useColorScheme()`.
 *
 * NB : `palette.json`/`tokens.ts` restent en hex (miroir exact du web, parité
 * vérifiée) — la conversion en canaux est faite ICI au build du preset uniquement.
 */
const palette = require('./src/palette.json')

const COLOR_TOKENS = Object.keys(palette.colors.light)

/**
 * `#2D6A4A` → `'45 106 74'` (canaux RGB séparés par des espaces), pour la forme
 * `rgb(var(--color-x) / <alpha-value>)`. Gère le hex court (`#abc`) et long.
 */
function hexToRgbChannels(hex) {
  let h = String(hex).trim().replace(/^#/, '')
  if (h.length === 3) h = h.replace(/(.)/g, '$1$1')
  const int = parseInt(h, 16)
  return `${(int >> 16) & 255} ${(int >> 8) & 255} ${int & 255}`
}

/** name → `rgb(var(--color-name) / <alpha-value>)` (consommé par `bg-*`, `text-*`, … + `/opacity`). */
const colors = COLOR_TOKENS.reduce((acc, name) => {
  acc[name] = `rgb(var(--color-${name}) / <alpha-value>)`
  return acc
}, {})

/** Map des variables CSS pour un mode (valeurs = canaux RGB, pas hex). */
function cssVars(scheme) {
  return Object.entries(palette.colors[scheme]).reduce((acc, [name, value]) => {
    acc[`--color-${name}`] = hexToRgbChannels(value)
    return acc
  }, {})
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  theme: {
    extend: {
      colors,
      borderRadius: { ...palette.radius },
      boxShadow: { ...palette.shadow },
      fontFamily: {
        sans: [palette.font.sans],
        montserrat: [palette.font.regular],
        'montserrat-medium': [palette.font.medium],
        'montserrat-semibold': [palette.font.semibold],
        'montserrat-bold': [palette.font.bold],
      },
    },
  },
  plugins: [
    // Forme « fonction » du plugin Tailwind (compatible v3 et v4) — évite un
    // `require('tailwindcss/plugin')` qui résoudrait vers la v4 hoistée du web.
    function injectThemeVars({ addBase }) {
      addBase({
        ':root': cssVars('light'),
        '.dark': cssVars('dark'),
      })
    },
  ],
}
