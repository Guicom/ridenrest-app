import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.md'],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: false,
    // `e2e/**` = specs Playwright (`pnpm test:e2e`) — ne PAS les faire tourner sous
    // Vitest : `test.describe` de Playwright plante hors runner Playwright (« FAIL
    // e2e/weather.spec.ts, 0 test »). Bug révélé quand le 1ᵉʳ spec E2E est arrivé sur
    // main (turbo test complet). (Fix 2026-07-05.)
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
})
