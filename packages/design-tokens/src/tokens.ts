/**
 * Design tokens Ride'n'Rest — objet TS typé pour les consommateurs **non-NativeWind**
 * (charts `react-native-svg`, styles MapLibre, `pin-factory`, etc.).
 *
 * Source unique : `./palette.json` — miroir vérifié des valeurs canoniques de
 * `apps/web/src/app/globals.css` (`:root` light + `.dark` « Charbon »). Aucune
 * valeur n'est inventée ici (cf. `UX-DR-MOB-001`) ; la parité est garantie par
 * `tokens.test.ts`. Les consommateurs NativeWind passent par `nativewind-preset.js`.
 */
import palette from './palette.json'

/** Noms de tokens couleur (identiques light/dark). */
export type ColorToken = keyof typeof palette.colors.light

/** Map nom de token → valeur hex, pour un mode donné. */
export type ColorScheme = Record<ColorToken, string>

export const lightColors: ColorScheme = palette.colors.light
export const darkColors: ColorScheme = palette.colors.dark

/** Échelle de rayons (rem) — dérivée de `--radius: 0.625rem` × multiplicateurs web. */
export const radius = palette.radius
/** Ombres « Charbon » (base noire) — valeurs canoniques du bloc `.dark`. */
export const shadow = palette.shadow
/** Familles de police natives (Montserrat chargée via `expo-font`). */
export const fontFamily = palette.font

/** Sélecteur de palette par mode. */
export function colorsFor(scheme: 'light' | 'dark'): ColorScheme {
  return scheme === 'dark' ? darkColors : lightColors
}

/** Token complet (toutes les sous-sections). */
export const tokens = {
  colors: palette.colors,
  radius,
  shadow,
  fontFamily,
} as const

export default tokens

// ── Couleurs POI ────────────────────────────────────────────────────────────
// Source de vérité = `@ridenrest/shared` (poi-colors.ts). On RÉ-EXPORTE, on ne
// duplique jamais (AC1). Couleurs POI dynamiques = style inline côté app.
export {
  POI_CATEGORY_COLORS,
  POI_CLUSTER_COLOR,
  POI_LAYER_COLORS,
} from '@ridenrest/shared'
