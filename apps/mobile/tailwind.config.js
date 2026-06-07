/**
 * Tailwind (NativeWind v4) — apps/mobile.
 *
 * Le thème provient ENTIÈREMENT du design system partagé
 * (`@ridenrest/design-tokens/nativewind-preset`), lui-même miroir vérifié de
 * `apps/web/src/app/globals.css` (cf. MOB-1.3 / UX-DR-MOB-001). On ne redéfinit
 * aucune valeur ici.
 *
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [
    require('nativewind/preset'),
    require('@ridenrest/design-tokens/nativewind-preset'),
  ],
}
