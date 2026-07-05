// PostCSS pour la cible WEB de Storybook (react-native-web-vite) : traite
// src/global.css avec Tailwind v3 (NativeWind v4). Isolé à apps/mobile —
// n'affecte pas apps/web (Tailwind v4). Sur natif, Metro/NativeWind gèrent le CSS.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
