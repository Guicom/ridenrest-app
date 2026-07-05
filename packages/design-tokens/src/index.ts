/**
 * @ridenrest/design-tokens — single source of truth du design system.
 *
 * Deux formes d'export :
 *  (a) objet JS/TS typé (ce module) — consommateurs non-NativeWind.
 *  (b) preset NativeWind/Tailwind — `@ridenrest/design-tokens/nativewind-preset`
 *      (CommonJS, require-able par `tailwind.config.js`).
 */
export * from './tokens'
export { default as tokens } from './tokens'
export type { ColorToken, ColorScheme } from './tokens'
